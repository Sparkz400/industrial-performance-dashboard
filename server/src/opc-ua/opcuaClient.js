// server/src/services/opcuaClient.js
const opcua = require('node-opcua');
const EventEmitter = require('events');
const opcuaMapping = require('../../config/opcuaMapping');
const logger = require('../../utils/logger');
const StatusConstants = require("../../utils/statusConstants");
const statusManager = require("../../utils/status");
const certificateManager = require('./certificateManager');

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

/**
 * Auto-accept untrusted certificates event handler
 * This is triggered when a server certificate is received but not trusted
 */
opcuaEmitter.on('serverCertificate', async (certificate, serverUri) => {
    try {
        if (process.env.AUTO_ACCEPT_CERTIFICATES === 'true') {
            // Auto-accept unknown certificates
            const serverName = serverUri || 'unknown_server';
            await certificateManager.trustCertificate(certificate, serverName);
            logger.info(`Auto-accepted certificate from ${serverName}`);
        } else {
            logger.warn('Untrusted server certificate received, manual acceptance required');

            // Emit event for potential UI handling
            opcuaEmitter.emit('untrustedCertificate', {
                certificate,
                serverUri: serverUri || 'unknown_server'
            });
        }
    } catch (error) {
        logger.error('Error handling server certificate:', error);
    }
});

/**
 * Initialize the certificate manager
 * @returns {Promise<void>}
 */
async function initializeCertificates() {
    try {
        await certificateManager.initialize();
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
    const securityMode = securityOptions.securityMode || process.env.OPCUA_SECURITY_MODE || 'None';
    const securityPolicy = securityOptions.securityPolicy || process.env.OPCUA_SECURITY_POLICY || 'None';

    while (retryCount < MAX_RETRIES) {
        try {
            // Get client options from certificate manager
            let clientOptions;
            try {
                clientOptions = await certificateManager.getClientOptions(securityMode, securityPolicy);

                // Log security configuration
                logger.info(`Using security mode: ${securityMode}, policy: ${securityPolicy}`);
            } catch (error) {
                logger.error('Failed to get secure client options, falling back to None:', error);

                // Fall back to no security if there's an issue with certificates
                clientOptions = {
                    applicationName: "Monitoring Client",
                    connectionStrategy: {
                        initialDelay: 1000,
                        maxRetry: 3,
                        maxDelay: 10 * 1000
                    },
                    securityMode: opcua.MessageSecurityMode.None,
                    securityPolicy: opcua.SecurityPolicy.None,
                    endpointMustExist: false
                };
            }

            // Add certificate rejection handler
            clientOptions.serverCertificateManager = {
                ...clientOptions.serverCertificateManager,
                validationCallback: (err, certificate) => {
                    if (err) {
                        logger.warn('Certificate validation error:', err.message);

                        // Emit certificate for potential handling
                        opcuaEmitter.emit('serverCertificate', certificate, null);

                        // Auto-accept untrusted certificates based on environment setting
                        if (process.env.AUTO_ACCEPT_CERTIFICATES === 'true') {
                            return true;
                        }
                    }
                    return err === null;
                }
            };

            // Create and connect client
            const client = opcua.OPCUAClient.create(clientOptions);

            // Log connection attempt
            logger.info(`Connecting to OPC UA server at ${endpointUrl} (SecurityMode=${securityMode}, SecurityPolicy=${securityPolicy})`);

            // Add event handlers for security issues
            client.on('backoff', (retry, delay) => {
                logger.warn(`Connection attempt ${retry} failed, retrying in ${delay}ms`);
            });

            await client.connect(endpointUrl);
            logger.info(`Connected to OPC UA server at ${endpointUrl}`);

            // Try to get endpoints to confirm connection
            const endpoints = await client.getEndpoints();
            logger.info(`Server has ${endpoints.length} endpoint(s) available`);

            // Log available endpoints (debug level)
            endpoints.forEach((endpoint, index) => {
                logger.debug(`Endpoint ${index + 1}: ${endpoint.endpointUrl}, SecurityMode=${endpoint.securityMode}, SecurityPolicy=${endpoint.securityPolicyUri}`);
            });

            const session = await client.createSession();
            logger.info("OPC UA session created");

            const subscription = opcua.ClientSubscription.create(session, {
                requestedPublishingInterval: 1000,
                requestedLifetimeCount: 600,
                requestedMaxKeepAliveCount: 20,
                maxNotificationsPerPublish: 10,
                publishingEnabled: true,
                priority: 10,
            });

            subscription.on("started", () => {
                logger.info(`Subscription started - ID: ${subscription.subscriptionId}`);
            });

            subscription.on("keepalive", () => {
                // Optional: log or handle keepalive events.
            });

            subscription.on("terminated", () => {
                logger.info("Subscription terminated");
                statusManager.setOpcuaStatus(StatusConstants.ERROR, { message: "Connection error" });
            });

            // Subscribe to all nodes defined in the mapping.
            for (const [key, nodeConfig] of Object.entries(opcuaMapping)) {
                const monitoredItem = opcua.ClientMonitoredItem.create(
                    subscription,
                    {
                        nodeId: nodeConfig.nodeId,
                        attributeId: opcua.AttributeIds.Value,
                    },
                    { samplingInterval: 1000, discardOldest: true, queueSize: 10 },
                    opcua.TimestampsToReturn.Both
                );

                monitoredItem.on("changed", (dataValue) => {
                    const value = dataValue.value.value;
                    const eventPayload = {
                        key,
                        label: nodeConfig.label,
                        timestamp: Date.now(),
                        value,
                    };
                    opcuaEmitter.emit('nodeChanged', eventPayload);
                });
            }

            // If successful, return the connection details
            return {
                client,
                session,
                subscription,
                securityMode,
                securityPolicy
            };
        } catch (error) {
            lastError = error;
            retryCount++;

            // Check if the error is related to security
            const isSecurityError = error.message && (
                error.message.includes("certificate") ||
                error.message.includes("security") ||
                error.message.includes("untrusted") ||
                error.message.includes("trust") ||
                error.message.includes("rejected")
            );

            if (isSecurityError) {
                logger.error(`Security error connecting to OPC UA server: ${error.message}`);

                // If using security and it fails, try without security
                if (securityMode !== 'None' || securityPolicy !== 'None') {
                    logger.warn('Falling back to no security mode due to security error');

                    // Update status to warning
                    statusManager.setOpcuaStatus(StatusConstants.WARNING, {
                        message: "Security configuration issue, falling back to insecure connection",
                        error: error.message
                    });

                    // Try again with no security if this was our first attempt
                    if (retryCount === 1) {
                        securityOptions.securityMode = 'None';
                        securityOptions.securityPolicy = 'None';
                        retryCount--; // Don't count this as a retry
                        continue;
                    }
                }
            }

            const delay = Math.pow(2, retryCount) * 1000;
            logger.warn(
                `Connection attempt ${retryCount} failed. Retrying in ${delay}ms. Error: ${error.message}`
            );
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // After exhausting retries, log error, update status, and return null.
    logger.error(
        `Failed to connect after ${MAX_RETRIES} attempts. Last error: ${lastError.message}. Waiting for manual retry.`
    );
    statusManager.setOpcuaStatus(StatusConstants.ERROR, { message: "Connection error" });
    return null;
}

module.exports = {
    connectAndSubscribe,
    opcuaEmitter,
    certificateManager,
    initializeCertificates
};