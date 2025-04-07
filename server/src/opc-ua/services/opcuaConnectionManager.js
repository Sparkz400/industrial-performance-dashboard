const opcuaClient = require('../opcuaClient');
const statusManager = require('../../utils/status');
const StatusConstants = require('../../utils/statusConstants');
const logger = require('../../utils/logger');
const EventEmitter = require('events');
const { opcua } = require('node-opcua');
const config = require('../../config/config');
/**
 * Manager for OPC UA connections with resilient reconnection and certificate support
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
            ip: config.OPCUA_IP,
            port: config.OPCUA_PORT,
            resourcePath: config.OPCUA_RESOURCE_PATH,
            securityMode: config.OPCUA_SECURITY_MODE,
            securityPolicy: config.OPCUA_SECURITY_POLICY
        };

        // Check if security fallback is enabled via environment variable
        this.securityFallbackEnabled = config.OPCUA_SECURITY_FALLBACK_ENABLED;
        if (this.securityFallbackEnabled) {
            logger.info('OPC UA security fallback to "None" is ENABLED.');
        } else {
            logger.info('OPC UA security fallback to "None" is DISABLED.');
        }

        this.currentConnection = null;

        // Initialize certificates
        this.initializeCertificates();

        // Set up event handler for untrusted certificates
        opcuaClient.opcuaEmitter.on('untrustedCertificate', (certInfo) => {
            logger.info(`Forwarding untrusted certificate event for ${certInfo.serverUri}`);
            this.emit('untrustedCertificate', certInfo);
        });

        // Set up event handler for certificate acceptance
        opcuaClient.opcuaEmitter.on('certificateAccepted', (certInfo) => {
            logger.info(`Certificate accepted for ${certInfo.serverUri}`);
            this.emit('certificateAccepted', certInfo);
        });

        // Set up event handler for certificate errors
        opcuaClient.opcuaEmitter.on('certificateError', (errorInfo) => {
            logger.error(`Certificate error: ${errorInfo.error}`);
            this.emit('certificateError', errorInfo);
        });
    }

    /**
     * Initialize certificates
     */
    async initializeCertificates() {
        try {
            // *** CORRECTION HERE ***
            // Call the function exported from opcuaClient.js
            await opcuaClient.initializeCertificates();
        } catch (error) {
            logger.error('Error initializing certificates:', error);
        }
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
        const securityOptions = {
            securityMode: this.currentConfig.securityMode,
            securityPolicy: this.currentConfig.securityPolicy
        };

        logger.info(`Attempting OPC UA connection to: ${endpointUrl} with SecurityMode=${securityOptions.securityMode}, SecurityPolicy=${securityOptions.securityPolicy} (Attempt ${this.connectionAttempts})`);

        statusManager.setOpcuaStatus(StatusConstants.CONNECTING, {
            endpoint: endpointUrl,
            securityMode: securityOptions.securityMode,
            securityPolicy: securityOptions.securityPolicy,
            attempt: this.connectionAttempts
        });

        try {
            const connectionPromise = opcuaClient.connectAndSubscribe(endpointUrl, securityOptions);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000); // Increased timeout
            });

            this.currentConnection = await Promise.race([connectionPromise, timeoutPromise]);

            if (this.currentConnection) {
                logger.info("OPC UA connection and subscription successful");

                statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                    endpoint: endpointUrl,
                    connected: true,
                    config: { ...this.currentConfig },
                    securityMode: this.currentConnection.securityMode,
                    securityPolicy: this.currentConnection.securityPolicy,
                    timestamp: new Date().toISOString()
                });

                this.connectionAttempts = 0;
                this.retryDelay = 5000;

                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }

                this.startHealthCheck();
                this.emit('connected', {
                    config: this.currentConfig,
                    securityMode: this.currentConnection.securityMode,
                    securityPolicy: this.currentConnection.securityPolicy
                });
            } else {
                // Should not happen if connectAndSubscribe throws on failure, but handle defensively
                throw new Error("Failed to establish OPC UA connection (connectAndSubscribe returned null)");
            }
        } catch (error) {
            // --- Enhanced Error Logging ---
            logger.error("Error during OPC UA connection attempt:", {
                message: error.message,
                // Include specific OPC UA status codes if available
                statusCode: error.statusCode ? error.statusCode.toString() : 'N/A',
                // Include stack trace for better debugging
                stack: error.stack,
                endpoint: endpointUrl,
                securityMode: securityOptions.securityMode,
                securityPolicy: securityOptions.securityPolicy,
                attempt: this.connectionAttempts
            });
            // --- End Enhanced Error Logging ---

            const isSecurityError = error.message && (
                error.message.includes("certificate") ||
                error.message.includes("security") ||
                error.message.includes("untrusted") ||
                error.message.includes("trust") ||
                error.message.includes("rejected") ||
                (error.statusCode && error.statusCode.name.startsWith("BadSecurity")) // Check for OPC UA security status codes
            );

            // --- Configurable Security Fallback ---
            if (this.securityFallbackEnabled && isSecurityError && this.currentConfig.securityMode !== 'None') {
                logger.warn('Security-related error detected and fallback is enabled. Attempting connection with SecurityMode=None.');

                statusManager.setOpcuaStatus(StatusConstants.WARNING, {
                    message: 'Security error, falling back to No security',
                    error: error.message,
                    endpoint: endpointUrl
                });

                const originalSecurity = {
                    securityMode: this.currentConfig.securityMode,
                    securityPolicy: this.currentConfig.securityPolicy
                };

                this.currentConfig.securityMode = 'None';
                this.currentConfig.securityPolicy = 'None';

                // Reset attempts for the fallback try
                this.connectionAttempts = 0;

                setTimeout(() => {
                    logger.info(`Retrying connection with No security (original was ${originalSecurity.securityMode}/${originalSecurity.securityPolicy})`);
                    this.isConnecting = false; // Allow the new attempt
                    void this.startConnection(); // Use void for fire-and-forget
                }, 2000); // Short delay before fallback attempt

                // Important: Return here to prevent scheduling another reconnect immediately
                this.isConnecting = false; // Ensure isConnecting is reset before returning
                return;
            }
            // --- End Configurable Security Fallback ---

            // If fallback is disabled, not a security error, or already tried None
            statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                message: `Connection failed: ${error.message}`,
                error: error.message, // Keep original error message
                endpoint: endpointUrl,
                timestamp: new Date().toISOString()
            });

            this.scheduleReconnect();
        } finally {
            // Ensure isConnecting is always reset, unless a fallback attempt is scheduled
            if (!this.reconnectTimer && !(this.securityFallbackEnabled && isSecurityError && this.currentConfig.securityMode !== 'None')) {
                this.isConnecting = false;
            }
        }
    }

    /**
     * Schedule a reconnection attempt with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            // Don't schedule multiple reconnects
            return;
        }

        if (this.connectionAttempts < this.maxConnectionAttempts) {
            // Use exponential backoff with a cap
            const delay = Math.min(this.retryDelay * Math.pow(1.5, this.connectionAttempts - 1), 300000); // Max 5 minutes

            logger.info(`Scheduling OPC UA reconnection in ${delay / 1000} seconds (Attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`);

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.isConnecting = false; // Allow the reconnect attempt
                void this.startConnection(); // Use void for fire-and-forget
            }, delay);
        } else {
            logger.error(`Failed to connect after ${this.maxConnectionAttempts} attempts. Stopping automatic retries. Manual intervention required.`);
            statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                message: `Max connection attempts (${this.maxConnectionAttempts}) reached. Auto-reconnect stopped.`,
                endpoint: this.getEndpointUrl()
            });
            // Reset attempts so manual trigger can work later
            this.connectionAttempts = 0;
        }
    }

    /**
     * Start OPC UA health check
     */
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        const healthCheckIntervalMs = config.OPCUA_HEALTH_CHECK_INTERVAL;

        this.healthCheckInterval = setInterval(async () => {
            if (!this.currentConnection || !this.currentConnection.session || !this.currentConnection.session.isOpen) {
                logger.warn("Health check skipped: No active or open session.");
                // If session is closed unexpectedly, trigger reconnect logic
                if (statusManager.getServiceStatus(StatusConstants.OPCUA) === StatusConstants.CONNECTED) {
                    logger.error("OPC UA session found closed unexpectedly during health check.");
                    statusManager.setOpcuaStatus(StatusConstants.ERROR, { message: 'Session closed unexpectedly' });
                    await this.disconnectConnection(); // Clean up potentially broken state
                    this.scheduleReconnect();
                }
                return;
            }

            try {
                const { session } = this.currentConnection;

                // More robust check: Read ServerStatus CurrentTime
                const nodeToRead = {
                    nodeId: opcua.resolveNodeId("Server_ServerStatus_CurrentTime"), // Standard node i=2258
                    attributeId: opcua.AttributeIds.Value
                };
                const dataValue = await session.read(nodeToRead);

                if (dataValue.statusCode.isGood()) {
                    // logger.debug('OPC UA health check passed.'); // Optional: debug log
                    if (statusManager.getServiceStatus(StatusConstants.OPCUA) !== StatusConstants.CONNECTED) {
                        statusManager.setOpcuaStatus(StatusConstants.CONNECTED, {
                            message: 'Health check passed',
                            timestamp: new Date().toISOString()
                        });
                    }
                } else {
                    throw new Error(`Health check read failed with status: ${dataValue.statusCode.toString()}`);
                }
            } catch (error) {
                logger.error('OPC UA health check failed:', { message: error.message, statusCode: error.statusCode ? error.statusCode.toString() : 'N/A' });

                const isCritical =
                    error.message.includes('BadSessionIdInvalid') ||
                    error.message.includes('BadSessionClosed') ||
                    error.message.includes('BadConnectionClosed') ||
                    error.message.includes('Socket is closed') ||
                    error.message.includes('Connection reset');

                if (isCritical) {
                    statusManager.setOpcuaStatus(StatusConstants.ERROR, {
                        message: 'Health check failed: Connection lost',
                        error: error.message
                    });
                    await this.disconnectConnection();
                    this.scheduleReconnect();
                } else {
                    statusManager.setOpcuaStatus(StatusConstants.WARNING, {
                        message: 'Health check warning',
                        error: error.message
                    });
                }
            }
        }, healthCheckIntervalMs);

        logger.info(`OPC UA health check scheduled every ${healthCheckIntervalMs / 1000} seconds`);
    }

    /**
     * Disconnect the OPC UA connection
     * @return {Promise<void>}
     */
    async disconnectConnection() {
        logger.info("Attempting to disconnect OPC UA connection...");
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.debug("Cleared health check interval.");
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            logger.debug("Cleared reconnect timer.");
        }

        // Prevent new connection attempts while disconnecting
        this.isConnecting = true;

        if (this.currentConnection) {
            const { subscription, session, client } = this.currentConnection;
            this.currentConnection = null; // Clear immediately to prevent race conditions

            const TIMEOUT_MS = 5000; // 5 second timeout for each step

            try {
                if (subscription) {
                    logger.debug("[Manager Shutdown] Terminating OPC UA subscription...");
                    await Promise.race([
                        subscription.terminate(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Subscription terminate timeout")), TIMEOUT_MS))
                    ]);
                    logger.debug("[Manager Shutdown] Subscription terminated or timed out.");
                }
            } catch (err) {
                logger.error("[Manager Shutdown] Error/Timeout terminating subscription:", err.message);
            }

            try {
                // Check session status before attempting to close
                if (session && typeof session.isOpen === 'boolean' && session.isOpen) {
                    logger.debug("[Manager Shutdown] Closing OPC UA session...");
                    await Promise.race([
                        session.close(true), // Pass true to delete subscriptions forcefully
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Session close timeout")), TIMEOUT_MS))
                    ]);
                    logger.debug("[Manager Shutdown] Session closed or timed out.");
                } else if (session) {
                    logger.debug("[Manager Shutdown] Session already closed or not open.");
                } else {
                    logger.debug("[Manager Shutdown] No session object found to close.");
                }
            } catch (err) {
                logger.error("[Manager Shutdown] Error/Timeout closing session:", err.message);
            }

            try {
                if (client) {
                    logger.debug("[Manager Shutdown] Disconnecting OPC UA client...");
                    await Promise.race([
                        client.disconnect(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Client disconnect timeout")), TIMEOUT_MS))
                    ]);
                    logger.debug("[Manager Shutdown] Client disconnected or timed out.");
                } else {
                    logger.debug("[Manager Shutdown] No client object found to disconnect.");
                }
            } catch (err) {
                logger.error("[Manager Shutdown] Error/Timeout disconnecting client:", err.message);
            }

            logger.info("[Manager Shutdown] OPC UA connection resources released.");
            statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
                message: 'Connection intentionally closed',
                timestamp: new Date().toISOString()
            });
            this.emit('disconnected');

        } else {
            logger.info("[Manager Shutdown] No active OPC UA connection to disconnect.");
            if (statusManager.getServiceStatus(StatusConstants.OPCUA) !== StatusConstants.DISCONNECTED) {
                statusManager.setOpcuaStatus(StatusConstants.DISCONNECTED, {
                    message: 'No connection was active'
                });
            }
        }

        // Reset state after attempting disconnect
        this.isConnecting = false;
        this.connectionAttempts = 0;
        this.retryDelay = 5000;
    }

    /**
     * Update connection configuration and reconnect
     * @param {Object} newConfig - New configuration parameters
     * @returns {Promise<Object>} - Updated configuration
     */
    async updateConnection(newConfig) {
        logger.info("Updating OPC UA connection configuration:", newConfig);
        // Merge new config with current, ensuring security settings are updated if provided
        this.currentConfig = {
            ...this.currentConfig,
            ...newConfig,
            securityMode: newConfig.securityMode !== undefined ? newConfig.securityMode : this.currentConfig.securityMode,
            securityPolicy: newConfig.securityPolicy !== undefined ? newConfig.securityPolicy : this.currentConfig.securityPolicy,
        };

        await this.disconnectConnection(); // Disconnect existing connection cleanly
        this.connectionAttempts = 0;       // Reset attempts for the new config
        this.retryDelay = 5000;            // Reset retry delay
        await this.startConnection();      // Start connection with new config
        return this.getConnectionInfo().config; // Return the effective config
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
            config: { ...this.currentConfig }, // Return a copy
            // Report the actual security used by the connection if available, else the config
            securityMode: this.currentConnection?.securityMode || this.currentConfig.securityMode,
            securityPolicy: this.currentConnection?.securityPolicy || this.currentConfig.securityPolicy,
            details: details || {}, // Ensure details is always an object
            lastUpdated: details?.timestamp || statusManager.getFullStatus().lastUpdated // Use service specific or overall
        };
    }

    /**
     * Get available security modes and policies from the certificate manager
     * @returns {Object} Available security options
     */
    getSecurityOptions() {
        try {
            return {
                securityModes: opcuaClient.certificateManager.getAvailableSecurityModes(),
                securityPolicies: opcuaClient.certificateManager.getAvailableSecurityPolicies()
            };
        } catch (error) {
            logger.error("Failed to get security options from certificate manager:", error);
            // Provide safe defaults if manager fails
            return {
                securityModes: ['None', 'Sign', 'SignAndEncrypt'],
                securityPolicies: ['None', 'Basic256Sha256', 'Aes128_Sha256_RsaOaep'] // Common policies
            };
        }
    }

    /**
     * Accept a previously rejected certificate using the certificate manager
     * @param {string} filename - The certificate filename
     * @returns {Promise<boolean>} - Success status
     */
    async acceptCertificate(filename) {
        try {
            await opcuaClient.certificateManager.acceptRejectedCertificate(filename);
            logger.info(`Successfully accepted rejected certificate: ${filename}`);
            this.emit('certificateAccepted', {
                success: true,
                filename,
                timestamp: new Date().toISOString()
            });
            return true;
        } catch (error) {
            logger.error(`Failed to accept rejected certificate ${filename}:`, error);
            this.emit('certificateError', {
                error: error.message,
                filename
            });
            return false;
        }
    }

    /**
     * Test connection to a server without affecting current connection
     * @param {string} endpointUrl - The server endpoint URL
     * @param {Object} securityOptions - Security options
     * @returns {Promise<Object>} - Connection details or throws on failure
     */
    async getConnectionPromise(endpointUrl, securityOptions) {
        let testConnection = null;
        try {
            logger.info(`Testing connection to: ${endpointUrl} with SecurityMode=${securityOptions.securityMode}, SecurityPolicy=${securityOptions.securityPolicy}`);

            // Use the core connect function but don't store the connection state locally
            testConnection = await opcuaClient.connectAndSubscribe(endpointUrl, securityOptions);

            if (!testConnection) {
                throw new Error("Test connection failed: connectAndSubscribe returned null");
            }

            logger.info(`Test connection to ${endpointUrl} successful.`);
            // Return relevant details from the test connection
            return {
                success: true,
                securityMode: testConnection.securityMode,
                securityPolicy: testConnection.securityPolicy
            };
        } catch (error) {
            logger.error(`Test connection to ${endpointUrl} failed: ${error.message}`);
            throw error; // Re-throw the error to be handled by the route
        } finally {
            // Ensure the test connection is always cleaned up
            if (testConnection) {
                try {
                    if (testConnection.session) await testConnection.session.close();
                    if (testConnection.client) await testConnection.client.disconnect();
                    logger.debug(`Test connection to ${endpointUrl} cleaned up.`);
                } catch (cleanupError) {
                    logger.error(`Error cleaning up test connection to ${endpointUrl}:`, cleanupError);
                }
            }
        }
    }
}

const opcuaManager = new OpcuaConnectionManager();
module.exports = opcuaManager;