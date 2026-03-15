import 'dotenv/config';

import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import Joi from 'joi';
import helmet from 'helmet';
import compression from 'compression';

import dbClient from './src/database/dbConnection.js';
import opcuaConnectionManager from './src/opc-ua/services/opcuaConnectionManager.js';
import { opcuaEmitter } from './src/opc-ua/opcuaClient.js';
import { rateLimiter } from './src/middleware/security.js';
import logger from './src/utils/logger.js';
import { AsyncQueue } from './src/utils/queue.js';
import connectionTracker from './src/utils/connectionTracker.js';
import statusManager from './src/utils/status.js';
import StatusConstants from './src/utils/statusConstants.js';
import { CSRF_HEADER_NAME } from './src/utils/csrf.js';
import config from './src/config/config.js';

import systemRoutes from './src/routes/systemRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import opcuaRoutes from './src/opc-ua/routes/opcuaRoutes.js';
import dbRoutes from './src/database/routes/dbRoutes.js';
import certificateRoutes from './src/opc-ua/routes/certificateRoutes.js';
import statusRoutes from './src/routes/statusRoutes.js';
import machineRoutes from './src/routes/machineRoutes.js';
import multiMachineManager from './src/opc-ua/services/multiMachineManager.js';
import { validateQuery } from './src/middleware/validation.js';

import type { OpcuaNodeData } from './src/opc-ua/opcuaClient.js';

const pgSession = connectPgSimple(session);

const app = express();

app.use(cors({
    origin: config.CLIENT_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "connect-src": ["'self'", config.CLIENT_URL, `ws://${new URL(config.CLIENT_URL).hostname}:3000`, `http://${new URL(config.CLIENT_URL).hostname}:3000`],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginResourcePolicy: { policy: "same-origin" },
}));
app.use(rateLimiter);
app.use(compression());
app.use(express.json());
app.use(logger.middleware);

// --- Session Middleware ---
if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        logger.error('FATAL ERROR: SESSION_SECRET is not set. Refusing to start in production without a secure session secret.');
        process.exit(1);
    }
    logger.warn("SESSION_SECRET not set in .env file. Using insecure default. Set a strong secret before deploying to production!");
}

// --- Configure PostgreSQL Session Store ---
const sessionStore = new pgSession({
    pool: dbClient.pool,
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60,
    ttl: 60 * 60 * 2,
});

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback-insecure-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        path: '/'
    }
}));

app.set('etag', 'strong');
app.disable('x-powered-by');

if (!config.COOKIE_SECRET) {
    logger.error('FATAL ERROR: COOKIE_SECRET environment variable is not set.');
    process.exit(1);
}
app.use(cookieParser(config.COOKIE_SECRET));

// --- CSRF Protection using csrf-sync ---
const {
    generateToken,
    csrfSynchronisedProtection,
    invalidCsrfTokenError,
} = csrfSync({
    getTokenFromRequest: (req) => {
        return (req.headers[CSRF_HEADER_NAME] as string) || req.body?._csrf;
    },
    getTokenFromState: (req) => {
        return (req as any).session?.csrfToken;
    },
    storeTokenInState: (req, token) => {
        (req as any).session.csrfToken = token;
    },
    size: 64,
});

app.use((req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    csrfSynchronisedProtection(req, res, next);
});

app.get('/api/csrf-token', (req: Request, res: Response) => {
    let token = (req.session as any).csrfToken;
    if (!token) {
        token = generateToken(req);
        logger.info(`[CSRF Token Gen] New token for session ${req.sessionID}`);
    }
    res.json({ csrfToken: token });
});

// --- OPC UA Data Queue and Worker ---
interface OpcuaDataItem {
    key: string;
    label: string;
    timestamp: any;
    value: any;
    machineId?: number;
}

const opcuaDataQueue = new AsyncQueue<OpcuaDataItem>();
const BATCH_SIZE: number = config.OPCUA_BATCH_SIZE;
const QUEUE_PROCESS_DELAY: number = config.OPCUA_QUEUE_DELAY;
const MAX_QUEUE_LOG_THRESHOLD: number = config.OPCUA_QUEUE_WARN_THRESHOLD;
let isShuttingDown = false;
let queueProcessingPromise: Promise<void> | null = null;

