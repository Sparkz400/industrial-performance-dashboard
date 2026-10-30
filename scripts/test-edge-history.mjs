import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttps } from "node:https";
import { createServer as createHttp, request as forward } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as opcua from "node-opcua";
import { request as playwrightRequest } from "@playwright/test";
import { dailyFixture } from "./daily-fixture.mjs";

// H08/E03/E04: two edge installations (own processes and owned databases) send committed
// history to the central installation (this fixture) through an HTTPS front with a pinned CA.
await dailyFixture(async ({ pool, call, actors, users, frontend, api, expect }) => {
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
  const centralTls = await certificate("central");
  const strangerCa = (await certificate("central-stranger")).cert;
  // `down` makes the central installation unreachable for edges without stopping it.
  let down = false;
  const upstreamPort = Number(new URL(api).port);
  const front = createHttps({ cert: centralTls.cert, key: centralTls.key }, (req, res) => {
    if (down) return req.socket.destroy();
    // Forward only the edge-sync API, and only to this fixture's own API.
    if (!req.url.startsWith("/api/v1/edge-sync/")) return res.writeHead(404).end();
    const host = `127.0.0.1:${upstreamPort}`;
    const options = { hostname: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: { ...req.headers, host } };
    const upstream = forward(options, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  }).listen(0, "127.0.0.1");
  await once(front, "listening");
  const centralUrl = `https://localhost:${front.address().port}`;

  const base = { host: process.env.DB_HOST, port: 55432, user: process.env.DB_USER, password: process.env.DB_PASSWORD };
  const admin = new pg.Client({ ...base, database: "postgres" });
  await admin.connect();
  const edgePassword = "edge-admin-" + randomUUID();
  const hash = await bcrypt.hash(edgePassword, 4);
  const profile = { signals: { state: { nodeKey: "State" } }, idealCycleSeconds: 12 };
  const edges = {};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const freePort = async () => {
    const probe = createHttp().listen(0, "127.0.0.1");
    await once(probe, "listening");
    const { port } = probe.address();
    await new Promise((resolve) => probe.close(resolve));
    return port;
  };
  const waitFor = async (check, message, ms = 45_000) => {
    const until = Date.now() + ms;
    for (;;) {
      const value = await check();
      if (value) return value;
      if (Date.now() > until)
        throw new Error(`${message}\n${Object.values(edges).map((e) => `[${e.name}] ${e.output}`).join("\n")}`);
      await sleep(250);
    }
  };
  async function createEdge(name) {
    const database = "pd_daily_" + randomUUID().replaceAll("-", "");
    console.log(JSON.stringify({ ownedEdgeDatabase: database }));
    await admin.query(`CREATE DATABASE "${database}"`);
    const db = new pg.Pool({ ...base, database });
    await migrate(drizzle(db), { migrationsFolder: "server/drizzle" });
    await db.query("INSERT INTO users(username,email,password_hash,role) VALUES('edgeadmin','edgeadmin@example.com',$1,'admin')", [hash]);
    // Both edges number their machine 1, on the same private address: they must not collide.
    const [{ id: machine }] = (
      await db.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('Press','opc.tcp://10.0.0.5:4840','10.0.0.5',false) RETURNING id")
    ).rows;
    await db.query("INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,1)", [machine, profile]);
    edges[name] = { name, database, db, machine, dir: join(directory, name), port: await freePort(), readings: 0, output: "" };
    return edges[name];
  }
  async function start(edge) {
    edge.process = spawn(process.execPath, ["dist/app.js"], {
      cwd: "server",
      env: {
        ...process.env,
        NODE_ENV: "development", // "test" keeps app.js from starting a server
        DB_NAME: edge.database,
        PORT: String(edge.port),
        HOST: "127.0.0.1",
        CLIENT_URL: "http://127.0.0.1:9",
        OPCUA_PKI_DIR: join(edge.dir, "pki"),
        OPCUA_SPOOL_PATH: join(edge.dir, "spool.sqlite"),
        MACHINE_SECRETS_KEY_FILE: join(edge.dir, "key"),
        REPORTS_DIR: join(edge.dir, "reports"),
        EDGE_SYNC_INTERVAL_MS: "1000",
        EDGE_SETTLE_MS: "1000",
        SOURCE_REVISION: "edge-test-1",
        LOG_LEVEL: "warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [edge.process.stdout, edge.process.stderr])
      stream.on("data", (chunk) => (edge.output = (edge.output + chunk).slice(-3000)));
    await waitFor(
      () => fetch(`http://127.0.0.1:${edge.port}/healthz`).then((r) => r.ok, () => false),
      `${edge.name} did not start`,
      90_000,
    );
    const context = await playwrightRequest.newContext({ baseURL: `http://127.0.0.1:${edge.port}` });
    edge.send = async (method, path, data) => {
      const { csrfToken } = await (await context.get("/api/v1/csrf-token")).json();
      return context.fetch("/api/v1" + path, { method, data, headers: { "x-csrf-token": csrfToken } });
    };
    edge.context = context;
    assert.equal((await edge.send("POST", "/auth/login", { username: "edgeadmin", password: edgePassword })).status(), 200);
  }
  async function stop(edge) {
    await edge.context?.dispose();
    if (edge.process.exitCode === null && edge.process.signalCode === null) {
      edge.process.kill("SIGKILL");
      await once(edge.process, "exit");
    }
  }
  // Rows as the collector stores them; every fifth is a bad-quality sample without a value.
  async function record(edge, count) {
    await edge.db.query(
      `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,source_clock_state,event_id)
       SELECT $1,'Pressure',$2::timestamptz + i*interval '1 second',
         CASE WHEN i%5=0 THEN NULL ELSE i END, CASE WHEN i%5=0 THEN NULL ELSE to_jsonb(i) END,
         CASE WHEN i%5=0 THEN 'BadNoCommunication' ELSE 'Good' END,'source',$3||i
       FROM generate_series($4::int,$5::int) i`,
      [edge.machine, "2026-10-01T06:00:00Z", `${edge.name}-`, edge.readings + 1, edge.readings + count],
    );
    edge.readings += count;
  }
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, `${method} ${path}: ${await r.text()}`);
    return r.status() === 204 ? null : r.json().catch(() => null);
  };
  const stored = async (edge) =>
    Number((await pool.query("SELECT count(*) n FROM opcua_data WHERE event_id LIKE $1", [`edge${edge.centralId}:%`])).rows[0].n);
  const central = async (edge) => (await pool.query("SELECT * FROM edge_nodes WHERE id=$1", [edge.centralId])).rows[0];
  const link = async (edge) => (await edge.db.query("SELECT * FROM edge_link")).rows[0];
  const allShipped = (edge) => waitFor(async () => (await stored(edge)) === edge.readings, `${edge.name} did not converge`);

  try {
    const site = async (name) => (await pool.query("INSERT INTO plants(name,timezone) VALUES($1,'UTC') RETURNING id", [name])).rows[0].id;
    const [siteA, siteB] = [await site("Site North"), await site("Site South")];
    const north = await createEdge("north"),
      south = await createEdge("south");
    await record(north, 120);
    await record(south, 40);
    await Promise.all([start(north), start(south)]);

    // Enrollment: one-time codes from the central administrator; wrong CA and reuse are refused.
    await ok("viewer", "POST", "/edges", { name: "north", plantId: siteA }, 403);
    const created = {};
    for (const [edge, plantId] of [[north, siteA], [south, siteB]]) {
      created[edge.name] = await ok("admin", "POST", "/edges", { name: edge.name, plantId }, 201);
      edge.centralId = created[edge.name].id;
      assert.match(created[edge.name].enrollment.code, /^pdee_/);
    }
    const listing = await ok("admin", "GET", "/edges");
    assert.equal(JSON.stringify(listing).includes(created.north.enrollment.code), false, "Codes are stored hashed");
    const enrollNorth = { centralUrl, caCertificate: centralTls.cert, enrollmentCode: created.north.enrollment.code };
    const wrongCa = await north.send("POST", "/edge/link", { ...enrollNorth, caCertificate: strangerCa });
    assert.equal(wrongCa.status(), 502);
    assert.match(await wrongCa.text(), /unreachable/);
    assert.equal(await link(north), undefined, "No link after a failed enrollment");
    assert.equal((await north.send("POST", "/edge/link", enrollNorth)).status(), 201);
    const reused = await south.send("POST", "/edge/link", { ...enrollNorth, enrollmentCode: created.north.enrollment.code });
    assert.equal(reused.status(), 502);
    assert.match(await reused.text(), /401/);
    assert.equal(
      (await south.send("POST", "/edge/link", { centralUrl, caCertificate: centralTls.cert, enrollmentCode: created.south.enrollment.code })).status(),
      201,
    );
    assert.equal((await north.send("GET", "/edge/link")).status(), 200);
    const sealed = (await link(north)).sealed_token;
    assert.doesNotMatch(sealed, /pded_/, "The edge token is sealed at rest");

    // History arrives: identical machine numbers become two site-qualified central machines.
    await allShipped(north);
    await allShipped(south);
    const machines = (
      await pool.query(
        "SELECT e.edge_id, m.id, m.name, s.plant_id, e.definition_digest FROM edge_machines e JOIN machines m ON m.id=e.machine_id JOIN machine_sites s ON s.machine_id=m.id ORDER BY e.edge_id",
      )
    ).rows;
    assert.equal(machines.length, 2);
    assert.notEqual(machines[0].id, machines[1].id);
    assert.deepEqual(machines.map((m) => [m.name, m.plant_id]), [["north · Press", siteA], ["south · Press", siteB]]);
    assert.equal(machines[0].definition_digest, machines[1].definition_digest, "Same definition on both sites");
    const bad = (await pool.query("SELECT count(*)::int n FROM opcua_data WHERE machine_id=$1 AND status_code='BadNoCommunication' AND value IS NULL", [machines[0].id])).rows[0].n;
    assert.equal(bad, 24, "Bad-quality samples arrive as bad quality without values");
    assert.equal((await central(north)).software_version, "edge-test-1");

    // A lower id can commit after a higher id, beyond the old settling interval.
    const delayed = await north.db.connect();
    try {
      await delayed.query("BEGIN");
      await delayed.query("INSERT INTO opcua_data(machine_id,node_key,timestamp,value,event_id) VALUES($1,'Pressure',now(),42,'delayed-commit')", [north.machine]);
      await record(north, 1);
      await waitFor(async () => /LOCK TABLE/.test((await link(north)).last_error ?? ""), "An open writer did not hold the sync horizon");
      await delayed.query("COMMIT");
      north.readings++;
      await allShipped(north);
      assert.equal((await pool.query("SELECT count(*)::int n FROM opcua_data WHERE event_id=$1", [`edge${north.centralId}:delayed-commit`])).rows[0].n, 1);
    } finally {
      await delayed.query("ROLLBACK");
      delayed.release();
    }

    // A lost acknowledgment: the edge resends what the central installation already stored.
    await north.db.query("UPDATE edge_link SET cursor=0");
    await waitFor(async () => (await link(north)).cursor > 0 && (await central(north)).acknowledged_cursor > 0, "north did not resend");
    await sleep(1500);
    assert.equal(await stored(north), north.readings, "A resent batch stores nothing twice");

    // Invalid and partial batches are refused whole; a replay is acknowledged without storing.
    const probeEdge = await ok("admin", "POST", "/edges", { name: "probe", plantId: siteA }, 201);
    const enrolled = await (await fetch(`${api}/api/v1/edge-sync/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: probeEdge.enrollment.code }) })).json();
    const batch = (token, body) =>
      fetch(`${api}/api/v1/edge-sync/batches`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const row = (id, extra = {}) => ({ id, machineId: 7, nodeKey: "Pressure", timestamp: "2026-10-01T07:00:00Z", value: id, rawValue: id, statusCode: "Good", sourceClockState: "source", eventId: `probe-${id}`, ...extra });
    const valid = { schemaVersion: 1, softwareVersion: "probe", backlog: 0, cursor: 3, appliedConfigRevision: 0, machines: [{ id: 7, name: "Probe press" }], rows: [row(1), row(2), row(3)] };
    const before = Number((await pool.query("SELECT count(*) n FROM opcua_data")).rows[0].n);
    for (const [status, body] of [
      [409, { ...valid, schemaVersion: 2 }],
      [400, { ...valid, rows: [row(1), row(2), row(3, { value: "abc" })] }],
      [400, { ...valid, rows: [row(1), row(4)] }],
      [400, { ...valid, rows: [row(1, { machineId: 8 })] }],
    ])
      assert.equal((await batch(enrolled.token, body)).status, status);
    assert.equal((await batch("pded_" + "A".repeat(43), valid)).status, 401);
    assert.equal(Number((await pool.query("SELECT count(*) n FROM opcua_data")).rows[0].n), before, "Refused batches store nothing");
    assert.deepEqual(await (await batch(enrolled.token, valid)).json().then((r) => [r.acknowledged, r.stored, r.duplicates]), [3, 3, 0]);
    assert.deepEqual(await (await batch(enrolled.token, valid)).json().then((r) => [r.acknowledged, r.stored, r.duplicates]), [3, 0, 3]);
    // Rotation: enrolling with a new code invalidates the earlier token.
    const rotated = await ok("admin", "POST", `/edges/${probeEdge.id}/enrollment`, undefined, 201);
    const second = await (await fetch(`${api}/api/v1/edge-sync/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: rotated.enrollment.code }) })).json();
    assert.equal((await batch(enrolled.token, valid)).status, 401, "The rotated-out token is refused");
    assert.equal((await batch(second.token, valid)).status, 200);

    // A configuration revision is applied; incompatible ones and machine commands are rejected.
    await ok("admin", "POST", `/edges/${north.centralId}/config`, { settings: { batchSize: 50 } }, 201);
    await waitFor(async () => (await central(north)).applied_config_revision === 1, "revision 1 not applied");
    assert.deepEqual((await link(north)).settings, { batchSize: 50 });
    await ok("admin", "POST", `/edges/${north.centralId}/config`, { schemaVersion: 2, settings: { batchSize: 60 } }, 201);
    await waitFor(async () => /Revision 2: .*schema 2 is not supported/.test((await central(north)).config_rejection ?? ""), "revision 2 not rejected");
    await ok("admin", "POST", `/edges/${north.centralId}/config`, { settings: { machineCommand: "start" } }, 201);
    await waitFor(async () => /Revision 3: .*machineCommand/.test((await central(north)).config_rejection ?? ""), "revision 3 not rejected");
    assert.equal((await central(north)).applied_config_revision, 1);
    assert.deepEqual((await link(north)).settings, { batchSize: 50 });
    // Smaller batches still converge in several acknowledged steps.
    await record(north, 130);
    await allShipped(north);

    // Staged upgrade: recorded and attributable; the edge only reports what it runs.
    await ok("admin", "PUT", `/edges/${north.centralId}/target-version`, { targetVersion: "edge-test-2" });
    const staged = (await ok("admin", "GET", "/edges")).find((e) => e.id === north.centralId);
    assert.deepEqual([staged.softwareVersion, staged.targetVersion], ["edge-test-1", "edge-test-2"]);

    // Central outage: edges keep collecting and serving locally, then catch up without gaps.
    down = true;
    await record(north, 25);
    await record(south, 15);
    const assets = await north.send("GET", "/production/assets");
    assert.equal(assets.status(), 200, "The edge serves its own data during the outage");
    await waitFor(async () => /unreachable/.test((await link(north)).last_error ?? ""), "north did not report the outage");
    assert.equal(await stored(north), north.readings - 25);
    // The overview shows a silent site as offline with the time its data ends, never as current.
    await pool.query("UPDATE edge_nodes SET last_contact_at=now()-interval '10 minutes' WHERE id=$1", [north.centralId]);
    await pool.query("INSERT INTO plant_memberships(user_id,plant_id,role) VALUES($1,$2,'viewer')", [users.viewer.id, siteA]);
    const overview = await ok("viewer", "GET", "/edges/overview");
    assert.deepEqual(overview.map((s) => s.name).sort(), ["north", "probe"], "Another site's edge is not visible");
    const northView = overview.find((s) => s.name === "north");
    assert.equal(northView.availability, "offline");
    assert.ok(northView.newestReadingAt);
    assert.equal(northView.machines.length, 1);
    const page = await actors.viewer.newPage();
    await page.goto(`${frontend}/operations`);
    await selectOperation(page, "Sites");
    const section = page.getByRole("region", { name: "Site North · north" });
    await expect(section.getByText("offline", { exact: true })).toBeVisible();
    await expect(section.getByText(/values after the time above are unknown here, not zero/)).toBeVisible();
    await page.screenshot({ path: ".local/daily-evidence/sites-offline.png", fullPage: true });
    down = false;
    await allShipped(north);
    await allShipped(south);
    assert.equal((await ok("viewer", "GET", "/edges/overview")).find((s) => s.name === "north").availability, "online");

    // A crash and restart resume from the acknowledged cursor without duplicates.
    await stop(north);
    await record(north, 30);
    await start(north);
    await allShipped(north);

    // Re-enrolling (credential rotation) resends everything; nothing is stored twice.
    const fresh = await ok("admin", "POST", `/edges/${north.centralId}/enrollment`, undefined, 201);
    assert.equal((await north.send("DELETE", "/edge/link")).status(), 204);
    assert.equal((await north.send("POST", "/edge/link", { ...enrollNorth, enrollmentCode: fresh.enrollment.code })).status(), 201);
    await waitFor(async () => (await link(north)).cursor >= north.readings, "north did not resend after re-enrollment");
    assert.equal(await stored(north), north.readings);

    // Revocation: the edge keeps its data and is told; the central installation stores nothing more.
    await ok("admin", "POST", `/edges/${south.centralId}/revoke`);
    await record(south, 10);
    await waitFor(async () => /401/.test((await link(south)).last_error ?? ""), "south was not refused");
    assert.equal(await stored(south), south.readings - 10);
    assert.equal(Number((await south.db.query("SELECT count(*) n FROM opcua_data")).rows[0].n), south.readings, "Local history is kept");
    // Readings the central installation has not confirmed are protected from edge retention.
    const protectedRows = await south.db.query(
      "SELECT count(*)::int n FROM opcua_data d WHERE NOT EXISTS (SELECT 1 FROM edge_link l WHERE d.id > l.cursor)",
    );
    assert.equal(protectedRows.rows[0].n, south.readings - 10);

    const actions = (await pool.query("SELECT action FROM audit_logs WHERE action LIKE 'edge.%'")).rows.map((r) => r.action);
    for (const action of ["edge.created", "edge.enrolled", "edge.enrollment_issued", "edge.config_revision", "edge.target_version", "edge.revoked"])
      assert.ok(actions.includes(action), action);
    const edgeActions = (await north.db.query("SELECT action FROM audit_logs WHERE action LIKE 'edge.link.%'")).rows.map((r) => r.action);
    assert.deepEqual([...new Set(edgeActions)].sort(), ["edge.link.enrolled", "edge.link.removed"]);

    // The central administrator manages edges in the browser.
    const adminPage = await actors.admin.newPage();
    await adminPage.goto(`${frontend}/settings`);
    await adminPage.getByRole("tab", { name: "Edges" }).click();
    await expect(adminPage.getByText("north · enrolled")).toBeVisible();
    await expect(adminPage.getByText(/upgrade staged to edge-test-2/)).toBeVisible();
    await adminPage.getByLabel("Edge name").fill("west");
    await adminPage.getByLabel("Edge site").click();
    await adminPage.getByRole("option", { name: "Site South" }).click();
    await adminPage.getByRole("button", { name: "Create edge" }).click();
    await expect(adminPage.locator("code").filter({ hasText: /^pdee_/ })).toBeVisible();
    await adminPage.screenshot({ path: ".local/daily-evidence/edges.png", fullPage: true });

    console.log(JSON.stringify({ edgeHistory: "passed", north: north.readings, south: south.readings }));
  } finally {
    front.closeAllConnections();
    front.close();
    for (const edge of Object.values(edges)) {
      if (edge.process) await stop(edge).catch(() => {});
      await edge.db.end();
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", [edge.database]);
      await admin.query(`DROP DATABASE IF EXISTS "${edge.database}"`);
    }
    await admin.end();
  }
});
