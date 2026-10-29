import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { once } from "node:events";
import * as opcua from "node-opcua";
import { Aedes } from "aedes";
import mqtt from "mqtt";
import { dailyFixture } from "./daily-fixture.mjs";

// C06: read-only MQTT ingestion from an owned TLS broker with a subscribe-only identity:
// mapping validation, duplicates, reordering, malformed payloads, broker restart, TLS and
// credential failures; the collector never publishes.
await dailyFixture(async ({ pool, call, sockets, actors, frontend, expect }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const certificate = async (name) => {
    const manager = new opcua.OPCUACertificateManager({ rootFolder: join(directory, `${name}-pki`), automaticallyAcceptUnknownCertificate: false });
    await manager.initialize();
    const file = join(directory, `${name}.pem`);
    await manager.createSelfSignedCertificate({
      outputFile: file,
      applicationUri: `urn:localhost:${name}`,
      subject: "/CN=localhost",
      dns: ["localhost"],
      ip: ["127.0.0.1"],
      startDate: new Date(Date.now() - 60000),
      validity: 1,
    });
    return { cert: await readFile(file, "utf8"), key: await readFile(manager.privateKey, "utf8") };
  };
  const tlsIdentity = await certificate("mqtt-broker");
  const strangerCa = (await certificate("mqtt-stranger")).cert;
  const passwords = { "pd-reader": "reader-fixture-secret", line: "line-fixture-secret" };
  const readable = new Set(["line/press", "line/count"]);
  const publishAttempts = [];
  let broker, server, port;
  const startBroker = async () => {
    broker = await Aedes.createBroker();
    broker.authenticate = (client, username, password, done) => {
      const ok = passwords[username] && password?.toString() === passwords[username];
      if (ok) client.user = username;
      done(ok ? null : Object.assign(new Error("Bad username or password"), { returnCode: 4 }), !!ok);
    };
    // Broker ACL: the reader may subscribe to the mapped topics only and may never publish.
    broker.authorizeSubscribe = (client, sub, done) =>
      done(null, client.user === "line" || readable.has(sub.topic) ? sub : null);
    broker.authorizePublish = (client, packet, done) => {
      if (client.user === "pd-reader") {
        publishAttempts.push(client.id);
        return done(new Error("subscribe-only identity"));
      }
      done(null);
    };
    server = tls.createServer({ cert: tlsIdentity.cert, key: tlsIdentity.key }, broker.handle);
    server.listen(port ?? 0, "127.0.0.1");
    await once(server, "listening");
    port = server.address().port;
  };
  const stopBroker = async () => {
    await new Promise((resolve) => broker.close(resolve));
    for (const client of Object.values(broker.clients ?? {})) client.conn?.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
  await startBroker();
  const url = `mqtts://localhost:${port}`;
  const { setupOpcuaBridge } = await import("../server/dist/src/opcuaBridge.js");
  setupOpcuaBridge(sockets);
  const worker = (await import("../server/dist/src/queue/opcuaQueueWorker.js")).default;
  worker.start();
  const { mqttIngestion } = await import("../server/dist/src/services/mqttIngestion.js");
  await mqttIngestion.startAll();
  const line = mqtt.connect(url, { username: "line", password: passwords.line, ca: [tlsIdentity.cert], clientId: "line-plc", protocolVersion: 4 });
  try {
    await once(line, "connect");
    const [{ id: machine }] = (
      await pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('MQTT line','opc.tcp://127.0.0.1:49987','127.0.0.1',false) RETURNING id")
    ).rows;
    const ok = async (role, method, path, body, status = 200) => {
      const r = await call(role, method, "/api/v1" + path, body);
      assert.equal(r.status(), status, await r.text());
      return r.json();
    };
    const source = (patch = {}, status = 201, role = "admin") =>
      ok(role, "POST", `/mqtt/machines/${machine}/sources`, {
        name: "Press line",
        brokerUrl: url,
        caCertificate: tlsIdentity.cert,
        username: "pd-reader",
        password: passwords["pd-reader"],
        mappings: [
          { topic: "line/press", nodeKey: "Pressure", valuePointer: "/p", timestampPointer: "/ts", dataType: "Double" },
          { topic: "line/count", nodeKey: "Count", valuePointer: "/n", timestampPointer: "/ts", dataType: "UInt32" },
        ],
        ...patch,
      }, status);
    await source({}, 403, "operator");
    await source({ brokerUrl: `mqtt://localhost:${port}` }, 400);
    await source({ mappings: [{ topic: "line/#", nodeKey: "All", valuePointer: "/p", timestampPointer: "/ts", dataType: "Double" }] }, 400);
    await source({ caCertificate: "-----BEGIN CERTIFICATE-----\nnot a certificate\n-----END CERTIFICATE-----" }, 400);
    const press = await source();
    assert.equal(press.password, undefined);
    assert.equal(press.encryptedPassword, undefined, "Secrets are never returned");
    await source({ name: "Clash" }, 400); // Pressure already has a source
    const status = async (id) =>
      (await ok("admin", "GET", `/mqtt/machines/${machine}/sources`)).find((s) => s.id === id).status;
    await expect.poll(async () => (await status(press.id))?.state, { timeout: 15000 }).toBe("connected");
    const sealed = (await pool.query("SELECT encrypted_password FROM mqtt_sources WHERE id=$1", [press.id])).rows[0].encrypted_password;
    assert.ok(sealed && !sealed.includes(passwords["pd-reader"]), "The broker password is sealed at rest");

    const publish = (topic, body) =>
      new Promise((resolve, reject) =>
        line.publish(topic, typeof body === "string" ? body : JSON.stringify(body), { qos: 1 }, (e) => (e ? reject(e) : resolve())),
      );
    const t = (minute) => new Date(Date.UTC(2026, 5, 1, 6, minute)).toISOString();
    await publish("line/press", { ts: t(10), p: 1.5 });
    await publish("line/press", { ts: t(10), p: 1.5 }); // redelivered duplicate
    await publish("line/press", { ts: t(5), p: 1.2 }); // arrives late, out of order
    await publish("line/press", "not json");
    await publish("line/press", { ts: t(15) }); // no value: stored bad, gap stays unknown
    await publish("line/count", { ts: t(10), n: 10 });
    await publish("line/secret", { ts: t(10), p: 99 }); // never subscribed
    const rows = async () =>
      (
        await pool.query(
          "SELECT node_key,timestamp,value,status_code FROM opcua_data WHERE machine_id=$1 ORDER BY node_key,timestamp",
          [machine],
        )
      ).rows.map((r) => [r.node_key, r.timestamp.toISOString(), r.value, r.status_code]);
    const expected = [
      ["Count", t(10), 10, "Good"],
      ["Pressure", t(5), 1.2, "Good"],
      ["Pressure", t(10), 1.5, "Good"],
      ["Pressure", t(15), null, "BadDecodingError"],
    ];
    await expect.poll(rows, { timeout: 15000 }).toEqual(expected);
    const counted = await status(press.id);
    assert.equal(counted.rejected, 1);
    assert.equal(counted.lastRejection, "Payload is not JSON");

    // A redelivery after the database committed the reading is still stored once.
    await expect.poll(() => worker.getHealth().pendingMeasurements, { timeout: 15000 }).toBe(0);
    await publish("line/press", { ts: t(10), p: 1.5 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.deepEqual(await rows(), expected);

    // Broker ACL refuses publishing for the reader identity; the collector itself never tried.
    const intruder = mqtt.connect(url, { username: "pd-reader", password: passwords["pd-reader"], ca: [tlsIdentity.cert], clientId: "reader-negative", protocolVersion: 4, reconnectPeriod: 0 });
    await once(intruder, "connect");
    intruder.publish("line/press", JSON.stringify({ ts: t(30), p: 7 }), { qos: 1 });
    await expect.poll(() => publishAttempts.length).toBe(1);
    assert.deepEqual(publishAttempts, ["reader-negative"]);
    await intruder.endAsync(true);

    // Broker restart: the subscriber reconnects and resumes.
    await stopBroker();
    await expect.poll(async () => (await status(press.id))?.state, { timeout: 15000 }).not.toBe("connected");
    await startBroker();
    await line.endAsync(true);
    const relined = mqtt.connect(url, { username: "line", password: passwords.line, ca: [tlsIdentity.cert], clientId: "line-plc", protocolVersion: 4 });
    await once(relined, "connect");
    await expect.poll(async () => (await status(press.id))?.state, { timeout: 20000 }).toBe("connected");
    await new Promise((resolve) => setTimeout(resolve, 500));
    relined.publish("line/press", JSON.stringify({ ts: t(20), p: 2 }), { qos: 1 });
    await expect.poll(async () => (await rows()).length, { timeout: 15000 }).toBe(expected.length + 1);
    await relined.endAsync(true);

    // A broker certificate from another CA and a wrong password are refused and shown.
    const mapping = (nodeKey) => [{ topic: "line/press", nodeKey, valuePointer: "/p", timestampPointer: "/ts", dataType: "Double" }];
    const stranger = await source({ name: "Wrong CA", caCertificate: strangerCa, mappings: mapping("PressureB") });
    await expect.poll(async () => (await status(stranger.id))?.lastError ?? "", { timeout: 15000 }).toMatch(/certificate|self.signed/i);
    const denied = await source({ name: "Wrong password", password: "not-the-password", mappings: mapping("PressureC") });
    await expect.poll(async () => (await status(denied.id))?.lastError ?? "", { timeout: 15000 }).toMatch(/not authorized|bad user|password/i);
    assert.equal((await pool.query("SELECT count(*)::int n FROM opcua_data WHERE node_key IN ('PressureB','PressureC')")).rows[0].n, 0);

    // The administrator sees the sources' state and disables one in the browser.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/production`);
    await page.getByRole("tab", { name: "Commission machine" }).click();
    await page.getByLabel("MQTT machine").click();
    await page.getByRole("option", { name: "MQTT line" }).click();
    // Seven readings arrived (two were repeats of stored ones); five rows exist.
    await expect(page.getByText(/^connected · readings received: 7 \(repeats are stored once\) · refused messages: 1 · last refusal: Payload is not JSON$/)).toBeVisible();
    await page.getByRole("button", { name: "Disable source Wrong CA" }).click();
    await expect(page.getByRole("button", { name: "Enable source Wrong CA" })).toBeVisible();
    await page.screenshot({ path: ".local/daily-evidence/mqtt-sources.png", fullPage: true });
    await page.close();
    assert.equal((await pool.query("SELECT is_active FROM mqtt_sources WHERE id=$1", [stranger.id])).rows[0].is_active, false);
    console.log(JSON.stringify({ mqttIngestion: "passed", stored: expected.length + 1 }));
  } finally {
    await line.endAsync(true).catch(() => {});
    await mqttIngestion.stopAll();
    await stopBroker().catch(() => {});
    // The bridge started the webhook outbox loop; stop it so the process can exit.
    await (await import("../server/dist/src/services/webhookService.js")).webhookService.stop();
  }
});
