const express = require('express');
const router = express.Router();
const dbClient = require('../services/dbConnection');
const logger = require('../utils/logger');



// GET /api/dashboards
// Returns all dashboards
router.get('/', async (req, res, next) => {
    try {
        const result = await dbClient.query('SELECT * FROM dashboards ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        logger.error('Error fetching dashboards:', err);
        next(err);
    }
});

// POST /api/dashboards/:id
// Inserts or updates a dashboard
router.post('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, widgets, layout } = req.body;

        if (!name || !widgets || !layout) {
            return res.status(400).json({ error: 'Missing required fields: name, widgets, or layout' });
        }

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
        const result = await dbClient.query(query, [
            id,
            name,
            widgetsJson,
            layoutJson
        ]);

        const savedDashboard = result.rows[0];
        res.json(savedDashboard);
    }
    catch (err) {
        logger.error('Error saving dashboard:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/dashboards/:id
// Deletes a dashboard
router.delete('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        await dbClient.query('DELETE FROM dashboards WHERE id = $1', [id]);
        res.json({ message: 'Dashboard deleted successfully' });
    } catch (err) {
        logger.error('Error deleting dashboard:', err);
        next(err);
    }
});

module.exports = router;