const persistToDLQ = async (batch: OpcuaDataItem[], error: Error): Promise<void> => {
    logger.warn(`[DLQ] Persisting batch of size ${batch.length} to Dead-Letter Queue due to error: ${error.message}`, {
        error: error.toString(),
        sampleBatch: batch.slice(0, 5).map(d => ({ key: d.key, ts: d.timestamp, val: d.value }))
    });
    try {
        const batchJson = JSON.stringify(batch);
        await dbClient.query(
            'INSERT INTO opcua_data_dlq (error_message, batch_data) VALUES ($1, $2)',
            [error.message || 'Unknown error', batchJson]
        );
        logger.info(`[DLQ] Successfully persisted batch of size ${batch.length} to DLQ.`);
    } catch (dlqError: any) {
        logger.error(`[DLQ] CRITICAL ERROR: Failed to persist batch to Dead-Letter Queue! Data loss occurred. DLQ Error: ${dlqError.message}`, {
            originalError: error.message,
            dlqError: dlqError.toString(),
            batchSize: batch.length
        });
    }
};

setInterval(() => {
    const currentSize = opcuaDataQueue.size();
    if (currentSize > 0) {
        logger.info(`OPC UA Data Queue Size: ${currentSize}`);
        if (currentSize > MAX_QUEUE_LOG_THRESHOLD) {
            logger.warn(`[ALERT] OPC UA Data Queue size (${currentSize}) exceeds threshold (${MAX_QUEUE_LOG_THRESHOLD}). Processing might be falling behind.`);
        }
    }
}, 60000);

const persistOpcuaData = (data: OpcuaDataItem): void => {
    if (isShuttingDown) {
        logger.warn("Shutdown in progress. Dropping incoming OPC UA data:", data.key);
        return;
    }
    try {
        opcuaDataQueue.enqueue(data);
    } catch (error: any) {
        if (error.message === 'Queue overflow') {
            logger.error('OPC UA Data Queue Overflow! Data loss is occurring. Check database insert performance or increase queue size/batch size.',
                { maxQueueSize: opcuaDataQueue.MAX_QUEUE_SIZE });
        } else {
            logger.error('Error enqueuing OPC UA data:', error);
        }
    }
};

const processOpcuaDataQueue = async (): Promise<boolean> => {
    const batch = opcuaDataQueue.drain(BATCH_SIZE);
    if (batch.length === 0) return false;

    try {
        await dbClient.query(`
            INSERT INTO opcua_data(node_key, node_label, timestamp, value, machine_id)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::timestamptz[], $4::float[], $5::int[])
            ON CONFLICT DO NOTHING;
        `, [
            batch.map(d => d.key),
            batch.map(d => d.label),
            batch.map(d => new Date(d.timestamp)),
            batch.map(d => typeof d.value === 'number' ? d.value : null),
            batch.map(d => d.machineId || null)
        ]);
        logger.debug(`Successfully inserted batch of ${batch.length} OPC UA data points.`);
        return true;
    } catch (error: any) {
        logger.error(`Failed to insert OPC UA data batch after retries. Dropping batch. Error: ${error.message}`, {
            batchSize: batch.length,
            sampleBatch: batch.slice(0, 5).map(d => ({ key: d.key, ts: d.timestamp, val: d.value })),
            dbErrorCode: error.code
        });
        await persistToDLQ(batch, error);
        return false;
    }
};

