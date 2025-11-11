const express = require('express');
const router = express.Router();
const opcuaConnectionManager = require('../services/opcuaConnectionManager');
const logger = require('../../utils/logger');
const Joi = require('joi');
const { validateBody } = require('../../middleware/validation');

// Enhanced connection schema with security options
const opcuaConnectionSchema = Joi.object({
    ip: Joi.string().required(),
    port: Joi.number().port().required(),
    resourcePath: Joi.string().allow('').default(''),
    securityMode: Joi.string().valid('None', 'Sign', 'SignAndEncrypt').default('None'),
    securityPolicy: Joi.string().default('None')
});

/**
 * GET /api/opcua/status
 * Get current OPC UA connection status including security settings
 */
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

/**
 * POST /api/opcua/connect
 * Connect/update OPC UA connection using provided settings
 */
router.post('/connect', validateBody(opcuaConnectionSchema), async (req, res) => {
    try {
        const { ip, port, resourcePath, securityMode, securityPolicy } = req.body;

        const normalizedPath =
            typeof resourcePath === 'string'
                ? resourcePath.trim() === '' || resourcePath.trim() === '/'
                    ? ''                                   // leer oder "/" => kein Pfad
                    : resourcePath.trim().startsWith('/')
                        ? resourcePath.trim()
                        : `/${resourcePath.trim()}`
                : '';

        const newConfig = {
            ip,
            port,
            resourcePath: normalizedPath,             // <- kein Fallback mehr
            securityMode: securityMode || 'None',
            securityPolicy: securityPolicy || 'None'
        };

        const config = await opcuaConnectionManager.updateConnection(newConfig);

        res.json({
            message: 'OPC UA connection reinitialized',
            config,
            securityMode: newConfig.securityMode,
            securityPolicy: newConfig.securityPolicy
        });
    } catch (error) {
        logger.error("Error in OPC UA connect endpoint:", error);
        res.status(500).json({
            error: "Connection failed",
            message: error.message,
            config: opcuaConnectionManager.getConnectionInfo().config
        });
    }
});

/**
 * POST /api/opcua/disconnect
 * Disconnect current OPC UA connection
 */
router.post('/disconnect', async (req, res) => {
    try {
        await opcuaConnectionManager.disconnectConnection();
        res.json({ message: "OPC UA connection disconnected" });
    } catch (error) {
        logger.error("Error in OPC UA disconnect endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/opcua/security-options
 * Get available security options
 */
router.get('/security-options', (req, res) => {
    try {
        const securityOptions = opcuaConnectionManager.getSecurityOptions();

        // Add the current configuration
        const connectionInfo = opcuaConnectionManager.getConnectionInfo();

        res.json({
            securityModes: securityOptions.securityModes,
            securityPolicies: securityOptions.securityPolicies,
            current: {
                securityMode: connectionInfo.securityMode || connectionInfo.config.securityMode,
                securityPolicy: connectionInfo.securityPolicy || connectionInfo.config.securityPolicy,
                ip: connectionInfo.config.ip,
                port: connectionInfo.config.port,
                resourcePath: connectionInfo.config.resourcePath
            }
        });
    } catch (error) {
        logger.error("Error getting security options:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/opcua/accept-certificate
 * Accept a previously rejected certificate and try reconnecting
 */
router.post('/accept-certificate/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        if (!filename) {
            return res.status(400).json({
                error: "Invalid request",
                message: "Certificate filename is required"
            });
        }

        logger.info(`Accepting certificate: ${filename}`);
        const result = await opcuaConnectionManager.acceptCertificate(filename);

        if (result) {
            res.json({
                success: true,
                message: "Certificate accepted successfully"
            });

            // Try to reconnect with the last configuration 
            // but don't wait for it to complete before responding
            setTimeout(() => {
                opcuaConnectionManager.startConnection().catch(err => {
                    logger.error("Error reconnecting after certificate acceptance:", err);
                });
            }, 1000);
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to accept certificate"
            });
        }
    } catch (error) {
        logger.error("Error accepting certificate:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/opcua/test-connection
 * Test connection to server without changing current connection
 */
router.post('/test-connection', validateBody(opcuaConnectionSchema), async (req, res) => {
    try {
        const { ip, port, resourcePath, securityMode, securityPolicy } = req.body;

        logger.info(`Testing connection to OPC UA server: ${ip}:${port}${resourcePath} with SecurityMode=${securityMode}, SecurityPolicy=${securityPolicy}`);

        // This doesn't save the new connection or interrupt the existing one
        const endpointUrl = `opc.tcp://${ip}:${port}${resourcePath}`;
        const securityOptions = { securityMode, securityPolicy };

        const connectionPromise = opcuaConnectionManager.getConnectionPromise(endpointUrl, securityOptions);
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Connection test timeout after 10 seconds")), 10000);
        });

        const connectionResult = await Promise.race([connectionPromise, timeoutPromise]);

        if (connectionResult) {
            // Close the test connection immediately
            if (connectionResult.session) await connectionResult.session.close();
            if (connectionResult.client) await connectionResult.client.disconnect();

            res.json({
                success: true,
                message: "Connection test successful",
                securityMode: connectionResult.securityMode,
                securityPolicy: connectionResult.securityPolicy
            });
        } else {
            throw new Error("Connection test failed - null connection");
        }
    } catch (error) {
        logger.error("Error testing OPC UA connection:", error);
        res.status(500).json({
            success: false,
            error: "Connection test failed",
            message: error.message
        });
    }
});

module.exports = router;