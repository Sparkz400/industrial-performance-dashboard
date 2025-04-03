require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const dbClient = require('./src/database/dbConnection');
const opcuaConnectionManager = require('./src/opc-ua/services/opcuaConnectionManager');
const helmet = require('helmet');
const { rateLimiter } = require('./src/middleware/security');
const logger = require('./src/utils/logger');
const { AsyncQueue } = require('./src/utils/queue');
const compression = require('compression');
const connectionTracker = require('./src/utils/connectionTracker');
const statusManager = require("./src/utils/status");
const StatusConstants = require('./src/utils/statusConstants');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"], // Example: Adjust based on client needs
            "connect-src": ["'self'", process.env.CLIENT_URL || 'http://localhost:5173', "ws://localhost:3000", "http://localhost:3000"], // Allow self, client origin, and WebSocket/API
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
app.use(cookieParser());

app.set('etag', 'strong');
app.disable('x-powered-by');

const csrfProtection = csrf({
    cookie: {
        httpOnly: true, // Cannot be accessed by client-side scripts
        secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
        sameSite: 'strict' // Helps mitigate CSRF attacks
    }
});

app.use(csrfProtection);

app.get('/api/csrf-token', (req, res) => {
    const token = req.csrfToken();
    logger.info(`[CSRF] Sending token: ${token}, Cookie: ${req.cookies['_csrf'] || 'Not Set Yet'}`);
    res.json({ csrfToken: token });
});

// --- OPC UA Data Queue and Worker ---
const opcuaDataQueue = new AsyncQueue();
const BATCH_SIZE = parseInt(process.env.OPCUA_BATCH_SIZE || '100', 10);
const QUEUE_PROCESS_DELAY = parseInt(process.env.OPCUA_QUEUE_DELAY || '500', 10);
const MAX_QUEUE_LOG_THRESHOLD = parseInt(process.env.OPCUA_QUEUE_WARN_THRESHOLD || '10000', 10);

setInterval(() => {
    const currentSize = opcuaDataQueue.size();
    if (currentSize > 0) {
        logger.info(`OPC UA Data Queue Size: ${currentSize}`);
       if (currentSize > MAX_QUEUE_LOG_THRESHOLD) {
            logger.warn(`OPC UA Data Queue size (${currentSize}) exceeds threshold (${MAX_QUEUE_LOG_THRESHOLD}). Processing might be falling behind.`);
        }
    }
}, 60000);

const persistOpcuaData = (data) => {
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
        // DO NOT prepend the batch back to the queue: opcuaDataQueue.prepend(batch);
        // Consider sending failed batches to a separate log file or dead-letter queue system
        // --- End Log and Drop ---
        return false; // Indicate processing failed for this cycle
    }
};

const processQueue = async () => {
    let isRunning = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // Stop hammering DB if it's consistently failing

    const stopProcessing = () => {
        logger.info("Stopping queue processing loop.");
        isRunning = false;
    };

    process.on('SIGTERM', stopProcessing);
    process.on('SIGINT', stopProcessing);

    logger.info(`Starting OPC UA data queue processor with batch size ${BATCH_SIZE} and delay ${QUEUE_PROCESS_DELAY}ms.`);

    while (isRunning) {
        try {
            const processed = await processOpcuaDataQueue();
            if (processed) {
                consecutiveErrors = 0; // Reset errors on success
                // If processed successfully and queue still has items, process immediately again
                if (!opcuaDataQueue.isEmpty()) {
                    continue; // Skip delay if more data exists
                }
            }
            // Wait only if nothing was processed or queue is empty
            await new Promise(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY));

        } catch (error) { // Catch errors from processOpcuaDataQueue itself (should be rare now)
            logger.error('Unexpected error in queue processing loop:', error);
            consecutiveErrors++;
            if (consecutiveErrors > maxConsecutiveErrors) {
                logger.error(`Queue processor encountered ${consecutiveErrors} consecutive errors. Pausing for 60 seconds.`);
                await new Promise(resolve => setTimeout(resolve, 60000));
                consecutiveErrors = 0; // Reset after pause
            } else {
                // Wait before retrying the loop on error
                await new Promise(resolve => setTimeout(resolve, QUEUE_PROCESS_DELAY * consecutiveErrors));
            }
        }
    }
    logger.info("Queue processing loop finished.");
};

