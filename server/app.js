require('dotenv').config();

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const dbClient = require('./src/database/dbConnection');
const opcuaConnectionManager = require('./src/opc-ua/services/opcuaConnectionManager');
const { opcuaEmitter } = require('./src/opc-ua/opcuaClient');
const helmet = require('helmet');
const { rateLimiter } = require('./src/middleware/security');
const logger = require('./src/utils/logger');
const { AsyncQueue } = require('./src/utils/queue');
const compression = require('compression');
const connectionTracker = require('./src/utils/connectionTracker');
const statusManager = require("./src/utils/status");
const StatusConstants = require('./src/utils/statusConstants');
const { CSRF_HEADER_NAME } = require('./src/utils/csrf');
const config = require('./src/config/config');
const path = require('path');

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
            "script-src": ["'self'", "'unsafe-inline'"], // Example: Adjust based on client needs
            "connect-src": ["'self'", config.CLIENT_URL, `ws://${new URL(config.CLIENT_URL).hostname}:3000`, `http://${new URL(config.CLIENT_URL).hostname}:3000`],
            // Add other directives like style-src, img-src as needed
        },
    },
    crossOriginEmbedderPolicy: false, // Keep false unless specifically needed and tested
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }, // Example, adjust as needed
    crossOriginResourcePolicy: { policy: "same-origin" }, // Example, adjust as needed
}));
app.use(rateLimiter);
app.use(compression());
app.use(express.json());

// --- Session Middleware ---
// Ensure SESSION_SECRET is loaded from .env
if (!process.env.SESSION_SECRET) {
    console.warn("⚠️ WARNING: SESSION_SECRET not set in .env file. Using insecure default. Please set a strong secret!");
}

// --- Configure FileStore ---
const sessionStore = new FileStore({
    path: path.join(__dirname, './sessions'), // Creates a 'sessions' directory
    logFn: logger.debug.bind(logger), // Optional: Log session store actions
    ttl: 60 * 60 * 2 // Optional: Session Time-To-Live in seconds (e.g., 2 hours)
});

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback-insecure-secret',
    resave: false,
    saveUninitialized: true, // Important for CSRF to store secret in new sessions
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'Lax', // Keep Lax
        path: '/'
        // maxAge: 1000 * 60 * 60 * 2 // Optional: 2 hour session expiry
    }
}));

app.set('etag', 'strong');
app.disable('x-powered-by');

if (!config.COOKIE_SECRET) {
    logger.error('FATAL ERROR: COOKIE_SECRET environment variable is not set.');
    process.exit(1);
}
// Initialize cookie-parser with the secret
app.use(cookieParser(config.COOKIE_SECRET));

const csrfProtection = csrf();
app.use(csrfProtection);

app.get('/api/csrf-token', (req, res) => {
    const token = req.csrfToken();
    logger.info(`[CSRF Token Gen] Session ID: ${req.sessionID}, Secret Stored in Session: ${req.session?.csrfSecret}, Token Sent: ${token}`);
    res.json({ csrfToken: token });
});

// --- OPC UA Data Queue and Worker ---
const opcuaDataQueue = new AsyncQueue();
const BATCH_SIZE = config.OPCUA_BATCH_SIZE;
const QUEUE_PROCESS_DELAY = config.OPCUA_QUEUE_DELAY;
const MAX_QUEUE_LOG_THRESHOLD = config.OPCUA_QUEUE_WARN_THRESHOLD;
let isShuttingDown = false; // Flag to signal shutdown
let queueProcessingPromise = null; // To track the queue processing loop

