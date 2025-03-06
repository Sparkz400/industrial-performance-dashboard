require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const dbClient = require('./src/database/dbConnection');
const opcuaConnectionManager = require('./src/opc-ua/services/opcuaConnectionManager');
const helmet = require('helmet');
const { rateLimiter } = require('./src/middleware/security');
const logger = require('./src/utils/logger');
const { AsyncQueue } = require('./src/utils/queue');
const compression = require('compression');
const connectionTracker = require('./src/utils/connectionTracker');

const app = express();
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(helmet());
app.use(rateLimiter);
app.use(compression());
app.set('etag', 'strong');
app.disable('x-powered-by');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"], // Adjust based on needs
        },
    },
    crossOriginEmbeddedPolicy: false,
}));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- OPC UA Data Queue and Worker ---
const opcuaDataQueue = new AsyncQueue();

const persistOpcuaData = (data) => {
    opcuaDataQueue.enqueue(data);
};

const processOpcuaDataQueue = async () => {
    const batch = opcuaDataQueue.drain(100); // Process in batches of 100
    if (batch.length === 0) return false;
    try {
        await dbClient.query(`
            INSERT INTO opcua_data(node_key, node_label, timestamp, value)
            SELECT * FROM UNNEST($1::text[], $2::text[], $3::timestamptz[], $4::float[])
        `, [
            batch.map(d => d.key),
            batch.map(d => d.label),
            batch.map(d => new Date(d.timestamp)),
            batch.map(d => d.value)
        ]
        );
        return true;
    } catch (error) {
        logger.error('Batch insert error:', error);
        opcuaDataQueue.prepend(batch);
        return false;
    }
};

const processQueue = async (options = { delay: 500, maxRetries: 3 }) => {
    let isRunning = true;

    // Graceful shutdown handler
    process.on('SIGTERM', () => {
        isRunning = false;
    });

    while (isRunning) {
        try {
            const processed = await processOpcuaDataQueue();
            if (!processed) {
                await new Promise(resolve => setTimeout(resolve, options.delay));
            }
        } catch (error) {
            logger.error('Queue processing error:', error);
            await new Promise(resolve => setTimeout(resolve, options.delay));
        }
    }
};

processQueue().catch(err => {
    logger.error('Fatal error in queue processing:', err);
    process.exit(1);
});

// --- Listen for OPC UA Data ---
const { opcuaEmitter } = require('./src/opc-ua/opcuaClient');
const StatusConstants = require('./src/utils/statusConstants');

opcuaEmitter.on('nodeChanged', (data) => {
    io.emit('opcuaUpdate', data);
    persistOpcuaData(data);

    // Update status timestamp to show activity
    statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
        message: 'Data received',
        lastDataTimestamp: data.timestamp
    });
});

// --- REST Routes ---
const systemRoutes = require('./src/routes/systemRoutes');
app.use('/api/system', systemRoutes);

const dashboardRoutes = require('./src/routes/dashboardRoutes');
app.use('/api/dashboards', dashboardRoutes);

const opcuaRoutes = require('./src/opc-ua/routes/opcuaRoutes');
app.use('/api/opcua', opcuaRoutes);

const dbRoutes = require('./src/database/routes/dbRoutes');
app.use('/api/db', dbRoutes);

const certificateRoutes = require('./src/opc-ua/routes/certificateRoutes');
app.use('/api/certificates', certificateRoutes);

const statusRoutes = require('./src/routes/statusRoutes');
const statusManager = require("./src/utils/status");
app.use('/api/status', statusRoutes);

app.get('/api/operation-mode-data', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const queryText = `
      SELECT timestamp, value
      FROM opcua_data
      WHERE node_key = 'OperationMode'
      ORDER BY timestamp
      LIMIT $1 OFFSET $2
    `;
        const result = await dbClient.query(queryText, [limit, offset]);
        const data = result.rows.map(row => ({
            time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode: row.value,
        }));
        res.json(data);
    } catch (err) {
        logger.error('Error fetching operation mode data:', err);
        next(err);
    }
});

// --- WebSocket Connection ---
io.on('connection', (socket) => {
    // Get connection info
    const clientIp = socket.handshake.address;
    const clientInfo = {
        ip: clientIp,
        userAgent: socket.handshake.headers['user-agent'],
        query: socket.handshake.query
    };

    // Track the new connection
    connectionTracker.addConnection(socket.id, clientInfo);

    logger.info(`Client connected via WebSocket: ${socket.id} from ${clientIp}`);

    // Set up certificate event handlers
    // Forward untrusted certificate events to clients
    opcuaConnectionManager.on('untrustedCertificate', (certInfo) => {
        logger.info(`Sending untrustedCertificate event to clients: ${certInfo.filename}`);
        socket.emit('untrustedCertificate', certInfo);
    });

    // Handle certificate acceptance requests from clients
    socket.on('acceptCertificate', async (filename) => {
        logger.info(`Received acceptCertificate request for: ${filename}`);
        try {
            const result = await opcuaConnectionManager.acceptCertificate(filename);
            socket.emit('certificateAccepted', {
                success: result,
                filename,
                timestamp: new Date().toISOString()
            });

            // Try to reconnect if needed
            if (result && statusManager.getServiceStatus(StatusConstants.OPCUA) !== StatusConstants.CONNECTED) {
                setTimeout(() => {
                    opcuaConnectionManager.startConnection().catch(err => {
                        logger.error("Error reconnecting after certificate acceptance:", err);
                    });
                }, 2000);
            }
        } catch (error) {
            logger.error(`Error accepting certificate ${filename}:`, error);
            socket.emit('certificateAccepted', {
                success: false,
                filename,
                error: error.message
            });
        }
    });

    // Track disconnection
    socket.on('disconnect', () => {
        connectionTracker.removeConnection(socket.id);
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

// --- Start OPC UA Connection ---
void opcuaConnectionManager.startConnection();

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
    logger.error(err.stack);
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal Server Error';
    res.status(statusCode).json({ error: message });
});

// --- Graceful Shutdown ---
const shutdown = async () => {
    logger.info("Shutting down server...");
    try {
        statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
            message: "Server shutting down"
        });
        statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
            message: "Server shutting down"
        });

        await opcuaConnectionManager.disconnectConnection();
        await dbClient.end();
        server.close(() => {
            logger.info("HTTP server closed.");
            process.exit(0);
        });
    } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});