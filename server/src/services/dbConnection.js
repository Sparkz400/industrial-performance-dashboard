const { Pool } = require('pg');
const status = require('../utils/status');
const logger = require('../utils/logger');
const { DatabaseError } = require("../utils/errors");

// Create a new connection pool with environment configurable values.
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'postgres',
    max: process.env.DB_MAX_POOL || 10,
});

// Attempt an initial connection.
pool.connect()
    .then(client => {
        logger.info('Connected to PostgreSQL');
        status.setDatabaseStatus("connected");
        client.release();
    })
    .catch(err => {
        logger.error('PostgreSQL connection error:', err.stack);
        status.setDatabaseStatus("error");
        throw new DatabaseError('Database connection failed');
    });

// Listen for unexpected errors on the pool.
pool.on('error', (err) => {
    logger.error('Unexpected error on idle PostgreSQL client:', err);
    status.setDatabaseStatus("error");
});

// Health check interval configurable via environment variable (default 60 seconds).
const healthCheckInterval = process.env.DB_HEALTH_CHECK_INTERVAL || 60000;

setInterval(async () => {
    try {
        const res = await pool.query('SELECT 1');
        if (res.rowCount > 0) {
            // If the query succeeds, update the status.
            status.setDatabaseStatus("connected");
        }
    } catch (error) {
        logger.error('Database connection health check failed:', error);
        status.setDatabaseStatus("error");
    }
}, healthCheckInterval);

module.exports = pool;
