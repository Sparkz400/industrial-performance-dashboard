const opcuaClient = require('./opcuaClient');
const statusManager = require('../utils/status');
const StatusConstants = require('../utils/statusConstants');
const logger = require('../utils/logger');
const EventEmitter = require('events');

/**
 * Manager for OPC UA connections with resilient reconnection
 */
class OpcuaConnectionManager extends EventEmitter {
    constructor() {
        super();
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.retryDelay = 5000; // Start with 5 seconds
        this.healthCheckInterval = null;

        // Default connection configuration
        this.currentConfig = {
            ip: process.env.OPCUA_IP || "localhost",
            port: process.env.OPCUA_PORT || 4840,
            resourcePath: process.env.OPCUA_RESOURCE_PATH || "/UA/MyLittleServer"
        };

        this.currentConnection = null;
    }

    /**
     * Get the full endpoint URL
     * @param {Object} config - Configuration object (optional)
     * @returns {string} - Full OPC UA endpoint URL
     */
    getEndpointUrl(config = this.currentConfig) {
        return `opc.tcp://${config.ip}:${config.port}${config.resourcePath}`;
    }

    /**
     * Start the OPC UA connection
     * @return {Promise<void>}
     */
    async startConnection() {
        if (this.isConnecting) {
            logger.info("Connection attempt already in progress");
            return;
        }

        this.isConnecting = true;
        this.connectionAttempts++;

        const endpointUrl = this.getEndpointUrl();
        logger.info(`Attempting OPC UA connection to: ${endpointUrl} (Attempt ${this.connectionAttempts})`);

        // Update status to connecting
        statusManager.setOpcuaStatus(StatusConstants.CONNECTING, {
            endpoint: endpointUrl,
            attempt: this.connectionAttempts
        });

        try {
            // Try to connect
            this.currentConnection = await opcuaClient.connectAndSubscribe(endpointUrl);

            if (this.currentConnection) {
                logger.info("OPC UA connection and subscription successful");

                // Update status on success
                statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                    endpoint: endpointUrl,
                    connected: true,
                    config: { ...this.currentConfig },
                    timestamp: new Date().toISOString()
                });

                // Reset connection tracking
                this.connectionAttempts = 0;
                this.retryDelay = 5000;

                // Clear any pending reconnection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }

                // Start health check
                this.startHealthCheck();

                // Emit connection event
                this.emit('connected', { config: this.currentConfig });
            } else {
                // Connection was null, schedule reconnect
                throw new Error("Failed to create OPC UA connection");
            }
        } catch (error) {
            logger.error("Error during OPC UA connection:", error.message);

            // Update status to error
            statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                message: error.message,
                endpoint: endpointUrl,
                timestamp: new Date().toISOString()
            });

            // Schedule reconnection
            this.scheduleReconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.connectionAttempts < this.maxConnectionAttempts) {
            // Use exponential backoff with a cap
            const delay = Math.min(this.retryDelay * Math.pow(1.5, this.connectionAttempts - 1), 300000); // Max 5 minutes

            logger.info(`Scheduling OPC UA reconnection in ${delay}ms`);

            this.reconnectTimer = setTimeout(() => {
                void this.startConnection();
            }, delay);
        } else {
            logger.error(`Failed to connect after ${this.maxConnectionAttempts} attempts. Manual reconnection required.`);

            statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                message: `Max connection attempts (${this.maxConnectionAttempts}) reached`,
                endpoint: this.getEndpointUrl()
            });
        }
    }

    /**
     * Start OPC UA health check
     */
    startHealthCheck() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Set up new interval - default 30 seconds
        const healthCheckIntervalMs = Number(process.env.OPCUA_HEALTH_CHECK_INTERVAL) || 30000;

        this.healthCheckInterval = setInterval(async () => {
            try {
                // If we don't have a connection, no health check needed
                if (!this.currentConnection || !this.currentConnection.session) {
                    throw new Error("No active session for health check");
                }

                // Read a simple value from the server
                const { session } = this.currentConnection;

                await session.keepAlive();

                const readResult = await session.read({
                    nodeId: "i=2258", // Server status node
                    attributeId: opcuaClient.AttributeIds.Value
                });

                if (readResult.statusCode.isGood()) {
                    // Update status only if not already connected
                    if (statusManager.getServiceStatus(StatusConstants.OPCUA) !== StatusConstants.CONNECTED) {
                        statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                            message: 'Health check passed',
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    throw new Error(`Health check read failed: ${readResult.statusCode.toString()}`);
                }
            } catch (error) {
                logger.error('OPC UA health check failed:', error.message);

                // Determine if this is a critical error
                const isCritical =
                    error.message.includes('The connection has been closed') ||
                    error.message.includes('No active session') ||
                    error.message.includes('Connection reset');

                if (isCritical) {
                    statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                        message: 'Health check failed: connection lost',
                        error: error.message
                    });

                    // Try to disconnect cleanly
                    await this.disconnectConnection();

                    // Schedule reconnection
                    this.scheduleReconnect();
                } else {
                    // Non-critical warning
                    statusManager.setOpcuaStatus(StatusConstants.WARNING, {
                        message: 'Health check warning',
                        error: error.message
                    });
                }
            }
        }, healthCheckIntervalMs);

        logger.info(`OPC UA health check scheduled every ${healthCheckIntervalMs}ms`);
    }

    /**
     * Disconnect the OPC UA connection
     * @return {Promise<void>}
     */
    async disconnectConnection() {
        // Clear any health check
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Clear any reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.currentConnection) {
            const { subscription, session, client } = this.currentConnection;
            const disconnectPromises = [];

            // Terminate subscription if it exists
            if (subscription) {
                disconnectPromises.push(
                    subscription.terminate().catch(err => {
                        logger.error("Error terminating subscription:", err.message);
                    })
                );
            }

            // Close session if it exists
            if (session) {
                disconnectPromises.push(
                    session.close().catch(err => {
                        logger.error("Error closing session:", err.message);
                    })
                );
            }

            // Disconnect client if it exists
            if (client) {
                disconnectPromises.push(
                    client.disconnect().catch(err => {
                        logger.error("Error disconnecting client:", err.message);
                    })
                );
            }

            try {
                await Promise.all(disconnectPromises);
                logger.info("OPC UA connection fully disconnected");

                statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
                    message: 'Connection closed',
                    timestamp: new Date().toISOString()
                });

                this.currentConnection = null;
                this.emit('disconnected');
            } catch (error) {
                logger.error("Error during OPC UA disconnection:", error);

                statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                    message: 'Error during disconnection',
                    error: error.message
                });

                // Force reset of the connection
                this.currentConnection = null;
            }
        } else {
            logger.info("No OPC UA connection to disconnect");

            statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
                message: 'No connection to close'
            });
        }
    }

    /**
     * Update connection configuration and reconnect
     * @param {Object} newConfig - New configuration parameters
     * @returns {Promise<Object>} - Updated configuration
     */
    async updateConnection(newConfig) {
        this.currentConfig = { ...this.currentConfig, ...newConfig };

        // Disconnect first
        await this.disconnectConnection();

        // Reset connection attempts for fresh start
        this.connectionAttempts = 0;

        // Start new connection
        await this.startConnection();

        return this.currentConfig;
    }

    /**
     * Get current connection status and configuration
     * @returns {Object} Current status
     */
    getConnectionInfo() {
        const status = statusManager.getServiceStatus(StatusConstants.OPCUA);
        const details = statusManager.getServiceDetails(StatusConstants.OPCUA);

        return {
            connected: status === StatusConstants.CONNECTED,
            status,
            statusText: StatusConstants.getStatusLabel(status),
            config: { ...this.currentConfig },
            details,
            lastUpdated: details.timestamp || new Date().toISOString()
        };
    }
}

// Create singleton instance
const opcuaManager = new OpcuaConnectionManager();

module.exports = opcuaManager;