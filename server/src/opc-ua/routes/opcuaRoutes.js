const express = require('express');
const router = express.Router();
const opcuaConnectionManager = require('../services/opc-ua/opcuaConnectionManager');
const logger = require('../utils/logger');
const Joi = require('joi');
const { validateBody } = require('../middleware/validation');

// Enhanced connection schema with security options
const opcuaConnectionSchema = Joi.object({
    ip: Joi.string().required().hostname(),
    port: Joi.number().port().required(),
    resourcePath: Joi.string().default('/UA/MyLittleServer'),
    securityMode: Joi.string().valid('None', 'Sign', 'SignAndEncrypt').default('None'),
    securityPolicy: Joi.string().default('None')
});

// Get current OPC UA connection status including security settings
router.get('/status', (req, res) => {
    const connectionInfo = opcuaConnectionManager.getConnectionInfo();

    // Format response for client
    res.json({
        connected: connectionInfo.connected,
        status: connectionInfo.status,
        statusText: connectionInfo.statusText,
        config: {
            ip: connectionInfo.config.ip,
            port: connectionInfo.config.port,
            resourcePath: connectionInfo.config.resourcePath,
            securityMode: connectionInfo.securityMode || connectionInfo.config.securityMode,
            securityPolicy: connectionInfo.securityPolicy || connectionInfo.config.securityPolicy
        },
        details: connectionInfo.details,
        lastUpdated: connectionInfo.lastUpdated
    });
});

// Connect/update OPC UA connection using provided settings
router.post('/connect', validateBody(opcuaConnectionSchema), async (req, res) => {
    try {
        const { ip, port, resourcePath, securityMode, securityPolicy } = req.body;

        // Log connection attempt with security details
        logger.info(`Attempting to connect to OPC UA server: ${ip}:${port}${resourcePath} with SecurityMode=${securityMode}, SecurityPolicy=${securityPolicy}`);

        const newConfig = {
            ip,
            port,
            resourcePath: resourcePath || "/UA/MyLittleServer",
            securityMode: securityMode || "None",
            securityPolicy: securityPolicy || "None"
        };

        const config = await opcuaConnectionManager.updateConnection(newConfig);

        res.json({
            message: "OPC UA connection reinitialized",
            config,
            securityMode: newConfig.securityMode,
            securityPolicy: newConfig.securityPolicy
        });
    } catch (error) {
        logger.error("Error in OPC UA connect endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

// Disconnect current OPC UA connection
router.post('/disconnect', async (req, res) => {
    try {
        await opcuaConnectionManager.disconnectConnection();
        res.json({ message: "OPC UA connection disconnected" });
    } catch (error) {
        logger.error("Error in OPC UA disconnect endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

// Get available security options
router.get('/security-options', (req, res) => {
    try {
        const securityOptions = opcuaConnectionManager.getSecurityOptions();
        res.json(securityOptions);
    } catch (error) {
        logger.error("Error getting security options:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;