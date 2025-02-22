const opcuaClient = require('./opcuaClient'); // your existing client service module
const { setOpcuaStatus, getStatus } = require('../utils/status');

// Default OPC UA connection configuration
let currentConfig = {
    ip: "localhost",
    port: 4840,
    resourcePath: "/UA/MyLittleServer"
};

// Store the current connection objects (client, session, subscription) so they can be closed
let currentConnection = null;
let client = null;
let session = null;


// Helper: Create the full endpoint URL from the current config.
function getEndpointUrl(config = currentConfig) {
    return `opc.tcp://${config.ip}:${config.port}${config.resourcePath}`;
}

// Start the OPC UA connection using currentConfig.
function startConnection() {
    const endpointUrl = getEndpointUrl();
    console.log("Attempting OPC UA connection to:", endpointUrl);

    // Connect and subscribe using your client module.
    return opcuaClient.connectAndSubscribe(endpointUrl)
        .then(connection => {
            currentConnection = connection;
            console.log("OPC UA connection and subscription successful.");
            setOpcuaStatus("connected");
        })
        .catch(err => {
            console.error("Error during OPC UA connection:", err);
            setOpcuaStatus("error");
            // Retry after 5 seconds
            setTimeout(startConnection, 5000);
        });
}

// Disconnect the current connection if it exists.
function disconnectConnection() {
    if (currentConnection) {
        const disconnectPromises = [];

        // Terminate the subscription if it exists.
        if (currentConnection.subscription) {
            disconnectPromises.push(
                currentConnection.subscription.terminate().catch(err => {
                    console.error("Error terminating subscription:", err);
                })
            );
        }

        // Close the session if it exists.
        if (currentConnection.session) {
            disconnectPromises.push(
                currentConnection.session.close().catch(err => {
                    console.error("Error closing session:", err);
                })
            );
        }

        // Disconnect the client if it exists.
        if (currentConnection.client) {
            disconnectPromises.push(
                currentConnection.client.disconnect().catch(err => {
                    console.error("Error disconnecting client:", err);
                })
            );
        }

        return Promise.all(disconnectPromises)
            .then(() => {
                console.log("OPC UA connection fully disconnected.");
                setOpcuaStatus("disconnected");
                currentConnection = null;
            })
            .catch(err => {
                console.error("Error disconnecting OPC UA connection:", err);
            });
    } else {
        console.log("No OPC UA connection to disconnect.");
        setOpcuaStatus("disconnected");
        currentConnection = null;
        return Promise.resolve();
    }
}

// Update connection settings: disconnect current connection (if any), update config, and reconnect.
function updateConnection(newConfig) {
    currentConfig = { ...currentConfig, ...newConfig };
    return disconnectConnection().then(() => startConnection())
        .then(() => currentConfig);
}

// Expose the current status (from your status utility)
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
