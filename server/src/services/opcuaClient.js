const opcua = require('node-opcua');
const EventEmitter = require('events');
const status = require('../utils/status');

class OPCUAEmitter extends EventEmitter {}
const opcuaEmitter = new OPCUAEmitter();

const endpointUrl = "opc.tcp://localhost:4840/UA/MyLittleServer"; // Your simulation server endpoint

function connectAndSubscribe() {
    // Create a new client instance every time this function is called
    const client =
        opcua.OPCUAClient.create({ endpointMustExist: false,
            securityMode: opcua.MessageSecurityMode.None,
            securityPolicy: opcua.SecurityPolicy.None,
    });

    return client.connect(endpointUrl)
        .then(() => {
            console.log("Connected to SPS via OPC UA");
            return client.createSession();
        })
        .then(session => {
            console.log("OPC UA session created");
            // Create a subscription for continuous data updates

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
                console.log("KeepAlive:", new Date());
            });

            subscription.on("terminated", () => {
                console.log("Subscription terminated");
                status.setOpcuaStatus("terminated");
            });

            // Monitor a specific node; ensure this NodeId matches your simulation server
            const monitoredItem = opcua.ClientMonitoredItem.create(
                subscription,
                { nodeId: "ns=1;s=SensorValue", attributeId: opcua.AttributeIds.Value },
                { samplingInterval: 1000, discardOldest: true, queueSize: 10 },
                opcua.TimestampsToReturn.Both
            );

            monitoredItem.on("changed", (dataValue) => {
                const sensorValue = dataValue.value.value;
                const sensorData = {
                    timestamp: Date.now(),
                    value: sensorValue
                };
                console.log("Sensor data received:", sensorData);
                opcuaEmitter.emit('sensorData', sensorData);
            });

            // Return a result object (you can include client if needed for later cleanup)
            return { client, session, subscription };
        });
}

module.exports = { connectAndSubscribe, opcuaEmitter };
