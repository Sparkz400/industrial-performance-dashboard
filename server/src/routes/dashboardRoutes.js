const express = require('express');
const router = express.Router();
const dbClient = require('../services/dbConnection');
const logger = require('../utils/logger');
const { schemas, validateBody, validateParams } = require('../middleware/validation');
const Joi = require('joi');

// ID validation schema
const idParamSchema = Joi.object({
    id: Joi.string().required().min(3).max(100)
});

router.use((err, req, res, next) => {
    logger.error('Dashboard route error:', err);

    // Determine if this is a known error type
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.message
        });
    }

    if (err.code === '23505') {
        return res.status(409).json({
            error: 'Conflict Error',
            details: 'A dashboard with this ID already exists'
        });
    }

    // Database connection errors
    if (err.code === 'ECONNREFUSED' || err.code === '08006') {
        return res.status(503).json({
            error: 'Database Connection Error',
            details: 'Unable to connect to the database'
        });
    }

    // Default to 500 for unknown errors
    res.status(500).json({
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err.message
    });
});

// GET /api/dashboards
// Returns all dashboards
router.get('/', async (req, res, next) => {
    try {
        const result = await dbClient.query('SELECT * FROM dashboards ORDER BY name');

        // If no dashboards exist, create a default one
        if (result.rows.length === 0) {
            logger.info('No dashboards found. Creating a default dashboard.');

            const defaultDashboard = {
                id: 'dashboard-default-' + Date.now(),
                name: 'Default Dashboard',
                widgets: [],
                layout: []
            };

            // Insert the default dashboard
            const insertQuery = `
                INSERT INTO dashboards (id, name, widgets, layout)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            `;

            const widgetsJson = JSON.stringify(defaultDashboard.widgets);
            const layoutJson = JSON.stringify(defaultDashboard.layout);

            const insertResult = await dbClient.query(insertQuery, [
                defaultDashboard.id,
                defaultDashboard.name,
                widgetsJson,
                layoutJson
            ]);

            // Return the newly created dashboard
            res.json(insertResult.rows);
        } else {
            // Return existing dashboards
            res.json(result.rows);
        }
    } catch (err) {
        logger.error('Error fetching dashboards:', err);
        next(err);
    }
});

// POST /api/dashboards/:id
// Replace the POST endpoint in server/src/routes/dashboardRoutes.js with this debug version

// POST /api/dashboards/:id
// Debug version with extensive error trapping
router.post('/:id', async (req, res) => {
    let client = null;

    try {
        // Validate ID parameter
        const id = req.params.id;
        if (!id || id.length < 3) {
            return res.status(400).json({
                error: 'Validation Error',
                message: 'Invalid dashboard ID'
            });
        }

        // Basic validation of body
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({
                error: 'Validation Error',
                message: 'Dashboard name is required'
            });
        }

        // Extract widgets and layout, normalize to arrays and stringify
        let widgets = req.body.widgets || [];
        let layout = req.body.layout || [];

        // Convert to arrays if needed
        if (typeof widgets === 'string') {
            try {
                widgets = JSON.parse(widgets);
            } catch (e) {
                console.error('⚠️ Error parsing widgets JSON, using empty array:', e.message);
                widgets = [];
            }
        } else if (!Array.isArray(widgets)) {
            widgets = [];
        }

        if (typeof layout === 'string') {
            try {
                layout = JSON.parse(layout);
            } catch (e) {
                console.error('⚠️ Error parsing layout JSON, using empty array:', e.message);
                layout = [];
            }
        } else if (!Array.isArray(layout)) {
            layout = [];
        }

        // Safely stringify
        const widgetsJson = JSON.stringify(widgets);
        const layoutJson = JSON.stringify(layout);

        // Get database connection
        try {
            client = await dbClient.pool.connect();
        } catch (dbConnErr) {
            console.error('❌ Database connection error:', dbConnErr);
            return res.status(503).json({
                error: 'Database Error',
                message: 'Unable to connect to database'
            });
        }

        try {
            // Begin transaction
            await client.query('BEGIN');

            // Perform insert/update
            const query = `
                INSERT INTO dashboards (id, name, widgets, layout)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET
                                           name = EXCLUDED.name,
                                           widgets = EXCLUDED.widgets,
                                           layout = EXCLUDED.layout
                RETURNING *;
            `;

            const result = await client.query(query, [
                id,
                name.trim(),
                widgetsJson,
                layoutJson
            ]);

            // Log the operation - optional history tracking
            try {
                const historyQuery = `
                    INSERT INTO dashboard_history (dashboard_id, action, timestamp, user_id)
                    VALUES ($1, $2, NOW(), $3);
                `;
                await client.query(historyQuery, [
                    id,
                    'UPDATE',
                    'system'
                ]);
            } catch (historyErr) {
                // Non-critical error, just log it
                console.warn('⚠️ Error updating history:', historyErr.message);
            }

            // Commit the transaction
            await client.query('COMMIT');

            // Prepare response data
            let savedDashboard = result.rows[0];

            // Ensure widgets and layout in response are arrays
            try {
                if (typeof savedDashboard.widgets === 'string') {
                    savedDashboard.widgets = JSON.parse(savedDashboard.widgets);
                }
                if (!Array.isArray(savedDashboard.widgets)) {
                    savedDashboard.widgets = [];
                }
            } catch (e) {
                console.warn('⚠️ Error parsing widgets for response:', e.message);
                savedDashboard.widgets = [];
            }

            try {
                if (typeof savedDashboard.layout === 'string') {
                    savedDashboard.layout = JSON.parse(savedDashboard.layout);
                }
                if (!Array.isArray(savedDashboard.layout)) {
                    savedDashboard.layout = [];
                }
            } catch (e) {
                console.warn('⚠️ Error parsing layout for response:', e.message);
                savedDashboard.layout = [];
            }

            return res.json(savedDashboard);

        } catch (queryErr) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackErr) {
                    console.error('❌ Error during rollback:', rollbackErr);
                }
            }

            console.error('❌ Database query error:', queryErr);

            // More specific error handling
            if (queryErr.code === '42P01') {
                return res.status(500).json({
                    error: 'Database Error',
                    message: 'Table does not exist. Did you run the database setup?'
                });
            }

            if (queryErr.code === '23505') {
                return res.status(409).json({
                    error: 'Conflict Error',
                    message: 'A dashboard with this ID already exists'
                });
            }

            return res.status(500).json({
                error: 'Database Error',
                message: queryErr.message
            });
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: err.message
        });
    } finally {
        if (client) {
            try {
                client.release();
            } catch (releaseErr) {
                console.error('❌ Error releasing client:', releaseErr);
            }
        }
    }
});

// DELETE /api/dashboards/:id
// Deletes a dashboard
router.delete('/:id',
    validateParams(idParamSchema),
    async (req, res, next) => {
        try {
            const id = req.params.id;
            await dbClient.query('DELETE FROM dashboards WHERE id = $1', [id]);
            res.json({ message: 'Dashboard deleted successfully' });
        } catch (err) {
            logger.error('Error deleting dashboard:', err);
            next(err);
        }
    }
);

module.exports = router;