// Placeholder for DLQ persistence logic - Implement this separately
// Likely involves dbClient.query to insert into a dedicated DLQ table
const persistToDLQ = async (batch, error) => {
    logger.warn(`[DLQ] Persisting batch of size ${batch.length} to Dead-Letter Queue due to error: ${error.message}`, {
        error: error.toString(),
        // Log first few items for diagnosis
        sampleBatch: batch.slice(0, 5).map(d => ({ key: d.key, ts: d.timestamp, val: d.value }))
    });
    // --- Implement DLQ Insertion Logic Here ---
    try {
        // Ensure batch data is serializable to JSON
        const batchJson = JSON.stringify(batch); 
        await dbClient.query(
            'INSERT INTO opcua_data_dlq (error_message, batch_data) VALUES ($1, $2)',
            [error.message || 'Unknown error', batchJson]
        );
        logger.info(`[DLQ] Successfully persisted batch of size ${batch.length} to DLQ.`);
        // [ALERT] Consider triggering an alert here for DLQ entries, maybe throttled.
    } catch (dlqError) {
        logger.error(`[DLQ] CRITICAL ERROR: Failed to persist batch to Dead-Letter Queue! Data loss occurred. DLQ Error: ${dlqError.message}`, {
            originalError: error.message,
            dlqError: dlqError.toString(),
            batchSize: batch.length
            // Avoid logging the batch data again here if it's large or causes issues
        });
        // [ALERT] Trigger a critical alert here - failed to write to DLQ
    }
    // --- End Implementation ---
};

setInterval(() => {
    const currentSize = opcuaDataQueue.size();
    if (currentSize > 0) {
        logger.info(`OPC UA Data Queue Size: ${currentSize}`);
        if (currentSize > MAX_QUEUE_LOG_THRESHOLD) {
            logger.warn(`[ALERT] OPC UA Data Queue size (${currentSize}) exceeds threshold (${MAX_QUEUE_LOG_THRESHOLD}). Processing might be falling behind.`);
            // Add actual alert notification logic here (e.g., email, webhook)
        }
    }
}, 60000); // Check every minute

const persistOpcuaData = (data) => {
    if (isShuttingDown) {
        logger.warn("Shutdown in progress. Dropping incoming OPC UA data:", data.key);
        return; // Don't enqueue new data during shutdown
    }
    try {
        opcuaDataQueue.enqueue(data);
    } catch (error) {
        // Handle queue overflow specifically
        if (error.message === 'Queue overflow') {
            logger.error('OPC UA Data Queue Overflow! Data loss is occurring. Check database insert performance or increase queue size/batch size.',
                { maxQueueSize: opcuaDataQueue.MAX_QUEUE_SIZE });
            // Optional: Implement strategy for overflow (e.g., drop oldest, notify admin)
        } else {
            logger.error('Error enqueuing OPC UA data:', error);
        }
    }
};

const processOpcuaDataQueue = async () => {
    const batch = opcuaDataQueue.drain(BATCH_SIZE); // Process in batches
    if (batch.length === 0) return false; // Nothing to process

    try {
        // Use dbClient.query for built-in retry logic
        await dbClient.query(`
            INSERT INTO opcua_data(node_key, node_label, timestamp, value)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::timestamptz[], $4::float[])
            ON CONFLICT DO NOTHING; -- Optional: Decide how to handle conflicts (e.g., duplicate timestamps/keys)
        `, [
            batch.map(d => d.key),
            batch.map(d => d.label),
            batch.map(d => new Date(d.timestamp)),
            batch.map(d => typeof d.value === 'number' ? d.value : null) // Ensure value is number or null
        ]);
        logger.debug(`Successfully inserted batch of ${batch.length} OPC UA data points.`);
        return true; // Batch processed
    } catch (error) {
        // --- Log and Drop Failed Batch ---
        logger.error(`Failed to insert OPC UA data batch after retries. Dropping batch. Error: ${error.message}`, {
            batchSize: batch.length,
            // Log first few items for diagnosis, avoid logging huge batches
            sampleBatch: batch.slice(0, 5).map(d => ({ key: d.key, ts: d.timestamp, val: d.value })),
            dbErrorCode: error.code
        });
        // --- Send to DLQ instead of dropping ---
        await persistToDLQ(batch, error); 
        // DO NOT prepend the batch back to the queue: opcuaDataQueue.prepend(batch);
        // Consider sending failed batches to a separate log file or dead-letter queue system
        // --- End Send to DLQ ---
        return false; // Indicate processing failed for this cycle
    }
};

