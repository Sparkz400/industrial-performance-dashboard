const express = require('express');
const router = express.Router();
const statusManager = require('../utils/status');
const StatusConstants = require('../utils/statusConstants');
const opcuaManager = require('../opc-ua/services/opcuaConnectionManager');
const { rateLimiter } = require('../middleware/security');
const config = require('../config/config');

/**
 * GET /api/status
 * Returns a standardized status format that's consistent for client display
 */
router.get('/', rateLimiter, (req, res) => {
    // Get the status object - it's already in the desired format
    const statusResponse = statusManager.getFullStatus();

    // Simply send the response directly
    res.json(statusResponse);
});

/**
 * GET /api/status/health
 * Simple health check endpoint
 */
router.get('/health', (req, res) => {
    const overallStatus = statusManager.getOverallStatus();
    const isHealthy = [
        StatusConstants.CONNECTED,
        StatusConstants.WARNING
    ].includes(overallStatus);

    if (isHealthy) {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: 'Service Unavailable',
            statusText: StatusConstants.getStatusLabel(overallStatus)
        });
    }
});

/**
 * GET /api/status/debug
 * Detailed status for debugging purposes (admin only)
 */
router.get('/debug', (req, res) => {
    // Check for admin authorization
    const isAdmin = req.headers['x-api-key'] === config.ADMIN_API_KEY;

    if (!isAdmin) {
        return res.status(403).json({
            error: 'Unauthorized access to debug information'
        });
    }

    // Include extra diagnostic info
    const diagnosticData = {
        ...statusManager.getFullStatus(),
        opcuaConnection: opcuaManager.getConnectionInfo(),
        system: {
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            nodeVersion: process.version,
            platform: process.platform
        }
    };

    res.json(diagnosticData);
});

module.exports = router;