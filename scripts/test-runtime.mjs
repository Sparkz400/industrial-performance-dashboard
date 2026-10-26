import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

const require = createRequire(
  new URL("../server/package.json", import.meta.url),
);
const { default: bcrypt } = await import(
  pathToFileURL(require.resolve("bcrypt"))
);
const { default: nodemailer } = await import(
  pathToFileURL(require.resolve("nodemailer"))
);
const opcua = await import(pathToFileURL(require.resolve("node-opcua")));
await import(pathToFileURL(require.resolve("cron-parser")));
const database = new DatabaseSync(":memory:");
assert.equal(database.prepare("SELECT 1 AS ok").get().ok, 1);
database.close();
assert.ok(
  await bcrypt.compare("runtime-smoke", await bcrypt.hash("runtime-smoke", 4)),
);

// Compile a message in memory; no SMTP connection or external recipient.
const transport = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
});
const message = await transport.sendMail({
  from: "test@example.invalid",
  to: "test@example.invalid",
  subject: "Report smoke",
  text: "Offline verification",
});
assert.match(message.message.toString(), /Offline verification/);

process.env.OTEL_ENABLED = "true";
process.env.OTEL_METRICS_EXPORTER = "none";
process.env.OTEL_LOGS_EXPORTER = "none";
const tracing = await import("../server/dist/src/observability/tracing.js");
tracing.initTracing();
await tracing.shutdownTracing();

const directory = await mkdtemp(join(tmpdir(), "dashboard-runtime-"));
let server,
  client,
  session,
  gateway,
  modbus,
  certificates,
  databaseManager,
  runtimeClientPki;
