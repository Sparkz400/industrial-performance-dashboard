import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import pg from "pg";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config({ path: "server/.env", quiet: true });
assert.ok(["127.0.0.1", "localhost"].includes(process.env.DB_HOST));
assert.equal(process.env.DB_PORT, "55432");
const directory = await mkdtemp(join(tmpdir(), "dashboard-recovery-"));
const database = `pd_recovery_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Client({
  host: process.env.DB_HOST,
  port: 55432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "postgres",
});
let pool,
  proxy,
  manager,
  worker,
  child,
  created = false,
  offline = false;
const sockets = new Set();
const spoolFile = join(directory, "measurements.sqlite");
const spoolUrl = pathToFileURL(
  resolve("server/dist/src/queue/measurementSpool.js"),
).href;
const workerUrl = pathToFileURL(
  resolve("server/dist/src/queue/opcuaQueueWorker.js"),
).href;
const killOwned = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  child = undefined;
};
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: 55432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
  await migrate(drizzle(pool), { migrationsFolder: "server/drizzle" });
  proxy = net.createServer((client) => {
    if (offline) {
      client.destroy();
      return;
    }
    const upstream = net.connect(55432, "127.0.0.1");
    sockets.add(client);
    sockets.add(upstream);
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => {
      sockets.delete(client);
      upstream.destroy();
    });
    upstream.on("close", () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.pipe(upstream);
    upstream.pipe(client);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  Object.assign(process.env, {
    DB_HOST: "127.0.0.1",
    DB_PORT: String(proxy.address().port),
    DB_NAME: database,
    DB_READ_REPLICA_URLS: "",
    DB_HEALTH_CHECK_INTERVAL: "0",
    OPCUA_SPOOL_PATH: spoolFile,
    NODE_ENV: "test",
    LOG_LEVEL: "error",
  });
  const producer = join(directory, "producer.mjs");
  await writeFile(
    producer,
    `import { MeasurementSpool } from ${JSON.stringify(spoolUrl)};\nconst spool=new MeasurementSpool(process.env.OPCUA_SPOOL_PATH);\nlet n=0;process.on('message',()=>{spool.enqueue({key:'OwnedCounter',label:'Owned',timestamp:new Date(),value:n++,statusCode:'Good'});process.send({accepted:spool.peek(100).at(-1).id});});process.send({ready:true});`,
  );
  child = fork(producer, [], {
    env: process.env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true,
  });
  const accepted = [];
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Producer receipt timeout")),
      15000,
    );
    child.once("error", reject);
    child.on("message", (message) => {
      if (message.accepted) accepted.push(message.accepted);
      if (accepted.length === 20) {
        clearTimeout(timeout);
        resolve();
      } else child.send("next");
    });
  });
  await killOwned();
  const { MeasurementSpool } = await import(spoolUrl);
  let spool = new MeasurementSpool(spoolFile);
  assert.deepEqual(
    spool.peek(100).map((row) => row.id),
    accepted,
  );
  spool.close();
  console.log(
    "PASS: 20 acknowledged durable writes survive forced collector termination",
  );

  const { OpcuaQueueWorker } = await import(workerUrl);
  manager = (await import("../server/dist/src/database/dbConnection.js"))
    .default;
  worker = new OpcuaQueueWorker();
  offline = true;
  for (const socket of sockets) socket.destroy();
  await assert.rejects(worker.processBatch());
  await worker.stop();
  worker = undefined;
  spool = new MeasurementSpool(spoolFile);
  assert.equal(spool.count(), 20);
  spool.close();
  offline = false;
  console.log(
    "PASS: actual database connection outage retains every accepted event",
  );

  const replay = join(directory, "replay.mjs");
  await writeFile(
    replay,
    `import { MeasurementSpool } from ${JSON.stringify(spoolUrl)};\nMeasurementSpool.prototype.acknowledge=function(){process.send({committed:true});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);};\nconst { OpcuaQueueWorker }=await import(${JSON.stringify(workerUrl)});await new OpcuaQueueWorker().processBatch();`,
  );
  child = fork(replay, [], {
    env: process.env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Replay commit timeout")),
      20000,
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== null) reject(new Error(`Replay exited ${code}`));
    });
    child.once("message", (message) => {
      if (message.committed) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  await killOwned();
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM opcua_data WHERE node_key='OwnedCounter'",
        )
      ).rows[0].count,
    ),
    20,
  );
  spool = new MeasurementSpool(spoolFile);
  assert.equal(spool.count(), 20);
  spool.close();
  worker = new OpcuaQueueWorker();
  await worker.processBatch();
  await worker.stop();
  worker = undefined;
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(DISTINCT event_id) FROM opcua_data WHERE node_key='OwnedCounter'",
        )
      ).rows[0].count,
    ),
    20,
  );
  spool = new MeasurementSpool(spoolFile);
  assert.equal(spool.count(), 0);
  spool.close();
  console.log(
    "PASS: process killed after PostgreSQL commit and before spool acknowledgment replays without loss or duplicates",
  );

  const sample = {
    key: "Capacity",
    label: "Capacity",
    timestamp: new Date(),
    value: 1,
  };
  spool = new MeasurementSpool(join(directory, "full.sqlite"));
  spool.enqueue(sample);
  const before = spool.peek(10);
  // Exercise SQLite's real SQLITE_FULL without filling a shared filesystem.
  const pages = spool.database.prepare("PRAGMA page_count").get().page_count;
  spool.database.exec(`PRAGMA max_page_count = ${pages}`);
  assert.throws(
    () => spool.enqueue({ ...sample, value: "x".repeat(100000) }),
    /full/i,
  );
  assert.deepEqual(spool.peek(10), before);
  spool.close();
  spool = new MeasurementSpool(join(directory, "reserve.sqlite"), {
    maxEntries: 1,
    minFreeBytes: Number.MAX_SAFE_INTEGER,
  });
  assert.throws(() => spool.enqueue(sample), /reserve/);
  assert.equal(spool.count(), 0);
  spool.close();
  spool = new MeasurementSpool(":memory:", { maxEntries: 1, minFreeBytes: 0 });
  spool.enqueue(sample);
  assert.throws(() => spool.enqueue(sample), /capacity/);
  assert.equal(spool.count(), 1);
  spool.close();
  console.log(
    "PASS: real SQLite capacity failure is atomic; free-space reserve and queue limit reject before acknowledgment",
  );
} finally {
  await killOwned();
  await worker?.stop();
  await manager?.end();
  for (const socket of sockets) socket.destroy();
  if (proxy) await new Promise((r) => proxy.close(r));
  await pool?.end();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith("dashboard-recovery-"));
  await rm(target, { recursive: true, force: true });
}
