const opcuaClient = require('./opcuaClient');
const { setOpcuaStatus, getStatus } = require('../utils/status');
const logger = require('../utils/logger');

let retryDelay = 5000;

let currentConfig = {
    ip: process.env.OPCUA_IP || "localhost",
    port: process.env.OPCUA_PORT || 4840,
    resourcePath: process.env.OPCUA_RESOURCE_PATH || "/UA/MyLittleServer"
};

let currentConnection = null;

/**
 * Constructs the OPC UA endpoint URL.
 * @param {Object} config - Configuration object.
 * @returns {string} - OPC UA endpoint URL.
 */
function getEndpointUrl(config = currentConfig) {
    return `opc.tcp://${config.ip}:${config.port}${config.resourcePath}`;
}

async function startConnection() {
    const endpointUrl = getEndpointUrl();
    console.log("Attempting OPC UA connection to:", endpointUrl);
    try {
        currentConnection = await opcuaClient.connectAndSubscribe(endpointUrl);
        logger.info("OPC UA connection and subscription successful.");
        setOpcuaStatus("connected");
        retryDelay = 5000;
    } catch (error) {
        logger.error("Error during OPC UA connection:", error);
        setOpcuaStatus("error");
        retryDelay = Math.min(retryDelay * 2, 300000);
        setTimeout(startConnection, retryDelay);
    }
}

async function disconnectConnection() {
    if (currentConnection) {
        const { subscription, session, client } = currentConnection;
        const disconnectPromises = [];
        if (subscription) {
            disconnectPromises.push(
                subscription.terminate().catch(err => {
                    logger.error("Error terminating subscription:", err);
                })
            );
        }
        if (session) {
            disconnectPromises.push(
                session.close().catch(err => {
                    logger.error("Error closing session:", err);
                })
            );
        }
        if (client) {
            disconnectPromises.push(
                client.disconnect().catch(err => {
                    logger.error("Error disconnecting client:", err);
                })
            );
        }
        await Promise.all(disconnectPromises);
        logger.info("OPC UA connection fully disconnected.");
        setOpcuaStatus("disconnected");
        currentConnection = null;
    } else {
        logger.info("No OPC UA connection to disconnect.");
        setOpcuaStatus("disconnected");
    }
}


/**
 * Updates the OPC UA connection configuration and restarts the connection.
 * @param {Object} newConfig - New configuration parameters.
 * @returns {Promise<Object>} - Updated configuration.
 */
async function updateConnection(newConfig) {
    currentConfig = { ...currentConfig, ...newConfig };
    await disconnectConnection();
    await startConnection();
    return currentConfig;
}

/**
 * Retrieves the current OPC UA connection status.
 * @returns {Object} - Current status.
 */
function getConnectionStatus() {
    return getStatus();
}

module.exports = {
    startConnection,
    disconnectConnection,
    updateConnection,
    getConnectionStatus,
    getEndpointUrl
};