try {
  const { writeReportPdf } =
    await import("../server/dist/src/services/reportPdf.js");
  const filename = join(directory, "report.pdf");
  await writeReportPdf(filename, {
    title: "Report smoke - Prüfstand Δ",
    generatedAt: new Date(),
    period: "Owned fixture",
    sections: [
      {
        title: "Measured values",
        table: {
          headers: ["Metric", "Value"],
          widths: [1, 1],
          rows: [["Temperature", "23 °C"]],
        },
      },
    ],
  });
  const pdf = await readFile(filename);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
  Object.assign(process.env, {
    NODE_ENV: "test",
    CLIENT_URL: "http://127.0.0.1",
    DB_HOST: "127.0.0.1",
    DB_PORT: "1",
    DB_USER: "runtime_test",
    DB_PASSWORD: randomUUID(),
    DB_NAME: "runtime_test",
    COOKIE_SECRET: randomUUID(),
    SESSION_SECRET: randomUUID(),
  });
  const { reportEmailService } =
    await import("../server/dist/src/services/reportEmailService.js");
  const originalSend = transport.sendMail.bind(transport);
  let attachment;
  transport.sendMail = async (options) => {
    attachment = await originalSend(options);
    return attachment;
  };
  reportEmailService.transporter = transport;
  await reportEmailService.sendReport(
    ["test@example.invalid"],
    "Report attachment",
    "Offline verification",
    filename,
    "<owned-runtime-report@performance-dashboard.local>",
  );
  const mime = attachment.message.toString();
  assert.match(mime, /Content-Type: application\/pdf/);
  assert.ok(
    mime.replaceAll(/\s/g, "").includes(pdf.toString("base64")),
    "Email must contain the complete generated PDF",
  );
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  server = new opcua.OPCUAServer({
    port,
    resourcePath: "/UA/Runtime",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    serverCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "server-pki"),
    }),
    userCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "user-pki"),
    }),
  });
  await server.initialize();
  const variable = server.engine.addressSpace.getOwnNamespace().addVariable({
    organizedBy: server.engine.addressSpace.rootFolder.objects,
    browseName: "RuntimeValue",
    nodeId: "ns=1;s=RuntimeValue",
    dataType: "Double",
    minimumSamplingInterval: 20,
    value: new opcua.Variant({ dataType: opcua.DataType.Double, value: 42 }),
  });
  await server.start();
  runtimeClientPki = new opcua.OPCUACertificateManager({
    rootFolder: join(directory, "client-pki"),
  });
  client = opcua.OPCUAClient.create({
    endpointMustExist: false,
    connectionStrategy: { maxRetry: 0 },
    clientCertificateManager: runtimeClientPki,
  });
  await client.connect(`opc.tcp://127.0.0.1:${port}/UA/Runtime`);
  session = await client.createSession();
  assert.equal(
    (
      await session.read(
        { nodeId: variable.nodeId, attributeId: opcua.AttributeIds.Value },
        0,
      )
    ).value.value,
    42,
  );
  const subscription = opcua.ClientSubscription.create(session, {
    requestedPublishingInterval: 50,
    requestedLifetimeCount: 100,
    requestedMaxKeepAliveCount: 10,
    publishingEnabled: true,
  });
  const item = await subscription.monitor(
    { nodeId: variable.nodeId, attributeId: opcua.AttributeIds.Value },
    { samplingInterval: 20, discardOldest: true, queueSize: 10 },
    opcua.TimestampsToReturn.Both,
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Owned OPC UA subscription timed out")),
      10000,
    );
    item.on("changed", (value) => {
      if (value.value.value === 43) {
        clearTimeout(timer);
        resolve();
      }
    });
    variable.setValueFromSource({ dataType: opcua.DataType.Double, value: 43 });
  });
  await subscription.terminate();
  await session.close();
  session = undefined;
  await client.disconnect();
  client = undefined;
  await server.shutdown(0);
  server = undefined;
  const { createModbusSimulator } =
    await import("../server/dist/simulation/modbusSimulationServer.js");
  const { startLegacyGateway } =
    await import("../server/dist/src/gateway/legacyGateway.js");
  certificates = (
    await import("../server/dist/src/opc-ua/services/certificateManager.js")
  ).default;
  databaseManager = (
    await import("../server/dist/src/database/dbConnection.js")
  ).default;
  const settings = (await import("../server/dist/src/config/config.js"))
    .default;
  settings.OPCUA_PKI_DIR = join(directory, "secure-client");
  await certificates.ensureInitialized();
  modbus = await createModbusSimulator(0);
  gateway = await startLegacyGateway({
    name: "OwnedRuntimeGateway",
    namespaceUri: "urn:performance-dashboard:runtime:legacy",
    opcuaPort: port,
    pkiDirectory: join(directory, "gateway-pki"),
    trustedClientCertificate: certificates.certificateFile,
    modbus: {
      host: "127.0.0.1",
      port: modbus.port,
      unitId: 1,
      functionCode: 3,
      startAddress: 0,
      count: 7,
      pollMs: 100,
      timeoutMs: 500,
    },
    tags: [
      { key: "Count", offset: 1, type: "uint32", wordOrder: "high-first" },
    ],
  });
  await certificates.trustCertificate(
    gateway.server.getCertificate(),
    "owned-runtime-gateway",
  );
  client = opcua.OPCUAClient.create({
    ...(await certificates.getClientOptions(
      "SignAndEncrypt",
      "Basic256Sha256",
    )),
    connectionStrategy: { maxRetry: 0 },
  });
  await client.connect(`opc.tcp://localhost:${port}/UA/LegacyGateway`);
  session = await client.createSession();
  const namespaceIndex = (await session.readNamespaceArray()).indexOf(
    gateway.config.namespaceUri,
  );
  const nodeId = `ns=${namespaceIndex};s=Count`;
  const measurement = await session.read({
    nodeId,
    attributeId: opcua.AttributeIds.Value,
  });
  assert.ok(measurement.statusCode.isGood());
  assert.ok(measurement.value.value >= 100);
  assert.equal(
    (
      await session.write({
        nodeId,
        attributeId: opcua.AttributeIds.Value,
        value: { value: { dataType: opcua.DataType.Double, value: 0 } },
      })
    ).name,
    "BadNotWritable",
  );
  modbus.state.available = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      !(
        await session.read({ nodeId, attributeId: opcua.AttributeIds.Value })
      ).statusCode.isGood()
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(
    (await session.read({ nodeId, attributeId: opcua.AttributeIds.Value }))
      .statusCode.name,
    "BadNoCommunication",
  );
} finally {
  await session?.close();
  await client?.disconnect();
  await server?.shutdown(0);
  await gateway?.stop();
  await modbus?.stop();
  await certificates?.dispose();
  await runtimeClientPki?.dispose();
  await databaseManager?.end();
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PASS: SQLite, bcrypt, OPC UA certificate generation/read/subscription, encrypted read-only Modbus gateway, scheduler, offline email, tracing and browser-free PDF",
);
