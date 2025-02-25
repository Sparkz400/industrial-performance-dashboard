const opcua = require('node-opcua');
const EventEmitter = require('events');
const status = require('../utils/status');
const opcuaMapping = require('../config/opcuaMapping');
const logger = require('../utils/logger');
const { OPCUAError } = require('../utils/errors');

// Add exponential backoff for reconnections
const MAX_RETRIES = 5;
let retryCount = 0;

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

/**
 * Connects to OPC UA server and subscribes to nodes.
 * @param {string} endpointUrl - OPC UA server endpoint.
 * @returns {Promise<Object>} - Returns client, session, and subscription.
 */
async function connectAndSubscribe(endpointUrl) {
    try {
        const client = opcua.OPCUAClient.create({
            endpointMustExist: false,
            securityMode: opcua.MessageSecurityMode.None,
            securityPolicy: opcua.SecurityPolicy.None,
        });

        await client.connect(endpointUrl);
        console.log("Connected to OPC UA server at", endpointUrl);
        const session = await client.createSession();
        console.log("OPC UA session created");

        const subscription = opcua.ClientSubscription.create(session, {
            requestedPublishingInterval: 1000,
            requestedLifetimeCount: 600,
            requestedMaxKeepAliveCount: 10,
            maxNotificationsPerPublish: 10,
            publishingEnabled: true,
            priority: 10
        });

        subscription.on("started", () => {
            console.log("Subscription started - ID:", subscription.subscriptionId);
        });
        subscription.on("keepalive", () => {
        });
        subscription.on("terminated", () => {
            console.log("Subscription terminated");
            status.setOpcuaStatus("terminated");
        });

        // Subscribe for every node defined in the mapping.
        for (const [key, nodeConfig] of Object.entries(opcuaMapping)) {
            const monitoredItem = opcua.ClientMonitoredItem.create(
                subscription,
                {
                    nodeId: nodeConfig.nodeId,
                    attributeId: opcua.AttributeIds.Value
                },
                {samplingInterval: 1000, discardOldest: true, queueSize: 10},
                opcua.TimestampsToReturn.Both
            );

            monitoredItem.on("changed", (dataValue) => {
                const value = dataValue.value.value;
                const eventPayload = {
                    key,
                    label: nodeConfig.label,
                    timestamp: Date.now(),
                    value
                };
                opcuaEmitter.emit('nodeChanged', eventPayload);
            });
        }
        retryCount = 0;
        return {client, session, subscription};
    }catch(error){
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 1000;
            logger.warn(`Connection failed, retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return connectAndSubscribe(endpointUrl);
            }
        throw new OPCUAError(`Failed to connect after ${MAX_RETRIES} attempts`);
    }
}

module.exports = { connectAndSubscribe, opcuaEmitter };
