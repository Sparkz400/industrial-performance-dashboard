const opcua = require('node-opcua');
const EventEmitter = require('events');
const opcuaMapping = require('../config/opcuaMapping');
const logger = require('../utils/logger');
const StatusConstants = require("../utils/statusConstants");
const statusManager = require("../utils/status");
const fs = require('fs');

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

async function connectAndSubscribe(endpointUrl) {
    const MAX_RETRIES = 5;
    let retryCount = 0;
    let lastError = null;

    // Remove or fix the certificate code that's causing problems
    while (retryCount < MAX_RETRIES) {
        try {
            // Use simpler configuration without certificates for now
            const client = opcua.OPCUAClient.create({
                applicationName: "Monitoring Client",
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: 3,
                    maxDelay: 10 * 1000
                },
                securityMode: opcua.MessageSecurityMode.None,
                securityPolicy: opcua.SecurityPolicy.None,
                endpointMustExist: false
            });

            logger.info(`Connecting to OPC UA server at ${endpointUrl}`);
            await client.connect(endpointUrl);
            logger.info(`Connected to OPC UA server at ${endpointUrl}`);

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

            // If successful, reset retryCount (or handle as needed) and return the connection details.
            return { client, session, subscription };
        } catch (error) {
            lastError = error;
            retryCount++;
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

module.exports = { connectAndSubscribe, opcuaEmitter };