const processQueue = async () => {
    let isRunning = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // Stop hammering DB if it's consistently failing

    const stopProcessing = () => {
        logger.info("[Queue] Received stop signal. Finishing current batch if any, then exiting loop.");
        isRunning = false; // Signal the loop to stop
    };

    process.on('SIGTERM', stopProcessing);
    process.on('SIGINT', stopProcessing);

    logger.info(`Starting OPC UA data queue processor with batch size ${BATCH_SIZE} and delay ${QUEUE_PROCESS_DELAY}ms.`);

    // Check isShuttingDown flag in the loop condition
    while (isRunning) { // Check the flag each iteration
        try {
            // Check BEFORE processing if we should stop
            if (!isRunning) break;

            const processed = await processOpcuaDataQueue();

            if (!isRunning) break;

            if (processed) {
                consecutiveErrors = 0; // Reset errors on success
                // If processed successfully and queue still has items, process immediately again
                if (!opcuaDataQueue.isEmpty() && isRunning) {
                    await new Promise(resolve => setImmediate(resolve)); // Yield event loop
                    continue; // Skip the longer delay
                }
            }
            // Wait only if nothing was processed or queue is empty (and still running)
            if (isRunning) {
                // Check one last time before sleeping
                if (!isRunning) break;
                await new Promise(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY));
            }

        } catch (error) { // Catch errors from processOpcuaDataQueue itself (should be rare now)
            logger.error('Unexpected error in queue processing loop:', error);
            if (!isRunning) break;

            consecutiveErrors++;
            if (consecutiveErrors > maxConsecutiveErrors) {
                logger.error(`[ALERT] Queue processor encountered ${consecutiveErrors} consecutive errors. Pausing for 60 seconds.`);
                // Add actual alert notification logic here
                if (!isRunning) break;
                await new Promise(resolve => setTimeout(resolve, 60000));
                consecutiveErrors = 0;
            } else {
                // Wait before retrying the loop on error
                if (!isRunning) break;
                await new Promise(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY * consecutiveErrors));
            }
        }
    }
    logger.info("Queue processing loop is exiting due to shutdown signal.");
};

// Start the queue processing and store the promise
queueProcessingPromise = processQueue().catch(err => {
    logger.error('Fatal error: Queue processing loop exited unexpectedly.', err);
    process.exit(1); // Exit if the loop itself crashes
});