const processQueue = async (): Promise<void> => {
    let isRunning = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    const stopProcessing = (): void => {
        logger.info("[Queue] Received stop signal. Finishing current batch if any, then exiting loop.");
        isRunning = false;
    };

    process.on('SIGTERM', stopProcessing);
    process.on('SIGINT', stopProcessing);

    logger.info(`Starting OPC UA data queue processor with batch size ${BATCH_SIZE} and delay ${QUEUE_PROCESS_DELAY}ms.`);

    while (isRunning) {
        try {
            if (!isRunning) break;

            const processed = await processOpcuaDataQueue();

            if (!isRunning) break;

            if (processed) {
                consecutiveErrors = 0;
                if (!opcuaDataQueue.isEmpty() && isRunning) {
                    await new Promise<void>(resolve => setImmediate(resolve));
                    continue;
                }
            }
            if (isRunning) {
                if (!isRunning) break;
                await new Promise<void>(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY));
            }

        } catch (error) {
            logger.error('Unexpected error in queue processing loop:', error);
            if (!isRunning) break;

            consecutiveErrors++;
            if (consecutiveErrors > maxConsecutiveErrors) {
                logger.error(`[ALERT] Queue processor encountered ${consecutiveErrors} consecutive errors. Pausing for 60 seconds.`);
                if (!isRunning) break;
                await new Promise<void>(resolve => setTimeout(resolve, 60000));
                consecutiveErrors = 0;
            } else {
                if (!isRunning) break;
                await new Promise<void>(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY * consecutiveErrors));
            }
        }
    }
    logger.info("Queue processing loop is exiting due to shutdown signal.");
};

queueProcessingPromise = processQueue().catch(err => {
    logger.error('Fatal error: Queue processing loop exited unexpectedly.', err);
    process.exit(1);
});


opcuaEmitter.on('nodeChanged', (data: OpcuaNodeData) => {
    if (data && data.key && data.timestamp && data.value !== undefined) {
        // Emit to both machine-scoped and legacy rooms
        if (data.machineId) {
            const machineRoomName = `opcua-${data.machineId}-${data.key}`;
            io.to(machineRoomName).emit('opcuaUpdate', data);
        }
        const roomName = `opcua-${data.key}`;
        io.to(roomName).emit('opcuaUpdate', data);
        persistOpcuaData({ ...data, machineId: data.machineId });

        if (statusManager.getServiceStatus(StatusConstants.OPCUA) === StatusConstants.CONNECTED) {
            statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                ...statusManager.getServiceDetails(StatusConstants.OPCUA),
                message: 'Data received',
                lastDataTimestamp: data.timestamp
            });
        }
    } else {
        logger.warn("Received invalid nodeChanged data:", data);
    }
});


// --- REST Routes ---
app.use('/api/system', systemRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/opcua', opcuaRoutes);
app.use('/api/db', dbRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/machines', machineRoutes);

// --- Input Validation (Query Params) ---
const operationModeSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(5000).default(1000),
    offset: Joi.number().integer().min(0).default(0),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
});

app.get('/api/operation-mode-data', validateQuery(operationModeSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { limit, offset, startDate, endDate } = req.query as any;

        let queryText = `
            SELECT timestamp, value
            FROM opcua_data
            WHERE node_key = 'OperationMode' `;
        const queryParams: any[] = [];

        if (startDate) {
            queryParams.push(startDate);
            queryText += `AND timestamp >= $${queryParams.length} `;
        }
        if (endDate) {
            queryParams.push(endDate);
            queryText += `AND timestamp <= $${queryParams.length} `;
        }

        queryText += `ORDER BY timestamp ASC `;
        queryParams.push(limit);
        queryText += `LIMIT $${queryParams.length} `;
        queryParams.push(offset);
        queryText += `OFFSET $${queryParams.length}`;

        const result = await dbClient.query(queryText, queryParams);
        const data = result.rows.map((row: any) => ({
            timestamp: row.timestamp.toISOString(),
            time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            mode: row.value,
        }));
        res.json(data);
    } catch (err) {
        logger.error('Error fetching operation mode data:', err);
        next(err);
    }
});

// --- WebSocket Connection ---
const server = http.createServer(app);

