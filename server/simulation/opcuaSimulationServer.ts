import * as opcua from "node-opcua";
import "dotenv/config";

const server = new opcua.OPCUAServer({
  port: parseInt(process.env.OPCUA_PORT || "4841"),
  resourcePath: "/UA/MyLittleServer",
  allowAnonymous: true,
  buildInfo: {
    productName: "MySampleServer",
    buildNumber: "7658",
    buildDate: new Date(2020, 1, 1),
  },
});

server.initialize(() => {
  console.log("OPC UA Simulation Server initialized");

  const addressSpace = server.engine.addressSpace!;
  const namespace = addressSpace.getOwnNamespace();

  const device = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: "MyDevice",
  });

  const started = Date.now();
  const scenario = () => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    const phase = seconds % 60;
    const total =
      Math.floor(seconds / 60) * 20 + Math.min(20, Math.floor(phase / 2));
    return {
      ProductionState: phase < 40 ? 1 : phase < 50 ? 0 : 2,
      ProductionCount: total,
      GoodCount: total - Math.floor(total / 10),
      RejectCount: Math.floor(total / 10),
    };
  };
  for (const key of [
    "ProductionState",
    "ProductionCount",
    "GoodCount",
    "RejectCount",
  ] as const)
    namespace.addVariable({
      componentOf: device,
      browseName: key,
      nodeId: "ns=1;s=" + key,
      dataType: "Int32",
      minimumSamplingInterval: 1000,
      value: {
        get: () =>
          new opcua.Variant({
            dataType: opcua.DataType.Int32,
            value: scenario()[key],
          }),
      },
    });

  namespace.addVariable({
    componentOf: device,
    browseName: "Running",
    nodeId: "ns=1;s=Running",
    dataType: "Boolean",
    value: {
      get: () =>
        new opcua.Variant({ dataType: opcua.DataType.Boolean, value: true }),
    },
  });
  namespace.addVariable({
    componentOf: device,
    browseName: "StatusText",
    nodeId: "ns=1;s=StatusText",
    dataType: "String",
    value: {
      get: () =>
        new opcua.Variant({
          dataType: opcua.DataType.String,
          value: "Simulator ready",
        }),
    },
  });
  namespace.addVariable({
    componentOf: device,
    browseName: "AirConsumption",
    nodeId: "ns=1;s=AirConsumption",
    dataType: "Double",
    minimumSamplingInterval: 1000,
    value: {
      get: () =>
        new opcua.Variant({
          dataType: opcua.DataType.Double,
          value: Math.random() * 100,
        }),
    },
  });
  namespace.addVariable({
    componentOf: device,
    browseName: "OperationMode",
    nodeId: "ns=1;s=OperationMode",
    dataType: "Int32",
    minimumSamplingInterval: 1000,
    value: {
      get: () =>
        new opcua.Variant({
          dataType: opcua.DataType.Int32,
          value: Math.floor(Math.random() * 6) + 1,
        }),
    },
  });
  namespace.addVariable({
    componentOf: device,
    browseName: "PowerConsumption",
    nodeId: "ns=1;s=PowerConsumption",
    dataType: "Double",
    minimumSamplingInterval: 1000,
    value: {
      get: () =>
        new opcua.Variant({
          dataType: opcua.DataType.Double,
          value: Math.random() * 100,
        }),
    },
  });

  server.start((err?: Error | null) => {
    if (err) {
      console.error("Error starting OPC UA Simulation Server:", err);
    } else {
      console.log(
        "OPC UA Simulation Server is now listening on endpoint:",
        server.getEndpointUrl(),
      );
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
