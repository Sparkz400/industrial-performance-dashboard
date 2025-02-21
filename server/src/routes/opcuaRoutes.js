const express = require('express');
const router = express.Router();
const opcuaConnectionManager = require('../services/opcuaConnectionManager');

// Get current OPC UA connection status
router.get('/status', (req, res) => {
    res.json(opcuaConnectionManager.getConnectionStatus());
});

// Connect/update OPC UA connection using provided settings
router.post('/connect', (req, res) => {
    const { ip, port, resourcePath } = req.body;
    if (!ip || !port) {
        return res.status(400).json({ error: "IP and port are required" });
    }
    opcuaConnectionManager.updateConnection({
        ip,
        port,
        resourcePath: resourcePath || "/UA/MyLittleServer"
    })
        .then(newConfig => {
            res.json({ message: "OPC UA connection reinitialized", config: newConfig });
        })
        .catch(err => {
            res.status(500).json({ error: err.message });
        });
});

// Disconnect current OPC UA connection
router.post('/disconnect', (req, res) => {
    opcuaConnectionManager.disconnectConnection()
        .then(() => res.json({ message: "OPC UA connection disconnected" }))
        .catch(err => res.status(500).json({ error: err.message }));
});

module.exports = router;
