const express = require('express');
const os = require('os');
const router = express.Router();
const logger = require('../utils/logger');
const connectionTracker = require('../utils/connectionTracker');

// Get server start time (when the process was started)
const serverStartTime = new Date();

/**
 * Helper function to convert bytes to MB
 */
const bytesToMB = (bytes) => Math.round(bytes / (1024 * 1024));

/**
 * Calculate CPU usage percentage
 * This is more complex because we need to compare usage over time
 */
let previousCpuUsage = null;
let previousCpuTime = 0;

const calculateCpuUsage = () => {
    const cpus = os.cpus();

    // Calculate total CPU time across all cores
    let totalIdle = 0;
    let totalTick = 0;

    for(const cpu of cpus) {
        for(const type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    }

    // Calculate difference from previous reading
    if (previousCpuUsage === null) {
        previousCpuUsage = { idle: totalIdle, total: totalTick };
        return 0; // First reading - return 0
    }

    const idleDifference = totalIdle - previousCpuUsage.idle;
    const totalDifference = totalTick - previousCpuUsage.total;

    // Update previous values for next calculation
    previousCpuUsage = { idle: totalIdle, total: totalTick };

    // Calculate CPU usage percentage
    const usage = 100 - Math.floor(100 * idleDifference / totalDifference);
    return Math.min(100, Math.max(0, usage)); // Ensure between 0-100
};

/**
 * GET /api/system/stats
 * Returns system statistics
 */
router.get('/stats', (req, res) => {
    try {
        // Get uptime in seconds
        const uptime = Math.floor(process.uptime());

        // Memory usage
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        // CPU usage
        const cpuUsage = calculateCpuUsage();

        // OS information
        const platform = {
            type: os.type(),
            platform: os.platform(),
            release: os.release(),
            architecture: os.arch()
        };

        // Process information
        const processMemoryUsage = process.memoryUsage();

        // Prepare and send response
        const stats = {
            uptime,
            memoryUsage: {
                total: bytesToMB(totalMemory),
                used: bytesToMB(usedMemory),
                free: bytesToMB(freeMemory),
                percentUsed: Math.round((usedMemory / totalMemory) * 100)
            },
            cpuUsage,
            cpuInfo: {
                cores: os.cpus().length,
                model: os.cpus()[0].model,
                speed: os.cpus()[0].speed
            },
            platform,
            processMemory: {
                rss: bytesToMB(processMemoryUsage.rss),
                heapTotal: bytesToMB(processMemoryUsage.heapTotal),
                heapUsed: bytesToMB(processMemoryUsage.heapUsed),
                external: bytesToMB(processMemoryUsage.external || 0)
            },
            activeConnections: connectionTracker.getActiveConnectionCount(),
            lastRestart: serverStartTime.toISOString()
        };

        res.json(stats);
    } catch (error) {
        logger.error('Error getting system stats:', error);
        res.status(500).json({
            error: 'Error retrieving system statistics',
            message: error.message
        });
    }
});

router.get('/connections', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20; // Default to 20 items

        const stats = {
            activeCount: connectionTracker.getActiveConnectionCount(),
            activeConnections: connectionTracker.getConnectedClients(),
            history: connectionTracker.getConnectionHistory(limit)
        };

        res.json(stats);
    } catch (error) {
        logger.error('Error fetching connection stats:', error);
        res.status(500).json({
            error: 'Error retrieving connection statistics',
            message: error.message
        });
    }
});

// Export the router
module.exports = router;
