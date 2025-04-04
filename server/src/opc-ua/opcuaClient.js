const opcua = require('node-opcua');
const EventEmitter = require('events');
const opcuaMapping = require('./config/opcuaMapping');
const logger = require('../utils/logger');
const StatusConstants = require("../utils/statusConstants");
const statusManager = require("../utils/status");
const certificateManager = require('./services/certificateManager');
const config = require('../config/config');

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

/**
 * Auto-accept untrusted certificates event handler
 * This is triggered when a server certificate is received but not trusted
 */
opcuaEmitter.on('serverCertificate', async (certificate, serverUri) => {
    try {
        logger.info(`Received server certificate from ${serverUri || 'unknown server'}`);

        // Create hash of certificate for logging/display purposes
        const crypto = require('crypto');
        const certificateHash = crypto.createHash('sha256').update(certificate).digest('hex');

        if (config.AUTO_ACCEPT_CERTIFICATES) {
            // Auto-accept unknown certificates
            const serverName = serverUri || 'unknown_server';
            await certificateManager.trustCertificate(certificate, serverName);
            logger.info(`Auto-accepted certificate from ${serverName} (hash: ${certificateHash.substring(0, 16)}...)`);

            // Emit event that certificate was accepted
            opcuaEmitter.emit('certificateAccepted', {
                success: true,
                serverUri,
                certificateHash,
                timestamp: new Date().toISOString()
            });
        } else {
            logger.warn(`Untrusted server certificate received from ${serverUri || 'unknown server'}, waiting for manual acceptance`);

            // Emit event for UI handling with certificate details
            opcuaEmitter.emit('untrustedCertificate', {
                certificate: certificate.toString('base64'),
                serverUri: serverUri || 'unknown_server',
                certificateHash: certificateHash,
                timestamp: new Date().toISOString(),
                filename: `${serverUri?.replace(/[^a-z0-9]/gi, '_') || 'unknown'}_${Date.now()}.pem`
            });
        }
    } catch (error) {
        logger.error('Error handling server certificate:', error);

        // Emit error event
        opcuaEmitter.emit('certificateError', {
            error: error.message,
            serverUri
        });
    }
});

/**
 * Initialize the certificate manager
 * @returns {Promise<void>}
 */
async function initializeCertificates() {
    try {
        // *** CORRECTION HERE ***
        await certificateManager.ensureInitialized();
    } catch (error) {
        logger.error('Failed to initialize certificates:', error);
        statusManager.setOpcuaStatus(StatusConstants.WARNING, {
            message: 'Certificate initialization failed, falling back to insecure connection',
            error: error.message
        });
    }
}

/**
 * Connect to OPC UA server and subscribe to nodes
 * @param {string} endpointUrl - The server endpoint URL
 * @param {Object} securityOptions - Security options (mode, policy)
 * @returns {Promise<Object>} - Client connection details
 */
async function connectAndSubscribe(endpointUrl, securityOptions = {}) {
    const MAX_RETRIES = 5;
    let retryCount = 0;
    let lastError = null;

    // Ensure certificates are initialized
    await initializeCertificates();

    // Get security mode and policy from options or environment
    const securityMode = securityOptions.securityMode || config.OPCUA_SECURITY_MODE;
    const securityPolicy = securityOptions.securityPolicy || config.OPCUA_SECURITY_POLICY;

    while (retryCount < MAX_RETRIES) {
        try {
            // Try a different approach to create the client
            // Explicitly create client with minimal options to avoid the assertion error
            const clientOptions = {
                applicationName: "NodeOPCUA-Client",
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: 2,
                    maxDelay: 5000
                },
                securityMode: opcua.MessageSecurityMode.None,
                securityPolicy: opcua.SecurityPolicy.None,
                endpointMustExist: false,
                keepSessionAlive: true,
                requestedSessionTimeout: 60000
            };

            logger.info(`Using simplified connection options for debug mode`);

            // Create client with debug logging
            const client = opcua.OPCUAClient.create(clientOptions);

            logger.info(`Connecting to OPC UA server at ${endpointUrl}`);

            // Add timeout for connect operation to avoid hanging
            const connectPromise = client.connect(endpointUrl);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000);
            });

            await Promise.race([connectPromise, timeoutPromise]);
            logger.info(`Connected to OPC UA server at ${endpointUrl}`);

            // Create session
            const sessionOptions = {
                requestedSessionTimeout: 60000,
                maxTransactionQueueLength: 100
            };

            const session = await client.createSession(sessionOptions);
            logger.info("OPC UA session created successfully");

            // Create subscription with longer lifetimes and timeouts
            const subscription = opcua.ClientSubscription.create(session, {
                requestedPublishingInterval: 1000,
                requestedLifetimeCount: 1000,       // Increased lifetime
                requestedMaxKeepAliveCount: 30,     // Increased keep alive
                maxNotificationsPerPublish: 1000,   // Increased notifications
                publishingEnabled: true,
                priority: 10
            });

            subscription.on("started", () => {
                logger.info(`Subscription started - ID: ${subscription.subscriptionId}`);
            });

            subscription.on("terminated", () => {
                logger.info("Subscription terminated");
                statusManager.setOpcuaStatus(StatusConstants.ERROR, { message: "Subscription terminated" });
            });

            // Use more basic monitoring approach for nodes
            for (const [key, nodeConfig] of Object.entries(opcuaMapping)) {
                try {
                    logger.info(`Monitoring node: ${nodeConfig.nodeId} (${key})`);

                    // Use simpler monitoring parameters
                    const monitoredItem = opcua.ClientMonitoredItem.create(
                        subscription,
                        {
                            nodeId: nodeConfig.nodeId,
                            attributeId: opcua.AttributeIds.Value
                        },
                        {
                            samplingInterval: 1000,
                            discardOldest: true,
                            queueSize: 10
                        },
                        opcua.TimestampsToReturn.Both
                    );

                    monitoredItem.on("changed", (dataValue) => {
                        // Extract and emit value
                        const value = dataValue.value.value;
                        opcuaEmitter.emit('nodeChanged', {
                            key,
                            label: nodeConfig.label,
                            timestamp: Date.now(),
                            value,
                        });
                    });
                } catch (err) {
                    logger.error(`Failed to create monitored item for ${key}: ${err.message}`);
                }
            }

            return {
                client,
                session,
                subscription,
                securityMode: 'None', // Force to None for now
                securityPolicy: 'None'
            };

        } catch (error) {
            lastError = error;
            retryCount++;

            // Log the full error for diagnosis
            logger.error(`Connection attempt ${retryCount} failed with error: ${error.message}`);
            logger.error(`Error stack: ${error.stack}`);

            // Try a different approach on next attempt
            const delay = 2000 * retryCount;
            logger.warn(`Retrying in ${delay}ms with different options`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // After exhausting retries, log error, update status, and return null.
    logger.error(
        `Failed to connect after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'Unknown error'}. Waiting for manual retry.`
    );

    statusManager.setOpcuaStatus(StatusConstants.ERROR, {
        message: "Connection failed after multiple attempts",
        error: lastError?.message || 'Unknown error'
    });

    return null;
}

module.exports = {
    connectAndSubscribe,
    opcuaEmitter,
    certificateManager,
    initializeCertificates // Keep exporting this function name
};