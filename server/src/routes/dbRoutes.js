const express = require('express');
const router = express.Router();
const dbPool = require('../services/dbConnection');
const logger = require('../utils/logger');

// A simple test endpoint to verify DB connectivity.
router.get('/test', async (req, res, next) => {
    try {
        const result = await dbPool.query('SELECT NOW()');
        res.json({ status: 'ok', time: result.rows[0] });
    } catch (err) {
        logger.error("Database query error:", err);
        next(err);
    }
});

module.exports = router;