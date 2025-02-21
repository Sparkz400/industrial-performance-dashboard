const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('pg');
const cors = require('cors');
const opcuaConnectionManager = require('./src/services/opcuaConnectionManager');
const status = require('./src/utils/status');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:5173", // Adjust for your client URL
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- PostgreSQL Setup ---
const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'root',
    database: 'postgres'
});

pgClient.connect()
    .then(() => {
        console.log('Connected to PostgreSQL');
        status.setDatabaseStatus("connected");
    })
    .catch(err => {
        console.error('PostgreSQL connection error:', err.stack);
        status.setDatabaseStatus("error");
    });

// --- OPC UA Data Handling (Queue & Worker) ---
const opcuaDataQueue = [];

function persistOpcuaData(data) {
    opcuaDataQueue.push(data);
}

function processOpcuaDataQueue() {
    if (opcuaDataQueue.length === 0) return;

    const data = opcuaDataQueue.shift();
    pgClient.query(
        'INSERT INTO opcua_data(node_key, node_label, timestamp, value) VALUES ($1, $2, to_timestamp($3 / 1000.0), $4)',
        [data.key, data.label, data.timestamp, data.value]
    )
        .then(result => {
            console.log(`Logged ${data.key} (${data.label}): ${data.value} at ${new Date(data.timestamp).toISOString()}`);
        })
        .catch(e => {
            console.error('Error inserting OPC UA data into DB:', e);
            opcuaDataQueue.unshift(data);
        });
}
setInterval(processOpcuaDataQueue, 1000);

// --- Listen for OPC UA Data ---
const { opcuaEmitter } = require('./src/services/opcuaClient');
opcuaEmitter.on('nodeChanged', (data) => {
    io.emit('opcuaUpdate', data);
    persistOpcuaData(data);
});

// --- Use the OPC UA Router ---
const opcuaRoutes = require('./src/routes/opcuaRoutes');
app.use('/api/opcua', opcuaRoutes);

// --- Other REST Endpoints ---
app.get('/api/status', (req, res) => {
    res.json(status.getStatus());
});

app.get('/api/operation-mode-data', async (req, res) => {
    try {
        const queryText = `
      SELECT timestamp, value 
      FROM opcua_data 
      WHERE node_key = 'OperationMode'
      ORDER BY timestamp
    `;
        const result = await pgClient.query(queryText);
        // Map each row into an object with "time" and "mode"
        const data = result.rows.map(row => ({
            time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            mode: row.value
        }));
        res.json(data);
    } catch (err) {
        console.error("Error fetching operation mode data:", err);
        res.status(500).json({ error: err.message });
    }
});


// --- WebSocket Setup ---
io.on('connection', (socket) => {
    console.log('A client connected via WebSocket');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// --- Start OPC UA Connection at Startup ---
opcuaConnectionManager.startConnection();

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