processQueue().catch(err => {
    logger.error('Fatal error: Queue processing loop exited unexpectedly.', err);
    process.exit(1); // Exit if the loop itself crashes
});

const { opcuaEmitter } = require('./src/opc-ua/opcuaClient');

opcuaEmitter.on('nodeChanged', (data) => {
    // Basic validation
    if (data && data.key && data.timestamp && data.value !== undefined) {
        io.emit('opcuaUpdate', data); // Emit to clients
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
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ["GET", "POST"],
        credentials: true
    },
    // Optional: Add ping timeout/interval for connection health
    // pingInterval: 10000,
    // pingTimeout: 5000,
});

// --- Listen for Status Manager Updates and Broadcast ---
statusManager.on('broadcastUpdate', (fullStatus) => {
    logger.info('[WebSocket] Broadcasting status update to clients.');
    io.emit('statusUpdate', fullStatus);
});

io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address; // Handle proxies
    const clientInfo = {
        ip: clientIp,
        userAgent: socket.handshake.headers['user-agent'],
        query: socket.handshake.query,
        connectedAt: new Date()
    };

    connectionTracker.addConnection(socket.id, clientInfo);
    logger.info(`Client connected via WebSocket: ${socket.id} from ${clientIp}`);

    try {
        const currentFullStatus = statusManager.getFullStatus();
        logger.info(`[WebSocket] Sending current status to newly connected client ${socket.id}`);
        socket.emit('statusUpdate', currentFullStatus);
    } catch (error) {
        logger.error(`[WebSocket] Failed to send initial status to ${socket.id}:`, error);
    }

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

    socket.on('disconnect', (reason) => { /* ... */ });
    socket.on('error', (error) => { /* ... */ });
});

// --- Start OPC UA Connection ---
logger.info("Initiating initial OPC UA connection...");
opcuaConnectionManager.startConnection().catch(err => {
    logger.error("Initial OPC UA connection failed:", err);
    // Status will be set to ERROR by the connection manager
});

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
    // --- Handle CSRF Errors Specifically ---
    if (err.code === 'EBADCSRFTOKEN') {
        logger.error('[CSRF Error] Invalid token detected:', {
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            receivedTokenHeader: req.headers['x-csrf-token'] || 'MISSING', // Check specific header
            receivedCookies: req.cookies, // Log parsed cookies
            expectedSecret: req.session?.csrfSecret || 'N/A (Session Missing/Unused)', // If using session storage for secret
            cookieSecret: req.secret || 'N/A (No req.secret)' // If using cookie signing secret
        });
        res.status(403).json({
            status: 'error',
            error: 'Invalid CSRF token. Please refresh the page or token and try again.',
            code: 'INVALID_CSRF_TOKEN'
        });
        return; // Stop further processing
    }
    // --- End CSRF Error Handling ---


    // Log the full error stack for debugging
    logger.error("Unhandled error:", { /* ... logging details ... */ });

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
    logger.warn(`Received ${signal}. Starting graceful shutdown...`);
    statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });
    statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, { message: "Server shutting down" });

    // 1. Stop accepting new connections
    server.close(async (err) => {
        if (err) {
            logger.error("Error closing HTTP server:", err);
            process.exit(1); // Exit immediately if server can't close
        }
        logger.info("HTTP server closed. No longer accepting connections.");

        // 2. Close WebSocket connections gracefully (optional, Socket.IO handles some of this)
        io.close(() => {
            logger.info("All WebSocket connections closed.");
        });

        // 3. Disconnect OPC UA
        try {
            await opcuaConnectionManager.disconnectConnection();
            logger.info("OPC UA connection closed.");
        } catch (opcErr) {
            logger.error("Error during OPC UA disconnection:", opcErr);
        }

        // 4. Close Database Pool
        try {
            await dbClient.end(); // Use the end method from DatabaseManager
            logger.info("Database pool closed.");
        } catch (dbErr) {
            logger.error("Error closing database pool:", dbErr);
        }

        // 5. Add delay for any pending queue processing (optional)
        logger.info("Waiting briefly for queue processing...");
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        logger.info("Graceful shutdown complete.");
        process.exit(0); // Exit successfully
    });

    // Force shutdown after a timeout if graceful shutdown hangs
    setTimeout(() => {
        logger.error("Graceful shutdown timed out. Forcing exit.");
        process.exit(1);
    }, 15000); // 15 second timeout
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const PORT = process.env.PORT || 3000;
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