opcuaEmitter.on('nodeChanged', (data) => {
    // Basic validation
    if (data && data.key && data.timestamp && data.value !== undefined) {
        const roomName = `opcua-${data.key}`;
        // Broadcast only to clients interested in this specific node key
        io.to(roomName).emit('opcuaUpdate', data);
        persistOpcuaData(data);      // Add to persistence queue

        // Update status timestamp to show activity, only if connected
        if (statusManager.getServiceStatus(StatusConstants.OPCUA) === StatusConstants.CONNECTED) {
            statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                // Keep existing details, just update timestamp
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
const systemRoutes = require('./src/routes/systemRoutes');
app.use('/api/system', systemRoutes);

const dashboardRoutes = require('./src/routes/dashboardRoutes');
app.use('/api/dashboards', dashboardRoutes); // Apply csrfProtection here if needed for POST/PUT/DELETE

const opcuaRoutes = require('./src/opc-ua/routes/opcuaRoutes');
app.use('/api/opcua', opcuaRoutes); // Apply csrfProtection here if needed

const dbRoutes = require('./src/database/routes/dbRoutes');
app.use('/api/db', dbRoutes);

const certificateRoutes = require('./src/opc-ua/routes/certificateRoutes');
app.use('/api/certificates', certificateRoutes); // Apply csrfProtection here if needed

const statusRoutes = require('./src/routes/statusRoutes');
app.use('/api/status', statusRoutes);

// --- Input Validation Example (Query Params) ---
const Joi = require('joi'); // Ensure Joi is required if not already
const { validateQuery } = require('./src/middleware/validation'); // Assuming you add this

const operationModeSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(5000).default(1000),
    offset: Joi.number().integer().min(0).default(0),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
});

app.get('/api/operation-mode-data', validateQuery(operationModeSchema), async (req, res, next) => {
    try {
        // Access validated query parameters from req.query
        const { limit, offset, startDate, endDate } = req.query;

        let queryText = `
            SELECT timestamp, value
            FROM opcua_data
            WHERE node_key = 'OperationMode' `;
        const queryParams = [];

        if (startDate) { // Already validated as Date objects or undefined
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
        const data = result.rows.map(row => ({
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

const io = socketIo(server, {
    cors: {
        origin:config.CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- Ensure statusManager broadcasts updates ---
statusManager.on('statusChanged', (statusData) => {
    logger.info('[WebSocket] Broadcasting status update to clients.');
    const fullStatus = statusManager.getFullStatus();
    io.emit('statusUpdate', fullStatus); // Broadcast to all clients
});

// --- Socket.IO Authentication Middleware ---
io.use((socket, next) => {
    const req = socket.request;
    // Manually invoke cookie parser middleware for the handshake request
    cookieParser(config.COOKIE_SECRET)(req, {}, (err) => {
        if (err) {
            logger.error('Socket.IO Cookie parsing error:', err);
            return next(new Error('Authentication error: Invalid cookies'));
        }

        logger.info(`Socket.IO connection request received for ${socket.id}. Further authentication may apply.`);
        socket.user = { authenticated: true }; // Mark socket as authenticated
        next();
    });
});
// --- End Socket.IO Authentication Middleware ---

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address; // Handle proxies
    const clientInfo = {
        ip: clientIp,
        userAgent: socket.handshake.headers['user-agent'],
        query: socket.handshake.query,
        connectedAt: new Date()
    };

    connectionTracker.addConnection(socket.id, clientInfo);

    // Double-check authentication status set by middleware
    if (!socket.user?.authenticated) {
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

    // --- Room Management ---
    socket.on('joinRoom', (roomName) => {
        if (typeof roomName === 'string' && roomName.startsWith('opcua-')) {
            socket.join(roomName);
            logger.info(`Socket ${socket.id} joined room: ${roomName}`);
        } else {
            logger.warn(`Socket ${socket.id} attempted to join invalid room: ${roomName}`);
        }
    });

    socket.on('leaveRoom', (roomName) => {
        if (typeof roomName === 'string' && roomName.startsWith('opcua-')) {
            socket.leave(roomName);
            logger.info(`Socket ${socket.id} left room: ${roomName}`);
        } else {
            logger.warn(`Socket ${socket.id} attempted to leave invalid room: ${roomName}`);
        }
    });

    const isAdmin = clientInfo.query?.role === 'admin';
    if (isAdmin) {
        logger.info(`Admin client ${socket.id} connected, enabling certificate management.`);

        const untrustedHandler = (certInfo) => {
            try { // <-- Wrap emit in try/catch
                logger.debug(`Sending untrustedCertificate event to admin client: ${socket.id}`);
                socket.emit('untrustedCertificate', certInfo);
            } catch (emitError) {
                logger.error(`Failed to emit untrustedCertificate to ${socket.id}:`, emitError);
            }
        };
        opcuaConnectionManager.on('untrustedCertificate', untrustedHandler);

        socket.on('acceptCertificate', async (filename) => {
            // ... (accept logic as before) ...
            try {
                const result = await opcuaConnectionManager.acceptCertificate(filename);
                try { // <-- Wrap emit in try/catch
                    socket.emit('certificateAccepted', { success: result, filename, timestamp: new Date().toISOString() });
                } catch (emitError) {
                    logger.error(`Failed to emit certificateAccepted to ${socket.id}:`, emitError);
                }
                // ... (reconnect logic) ...
            } catch (error) {
                logger.error(`Error processing acceptCertificate request from ${socket.id} for ${filename}:`, error);
                try { // <-- Wrap emit in try/catch
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

    socket.on('disconnect', (reason) => {
        connectionTracker.removeConnection(socket.id);
        logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    socket.on('error', (error) => {
        logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
});

// --- Start OPC UA Connection ---
logger.info("Initiating initial OPC UA connection...");
opcuaConnectionManager.startConnection().catch(err => {
    logger.error("Initial OPC UA connection failed:", err);
});

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        logger.error('[CSRF Error - Session Mode] Invalid token detected:', {
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            receivedTokenHeader: req.headers['x-csrf-token'] || 'MISSING',
            receivedCookies: req.cookies, // Log the actual cookies received
            sessionID: req.sessionID || 'N/A', // Log the session ID loaded by express-session
            sessionExists: !!req.session, // Did express-session load a session object?
            // CRITICAL: Log the secret that csurf FOUND in the session for this specific request
            sessionCSRFSecretFoundAtValidation: req.session?.csrfSecret || 'MISSING/DIFFERENT FROM SESSION AT VALIDATION',
            errorDetails: { code: err.code, message: err.message } // Log details from the csurf error
        });
        res.status(403).json({
            status: 'error',
            error: 'Invalid CSRF token. Your security session may be invalid. Please refresh the page and try again.',
            code: 'INVALID_CSRF_TOKEN'
        });
        return; // Ensure we exit the handler here
    }


    // Log the full error stack for debugging
    logger.error("Unhandled error:", {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode || 500
    });

    // Set default status code and message
    const statusCode = err.statusCode || 500;
    let message = err.isOperational ? err.message : 'Internal Server Error';
    if (process.env.NODE_ENV === 'production' && !err.isOperational) {
        message = 'An unexpected error occurred.';
    }

    res.status(statusCode).json({ status: 'error', error: message });
});



// --- Graceful Shutdown ---
const shutdown = async (signal) => {
    logger.warn(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);
    // Set status immediately
    statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });
    statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });

    // --- Add timeout for the entire shutdown process ---
    let shutdownTimer = setTimeout(() => {
        logger.error("[Shutdown] Graceful shutdown OVERALL timeout exceeded (30s). Forcing exit.");
        process.exit(1);
    }, 30000); // 30 second overall timeout

    try {
        // 1. Stop accepting new connections
        logger.info("[Shutdown] Closing HTTP server...");
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    logger.error("[Shutdown] Error closing HTTP server:", err);
                    return reject(err); // Reject promise on error
                }
                logger.info("[Shutdown] HTTP server closed.");
                resolve();
            });
        });

        // 2. Close WebSocket connections
        logger.info("[Shutdown] Closing WebSocket connections...");
        await new Promise((resolve) => {
            io.close(() => {
                logger.info("[Shutdown] All WebSocket connections closed.");
                resolve();
            });
        });

        // 3. Disconnect OPC UA (now with internal timeouts)
        logger.info("[Shutdown] Disconnecting OPC UA...");
        await opcuaConnectionManager.disconnectConnection();
        // Log already happens inside disconnectConnection

        // 4. Close Database Pool
        logger.info("[Shutdown] Closing Database pool...");
        await dbClient.end();
        // Log already happens inside dbClient.end

        logger.info("[Shutdown] Graceful shutdown sequence complete.");
        clearTimeout(shutdownTimer); // Cancel the force exit timer
        process.exit(0); // Exit successfully

    } catch (shutdownError) {
        logger.error("[Shutdown] Error during graceful shutdown sequence:", shutdownError);
        clearTimeout(shutdownTimer); // Cancel the force exit timer
        process.exit(1); // Exit with error
    }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const PORT = config.PORT;
server.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    // Set initial database status after server starts listening
    if (statusManager.getServiceStatus(StatusConstants.DATABASE) === StatusConstants.UNKNOWN) {
        // If connect() hasn't finished yet, keep it as connecting or let connect() update it.
        // If connect() failed, it would be ERROR. If successful, CONNECTED.
        // This avoids overwriting an active status set by connect().
        logger.info("Server listening. Database status managed by connection attempts.");
    }
    // Set initial OPC UA status similarly
    if (statusManager.getServiceStatus(StatusConstants.OPCUA) === StatusConstants.UNKNOWN) {
        logger.info("Server listening. OPC UA status managed by connection attempts.");
    }
});