import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename, dirname } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config({ path: "server/.env", quiet: true });
assert.ok(["localhost", "127.0.0.1"].includes(process.env.DB_HOST));
assert.equal(
  process.env.DB_PORT,
  "55432",
  "Requires the owned test PostgreSQL port",
);
const database = `pd_shift_${randomUUID().replaceAll("-", "")}`;
const directory = await mkdtemp(join(tmpdir(), "dashboard-shift-"));
const admin = new pg.Client({
  host: process.env.DB_HOST,
  port: 55432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "postgres",
});
let pool,
  manager,
  worker,
  socketServer,
  appServer,
  receiver,
  uaServer,
  browser,
  vite,
  sessionStore,
  multiMachine,
  webhookService,
  reportScheduler,
  liveClient;
let smtp;
let created = false;
const waitFor = async (check, message, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
};
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const { createSmtpFixture } = await import("./test-report-jobs.mjs");
  smtp = await createSmtpFixture();
  Object.assign(process.env, {
    DB_NAME: database,
    DB_READ_REPLICA_URLS: "",
    DB_HEALTH_CHECK_INTERVAL: "0",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    ALLOW_PRIVATE_OUTBOUND_URLS: "true",
    OPCUA_SPOOL_PATH: join(directory, "spool.sqlite"),
    OPCUA_PKI_DIR: join(directory, "client-pki"),
    MACHINE_SECRETS_KEY_FILE: join(directory, "machine-secrets.key"),
    AUTO_ACCEPT_CERTIFICATES: "false",
    OPCUA_QUEUE_DELAY: "100",
    REPORTS_DIR: join(directory, "reports"),
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "owned-fixture@example.com",
  });
  pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: 55432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
  await migrate(drizzle(pool), { migrationsFolder: "server/drizzle" });
  const journal = JSON.parse(await readFile("server/drizzle/meta/_journal.json", "utf8"));
  const snapshot = JSON.parse(await readFile(`server/drizzle/meta/${String(journal.entries.at(-1).idx).padStart(4, "0")}_snapshot.json`, "utf8"));
  const tables = new Set(
    (
      await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
      )
    ).rows.map((row) => row.table_name),
  );
  for (const table of Object.values(snapshot.tables))
    assert.ok(tables.has(table.name), "Missing migrated table: " + table.name);
  const password = randomUUID();
  const hash = await bcrypt.hash(password, 4);
  const users = (
    await pool.query(
      "INSERT INTO users(username,email,password_hash,role) VALUES ('shiftadmin','admin@example.invalid',$1,'admin'),('shiftviewer','viewer@example.invalid',$1,'viewer') RETURNING id,username",
      [hash],
    )
  ).rows;
  const adminId = users[0].id,
    viewerId = users[1].id;
  appServer = createServer();
  appServer.listen(0, "127.0.0.1");
  await once(appServer, "listening");
  const apiUrl = `http://127.0.0.1:${appServer.address().port}`;
  process.env.VITE_API_BASE_URL = `${apiUrl}/api/v1`;
  process.env.VITE_WEBSOCKET_ADDR = apiUrl;
  const { createServer: createVite } = await import("vite");
  vite = await createVite({
    configFile: resolve("client/vite.config.ts"),
    root: resolve("client"),
    cacheDir: join(directory, "vite-cache"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    logLevel: "error",
  });
  await vite.listen();
  const frontend = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.CLIENT_URL = frontend;
  const { createApp } = await import("../server/dist/app.js");
  const application = createApp();
  sessionStore = application.sessionStore;
  appServer.on("request", application.app);
  const { createSocketServer } =
    await import("../server/dist/src/socket/socketServer.js");
  socketServer = createSocketServer(
    appServer,
    sessionStore,
    application.sessionMiddleware,
  );
  const { setupOpcuaBridge } =
    await import("../server/dist/src/opcuaBridge.js");
  setupOpcuaBridge(socketServer);
  worker = (await import("../server/dist/src/queue/opcuaQueueWorker.js"))
    .default;
  manager = (await import("../server/dist/src/database/dbConnection.js"))
    .default;
  multiMachine = (
    await import("../server/dist/src/opc-ua/services/multiMachineManager.js")
  ).default;
  ({ webhookService } =
    await import("../server/dist/src/services/webhookService.js"));
  reportScheduler = (
    await import("../server/dist/src/services/reportSchedulerService.js")
  ).reportSchedulerService;
  const { chromium } = await import("@playwright/test");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${frontend}/login`);
  await page.getByLabel("Username").fill("shiftadmin");
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"));
  const csrf = async (request) =>
    (await (await request.get(`${apiUrl}/api/v1/csrf-token`)).json()).csrfToken;
  const call = async (method, path, data, request = context.request) =>
    request.fetch(`${apiUrl}${path}`, {
      method,
      data,
      headers: { "x-csrf-token": await csrf(request) },
    });
  const viewer = await browser.newContext();
  const { testSecureMachine } = await import("./test-secure-machine.mjs");
  await testSecureMachine({
    call,
    page,
    frontend,
    pool,
    directory,
    multiMachine,
    waitFor,
  });
  await call(
    "POST",
    "/api/v1/auth/login",
    { username: "shiftviewer", password },
    viewer.request,
  );
  for (const path of [
    "/api/v1/dashboards",
    "/api/v1/production/shifts",
    "/api/trpc/dashboard.save",
  ]) {
    assert.equal(
      (await context.request.post(`${apiUrl}${path}`, { data: {} })).status(),
      403,
      "Missing CSRF: " + path,
    );
    assert.equal(
      (
        await context.request.post(`${apiUrl}${path}`, {
          data: {},
          headers: { "x-csrf-token": "invalid-token" },
        })
      ).status(),
      403,
      "Wrong CSRF: " + path,
    );
    assert.equal(
      (
        await context.request.post(`${apiUrl}${path}`, {
          data: {},
          headers: { "x-csrf-token": await csrf(viewer.request) },
        })
      ).status(),
      403,
      "Another session token: " + path,
    );
  }
  for (const [method, path, data] of [
    ["POST", "/api/v1/dashboards", {}],
    ["POST", "/api/v1/alarms/rules", {}],
    ["POST", "/api/v1/reports/schedules/1/run-now", {}],
    ["POST", "/api/v1/share/dashboards/x", {}],
    ["GET", "/api/v1/db/status"],
    ["GET", "/api/v1/DB/status"],
    ["GET", "/api/v1/alerts/channels"],
    ["GET", "/api/v1/production/diagnostics"],
    ["GET", "/metrics"],
  ]) {
    const response = await call(method, path, data, viewer.request);
    assert.equal(response.status(), 403, `${method} ${path}`);
  }
  assert.equal(
    (
      await context.request.get(
        `${apiUrl}/api/v1/share/public/${"a".repeat(64)}`,
      )
    ).status(),
    410,
  );
  assert.equal(
    (
      await context.request.get(
        `${apiUrl}/api/v1/share/embed/${"a".repeat(64)}`,
      )
    ).status(),
    410,
  );
  const { appRouter } = await import("../server/dist/src/trpc/index.js");
  const version = (
    await pool.query("SELECT updated_at FROM users WHERE id=$1", [viewerId])
  ).rows[0].updated_at.toISOString();
  const viewerCaller = appRouter.createCaller({
    session: { userId: viewerId, userRole: "admin", userVersion: version },
  });
  await assert.rejects(
    viewerCaller.dashboard.save({
      id: "unauthorized",
      name: "bad",
      widgets: [],
      layout: [],
    }),
    /Admin access/,
  );
  await assert.rejects(
    appRouter.createCaller({ session: {} }).nodeData.history({ nodeKey: "x" }),
    /Authentication/,
  );
  console.log(
    "PASS: REST, reports, tRPC, metrics and public-share negative access checks",
  );

  // Owned OPC UA endpoint, never a configured external endpoint.
  const opcua = await import("node-opcua");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const uaPort = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  uaServer = new opcua.OPCUAServer({
    port: uaPort,
    resourcePath: "/UA/ShiftTest",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    serverCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "server-pki"),
    }),
    userCertificateManager: new opcua.OPCUACertificateManager({ rootFolder: join(directory, "user-pki") }),
  });
  await uaServer.initialize();
  const namespace = uaServer.engine.addressSpace.getOwnNamespace();
  const values = {
    ProductionState: 1,
    ProductionCount: 0,
    GoodCount: 0,
    RejectCount: 0,
    AlarmSignal: 0,
  };
  for (const key of Object.keys(values))
    namespace.addVariable({
      organizedBy: uaServer.engine.addressSpace.rootFolder.objects,
      browseName: key,
      nodeId: `ns=1;s=${key}`,
      dataType: "Int32",
      minimumSamplingInterval: 100,
      value: {
        get: () =>
          new opcua.Variant({
            dataType: opcua.DataType.Int32,
            value: values[key],
          }),
      },
    });
  await uaServer.start();
  const machineResponse = await call("POST", "/api/v1/machines", {
    name: "Owned shift browser fixture",
    ip: "127.0.0.1",
    port: uaPort,
    resourcePath: "/UA/ShiftTest",
    securityMode: "None",
    securityPolicy: "None",
    isActive: false,
  });
  assert.equal(machineResponse.status(), 201, await machineResponse.text());
  const machine = await machineResponse.json();
  await page.goto(`${frontend}/production`);
  const supportDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download support diagnostics" })
    .click();
  const support = JSON.parse(
    await readFile(await (await supportDownload).path(), "utf8"),
  );
  assert.equal(support.format, "support-diagnostics-v1");
  assert.ok(JSON.stringify(support).length < 1000000);
  assert.ok(!JSON.stringify(support).includes(machine.name));
  assert.ok(!JSON.stringify(support).includes(password));
  await page.getByRole("tab", { name: "Commission machine" }).click();
  await page.getByLabel("Machine to commission").click();
  await page.getByRole("option", { name: machine.name }).click();
  await page
    .getByRole("button", { name: "Check connection", exact: true })
    .click();
  await expectVisible(page.getByText(/Connected using anonymous/));
  await page
    .getByRole("button", { name: "Use owned simulator example" })
    .click();
  await page.getByRole("button", { name: "Preview mapped signals" }).click();
  await expectVisible(page.getByText(/state: ns=1;s=ProductionState/));
  const diagnosticDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download redacted diagnostics" })
    .click();
  const diagnostic = JSON.parse(
    await readFile(await (await diagnosticDownload).path(), "utf8"),
  );
  assert.equal(diagnostic.format, "commissioning-diagnostics-v1");
  assert.equal(diagnostic.signals.length, 4);
  assert.ok(!JSON.stringify(diagnostic).includes("ProductionState"));
  assert.ok(
    diagnostic.signals.every(
      (signal) =>
        !Object.hasOwn(signal, "value") && !Object.hasOwn(signal, "nodeId"),
    ),
  );
  await page.getByLabel(/I reviewed the mappings/).check();
  await page
    .getByRole("button", { name: "Save profile and create dashboard" })
    .click();
  await expectVisible(page.getByText(/Profile saved. Connection:/));
  await mkdir(".local/production-evidence", { recursive: true });
  await page.screenshot({
    path: ".local/production-evidence/commissioning.png",
    fullPage: true,
  });
  const profile = (
    await (await call("GET", "/api/v1/production/profiles")).json()
  )[0].profile;
  assert.equal(profile.signals.state.namespaceUri, namespace.namespaceUri);
  console.log(
    "PASS: actual browser commissioning, namespace resolution, read preview and dashboard creation",
  );

  // Real UI rule -> owned OPC UA subscription -> durable history -> signed receiver.
  await call("POST", `/api/v1/machines/${machine.id}/mappings`, {
    mappings: [
      {
        nodeId: "ns=1;s=AlarmSignal",
        nodeKey: "AlarmSignal",
        displayName: "AlarmSignal",
        dataType: "Int32",
        samplingInterval: 100,
        isActive: true,
      },
    ],
  });
  let accepts = false;
  const received = [];
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (data) => (body += data));
    req.on("end", () => {
      received.push({
        body,
        signature: req.headers["x-webhook-signature"],
        deliveryId: req.headers["x-webhook-delivery-id"],
      });
      res.writeHead(accepts ? 200 : 503).end();
    });
  });
  receiver.listen(0, "127.0.0.1");
  await once(receiver, "listening");
  const hookResponse = await call("POST", "/api/v1/webhooks", {
    name: "Owned receipt",
    url: `http://127.0.0.1:${receiver.address().port}/events`,
    events: ["alarm.triggered", "alarm.cleared"],
  });
  assert.equal(hookResponse.status(), 201);
  const hook = await hookResponse.json();
  await page.goto(`${frontend}/alerts/rules`);
  await page
    .getByRole("button", { name: /add rule|new rule|create rule/i })
    .click();
  await page.getByLabel(/^Name/).fill("Owned limit");
  await page.getByLabel(/^Node Key/).fill("AlarmSignal");
  await page.getByLabel(/^Threshold/).fill("5");
  await page.getByLabel("Cooldown (seconds)").fill("0");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expectVisible(page.getByText("Owned limit", { exact: true }));
  worker.start();
  values.AlarmSignal = 10;
  await waitFor(
    async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM alert_history WHERE rule_name='Owned limit'",
          )
        ).rows[0].count,
      ) === 1,
    "UI rule did not receive actual simulator event",
  );
  await waitFor(
    () => received.length > 0,
    "Configured receiver did not receive real alarm",
  );
  assert.equal(JSON.parse(received[0].body).type, "alarm.triggered");
  assert.equal(
    received[0].signature,
    createHmac("sha256", hook.secret).update(received[0].body).digest("hex"),
  );
  const incident = (
    await pool.query(
      "SELECT * FROM alert_history WHERE rule_name='Owned limit'",
    )
  ).rows[0];
  assert.equal(incident.machine_id, machine.id);
  const { io: connectSocket } = await import("socket.io-client");
  const foreignSocket = connectSocket(apiUrl, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 3000,
    extraHeaders: {
      origin: "https://untrusted.example.invalid",
      cookie: (await viewer.cookies(apiUrl))
        .map((c) => c.name + "=" + c.value)
        .join("; "),
    },
  });
  try {
    await new Promise((resolve, reject) => {
      foreignSocket.once("connect_error", resolve);
      foreignSocket.once("connect", () =>
        reject(new Error("Foreign origin accepted a session cookie")),
      );
    });
    assert.equal(foreignSocket.connected, false);
  } finally {
    foreignSocket.disconnect();
  }
  assert.ok(
    (
      await pool.query(
        "SELECT sess->'cookie'->>'expires' AS expires FROM session WHERE sess->>'username'='shiftviewer'",
      )
    ).rows[0].expires,
    "HTTP sessions must retain the cookie lifetime after socket initialization",
  );
  liveClient = connectSocket(apiUrl, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      cookie: (await viewer.cookies(apiUrl))
        .map((c) => c.name + "=" + c.value)
        .join("; "),
    },
  });
  await new Promise((resolve, reject) => {
    liveClient.once("connect", resolve);
    liveClient.once("connect_error", reject);
  });
  liveClient.emit("acknowledgeAlert", { id: incident.id, userId: adminId });
  await waitFor(
    async () =>
      (
        await pool.query(
          "SELECT acknowledged_by FROM alert_history WHERE id=$1",
          [incident.id],
        )
      ).rows[0].acknowledged_by === viewerId,
    "Socket acknowledgment did not use authenticated actor",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT acknowledged_by FROM alert_history WHERE id=$1",
        [incident.id],
      )
    ).rows[0].acknowledged_by,
    viewerId,
  );
  values.AlarmSignal = 0;
  await waitFor(
    async () =>
      (
        await pool.query("SELECT status FROM alert_history WHERE id=$1", [
          incident.id,
        ])
      ).rows[0].status === "resolved",
    "Good recovery did not clear persisted incident",
  );
  accepts = true;
  await pool.query("UPDATE webhook_deliveries SET next_attempt_at=now()");
  await waitFor(
    async () =>
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM webhook_deliveries WHERE delivered_at IS NULL",
          )
        ).rows[0].count,
      ) === 0,
    "Outbox did not recover",
  );
  assert.ok(received.every((r) => r.deliveryId));
  const repeated = received.filter(
    (r) => r.deliveryId === received[0].deliveryId,
  );
  assert.ok(repeated.length >= 2);
  assert.ok(repeated.every((r) => r.body === repeated[0].body));
  await multiMachine.disconnectAll();
  await worker.stop();
  console.log(
    "PASS: UI-created rule -> live simulator -> history -> signed receiver, acknowledgment, measured recovery and durable retry identity",
  );

  const { AlarmEvaluator } =
    await import("../server/dist/src/services/alarmService.js");
  const evaluator = new AlarmEvaluator();
  const other = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Isolated second machine','opc.tcp://owned-invalid:4841','owned-invalid',false) RETURNING id",
    )
  ).rows[0].id;
  const rule = (
    await pool.query(
      "INSERT INTO alert_rules(name,node_key,condition,threshold,cooldown_seconds) VALUES ('Replay fixture','ReplayValue','gt',5,0) RETURNING id",
    )
  ).rows[0].id;
  const receiptTime = new Date();
  const sample = (machineId, value, statusCode = "Good") => ({
    id: randomUUID(),
    data: {
      machineId,
      key: "ReplayValue",
      label: "Replay",
      value,
      statusCode,
      timestamp: receiptTime,
      receivedAt: receiptTime,
    },
  });
  const high = sample(machine.id, 10),
    low = sample(machine.id, 0);
  await evaluator.evaluate(high);
  await evaluator.evaluate(sample(other, 10));
  await evaluator.evaluate(sample(machine.id, 10, "BadNoCommunication"));
  let history = (
    await pool.query(
      "SELECT * FROM alert_history WHERE rule_id=$1 ORDER BY id",
      [rule],
    )
  ).rows;
  assert.equal(history.length, 2);
  assert.equal(history[0].metadata.conditionState, "unknown");
  assert.equal(history[0].status, "active");
  assert.equal(history[1].machine_id, other);
  await evaluator.evaluate(low);
  // All events intentionally share a receive timestamp: receipts, not time ordering, provide deduplication.
  const restarted = new AlarmEvaluator();
  await restarted.evaluate(high);
  await restarted.evaluate(low);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM alert_history WHERE rule_id=$1",
          [rule],
        )
      ).rows[0].count,
    ),
    2,
  );
  const failing = (
    await pool.query(
      "INSERT INTO alert_rules(name,node_key,condition,threshold,cooldown_seconds) VALUES ('Atomic failure fixture','FailureValue','gt',5,0) RETURNING id",
    )
  ).rows[0].id;
  await pool.query(
    "CREATE FUNCTION owned_alarm_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.rule_name='Atomic failure fixture' THEN RAISE EXCEPTION 'owned persistence failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER owned_alarm_failure BEFORE INSERT ON alert_history FOR EACH ROW EXECUTE FUNCTION owned_alarm_failure()",
  );
  await restarted.reloadRules();
  const failure = sample(machine.id, 10);
  failure.data.key = "FailureValue";
  failure.data.timestamp = new Date();
  failure.data.receivedAt = new Date();
  await assert.rejects(restarted.evaluate(failure));
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM alarm_evaluation_receipts WHERE rule_id=$1",
          [failing],
        )
      ).rows[0].count,
    ),
    0,
  );
  await pool.query(
    "DROP TRIGGER owned_alarm_failure ON alert_history; DROP FUNCTION owned_alarm_failure()",
  );
  await restarted.evaluate(failure);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM alert_history WHERE rule_id=$1",
          [failing],
        )
      ).rows[0].count,
    ),
    1,
  );
  console.log(
    "PASS: machine isolation, unknown quality, identical-timestamp replay, restart deduplication and atomic rollback/retry",
  );

  // Independent fixed shift ledger, distinct from the live simulator timings.
  const start = new Date("2026-01-01T00:00:00Z"),
    end = new Date("2026-01-01T00:01:00Z");
  const second = (s) => new Date(start.getTime() + s * 1000);
  for (const [role, key] of [
    ["state", "ProductionState"],
    ["total", "ProductionCount"],
    ["good", "GoodCount"],
    ["reject", "RejectCount"],
  ]) {
    const series =
      role === "state"
        ? [1, 1, 2, 2, 1]
        : role === "total"
          ? [0, 7, 15, 15, 15]
          : role === "good"
            ? [0, 6, 13, 13, 13]
            : [0, 1, 2, 2, 2];
    for (let i = 0; i < series.length; i++)
      await pool.query(
        "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES ($1,$2,$3,$4,'Good',$5)",
        [
          machine.id,
          key,
          second(i * 15),
          series[i],
          JSON.stringify({
            namespaceUri: namespace.namespaceUri,
            identifier: `s=${key}`,
          }),
        ],
      );
  }
  await page.goto(`${frontend}/production`);
  await page.getByLabel("Shift machine", { exact: true }).click();
  await page.getByRole("option", { name: machine.name }).click();
  await page
    .getByLabel("Shift name", { exact: true })
    .fill("Independent one-minute ledger");
  await page.getByLabel("Site timezone").fill("UTC");
  await page
    .getByLabel("Start (include UTC offset)", { exact: true })
    .fill(start.toISOString());
  await page
    .getByLabel("End (include UTC offset)", { exact: true })
    .fill(end.toISOString());
  await page.getByLabel("Work order", { exact: true }).fill("FIXTURE-1");
  await page.getByLabel("Product", { exact: true }).fill("Fixture part");
  await page.getByRole("button", { name: "Create shift", exact: true }).click();
  await expectVisible(
    page.getByText(
      "Incomplete — review the issues below. This report is not verified.",
    ),
  );
  await page
    .getByRole("button", { name: "Classify stop", exact: true })
    .click();
  await page.getByLabel("Reason / correction explanation").fill("Material jam");
  await page
    .getByRole("button", { name: "Save operator reason", exact: true })
    .click();
  await page.getByLabel("Independent total", { exact: true }).fill("15");
  await page.getByLabel("Independent good", { exact: true }).fill("13");
  await page.getByLabel("Independent reject", { exact: true }).fill("2");
  await page
    .getByLabel("Independent reference", { exact: true })
    .fill(
      "Hand-calculated fixture: 30 seconds running, 30 seconds jam; 15 parts, 2 rejects",
    );
  await page
    .getByRole("button", { name: "Record reconciliation", exact: true })
    .click();
  await expectVisible(
    page.getByText("Reconciled against recorded independent counts", {
      exact: true,
    }),
  );
  const shift = (await pool.query("SELECT id FROM production_shifts")).rows[0];
  const reportResponse = await call(
    "GET",
    `/api/v1/production/shifts/${shift.id}/report`,
  );
  const report = await reportResponse.json();
  assert.equal(report.verified, true);
  assert.equal(report.oee.overall, 13 / 30);
  assert.deepEqual(report.quantities, { total: 15, good: 13, reject: 2 });
  await page
    .getByText("Reconciled against recorded independent counts", {
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/production-evidence/shift-report.png",
    fullPage: true,
  });
  await page.pdf({
    path: ".local/production-evidence/shift-report.pdf",
    format: "A4",
    printBackground: true,
  });
  assert.equal(
    (
      await call(
        "POST",
        `/api/v1/production/shifts/${shift.id}/reasons`,
        {
          start: start.toISOString(),
          end: second(15).toISOString(),
          category: "unplanned",
          reason: "Not a stop",
        },
        viewer.request,
      )
    ).status(),
    400,
  );
  assert.equal(
    (
      await call(
        "POST",
        `/api/v1/production/shifts/${shift.id}/reasons`,
        {
          start: second(30).toISOString(),
          end: end.toISOString(),
          category: "unplanned",
          reason: "Overlap",
        },
        viewer.request,
      )
    ).status(),
    400,
  );
  const original = report.reasons[0];
  const corrected = await call(
    "POST",
    `/api/v1/production/shifts/${shift.id}/reasons`,
    {
      start: original.start,
      end: original.end,
      category: "unplanned",
      reason: "Confirmed material jam",
      supersedesId: original.id,
    },
    viewer.request,
  );
  assert.equal(corrected.status(), 201);
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM downtime_reasons")).rows[0].count,
    ),
    2,
  );
  const correction = await corrected.json();
  assert.equal(
    (
      await call(
        "POST",
        `/api/v1/production/shifts/${shift.id}/reasons`,
        {
          start: original.start,
          end: second(45).toISOString(),
          category: "unplanned",
          reason: "Jam removal",
          supersedesId: correction.id,
        },
        viewer.request,
      )
    ).status(),
    201,
  );
  assert.equal(
    (
      await call(
        "POST",
        `/api/v1/production/shifts/${shift.id}/reasons`,
        {
          start: second(45).toISOString(),
          end: original.end,
          category: "unplanned",
          reason: "Restart inspection",
        },
        viewer.request,
      )
    ).status(),
    201,
  );
  const split = await (
    await call("GET", `/api/v1/production/shifts/${shift.id}/report`)
  ).json();
  assert.equal(split.reasons.length, 4);
  assert.equal(split.verified, true);
  assert.deepEqual(split.losses, [
    { reason: "Jam removal", seconds: 15 },
    { reason: "Restart inspection", seconds: 15 },
  ]);
  assert.equal(
    (
      await call("POST", `/api/v1/production/shifts/${shift.id}/reconcile`, {
        total: 15,
        good: 13,
        reject: 2,
        reference: "Overwrite",
      })
    ).status(),
    400,
  );
  assert.deepEqual(pageErrors, []);

  const { testOperator } = await import("./test-operator.mjs");
  await testOperator({ call, page, frontend, pool, browser, viewer, machine, shift, adminId, viewerId });
  console.log(
    "PASS: browser shift creation, operator classification, immutable reconciliation, corrections and printed report; exact independent OEE = 43.333333%",
  );
  // Exercise saved configuration and actual downloads through the reporting UI.
  await page.goto(`${frontend}/reports/templates`);
  await page.getByRole("button", { name: /create template/i }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Name/).fill("Migration report");
  await dialog.getByLabel("Report title", { exact: true }).fill("Prüfstand Δ");
  await dialog.getByLabel("Reporting window (hours)").fill("168");
  for (const section of ["OEE Summary", "Alert Summary", "Trending Data"])
    await dialog.getByLabel(section, { exact: true }).check();
  await dialog
    .getByLabel("Trend signals")
    .pressSequentially("AlarmSignal, MissingSignal");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await dialog.waitFor({ state: "hidden" });
  let templates = await (await call("GET", "/api/v1/reports/templates")).json();
  const template = templates.find((item) => item.name === "Migration report");
  assert.ok(template);
  assert.equal(template.templateConfig.lookbackHours, 168);
  assert.deepEqual(
    template.templateConfig.sections.find((item) => item.type === "trending")
      .nodeKeys,
    ["AlarmSignal", "MissingSignal"],
  );
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Migration report" })
    .getByLabel("Edit template")
    .click();
  dialog = page.getByRole("dialog");
  assert.equal(
    await dialog.getByLabel("Trend signals").inputValue(),
    "AlarmSignal, MissingSignal",
  );
  await dialog.getByLabel("Description").fill("Browser-free acceptance");
  await dialog.getByRole("button", { name: /save/i }).click();
  await dialog.waitFor({ state: "hidden" });
  templates = await (await call("GET", "/api/v1/reports/templates")).json();
  assert.deepEqual(
    templates.find((item) => item.id === template.id).templateConfig,
    template.templateConfig,
  );
  for (const invalid of [
    { cronExpression: "bad" },
    { timezone: "Invalid/Zone" },
  ]) {
    assert.equal(
      (
        await call("POST", "/api/v1/reports/schedules", {
          templateId: template.id,
          name: "Invalid",
          cronExpression: "0 6 * * *",
          ...invalid,
        })
      ).status(),
      400,
    );
  }
  assert.equal(
    (
      await call("POST", "/api/v1/reports/templates", {
        name: "Invalid",
        type: "daily",
        templateConfig: { lookbackHours: -1 },
      })
    ).status(),
    400,
  );
  await page.goto(`${frontend}/reports/schedules`);
  await page.getByRole("button", { name: /create schedule/i }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Name/).fill("Migration schedule");
  await dialog.getByRole("combobox", { name: "Template", exact: true }).click();
  await page
    .getByRole("option", { name: "Migration report", exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Timezone", exact: true }).click();
  await page
    .getByRole("option", { name: "Europe/Berlin", exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Machines", exact: true }).click();
  await page.getByRole("option", { name: machine.name, exact: true }).click();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: /^save$/i }).click();
  await dialog.waitFor({ state: "hidden" });
  const schedule = (
    await (await call("GET", "/api/v1/reports/schedules")).json()
  ).find((item) => item.name === "Migration schedule");
  assert.deepEqual(schedule.machineIds, [machine.id]);
  assert.equal(schedule.timezone, "Europe/Berlin");
  assert.ok(schedule.nextRunAt);
  await page
    .getByRole("row")
    .filter({ hasText: "Migration schedule" })
    .getByTitle("Run Now")
    .click();
  const completedReports = async () =>
    (
      await (
        await call(
          "GET",
          `/api/v1/reports/history?scheduleId=${schedule.id}&status=completed`,
        )
      ).json()
    ).data;
  await waitFor(
    async () => (await completedReports()).length === 1,
    "Manual report did not finish",
  );
  await page.goto(`${frontend}/reports/history`);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("row")
    .filter({ hasText: "Migration schedule" })
    .getByTitle("Download")
    .click();
  const download = await downloadEvent;
  await download.saveAs(".local/production-evidence/scheduled-report.pdf");
  const downloaded = await readFile(
    ".local/production-evidence/scheduled-report.pdf",
  );
  assert.equal(downloaded.subarray(0, 4).toString(), "%PDF");
  assert.ok(downloaded.length > 5000);
  await page.screenshot({
    path: ".local/production-evidence/report-history.png",
    fullPage: true,
  });
  assert.equal(
    (
      await call(
        "POST",
        `/api/v1/reports/schedules/${schedule.id}/run-now`,
        {},
        viewer.request,
      )
    ).status(),
    403,
  );
  // A real timer tick proves the saved schedule reaches the generator, not just a mock.
  await call("PUT", `/api/v1/reports/schedules/${schedule.id}`, {
    cronExpression: "*/2 * * * * *",
  });
  await waitFor(
    async () => (await completedReports()).length >= 2,
    "Automatic report did not finish",
  );
  await call("PUT", `/api/v1/reports/schedules/${schedule.id}`, {
    isActive: false,
  });
  assert.equal(reportScheduler.activeJobCount, 0);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: report template create/edit/persistence, machine selection, timezone, invalid input, manual/automatic generation, browser history/download and viewer denial",
  );
  // Logout and account revocation deny both subsequent requests and live sockets.
  const { testReportJobs } = await import("./test-report-jobs.mjs");
  await testReportJobs({ call, pool, page, frontend, smtp, waitFor, reportScheduler, machine });
  const { testUnattendedAlarms } = await import("./test-unattended-alarms.mjs");
  await testUnattendedAlarms({ page, frontend, call, pool, machine, adminId, worker });
  const { testGateway } = await import("./test-gateway.mjs");
  await testGateway({ call, page, frontend, pool, directory, multiMachine, worker, waitFor });
  const { testIncidentReplay } = await import("./test-incident-replay.mjs");
  await testIncidentReplay({ call, pool, page, frontend, machine, shift, adminId, viewer });
  assert.deepEqual(pageErrors, []);
  await call("POST", "/api/v1/auth/logout", {}, viewer.request);
  await waitFor(() => !liveClient.connected, "Logout left socket connected");
  assert.equal(
    (await viewer.request.get(`${apiUrl}/api/v1/dashboards`)).status(),
    401,
  );
  liveClient.disconnect();
  assert.equal(
    (
      await viewer.request.get(
        `${apiUrl}/api/v1/production/shifts/${shift.id}/report`,
      )
    ).status(),
    401,
  );
  await call(
    "POST",
    "/api/v1/auth/login",
    { username: "shiftviewer", password },
    viewer.request,
  );
  liveClient = connectSocket(apiUrl, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      cookie: (await viewer.cookies(apiUrl))
        .map((c) => c.name + "=" + c.value)
        .join("; "),
    },
  });
  await new Promise((resolve, reject) => {
    liveClient.once("connect", resolve);
    liveClient.once("connect_error", reject);
  });
  await pool.query(
    "UPDATE users SET is_active=false,updated_at=now() WHERE id=$1",
    [viewerId],
  );
  await waitFor(
    () => !liveClient.connected,
    "Account deactivation left live stream connected",
    5000,
  );
  assert.equal(
    (
      await viewer.request.get(
        `${apiUrl}/api/v1/production/shifts/${shift.id}/report`,
      )
    ).status(),
    401,
  );
  await assert.rejects(viewerCaller.dashboard.list(), /Authentication/);
  console.log(
    "PASS: logout and account deactivation revoke REST, report exports, tRPC and live streams",
  );
  const { opcuaEmitter: emitter } =
    await import("../server/dist/src/opc-ua/opcuaClient.js");
  let enqueueAttempts = 0,
    broadcasts = 0;
  worker.enqueue = () => {
    enqueueAttempts++;
    throw new Error("Owned storage-failure fixture");
  };
  socketServer.opcuaService.broadcastNodeChange = () => {
    broadcasts++;
  };
  emitter.emit("nodeChanged", high.data);
  emitter.emit("nodeChanged", low.data);
  assert.equal(
    enqueueAttempts,
    1,
    "Storage failure must latch acquisition off",
  );
  assert.equal(broadcasts, 0, "Unaccepted samples must not appear live");
  console.log(
    "PASS: collector storage failure stops further acceptance and live broadcasts",
  );
  await viewer.close();
  await context.close();
  await webhookService.stop();
} catch (error) {
  console.error("Production acceptance failed:", error);
  throw error;
} finally {
  reportScheduler?.stop();
  await smtp?.close();
  liveClient?.disconnect();
  await webhookService?.stop();
  await browser?.close();
  await vite?.close();
  await multiMachine?.disconnectAll();
  await worker?.stop();
  if (socketServer) await new Promise((r) => socketServer.io.close(r));
  else if (appServer) await new Promise((r) => appServer.close(r));
  if (receiver) await new Promise((r) => receiver.close(r));
  await uaServer?.shutdown(0);
  await sessionStore?.close();
  await manager?.end();
  await (
    await import("../server/dist/src/opc-ua/services/certificateManager.js")
  ).default.dispose();
  // NodeOPCUA caches default stores across clients; release them before deleting owned PKI folders.
  await (await import("node-opcua")).OPCUACertificateManager.disposeAll();
  await pool?.end();
  if (created) {
    // Pool shutdown can resolve before PostgreSQL observes the socket disconnect.
    await waitFor(
      async () =>
        (
          await admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1", [
            database,
          ])
        ).rowCount === 0,
      "Test database still has live connections after shutdown",
    );
    await admin.query(`DROP DATABASE "${database}"`);
  }
  await admin.end();
  const resolved = resolve(directory);
  assert.equal(dirname(resolved), resolve(tmpdir()));
  assert.ok(basename(resolved).startsWith("dashboard-shift-"));
  await rm(resolved, { recursive: true, force: true });
}
async function expectVisible(locator) {
  await locator.waitFor({ state: "visible", timeout: 30000 });
}
