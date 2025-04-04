const { Pool } = require('pg');
const statusManager = require('../utils/status');
const StatusConstants = require('../utils/statusConstants');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Class for managing database connections with integrated health monitoring
 */
class DatabaseManager {
    constructor() {
        this.isConnecting = false;
        this.healthCheckInterval = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.retryDelay = 5000; // Start with 5 seconds

        // Create the database pool with environment configurations
        this.pool = new Pool({
            host: config.DB_HOST,
            port: config.DB_PORT,
            user: config.DB_USER,
            password: config.DB_PASSWORD,
            database: config.DB_NAME,
            max: config.DB_MAX_POOL,
            connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT,
            idleTimeoutMillis: config.DB_IDLE_TIMEOUT
        });

        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle PostgreSQL client:', err);
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Unexpected pool error',
                error: err.message // Log only message for status
            });
            this.scheduleReconnect();
        });

        void this.connect(); // Use void for fire-and-forget async call
    }

    async connect() {
        if (this.isConnecting) return;

        this.isConnecting = true;
        this.connectionAttempts++;

        statusManager.setDatabaseStatus(StatusConstants.CONNECTING, {
            message: `Attempting connection (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`,
            attempt: this.connectionAttempts
        });
        logger.info(`Attempting database connection (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})...`);

        try {
            const client = await this.pool.connect();
            logger.info(`Connected to PostgreSQL database: ${config.DB_NAME} on ${config.DB_HOST}`);

            statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
                message: 'Connection successful',
                timestamp: new Date().toISOString()
            });

            client.release();
            this.connectionAttempts = 0;
            this.retryDelay = 5000;
            this.startHealthCheck();
        } catch (err) {
            logger.error('PostgreSQL connection error:', { message: err.message, code: err.code });
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Connection failed',
                error: err.message
            });
            this.scheduleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    scheduleReconnect() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval); // Stop health checks during reconnect attempts
            this.healthCheckInterval = null;
        }
        if (this.connectionAttempts < this.maxConnectionAttempts) {
            const delay = Math.min(this.retryDelay * 1.5, 60000); // Exponential backoff capped at 60s
            this.retryDelay = delay; // Update delay for next potential failure

            logger.info(`Scheduling database reconnection attempt in ${delay / 1000} seconds...`);
            setTimeout(() => this.connect(), delay);
        } else {
            logger.error(`Database connection failed after ${this.maxConnectionAttempts} attempts. Stopping automatic retries. Manual intervention required.`);
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: `Max connection attempts (${this.maxConnectionAttempts}) reached. Auto-reconnect stopped.`,
                attempts: this.connectionAttempts
            });
            // Consider resetting attempts here if manual retry should be possible later
            // this.connectionAttempts = 0;
        }
    }

    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Use the config value directly
        const intervalMs = config.DB_HEALTH_CHECK_INTERVAL; // Get interval from config

        if (intervalMs <= 0) { // Use the fetched value for the check
            logger.warn("Database health check is disabled (interval <= 0).");
            return;
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                // --- Pool Monitoring ---
                const poolStats = {
                    totalCount: this.pool.totalCount,
                    idleCount: this.pool.idleCount,
                    waitingCount: this.pool.waitingCount,
                };
                // Log pool stats periodically (e.g., every few health checks or based on level)
                // For now, log every time for demonstration. Adjust frequency as needed.
                logger.debug('Database pool stats:', poolStats);
                // --- End Pool Monitoring ---

                const res = await this.pool.query('SELECT 1');
                if (res.rowCount > 0) {
                    if (statusManager.getServiceStatus(StatusConstants.DATABASE) !== StatusConstants.CONNECTED) {
                        logger.info("Database health check passed, restoring status to CONNECTED.");
                        statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
                            message: 'Health check passed',
                            timestamp: new Date().toISOString()
                        });
                    } else {
                        // logger.debug("Database health check passed."); // Optional debug log
                    }
                } else {
                    // Should not happen with SELECT 1, but handle defensively
                    throw new Error("Health check query returned no rows.");
                }
            } catch (error) {
                logger.error('Database health check failed:', { message: error.message, code: error.code });
                statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                    message: 'Health check failed',
                    error: error.message
                });
                // Stop health check and attempt reconnect on failure
                if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
                this.scheduleReconnect();
            }
        }, intervalMs);

        logger.info(`Database health check scheduled every ${intervalMs / 1000} seconds`);
    }

    async query(text, params = [], options = { maxRetries: 2 }) {
        let retries = 0;
        const maxRetries = options.maxRetries; // Use provided maxRetries

        while (retries <= maxRetries) {
            try {
                // logger.debug(`Executing query (attempt ${retries + 1}): ${text}`, params); // Optional debug log
                return await this.pool.query(text, params);
            } catch (error) {
                logger.error(`Database query error (attempt ${retries + 1}/${maxRetries + 1}):`, {
                    message: error.message,
                    code: error.code,
                    query: text.substring(0, 100) + (text.length > 100 ? '...' : '') // Log truncated query
                });

                retries++;
                const isRetryable =
                    error.code === 'ECONNRESET' || // Connection reset
                    error.code === 'ETIMEDOUT' ||  // Connection timeout
                    error.code === '57P01' ||      // Admin shutdown
                    error.code === '57P03' ||      // Cannot connect now (failover?)
                    error.code === '08003' ||      // Connection does not exist
                    error.code === '08006';        // Connection failure

                if (retries > maxRetries || !isRetryable) {
                    logger.error(`Query failed permanently after ${retries} attempts.`);
                    // Update status only if it's a connection-related issue, not a syntax error etc.
                    if (isRetryable || error.message.includes('connection')) {
                        statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                            message: 'Persistent connection issue during query',
                            error: error.message
                        });
                        this.scheduleReconnect(); // Attempt to recover connection
                    }
                    throw error; // Re-throw the error
                }

                const delay = 1000 * retries; // Simple linear backoff for query retry
                logger.warn(`Retrying query in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        // Should not be reached if loop logic is correct, but throw just in case
        throw new Error("Query retry logic failed unexpectedly.");
    }

    async end() {
        logger.info('Closing database pool...');
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        try {
            await this.pool.end();
            logger.info('Database pool closed successfully.');
            statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
                message: 'Connection pool closed'
            });
        } catch (error) {
            logger.error('Error closing database pool:', error);
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Error closing pool',
                error: error.message
            });
        }
    }
}

const dbManager = new DatabaseManager();
module.exports = dbManager; // Export the singleton instance