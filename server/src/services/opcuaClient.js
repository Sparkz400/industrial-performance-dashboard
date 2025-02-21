const opcua = require('node-opcua');
const EventEmitter = require('events');
const status = require('../utils/status');
const opcuaMapping = require('../config/opcuaMapping');

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

const endpointUrl = "opc.tcp://localhost:4840/UA/MyLittleServer";

function connectAndSubscribe() {
    const client = opcua.OPCUAClient.create({
        endpointMustExist: false,
        securityMode: opcua.MessageSecurityMode.None,
        securityPolicy: opcua.SecurityPolicy.None,
    });

    return client.connect(endpointUrl)
        .then(() => {
            console.log("Connected to OPC UA server");
            return client.createSession();
        })
        .then(session => {
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
            subscription.on("keepalive", () => {});
            subscription.on("terminated", () => {
                console.log("Subscription terminated");
                status.setOpcuaStatus("terminated");
            });

            // Iterate over every node in our mapping and subscribe
            for (const [key, nodeConfig] of Object.entries(opcuaMapping)) {
                const monitoredItem = opcua.ClientMonitoredItem.create(
                    subscription,
                    {
                        nodeId: nodeConfig.nodeId,
                        attributeId: opcua.AttributeIds.Value
                    },
                    { samplingInterval: 1000, discardOldest: true, queueSize: 10 },
                    opcua.TimestampsToReturn.Both
                );

                monitoredItem.on("changed", (dataValue) => {
                    const value = dataValue.value.value;
                    const eventPayload = {
                        key, // e.g., "sensorValue"
                        label: nodeConfig.label,
                        timestamp: Date.now(),
                        value
                    };
                    console.log(`Node ${key} changed:`, eventPayload);
                    opcuaEmitter.emit('nodeChanged', eventPayload);
                });
            }

            return { client, session, subscription };
        });
}

module.exports = { connectAndSubscribe, opcuaEmitter };
