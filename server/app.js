const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Client } = require('pg');
const cors = require('cors');
const opcuaClient = require('./src/services/opcuaClient');
const status = require('./src/utils/status');
const { setOpcuaStatus } = require("./src/utils/status");

const app = express();
app.use(cors());

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

// Function to persist sensor data robustly
function persistSensorData(data) {
    pgClient.query(
        'INSERT INTO sensor_data(timestamp, value) VALUES (to_timestamp($1 / 1000.0), $2)',
        [data.timestamp, data.value]
    )
        .then(() => {
            // Successfully inserted
        })
        .catch(e => {
            console.error('Error inserting sensor data into DB:', e);
            // Optionally retry after 5 seconds
            setTimeout(() => persistSensorData(data), 5000);
        });
}

// Listen for sensor data from OPC UA
const { opcuaEmitter } = opcuaClient;
opcuaEmitter.on('sensorData', (data) => {
    // Emit data via WebSocket
    io.emit('sensorUpdate', data);
    // Persist data into PostgreSQL
    persistSensorData(data);
});

// Function to start OPC UA connection with reconnection logic
function startOpcuaConnection() {
    opcuaClient.connectAndSubscribe()
        .then(_ => {
            console.log('OPC UA connection and subscription successful:');
            setOpcuaStatus("connected");
        })
        .catch(err => {
            console.error('Error during OPC UA connection and subscription:', err);
            setOpcuaStatus("error");
            // Retry after 5 seconds
            setTimeout(startOpcuaConnection, 5000);
        });
}

// Start OPC UA connection routine
startOpcuaConnection();

// --- REST Endpoints ---
app.get('/api/status', (req, res) => {
    res.json(status.getStatus());
});

app.get('/api/data', (req, res) => {
    pgClient.query('SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 10')
        .then(result => res.json(result.rows))
        .catch(e => res.status(500).json({ error: e.message }));
});

// --- WebSocket Setup ---
io.on('connection', (socket) => {
    console.log('A client connected via WebSocket');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
