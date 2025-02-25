const express = require('express');
const router = express.Router();
const opcuaConnectionManager = require('../services/opcuaConnectionManager');
const logger = require('../utils/logger');

// Get current OPC UA connection status.
router.get('/status', (req, res) => {
    const status = opcuaConnectionManager.getConnectionStatus() || { database: "not connected", opcua: "not connected" };
    res.json({
        connected: status.opcua === 'connected',
        config: {
            ip: process.env.OPCUA_IP || "localhost",
            port: process.env.OPCUA_PORT || 4840,
            resourcePath: process.env.OPCUA_RESOURCE_PATH || "/UA/MyLittleServer"
        }
    });
});

// Connect/update OPC UA connection using provided settings.
router.post('/connect', async (req, res) => {
    try {
        const { ip, port, resourcePath } = req.body;
        if (!ip || !port) {
            return res.status(400).json({ error: "IP and port are required" });
        }
        const newConfig = { ip, port, resourcePath: resourcePath || "/UA/MyLittleServer" };
        const config = await opcuaConnectionManager.updateConnection(newConfig);
        res.json({ message: "OPC UA connection reinitialized", config });
    } catch (error) {
        logger.error("Error in OPC UA connect endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

// Disconnect current OPC UA connection.
router.post('/disconnect', async (req, res) => {
    try {
        await opcuaConnectionManager.disconnectConnection();
        res.json({ message: "OPC UA connection disconnected" });
    } catch (error) {
        logger.error("Error in OPC UA disconnect endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;