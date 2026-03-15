import opcua from "node-opcua";

const server = new opcua.OPCUAServer({
    port: parseInt(process.env.OPCUA_PORT || '4840'),
    resourcePath: "/UA/MyLittleServer",
    allowAnonymous: true,
    buildInfo: {
        productName: "MySampleServer",
        buildNumber: "7658",
        buildDate: new Date(2020, 1, 1)
    }
});

server.initialize(() => {
    console.log("OPC UA Simulation Server initialized");

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    const device = namespace.addObject({
        organizedBy: addressSpace.rootFolder.objects,
        browseName: "MyDevice"
    });

    namespace.addVariable({
        componentOf: device,
        browseName: "AirConsumption",
        nodeId: "ns=1;s=AirConsumption",
        dataType: "Double",
        minimumSamplingInterval: 1000,
        value: {
            get: () => new opcua.Variant({
                dataType: opcua.DataType.Double,
                value: Math.random() * 100
            })
        }
    });
    namespace.addVariable({
        componentOf: device,
        browseName: "OperationMode",
        nodeId: "ns=1;s=OperationMode",
        dataType: "Int32",
        minimumSamplingInterval: 1000,
        value: {
            get: () => new opcua.Variant({
                dataType: opcua.DataType.Int32,
                value: Math.floor(Math.random() * 6) + 1,
            })
        }
    });
    namespace.addVariable({
        componentOf: device,
        browseName: "PowerConsumption",
        nodeId: "ns=1;s=PowerConsumption",
        dataType: "Double",
        minimumSamplingInterval: 1000,
        value: {
            get: () => new opcua.Variant({
                dataType: opcua.DataType.Double,
                value: Math.random() * 100
            })
        }
    });

    server.start((err?: Error | null) => {
        if (err) {
            console.error("Error starting OPC UA Simulation Server:", err);
        } else {
            console.log("OPC UA Simulation Server is now listening on endpoint:", server.getEndpointUrl());
        }
    });
});

function shutdownServer(): void {
    console.log("Shutting down OPC UA Simulation Server...");
    server.shutdown(1000, () => {
        console.log("OPC UA Simulation Server shutdown complete.");
        process.exit(0);
    });
}

process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);
