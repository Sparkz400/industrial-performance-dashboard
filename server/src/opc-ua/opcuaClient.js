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
    const MAX_RETRIES = 3; // Reduced for faster testing
    let retryCount = 0;
    let lastError = null;

    // Ensure certificates are initialized (ensure this completes)
    logger.info("[ConnectAndSub] Ensuring certificates are initialized...");
    try {
        await initializeCertificates();
        logger.info("[ConnectAndSub] Certificates initialization complete.");
    } catch (initErr) {
        logger.error("[ConnectAndSub] Certificate initialization failed during connection attempt:", initErr);
        // Decide if you want to proceed without certs or fail here
        // For Security=None, it might be okay, but log it.
        statusManager.setOpcuaStatus(StatusConstants.WARNING, {
            message: 'Certificate initialization failed, connection might be insecure or fail.',
            error: initErr.message
        });
    }


    const securityMode = securityOptions.securityMode || config.OPCUA_SECURITY_MODE;
    const securityPolicy = securityOptions.securityPolicy || config.OPCUA_SECURITY_POLICY;

    while (retryCount < MAX_RETRIES) {
        let client = null; // Define client outside try
        try {
            // Get client options (this ensures certificate paths are ready if needed)
            logger.info(`[ConnectAndSub Attempt ${retryCount+1}] Getting client options... Mode: ${securityMode}, Policy: ${securityPolicy}`);
            const clientOptions = await certificateManager.getClientOptions(securityMode, securityPolicy);
            logger.debug(`[ConnectAndSub Attempt ${retryCount+1}] Client Options:`, clientOptions); // Log the options

            client = opcua.OPCUAClient.create(clientOptions);
            logger.info(`[ConnectAndSub Attempt ${retryCount+1}] Client created. Connecting to ${endpointUrl}...`);

            // Add timeout for connect operation
            const connectPromise = client.connect(endpointUrl);
            const timeoutPromise = new Promise((_, reject) => {
                // Keep the 30s timeout for now based on previous error
                setTimeout(() => reject(new Error('Connection timeout after 30 seconds (client.connect)')), 30000);
            });

            await Promise.race([connectPromise, timeoutPromise]);
            logger.info(`[ConnectAndSub Attempt ${retryCount+1}] Client connected successfully to ${endpointUrl}!`); // <-- Did we reach here?

            // <<<--- TEMPORARILY COMMENT OUT SESSION/SUBSCRIPTION --->>>
            logger.info("[ConnectAndSub] Temporarily skipping session and subscription creation for debugging.");

            // Close the connection immediately after successful test connect
            if (client) {
                logger.info("[ConnectAndSub] Disconnecting test client connection...");
                await client.disconnect();
                logger.info("[ConnectAndSub] Test client disconnected.");
            }

            // Return a simplified object indicating success
            return {
                client: null, // Return null as we disconnected
                session: null,
                subscription: null,
                securityMode: securityMode, // Report what was used
                securityPolicy: securityPolicy
            };



        } catch (error) {
            lastError = error;
            retryCount++;
            logger.error(`[ConnectAndSub Attempt ${retryCount}] Connection failed: ${error.message}`);
            logger.debug(`[ConnectAndSub Attempt ${retryCount}] Error stack: ${error.stack}`); // Log stack

            // Clean up potentially partially connected client on error
            if (client) {
                try {
                    logger.warn(`[ConnectAndSub Attempt ${retryCount}] Disconnecting client after error...`);
                    await client.disconnect();
                } catch (disconnectError) {
                    logger.error(`[ConnectAndSub Attempt ${retryCount}] Error disconnecting client after connection error: ${disconnectError.message}`);
                }
            }

            if (retryCount >= MAX_RETRIES) break; // Exit loop if max retries reached

            const delay = 2000 * retryCount;
            logger.warn(`[ConnectAndSub] Retrying connection in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    logger.error(`[ConnectAndSub] Failed to connect after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'Unknown error'}.`);
    statusManager.setOpcuaStatus(StatusConstants.ERROR, {
        message: "Connection failed after multiple attempts",
        error: lastError?.message || 'Unknown error'
    });
    return null; // Explicitly return null on failure
}

module.exports = {
    connectAndSubscribe,
    opcuaEmitter,
    certificateManager,
    initializeCertificates // Keep exporting this function name
};