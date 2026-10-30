import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import {
  mkdir,
  readFile,
  writeFile,
  appendFile,
  statfs,
  copyFile,
  cp,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { cpus, totalmem, platform, arch } from "node:os";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { chromium, expect } from "@playwright/test";
import { createSmtpFixture } from "./test-report-jobs.mjs";
import {
  browserGet,
  safeFailure,
  writeReceipt,
  captureFailurePages,
} from "./endurance-harness.mjs";

// This harness owns every endpoint. It never loads the installation's .env.
const { values: options } = parseArgs({
  options: {
    hours: { type: "string", default: "72" },
    "cycle-seconds": { type: "string", default: "300" },
    "outage-seconds": { type: "string", default: "10" },
    "restart-every": { type: "string", default: "288" },
    users: { type: "string", default: "2" },
    tags: { type: "string", default: "6" },
    directory: { type: "string" },
  },
});
const settings = {
  hours: Number(options.hours),
  cycleSeconds: Number(options["cycle-seconds"]),
  outageSeconds: Number(options["outage-seconds"]),
  restartEvery: Number(options["restart-every"]),
  users: Number(options.users),
  tags: Number(options.tags),
  sampleIntervalMs: 1000,
};
assert(
  Number.isFinite(settings.hours) &&
    settings.hours > 0 &&
    settings.hours <= 720,
);
for (const [key, min, max] of [
  ["cycleSeconds", 20, 86400],
  ["outageSeconds", 3, 300],
  ["restartEvery", 1, 10000],
  ["users", 1, 20],
  ["tags", 4, 100],
])
  assert(
    Number.isInteger(settings[key]) &&
      settings[key] >= min &&
      settings[key] <= max,
    `Invalid ${key}`,
  );
const root = resolve(import.meta.dirname, "..");
const token = randomUUID();
const container = "pd-installation-" + token.slice(0, 12);
const directory = options.directory
  ? resolve(options.directory)
  : join(root, ".local", container);
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory, { recursive: false });
const statePath = join(directory, "status.json");
const receiptPath = join(directory, "cycles.jsonl");
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceDirty = !!execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceDiff = execFileSync("git", ["diff", "HEAD"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
await writeFile(join(directory, "source.patch"), sourceDiff);
const state = {
  format: "installation-endurance-v1",
  state: "starting",
  sourceRevision,
  sourceDirty,
  runtime: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    hostMemoryBytes: totalmem(),
  },
  startedAt: new Date().toISOString(),
  pid: process.pid,
  container,
  settings,
  completedCycles: 0,
  measuredHours: 0,
  passed: false,
  full72Hours: false,
  scope:
    "Owned OPC UA simulator, production application bootstrap/collector/alarms/report scheduler, PostgreSQL, browser sessions, compiled frontend and loopback SMTP",
  exclusions: [
    "Physical-machine qualification",
    "Production image/deployment qualification",
    "Measurements never received during collector downtime",
    "SMTP delivery outside the owned fixture",
    "Simulator dead-client session timeouts (the fixture explicitly removes dead sessions)",
  ],
};
let app,
  pool,
  browser,
  ua,
  smtp,
  generator,
  created = false,
  stopped = false,
  phase = "startup";
let appOutput = "",
  pageErrors = [],
  networkErrors = [],
  pendingRequests = new Map(),
  pageErrorCount = 0,
  fatalError,
  appStartedAt,
  expectedAppStop = false,
  lastEmissionAt = Date.now(),
  maximumTimerGapMs = 0,
  lastSample,
  samples = 0,
  queryCount = 0,
  queryMaxMs = 0;
const begun = Date.now();
const docker = process.env.DOCKER_BIN || "docker";
const save = async (updates = {}) => {
  Object.assign(state, updates, {
    heartbeatAt: new Date().toISOString(),
    measuredHours: (Date.now() - begun) / 3600000,
  });
  await writeReceipt(statePath, state);
};
const run = async (exe, args) => {
  const child = spawn(exe, args, {
    cwd: directory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    error = "";
  child.stdout.on("data", (d) => {
    out = (out + d).slice(-200000);
  });
  child.stderr.on("data", (d) => {
    error = (error + d).slice(-10000);
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, `${exe} failed: ${error}`);
  return out.trim();
};
const port = async () => {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const number = socket.address().port;
  await new Promise((done) => socket.close(done));
  return number;
};
const wait = async (predicate, label, timeout = 60000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (!stopped && Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error.message;
    }
    await delay(250);
  }
  throw new Error(
    `${label}${lastError ? ": " + lastError : ""}${stopped ? " (interrupted)" : ""}`,
  );
};
const killApp = async () => {
  expectedAppStop = true;
  if (app && app.exitCode === null && app.signalCode === null) {
    const exited = once(app, "exit");
    app.kill("SIGKILL");
    await exited;
  }
};
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
const failRun = (error) => {
  fatalError = error instanceof Error ? error : new Error(String(error));
  stopped = true;
  clearInterval(generator);
};
process.on("uncaughtException", failRun);
process.on("unhandledRejection", failRun);
await save();
console.log(JSON.stringify({ directory, pid: process.pid, settings }));
try {
  const databasePassword = randomBytes(24).toString("hex");
  const apiPort = await port(),
    uaPort = await port(),
    databasePort = await port();
  await run(docker, [
    "run",
    "-d",
    "--name",
    container,
    "--label",
    `pd.installation.owner=${token}`,
    "-e",
    "POSTGRES_DB=pd_endurance",
    "-e",
    "POSTGRES_USER=dashboard",
    "-e",
    `POSTGRES_PASSWORD=${databasePassword}`,
    "-p",
    `127.0.0.1:${databasePort}:5432`,
    "postgres:16-alpine",
  ]);
  created = true;
  await save({
    databaseImage: await run(docker, [
      "inspect",
      "--format",
      "{{.Image}}",
      container,
    ]),
    harnessSha256: createHash("sha256")
      .update(await readFile(import.meta.filename))
      .digest("hex"),
    applicationEntrySha256: createHash("sha256")
      .update(await readFile(join(root, "server/dist/app.js")))
      .digest("hex"),
    frontendEntrySha256: createHash("sha256")
      .update(await readFile(join(root, "client/dist/index.html")))
      .digest("hex"),
  });
  pool = new pg.Pool({
    host: "127.0.0.1",
    port: databasePort,
    user: "dashboard",
    password: databasePassword,
    database: "pd_endurance",
    connectionTimeoutMillis: 1500,
    max: 3,
  });
  pool.on("error", () => {});
  const databaseReady = () =>
    wait(
      async () => (await pool.query("SELECT 1")).rowCount === 1,
      "Owned database unavailable",
    );
  await databaseReady();
  await migrate(drizzle(pool), {
    migrationsFolder: join(root, "server/drizzle"),
  });
  const password = randomBytes(18).toString("hex"),
    hash = await bcrypt.hash(password, 4);
  const users = (
    await pool.query(
      "INSERT INTO users(username,email,password_hash,role) VALUES('endurance-admin','admin@example.invalid',$1,'admin'),('endurance-viewer','viewer@example.invalid',$1,'viewer') RETURNING id,username",
      [hash],
    )
  ).rows;

  const opcua = await import("node-opcua");
  ua = new opcua.OPCUAServer({
    port: uaPort,
    resourcePath: "/UA/Endurance",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    serverCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "server-pki"),
    }),
    userCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "user-pki"),
    }),
  });
  await ua.initialize();
  const namespace = ua.engine.addressSpace.getOwnNamespace();
  const keys = [
    "ProductionState",
    "ProductionCount",
    "GoodCount",
    "AlarmSignal",
    ...Array.from({ length: settings.tags - 4 }, (_, i) => `Signal${i}`),
  ];
  const variables = keys.map((key) =>
    namespace.addVariable({
      organizedBy: ua.engine.addressSpace.rootFolder.objects,
      browseName: key,
      nodeId: `ns=1;s=${key}`,
      dataType: "Double",
      minimumSamplingInterval: 100,
    }),
  );
  const emit = () => {
    const now = Date.now(),
      gap = now - lastEmissionAt;
    lastEmissionAt = now;
    if (state.state === "running") {
      maximumTimerGapMs = Math.max(maximumTimerGapMs, gap);
      if (gap > 30000 || gap < 0) {
        failRun(
          new Error(
            `Simulator clock gap ${gap} ms: suspended time or a clock change cannot qualify as continuous operation`,
          ),
        );
        return;
      }
    }
    samples++;
    const at = new Date();
    variables.forEach((variable, i) => {
      const value =
        i === 0
          ? samples % 20 < 15
            ? 1
            : 0
          : i === 3
            ? samples % 16 < 8
              ? 10
              : 0
            : samples;
      variable.setValueFromSource(
        { dataType: opcua.DataType.Double, value },
        i >= 4 && samples % 11 === 0
          ? opcua.StatusCodes.Uncertain
          : opcua.StatusCodes.Good,
        at,
      );
    });
  };
  emit();
  generator = setInterval(emit, 1000);
  await ua.start();
  const machine = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,port,resource_path,is_active) VALUES('Owned endurance machine',$1,'127.0.0.1',$2,'/UA/Endurance',true) RETURNING id",
      [`opc.tcp://127.0.0.1:${uaPort}/UA/Endurance`, uaPort],
    )
  ).rows[0].id;
  for (const key of keys)
    await pool.query(
      "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,data_type,sampling_interval,is_active) VALUES($1,$2,$3,$3,'Double',1000,true)",
      [machine, `ns=1;s=${key}`, key],
    );
  await pool.query(
    "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
    [users[1].id, machine],
  );
  await pool.query(
    "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold,cooldown_seconds,created_by) VALUES('Endurance limit',$1,'AlarmSignal','gt',5,0,$2)",
    [machine, users[0].id],
  );
  const signal = (key) => ({
    nodeKey: key,
    namespaceUri: namespace.namespaceUri,
    identifier: `s=${key}`,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [
      machine,
      {
        version: 1,
        name: "Owned endurance",
        endpointModel: "Owned simulator",
        signals: {
          state: signal(keys[0]),
          total: signal(keys[1]),
          good: signal(keys[2]),
        },
        states: { running: [1], idle: [0], fault: [2], planned: [3] },
        idealCycleMs: 1000,
        maxGapSeconds: 5,
        counterPolicy: "reject-decrease",
      },
      users[0].id,
    ],
  );
  smtp = await createSmtpFixture();
  const template = (
    await pool.query(
      "INSERT INTO report_templates(name,type,template_config,created_by) VALUES('Endurance report','custom',$1,$2) RETURNING id",
      [
        {
          lookbackHours: 1,
          sections: [
            {
              type: "trending",
              machineId: machine,
              nodeKeys: [keys[0], keys.at(-1)],
            },
          ],
        },
        users[0].id,
      ],
    )
  ).rows[0].id;
  const schedule = (
    await pool.query(
      "INSERT INTO report_schedules(template_id,name,cron_expression,machine_ids,recipients,delivery_channels,next_run_at,created_by) VALUES($1,'Endurance scheduled report','* * * * *',$2,$3,'[\"email\"]',now(),$4) RETURNING id",
      [
        template,
        JSON.stringify([machine]),
        JSON.stringify(["owned@example.invalid"]),
        users[0].id,
      ],
    )
  ).rows[0].id;

  const api = `http://127.0.0.1:${apiPort}`;
  // Freeze the built frontend and exercise the application's real static-file path.
  await cp(join(root, "client/dist"), join(directory, "public"), {
    recursive: true,
  });
  const frontend = api;
  const env = {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    CLIENT_URL: frontend,
    DB_HOST: "127.0.0.1",
    DB_PORT: String(databasePort),
    DB_USER: "dashboard",
    DB_PASSWORD: databasePassword,
    DB_NAME: "pd_endurance",
    DB_READ_REPLICA_URLS: "",
    DB_HEALTH_CHECK_INTERVAL: "5000",
    DB_CONNECTION_TIMEOUT: "1500",
    LOG_LEVEL: "error",
    COOKIE_SECRET: randomBytes(32).toString("hex"),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    OPCUA_SPOOL_PATH: join(directory, "spool.sqlite"),
    OPCUA_PKI_DIR: join(directory, "client-pki"),
    MACHINE_SECRETS_KEY_FILE: join(directory, "machine.key"),
    OPCUA_QUEUE_DELAY: "100",
    OPCUA_BATCH_SIZE: "100",
    AUTO_ACCEPT_CERTIFICATES: "false",
    OPCUA_IP: "127.0.0.1",
    OPCUA_PORT: String(uaPort),
    OPCUA_RESOURCE_PATH: "/UA/Endurance",
    REPORTS_DIR: join(directory, "reports"),
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "owned@example.invalid",
    ALLOW_PRIVATE_OUTBOUND_URLS: "true",
    RECOVERY_MODE: "false",
    ENABLE_LEGACY_GATEWAY: "false",
    COMPLIANCE_MODE_ENABLED: "false",
    OTEL_ENABLED: "false",
    RATE_LIMIT_MAX_REQUESTS: "1000000",
  };
  const startApp = async () => {
    expectedAppStop = false;
    appStartedAt = Date.now();
    app = spawn(process.execPath, [join(root, "server/dist/app.js")], {
      env,
      cwd: directory,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [app.stdout, app.stderr])
      stream.on("data", (d) => {
        appOutput = (appOutput + d).slice(-32768);
      });
    app.once("exit", (code, signal) => {
      state.lastAppExit = {
        at: new Date().toISOString(),
        code,
        signal,
        planned: expectedAppStop,
      };
      if (!expectedAppStop)
        failRun(
          new Error(
            `Application exited unexpectedly (code ${code}, signal ${signal})`,
          ),
        );
    });
    await wait(async () => {
      assert.equal(app.exitCode, null, "Application exited: " + appOutput);
      const r = await fetch(api + "/healthz", {
        signal: AbortSignal.timeout(2000),
      });
      await r.text();
      return r.ok;
    }, "Application did not become ready");
  };
  await startApp();
  browser = await chromium.launch({ headless: true });
  const sessions = [];
  const login = async (session) => {
    const response = await session.page.goto(frontend + "/login");
    assert.equal(
      response.status(),
      200,
      "The compiled login route must be served",
    );
    assert.match(
      await response.text(),
      /\/assets\//,
      "Expected the built frontend",
    );
    await session.page.getByLabel("Username").fill(session.username);
    await session.page.getByLabel(/^password/i).fill(password);
    await session.page.getByRole("button", { name: /sign in|log in/i }).click();
    await session.page.waitForURL((url) => !url.pathname.includes("login"));
    session.lastLogin = Date.now();
  };
  for (let i = 0; i < settings.users; i++) {
    const context = await browser.newContext({
      viewport: { width: i % 2 ? 768 : 1440, height: 900 },
    });
    const page = await context.newPage();
    page.on("request", (request) => {
      pendingRequests.set(request, {
        path: new URL(request.url()).pathname,
        type: request.resourceType(),
        startedAt: Date.now(),
      });
      if (pendingRequests.size > 200)
        pendingRequests.delete(pendingRequests.keys().next().value);
    });
    page.on("requestfinished", (request) => pendingRequests.delete(request));
    page.on("requestfailed", (request) => {
      pendingRequests.delete(request);
      networkErrors.push({
        phase,
        path: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
      });
      networkErrors = networkErrors.slice(-40);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().startsWith(api))
        console.log(
          JSON.stringify({
            phase,
            httpError: response.status(),
            path: new URL(response.url()).pathname,
          }),
        );
    });
    page.on("pageerror", (error) => {
      pageErrorCount++;
      pageErrors.push({ phase, message: error.message });
      pageErrors = pageErrors.slice(-20);
    });
    const session = {
      context,
      page,
      username: users[i === 0 ? 0 : 1].username,
    };
    sessions.push(session);
    await login(session);
  }
  const jsonGet = async (session, path) =>
    JSON.parse(await browserGet(session.page, api + path));
  await wait(
    async () =>
      Number(
        (await pool.query("SELECT count(*) FROM opcua_data")).rows[0].count,
      ) >=
      settings.tags * 2,
    "Actual OPC UA collection did not start",
  );
  phase = "live";
  await save({
    state: "running",
    appPid: app.pid,
    frontend,
    api,
    databasePort,
    workloadStartedAt: new Date().toISOString(),
  });
  const workloadBegan = Date.now();
  do {
    const cycle = state.completedCycles + 1,
      liveUntil = Date.now() + settings.cycleSeconds * 1000;
    const latencies = [],
      errorsBefore = pageErrorCount;
    phase = "live";
    while (Date.now() < liveUntil && !stopped) {
      await Promise.all(
        sessions.map(async (session) => {
          if (Date.now() - session.lastLogin > 3600000) await login(session);
          await session.page.goto(frontend + "/operations");
          await expect(
            session.page.getByRole("heading", { name: "Daily operations" }),
          ).toBeVisible();
          await session.page.getByLabel("Machine", { exact: true }).click();
          await session.page
            .getByRole("option", { name: "Owned endurance machine" })
            .click();
          await session.page
            .getByRole("tab", { name: "History", exact: true })
            .click();
          const start = Date.now();
          const query = new URLSearchParams({
            machineId: String(machine),
            nodeKeys: keys.join(","),
            startDate: new Date(Date.now() - 60000).toISOString(),
            endDate: new Date().toISOString(),
          });
          const trend = await jsonGet(
            session,
            "/api/v1/trending/data?" + query,
          );
          assert.equal(trend.series.length, keys.length);
          const counter = trend.series.find(
            (series) => series.nodeKey === "ProductionCount",
          );
          assert(
            counter.sampleCount > 0 && counter.data.length > 0,
            "Browser query returned no real readings",
          );
          assert(
            Date.now() - Date.parse(counter.observedEnd) < 15000,
            "Browser query returned stale readings",
          );
          for (const series of trend.series)
            for (const point of series.data)
              if (!point.statusCode?.startsWith("Good"))
                assert.equal(
                  point.value,
                  null,
                  "Bad quality was presented as a number",
                );
          const elapsed = Date.now() - start;
          latencies.push(elapsed);
          if (latencies.length > 1000) latencies.shift();
          queryCount++;
          queryMaxMs = Math.max(queryMaxMs, elapsed);
        }),
      );
      assert.equal(
        app.exitCode,
        null,
        "Application exited unexpectedly: " + appOutput,
      );
      smtp.captures.splice(0, Math.max(0, smtp.captures.length - 2));
      await save({ queryCount, queryMaxMs, simulatedUpdates: samples, phase });
      await delay(Math.min(5000, Math.max(0, liveUntil - Date.now())));
    }
    assert(
      !stopped,
      "Run interrupted; elapsed time is not completed acceptance",
    );
    assert.equal(
      pageErrorCount,
      errorsBefore,
      "Browser error during live operation: " + JSON.stringify(pageErrors),
    );
    await Promise.all(
      sessions.map(async ({ page }) => {
        await page.goto(frontend + "/production");
        await page
          .getByRole("tab", { name: "Incident replay", exact: true })
          .click();
        await page.getByLabel("Replay machine", { exact: true }).click();
        await page
          .getByRole("option", { name: "Owned endurance machine", exact: true })
          .click();
        await page
          .getByLabel("Signal keys (comma separated, up to 8)")
          .fill("ProductionCount," + keys.at(-1));
        await page
          .getByLabel("Replay start (ISO with offset)")
          .fill(new Date(Date.now() - 60000).toISOString());
        await page
          .getByLabel("Replay end (ISO with offset)")
          .fill(new Date().toISOString());
        const response = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname ===
            `/api/v1/production/replay/${machine}`,
        );
        await page
          .getByRole("button", { name: "Load replay", exact: true })
          .click();
        const replayResponse = await response;
        assert.equal(replayResponse.status(), 200);
        const data = await replayResponse.json();
        const sample = data.signals
          .find((signal) => signal.key === "ProductionCount")
          .samples.at(-1);
        assert(
          sample && Date.now() - Date.parse(sample.at) < 15000,
          "Rendered replay was stale",
        );
        await page.getByRole("slider", { name: "Replay position" }).focus();
        await page.keyboard.press("End");
        await expect(
          page
            .getByLabel("Replay observation ProductionCount")
            .getByRole("heading", { name: String(sample.raw), exact: true }),
        ).toBeVisible();
      }),
    );
    await sessions[0].page.screenshot({
      path: join(directory, "browser-replay-latest.png"),
      fullPage: true,
    });
    await sessions[0].page.goto(frontend + "/reports/history");
    await expect(
      sessions[0].page.getByRole("heading", { name: /Report History/i }),
    ).toBeVisible();
    await wait(
      async () =>
        (
          await pool.query(
            "SELECT 1 FROM report_history WHERE schedule_id=$1 AND id>$2 AND status='completed' AND email_status='sent'",
            [schedule, lastSample?.completedReportId ?? 0],
          )
        ).rowCount > 0,
      "Scheduled PDF/email did not complete",
    );
    const metrics = await browserGet(sessions[0].page, api + "/metrics");
    const residentBytes = Number(
      /^process_resident_memory_bytes (\d+)/m.exec(metrics)?.[1],
    );
    assert(
      Number.isFinite(residentBytes) && residentBytes > 0,
      "Missing actual application memory metric",
    );

    phase = "database-outage";
    await save({ phase });
    await run(docker, ["stop", "-t", "1", container]);
    await delay(settings.outageSeconds * 1000);
    // Read only: identities already durably accepted by the real production collector.
    const readPending = () => {
      const spool = new DatabaseSync(join(directory, "spool.sqlite"), {
        readOnly: true,
      });
      try {
        const rows = spool
          .prepare(
            "SELECT id,payload FROM measurements ORDER BY sequence LIMIT 100001",
          )
          .all();
        assert(
          rows.length <= 100000,
          "Backlog exceeds the bounded 100,000-event validation checkpoint; operating envelope exceeded",
        );
        return rows;
      } finally {
        spool.close();
      }
    };
    let pending = readPending();
    assert(
      pending.length > 0,
      "Database outage did not create a durable backlog",
    );
    const processAgeSeconds = (Date.now() - appStartedAt) / 1000;
    const restarted = cycle === 1 || cycle % settings.restartEvery === 0;
    if (restarted) {
      await killApp();
      // Include every event accepted up to process termination, not just the earlier live snapshot.
      pending = readPending();
      // The owned simulator discards dead-client sessions; server session timeout behavior is outside this fixture.
      for (const session of ua.engine.getSessions())
        ua.engine.closeSession(session.authenticationToken, true, "Forcing");
    }
    const identities = pending.map((row) => row.id);
    const checkpoint = createHash("sha256")
      .update(JSON.stringify(pending))
      .digest("hex");
    await writeFile(
      join(directory, "pending-latest.json"),
      JSON.stringify(pending),
    );
    await delay(1000);
    await run(docker, ["start", container]);
    await databaseReady();
    phase = "recovery";
    if (restarted) await startApp();
    await wait(
      async () =>
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM opcua_data WHERE event_id=ANY($1)",
              [identities],
            )
          ).rows[0].count,
        ) === identities.length,
      "Durably accepted outage events were not recovered",
    );
    const duplicate = (
      await pool.query(
        "SELECT event_id,count(*) FROM opcua_data WHERE event_id=ANY($1) GROUP BY event_id HAVING count(*)<>1",
        [identities],
      )
    ).rows;
    assert.equal(
      duplicate.length,
      0,
      "Replay duplicated accepted measurements",
    );
    const replayed = new Map(
      (
        await pool.query(
          "SELECT event_id,node_key,raw_value,value,status_code,source_timestamp,received_at FROM opcua_data WHERE event_id=ANY($1)",
          [identities],
        )
      ).rows.map((row) => [row.event_id, row]),
    );
    for (const accepted of pending) {
      const original = JSON.parse(accepted.payload),
        row = replayed.get(accepted.id);
      assert.equal(row.node_key, original.key);
      assert.deepEqual(row.raw_value, original.value);
      assert.equal(row.status_code, original.statusCode);
      assert.equal(
        row.source_timestamp?.toISOString() ?? null,
        original.sourceTimestamp ?? null,
      );
      assert.equal(row.received_at.toISOString(), original.receivedAt);
      assert.equal(
        row.value,
        original.statusCode.startsWith("Good") ? original.value : null,
      );
    }
    const counts = (
      await pool.query(
        "SELECT count(*)::int rows,count(*) FILTER(WHERE status_code NOT LIKE 'Good%' AND value IS NULL)::int unknown,count(*) FILTER(WHERE event_id IS NULL OR received_at IS NULL)::int missing_provenance FROM opcua_data",
      )
    ).rows[0];
    assert.equal(counts.missing_provenance, 0);
    if (settings.tags > 4)
      assert(
        counts.unknown > 0,
        "Uncertain source samples must remain unknown",
      );
    assert(counts.rows > (lastSample?.rows ?? 0), "History stopped growing");
    await wait(
      async () =>
        (
          await pool.query(
            "SELECT 1 FROM alert_history WHERE rule_name='Endurance limit' AND resolved_at IS NOT NULL AND id>$1",
            [lastSample?.resolvedAlarmId ?? 0],
          )
        ).rowCount > 0,
      "Real OPC UA alarm never triggered and recovered",
    );
    const report = (
      await pool.query(
        "SELECT id,file_path,file_size FROM report_history WHERE status='completed' ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    const resolvedAlarmId = (
      await pool.query(
        "SELECT max(id)::int id FROM alert_history WHERE rule_name='Endurance limit' AND resolved_at IS NOT NULL",
      )
    ).rows[0].id;
    const pdf = await readFile(report.file_path);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    await copyFile(report.file_path, join(directory, "report-latest.pdf"));
    const databaseBytes = Number(
      (await pool.query("SELECT pg_database_size(current_database()) bytes"))
        .rows[0].bytes,
    );
    const disk = await statfs(directory);
    const sorted = latencies.sort((a, b) => a - b);
    lastSample = {
      cycle,
      at: new Date().toISOString(),
      ...counts,
      checkpointEvents: pending.length,
      checkpointSha256: checkpoint,
      replayedExactlyOnce: identities.length,
      databaseBytes,
      collectorFreeBytes: disk.bavail * disk.bsize,
      applicationResidentBytes: residentBytes,
      processAgeSeconds,
      restarted,
      harnessResidentBytes: process.memoryUsage().rss,
      queryP95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
      querySamples: sorted.length,
      completedReportId: report.id,
      resolvedAlarmId,
      reportSha256: createHash("sha256").update(pdf).digest("hex"),
      workloadHours: (Date.now() - workloadBegan) / 3600000,
      maximumTimerGapMs,
      unreceivedIntervals: "unknown; never reconstructed",
    };
    await appendFile(receiptPath, JSON.stringify(lastSample) + "\n", {
      flush: true,
    });
    await save({
      completedCycles: cycle,
      lastCycle: lastSample,
      appPid: app.pid,
      phase: "live",
    });
    console.log(JSON.stringify(lastSample));
  } while (Date.now() - workloadBegan < settings.hours * 3600000);
  await sessions[0].page.screenshot({
    path: join(directory, "browser-final.png"),
    fullPage: true,
  });
  assert(
    !stopped,
    fatalError?.message ?? "Run interrupted before final acceptance",
  );
  await save({
    state: "completed",
    passed: true,
    full72Hours: lastSample.workloadHours >= 72,
    workloadHours: lastSample.workloadHours,
    completedAt: new Date().toISOString(),
  });
} catch (error) {
  const failedPendingRequests = [...pendingRequests.values()].map(
    ({ startedAt, ...request }) => ({
      ...request,
      elapsedMs: Date.now() - startedAt,
    }),
  );
  const failurePages = await captureFailurePages(browser, directory);
  await save({
    state: fatalError || !stopped ? "failed" : "interrupted",
    failure: safeFailure(fatalError ?? error),
    applicationTail: safeFailure(appOutput),
    phase,
    failurePages,
    networkErrors,
    pendingRequests: failedPendingRequests,
    pageErrors: pageErrors.map((item) => ({
      ...item,
      message: safeFailure(item.message),
    })),
  });
  await writeFile(
    join(directory, "application-tail.log"),
    safeFailure(appOutput),
  );
  console.error(safeFailure(fatalError ?? error));
  process.exitCode = 1;
} finally {
  clearInterval(generator);
  await killApp();
  await browser?.close();
  await smtp?.close();
  await ua?.shutdown(0);
  await (await import("node-opcua")).OPCUACertificateManager.disposeAll();
  await pool?.end();
  if (created) {
    const owner = await run(docker, [
      "inspect",
      "--format",
      '{{index .Config.Labels "pd.installation.owner"}}',
      container,
    ]);
    assert.equal(
      owner,
      token,
      "Refusing to remove a container not owned by this run",
    );
    await run(docker, ["rm", "-f", "-v", container]);
  }
  await save({ cleanedUp: true });
}
