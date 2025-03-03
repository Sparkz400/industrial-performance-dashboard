const { Pool } = require('pg');
const statusManager = require('../utils/status');
const StatusConstants = require('../utils/statusConstants');
const logger = require('../utils/logger');

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
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'postgres',
            max: process.env.DB_MAX_POOL || 10,
            // Add connection timeout
            connectionTimeoutMillis: 10000,
            // Add idle timeout
            idleTimeoutMillis: 30000
        });

        // Listen for unexpected errors on the pool
        this.pool.on('error', (err) => {
            logger.error('Unexpected error on idle PostgreSQL client:', err);
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Unexpected pool error',
                error: err
            });

            // Try to recover the connection if possible
            this.scheduleReconnect();
        });

        // Set up initial connection
        void this.connect();
    }

    /**
     * Attempt to connect to the database
     */
    async connect(options) {
        if (this.isConnecting) return;

        this.isConnecting = true;
        this.connectionAttempts++;

        statusManager.setDatabaseStatus(StatusConstants.CONNECTING, {
            message: 'Attempting to connect',
            attempt: this.connectionAttempts
        });

        try {
            const client = await this.pool.connect(options);
            logger.info('Connected to PostgreSQL');

            statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
                message: 'Connected',
                timestamp: new Date().toISOString()
            });

            client.release();

            // Reset connection attempts on success
            this.connectionAttempts = 0;
            this.retryDelay = 5000;

            // Start health check after successful connection
            this.startHealthCheck();
        } catch (err) {
            logger.error('PostgreSQL connection error:', err.message);

            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Connection failed',
                error: err.message
            });

            // Handle reconnection
            this.scheduleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        if (this.connectionAttempts < this.maxConnectionAttempts) {
            // Use exponential backoff with a cap
            this.retryDelay = Math.min(this.retryDelay * 1.5, 60000); // Max 60 seconds

            logger.info(`Scheduling database reconnection in ${this.retryDelay}ms`);
            setTimeout(() => this.connect(), this.retryDelay);
        } else {
            logger.error(`Failed to connect after ${this.maxConnectionAttempts} attempts. Manual intervention required.`);

            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Max connection attempts reached',
                attempts: this.connectionAttempts
            });
        }
    }

    /**
     * Start regular health check
     */
    startHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Set up new interval
        const healthCheckIntervalMs = Number(process.env.DB_HEALTH_CHECK_INTERVAL) || 60000;

        this.healthCheckInterval = setInterval(async () => {
            try {
                const res = await this.pool.query('SELECT 1');

                if (res.rowCount > 0) {
                    // Update status only if it's not already CONNECTED
                    if (statusManager.getServiceStatus(StatusConstants.DATABASE) !== StatusConstants.CONNECTED) {
                        statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
                            message: 'Health check passed',
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            } catch (error) {
                logger.error('Database health check failed:', error.message);

                statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                    message: 'Health check failed',
                    error: error.message
                });

                // Try to reconnect on health check failure
                this.scheduleReconnect();
            }
        }, healthCheckIntervalMs);

        // Log health check setup
        logger.info(`Database health check scheduled every ${healthCheckIntervalMs}ms`);
    }

    /**
     * Perform a database query with error handling and retries
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @param {Object} options - Query options including maxRetries
     */
    async query(text, params = [], options = { maxRetries: 2 }) {
        let retries = 0;

        while (retries <= options.maxRetries) {
            try {
                // Execute the query
                return await this.pool.query(text, params);
            } catch (error) {
                retries++;

                // Determine if the error is retryable
                const isRetryable =
                    error.code === 'ECONNRESET' ||
                    error.code === '08006' ||   // Connection failure
                    error.code === '08001' ||   // Unable to establish connection
                    error.code === '57P01';     // Server closed the connection unexpectedly

                if (retries > options.maxRetries || !isRetryable) {
                    logger.error(`Query failed after ${retries} attempts:`, error);

                    // Update status based on error severity
                    if (isRetryable) {
                        statusManager.setDatabaseStatus(StatusConstants.WARNING, {
                            message: 'Temporary connection issue',
                            error: error.message
                        });

                        // Try to reconnect
                        this.scheduleReconnect();
                    }

                    throw error;
                }

                // Log retry attempt
                logger.warn(`Retrying query (attempt ${retries}/${options.maxRetries}):`, error.message);

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
    }

    /**
     * Gracefully end the pool
     */
    async end() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        try {
            await this.pool.end();
            logger.info('Database pool closed');
            statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
                message: 'Connection closed'
            });
        } catch (error) {
            logger.error('Error closing database pool:', error);
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
                message: 'Error during shutdown',
                error: error.message
            });
        }
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;