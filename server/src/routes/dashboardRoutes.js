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

// GET /api/dashboards
// Returns all dashboards
router.get('/', async (req, res, next) => {
    try {
        const result = await dbClient.query('SELECT * FROM dashboards ORDER BY name ');
        res.json(result.rows);
    } catch (err) {
        logger.error('Error fetching dashboards:', err);
        next(err);
    }
});

// POST /api/dashboards/:id
// Inserts or updates a dashboard
router.post('/:id',
    validateParams(idParamSchema),
    validateBody(schemas.dashboardSchema),
    async (req, res, next) => {
        const client = await dbClient.pool.connect();

        try {
            await client.query('BEGIN');

            const { id } = req.params;
            const { name, widgets, layout } = req.body;

            // Insert/update the dashboard
            const query = `
                INSERT INTO dashboards (id, name, widgets, layout)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET
                                               name = EXCLUDED.name,
                                               widgets = EXCLUDED.widgets,
                                               layout = EXCLUDED.layout
                RETURNING *;
            `;

            const widgetsJson = JSON.stringify(widgets);
            const layoutJson = JSON.stringify(layout);
            const result = await client.query(query, [
                id,
                name,
                widgetsJson,
                layoutJson
            ]);

            // Log the operation - optional history tracking
            const historyQuery = `
                INSERT INTO dashboard_history (dashboard_id, action, timestamp, user_id)
                VALUES ($1, $2, NOW(), $3);
            `;
            await client.query(historyQuery, [
                id,
                'UPDATE',
                req.user?.id || 'system' // Assuming authentication middleware sets req.user
            ]);

            await client.query('COMMIT');

            const savedDashboard = result.rows[0];
            res.json(savedDashboard);
        }
        catch (err) {
            await client.query('ROLLBACK');
            logger.error('Error saving dashboard:', err);
            next(err);
        }
        finally {
            client.release();
        }
    }
);

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