const io = new SocketIOServer(server, {
    cors: {
        origin: config.CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- Ensure statusManager broadcasts updates ---
statusManager.on('statusChanged', (statusData: any) => {
    logger.info('[WebSocket] Broadcasting status update to clients.');
    const fullStatus = statusManager.getFullStatus();
    io.emit('statusUpdate', fullStatus);
});

// --- Socket.IO Authentication Middleware ---
io.use((socket, next) => {
    const req = socket.request as any;
    cookieParser(config.COOKIE_SECRET)(req, {} as any, (err?: any) => {
        if (err) {
            logger.error('Socket.IO Cookie parsing error:', err);
            return next(new Error('Authentication error: Invalid cookies'));
        }

        logger.info(`Socket.IO connection request received for ${socket.id}. Further authentication may apply.`);
        (socket as any).user = { authenticated: true };
        next();
    });
});

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const clientInfo = {
        ip: clientIp as string,
        userAgent: socket.handshake.headers['user-agent'],
        query: socket.handshake.query as Record<string, string>,
        connectedAt: new Date()
    };

    connectionTracker.addConnection(socket.id, clientInfo);

    if (!(socket as any).user?.authenticated) {
        logger.warn(`Unauthenticated socket ${socket.id} connected despite middleware. Disconnecting.`);
        return socket.disconnect(true);
    }

    logger.info(`Client connected via WebSocket: ${socket.id} from ${clientIp}`);

    try {
        const currentFullStatus = statusManager.getFullStatus();
        logger.info(`[WebSocket] Sending current status to newly connected client ${socket.id}`);
        socket.emit('statusUpdate', currentFullStatus);
    } catch (error) {
        logger.error(`[WebSocket] Failed to send initial status to ${socket.id}:`, error);
    }

    socket.on('joinRoom', (roomName: string) => {
        // Support both legacy 'opcua-NodeKey' and machine-scoped 'opcua-{machineId}-NodeKey' rooms
        if (typeof roomName === 'string' && roomName.startsWith('opcua-')) {
            socket.join(roomName);
            logger.info(`Socket ${socket.id} joined room: ${roomName}`);
        } else {
            logger.warn(`Socket ${socket.id} attempted to join invalid room: ${roomName}`);
        }
    });

    socket.on('leaveRoom', (roomName: string) => {
        if (typeof roomName === 'string' && roomName.startsWith('opcua-')) {
            socket.leave(roomName);
            logger.info(`Socket ${socket.id} left room: ${roomName}`);
        } else {
            logger.warn(`Socket ${socket.id} attempted to leave invalid room: ${roomName}`);
        }
    });

    const isAdmin = (clientInfo.query as any)?.role === 'admin';
    if (isAdmin) {
        logger.info(`Admin client ${socket.id} connected, enabling certificate management.`);

        const untrustedHandler = (certInfo: any): void => {
            try {
                logger.debug(`Sending untrustedCertificate event to admin client: ${socket.id}`);
                socket.emit('untrustedCertificate', certInfo);
            } catch (emitError) {
                logger.error(`Failed to emit untrustedCertificate to ${socket.id}:`, emitError);
            }
        };
        opcuaConnectionManager.on('untrustedCertificate', untrustedHandler);

        socket.on('acceptCertificate', async (filename: string) => {
            try {
                const result = await opcuaConnectionManager.acceptCertificate(filename);
                try {
                    socket.emit('certificateAccepted', { success: result, filename, timestamp: new Date().toISOString() });
                } catch (emitError) {
                    logger.error(`Failed to emit certificateAccepted to ${socket.id}:`, emitError);
                }
            } catch (error: any) {
                logger.error(`Error processing acceptCertificate request from ${socket.id} for ${filename}:`, error);
                try {
                    socket.emit('certificateAccepted', { success: false, filename, error: error.message });
                } catch (emitError) {
                    logger.error(`Failed to emit certificateAccepted (failure) to ${socket.id}:`, emitError);
                }
            }
        });

        socket.on('disconnect', () => {
            opcuaConnectionManager.off('untrustedCertificate', untrustedHandler);
            logger.info(`Admin client ${socket.id} disconnected, certificate listeners removed.`);
        });
    } else {
        logger.info(`Non-admin client ${socket.id} connected.`);
    }

    socket.on('disconnect', (reason: string) => {
        connectionTracker.removeConnection(socket.id);
        logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on('error', (error: Error) => {
        logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
});

// --- Start OPC UA Connections ---
// Initialize multi-machine manager (connects to all active machines from DB)
logger.info("Initializing multi-machine OPC UA manager...");
multiMachineManager.initialize().then(() => {
    const connectedIds = multiMachineManager.getConnectedMachineIds();
    if (connectedIds.length > 0) {
        logger.info(`Multi-machine manager initialized with ${connectedIds.length} connection(s).`);
    } else {
        // Fall back to single connection from .env if no machines configured
        logger.info("No machines in DB. Falling back to single OPC UA connection from .env...");
        opcuaConnectionManager.startConnection().catch(err => {
            logger.error("Initial OPC UA connection failed:", err);
        });
    }
}).catch(err => {
    logger.error("Multi-machine manager initialization failed, falling back to single connection:", err);
    opcuaConnectionManager.startConnection().catch(connErr => {
        logger.error("Fallback OPC UA connection also failed:", connErr);
    });
});

// Forward multi-machine status events to WebSocket clients
multiMachineManager.on('machineStatusChanged', (data: { machineId: number; status: string }) => {
    io.emit('machineStatusUpdate', data);
});

// --- Global Error Handling Middleware ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err === invalidCsrfTokenError || err.code === 'EBADCSRFTOKEN' || err.message?.includes('csrf')) {
        logger.error('[CSRF Error] Invalid token detected:', {
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            receivedTokenHeader: (req.headers[CSRF_HEADER_NAME] as string) || 'MISSING',
            sessionID: req.sessionID || 'N/A',
            sessionExists: !!req.session,
            sessionCsrfToken: (req.session as any)?.csrfToken ? 'present' : 'MISSING',
        });
        res.status(403).json({
            status: 'error',
            error: 'Invalid CSRF token. Your security session may be invalid. Please refresh the page and try again.',
            code: 'INVALID_CSRF_TOKEN'
        });
        return;
    }

    logger.error("Unhandled error:", {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode || 500
    });

    const statusCode = err.statusCode || 500;
    let message = err.isOperational ? err.message : 'Internal Server Error';
    if (process.env.NODE_ENV === 'production' && !err.isOperational) {
        message = 'An unexpected error occurred.';
    }

    res.status(statusCode).json({ status: 'error', error: message });
});


// --- Graceful Shutdown ---
const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });
    statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });

    let shutdownTimer = setTimeout(() => {
        logger.error("[Shutdown] Graceful shutdown OVERALL timeout exceeded (30s). Forcing exit.");
        process.exit(1);
    }, 30000);

    try {
        logger.info("[Shutdown] Closing HTTP server...");
        await new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    logger.error("[Shutdown] Error closing HTTP server:", err);
                    return reject(err);
                }
                logger.info("[Shutdown] HTTP server closed.");
                resolve();
            });
        });

        logger.info("[Shutdown] Closing WebSocket connections...");
        await new Promise<void>((resolve) => {
            io.close(() => {
                logger.info("[Shutdown] All WebSocket connections closed.");
                resolve();
            });
        });

        logger.info("[Shutdown] Disconnecting OPC UA connections...");
        await multiMachineManager.disconnectAll();
        await opcuaConnectionManager.disconnectConnection();

        logger.info("[Shutdown] Closing Database pool...");
        await dbClient.end();

        logger.info("[Shutdown] Graceful shutdown sequence complete.");
        clearTimeout(shutdownTimer);
        process.exit(0);

    } catch (shutdownError) {
        logger.error("[Shutdown] Error during graceful shutdown sequence:", shutdownError);
        clearTimeout(shutdownTimer);
        process.exit(1);
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const PORT = config.PORT;
server.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    if (statusManager.getServiceStatus(StatusConstants.DATABASE) === StatusConstants.UNKNOWN) {
        logger.info("Server listening. Database status managed by connection attempts.");
    }
    if (statusManager.getServiceStatus(StatusConstants.OPCUA) === StatusConstants.UNKNOWN) {
        logger.info("Server listening. OPC UA status managed by connection attempts.");
    }
});
