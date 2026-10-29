import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import * as opcua from "node-opcua";
import { dailyFixture } from "./daily-fixture.mjs";

// D08: collector fencing. Samples carry the lease they were taken under; a sample received
// after another collector's newer lease began is quarantined. Two app processes against one
// owned database and owned OPC UA server: only the lock holder collects, and kill -9 of the
// holder hands collection to the other without duplicate samples.
await dailyFixture(async ({ pool, expect }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Part 1: the fencing rule, in this process.
  const lock = await import("../server/dist/src/services/collectorLock.js");
  const worker = (await import("../server/dist/src/queue/opcuaQueueWorker.js")).default;
  assert.equal(await lock.acquireCollectorLock(() => {}, 200), true);
  const mine = lock.currentLease();
  const [{ id: fenceMachine }] = (
    await pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('Fence fixture','opc.tcp://127.0.0.1:49975','127.0.0.1',false) RETURNING id")
  ).rows;
  const t0 = Date.now();
  const at = (offset) => new Date(t0 + offset).toISOString();
  const sample = (key, received, leaseEpoch = mine.epoch) =>
    worker.enqueue({ key, label: key, timestamp: received, receivedAt: received, value: 1, statusCode: "Good", machineId: fenceMachine, leaseEpoch });
  // This process retakes its own lock (for example after a database outage): its backlog stays valid.
  await pool.query("INSERT INTO collector_epochs(holder,acquired_at) VALUES($1,$2)", [mine.holder, at(0)]);
  sample("OwnRetake", at(500));
  // Another collector takes over at t0+1000 while this one, cut off from the database, keeps spooling.
  await pool.query("INSERT INTO collector_epochs(holder,acquired_at) VALUES('other-host:7:feed',$1)", [at(1000)]);
  sample("BeforeTakeover", at(900));
  sample("AfterTakeover", at(1100));
  for (let i = 0; i < 5; i++) await worker.processBatch();
  const stored = (await pool.query("SELECT node_key FROM opcua_data WHERE machine_id=$1 ORDER BY node_key", [fenceMachine])).rows.map((r) => r.node_key);
  assert.deepEqual(stored, ["BeforeTakeover", "OwnRetake"]);
  const quarantined = worker.getQuarantine(10);
  assert.equal(quarantined.length, 1);
  assert.match(quarantined[0].reason, /^Fenced: received after collector lease \d+ \(other-host:7:feed\) began; taken under lease \d+/);
  await lock.releaseCollectorLock();

  // Part 2: two collector processes, one database, one owned OPC UA server.
  const port = await new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const certificates = new opcua.OPCUACertificateManager({ rootFolder: join(directory, "fence-server-pki"), automaticallyAcceptUnknownCertificate: false });
  await certificates.initialize();
  const certificateFile = join(directory, "fence-server.pem");
  await certificates.createSelfSignedCertificate({
    outputFile: certificateFile,
    applicationUri: "urn:localhost:fence-fixture",
    subject: "/CN=localhost",
    dns: ["localhost"],
    ip: ["127.0.0.1"],
    startDate: new Date(Date.now() - 60000),
    validity: 1,
  });
  const server = new opcua.OPCUAServer({
    port,
    hostname: "localhost",
    resourcePath: "/UA/Fence",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    allowAnonymous: true,
    certificateFile,
    privateKeyFile: certificates.privateKey,
    serverCertificateManager: certificates,
    serverInfo: { applicationUri: "urn:localhost:fence-fixture" },
  });
  await server.initialize();
  let counter = 0;
  const node = server.engine.addressSpace.getOwnNamespace().addVariable({
    organizedBy: server.engine.addressSpace.rootFolder.objects,
    browseName: "Count",
    nodeId: "ns=1;s=Count",
    dataType: "Double",
    minimumSamplingInterval: 100,
    value: new opcua.Variant({ dataType: opcua.DataType.Double, value: 0 }),
  });
  await server.start();
  const ticker = setInterval(() => {
    counter += 1;
    node.setValueFromSource(new opcua.Variant({ dataType: opcua.DataType.Double, value: counter }));
  }, 100);
  const [{ id: machine }] = (
    await pool.query("INSERT INTO machines(name,endpoint_url,ip,port) VALUES('Fence press',$1,'127.0.0.1',$2) RETURNING id", [`opc.tcp://localhost:${port}/UA/Fence`, port])
  ).rows;
  await pool.query("INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,sampling_interval) VALUES($1,'ns=1;s=Count','Count','Count',100)", [machine]);

  const children = [];
  const start = (name) => {
    const child = spawn(process.execPath, ["dist/app.js"], {
      cwd: "server",
      env: {
        ...process.env,
        NODE_ENV: "development", // "test" keeps app.js from starting a server
        PORT: "0",
        HOST: "127.0.0.1",
        OPCUA_PKI_DIR: join(directory, `${name}-pki`),
        OPCUA_SPOOL_PATH: join(directory, `${name}.sqlite`),
        REPORTS_DIR: join(directory, `${name}-reports`),
        LOG_LEVEL: "info",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (d) => (child.output = (child.output + d).slice(-6000)));
    children.push(child);
    return child;
  };
  const rows = async () => Number((await pool.query("SELECT count(*) n FROM opcua_data WHERE machine_id=$1", [machine])).rows[0].n);
  const duplicates = async () =>
    (await pool.query("SELECT source_timestamp, count(*)::int n FROM opcua_data WHERE machine_id=$1 GROUP BY source_timestamp HAVING count(*)>1", [machine])).rowCount;
  const holders = async () => (await pool.query("SELECT DISTINCT holder FROM collector_epochs WHERE holder NOT IN ($1,'other-host:7:feed')", [mine.holder])).rows.map((r) => r.holder);
  try {
    const first = start("collector-a");
    await expect.poll(rows, { timeout: 60_000, message: first.output }).toBeGreaterThan(10);
    const second = start("collector-b");
    await sleep(4000);
    assert.equal((await holders()).length, 1, "The second collector waits without a lease");
    assert.equal(await duplicates(), 0, "Only the lock holder collects");
    const before = await rows();
    first.kill("SIGKILL");
    await once(first, "exit");
    // The second collector takes the lock (retried every 5 s), connects and continues.
    await expect.poll(async () => (await holders()).length, { timeout: 30_000, message: second.output }).toBe(2);
    await expect.poll(rows, { timeout: 60_000, message: second.output }).toBeGreaterThan(before + 10);
    assert.equal(await duplicates(), 0, "No sample was stored by both collectors");
    console.log(JSON.stringify({ collectorFencing: "passed", samples: await rows(), leases: (await holders()).length }));
  } catch (error) {
    for (const [i, child] of children.entries()) console.error(`--- collector ${i}
${child.output}`);
    throw error;
  } finally {
    clearInterval(ticker);
    for (const child of children)
      // A child killed by a signal keeps exitCode null; signalCode tells it has exited.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    await Promise.race([server.shutdown(0), sleep(5000)]);
  }
});
