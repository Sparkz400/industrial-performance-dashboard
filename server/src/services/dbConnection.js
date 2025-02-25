const { Pool } = require('pg');
const status = require('../utils/status');
const logger = require('../utils/logger');
const {DatabaseError} = require("../utils/errors");

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'postgres',
    max: process.env.DB_MAX_POOL || 10
});

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

// Health check interval (every minute)
setInterval(async () => {
    try {
        await pool.query('SELECT 1');
    } catch (error) {
        logger.error('Database connection health check failed:', error);
        status.setDatabaseStatus("error");
    }
}, 60000);

module.exports = pool;
