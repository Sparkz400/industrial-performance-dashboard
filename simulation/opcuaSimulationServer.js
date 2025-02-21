const opcua = require("node-opcua");

const server = new opcua.OPCUAServer({
    port: 4840,
    resourcePath: "/UA/MyLittleServer",
    allowAnonymous: true,
    buildInfo: {
        productName: "MySampleServer",
        buildNumber: "7658",
        buildDate: new Date(2020, 1, 1)
    }
});

server.initialize(() => {
    console.log("Server initialized");

    const addressSpace = server.engine.addressSpace;
    const namespace = addressSpace.getOwnNamespace();

    const device = namespace.addObject({
        organizedBy: addressSpace.rootFolder.objects,
        browseName: "MyDevice"
    });

    namespace.addVariable({
        componentOf: device,
        browseName: "SensorValue",
        nodeId: "ns=1;s=SensorValue",
        dataType: "Double",
        minimumSamplingInterval: 1000,
        value: {
            get: function () {
                return new opcua.Variant({
                    dataType: opcua.DataType.Double,
                    value: Math.random() * 100
                });
            }
        }
    });

    server.start((err) => {
        if (err) {
            console.error("Error starting server:", err);
        } else {
            const endpointUrl = server.getEndpointUrl();
            console.log("Server is now listening on endpoint:", endpointUrl);
        }
    });
});

function shutdownServer() {
    console.log("Shutting down OPC UA Server...");
    server.shutdown(1000, () => {
        console.log("OPC UA Server shutdown complete.");
        process.exit(0);
    });
}

// Handle Ctrl+C (SIGINT) and termination (SIGTERM)
process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);