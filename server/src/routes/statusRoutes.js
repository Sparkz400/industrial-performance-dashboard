const express = require('express');
const router = express.Router();
const statusManager = require('../utils/status');
const StatusConstants = require('../utils/statusConstants');
const opcuaManager = require('../services/opcuaConnectionManager');
const logger = require('../utils/logger');
const { rateLimiter } = require('../middleware/security');

/**
 * GET /api/status
 * Returns a standardized status format that's consistent for client display
 */
router.get('/', rateLimiter, (req, res) => {
    const rawStatus = statusManager.getFullStatus();

    // Create a standardized status response that the client can easily parse
    const standardizedStatus = {
        database: {
            status: rawStatus.status[StatusConstants.DATABASE],
            statusText: StatusConstants.getStatusLabel(rawStatus.status[StatusConstants.DATABASE]),
            statusColor: StatusConstants.getStatusColor(rawStatus.status[StatusConstants.DATABASE]),
            details: rawStatus.details[StatusConstants.DATABASE] || {}
        },
        opcua: {
            status: rawStatus.status[StatusConstants.OPCUA],
            statusText: StatusConstants.getStatusLabel(rawStatus.status[StatusConstants.OPCUA]),
            statusColor: StatusConstants.getStatusColor(rawStatus.status[StatusConstants.OPCUA]),
            details: rawStatus.details[StatusConstants.OPCUA] || {}
        },
        overall: {
            status: rawStatus.overall,
            statusText: rawStatus.overallLabel,
            statusColor: StatusConstants.getStatusColor(rawStatus.overall)
        },
        lastUpdated: rawStatus.lastUpdated
    };

    res.json(standardizedStatus);
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
    const isAdmin = req.headers['x-api-key'] === process.env.ADMIN_API_KEY;

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