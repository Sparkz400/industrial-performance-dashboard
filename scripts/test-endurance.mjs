import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { createServer } from "node:net";
import { once } from "node:events";
const { values: o } = parseArgs({
  options: {
    hours: { type: "string", default: "72" },
    machines: { type: "string", default: "2" },
    tags: { type: "string", default: "10" },
    users: { type: "string", default: "2" },
    hz: { type: "string", default: "1" },
    "cycle-seconds": { type: "string", default: "300" },
    "outage-seconds": { type: "string", default: "10" },
    worker: { type: "string" },
    directory: { type: "string" },
  },
});
const settings = {
  hours: Number(o.hours),
  machines: Number(o.machines),
  tags: Number(o.tags),
  users: Number(o.users),
  hz: Number(o.hz),
  cycleSeconds: Number(o["cycle-seconds"]),
  outageSeconds: Number(o["outage-seconds"]),
};
assert(settings.hours > 0 && settings.hours <= 720);
for (const [key, max] of [
  ["machines", 100],
  ["tags", 10000],
  ["users", 100],
  ["hz", 100],
  ["cycleSeconds", 86400],
  ["outageSeconds", 3600],
])
  assert(
    Number.isInteger(settings[key]) &&
      settings[key] >= 1 &&
      settings[key] <= max,
    `Invalid ${key}`,
  );
assert(
  settings.machines * settings.tags * settings.hz <= 100000,
  "Maximum requested samples per second is 100,000",
);
const docker = process.env.DOCKER_BIN || "docker";
async function run(exe, args, env = process.env) {
  const child = spawn(exe, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    error = "";
  child.stdout.on("data", (d) => {
    out += d;
  });
  child.stderr.on("data", (d) => {
    error = (error + d).slice(-4000);
  });
  await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done() : fail(new Error(`${exe} exited ${code}: ${error}`)),
    );
  });
  return out.trim();
}
if (o.worker) {
  assert.equal(process.env.PD_OWNED_ENDURANCE, "true");
  const { MeasurementSpool, toMeasurementRow } =
    await import("../server/dist/src/queue/measurementSpool.js");
  const spool = new MeasurementSpool(join(o.directory, "measurements.sqlite"));
  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number(process.env.PD_ENDURANCE_PORT),
    user: "postgres",
    password: process.env.PD_ENDURANCE_PASSWORD,
    database: "postgres",
    connectionTimeoutMillis: 1000,
    max: settings.users + 1,
  });
  pool.on("error", () => {});
  let received = 0,
    attempts = 0,
    failedWrites = 0,
    peakRss = 0;
  const latencies = [];
  const begin = Date.now(),
    until = begin + settings.cycleSeconds * 1000;
  async function replay() {
    const entries = spool.peek(500);
    if (!entries.length) return;
    const rows = entries.map(toMeasurementRow);
    const insert = `INSERT INTO endurance_measurements(event_id,timestamp,machine_id,node_key,value,raw_value,status_code,received_at)
    SELECT "eventId",timestamp,"machineId","nodeKey",value,"rawValue","statusCode","receivedAt"
    FROM jsonb_to_recordset($1::jsonb) AS x("eventId" text,timestamp timestamptz,"machineId" integer,"nodeKey" text,value double precision,"rawValue" jsonb,"statusCode" text,"receivedAt" timestamptz) ON CONFLICT DO NOTHING`;
    try {
      attempts++;
      await pool.query(insert, [JSON.stringify(rows)]);
      // Replay the committed batch before acknowledgment to exercise crash-window idempotency.
      await pool.query(insert, [JSON.stringify(rows)]);
      spool.acknowledge(entries);
    } catch {
      failedWrites++;
    }
  }
  try {
    if (o.worker === "drain") {
      for (let i = 0; spool.count() && i < 100000; i++) await replay();
      assert.equal(spool.count(), 0);
    } else
      while (Date.now() < until) {
        const tick = Date.now();
        for (let m = 1; m <= settings.machines; m++)
          for (let t = 0; t < settings.tags; t++) {
            spool.enqueue({
              machineId: m,
              key: `Tag${t}`,
              label: "Owned endurance fixture",
              timestamp: new Date(tick - (received % 37 === 0 ? 86400000 : 0)),
              receivedAt: new Date(tick),
              value: received,
              statusCode: received % 97 === 0 ? "Bad" : "Good",
            });
            received++;
          }
        if (o.worker === "live")
          await Promise.all([
            replay(),
            ...Array.from({ length: settings.users }, async () => {
              const at = Date.now();
              try {
                await pool.query(
                  "SELECT machine_id,node_key,avg(value),count(*) FROM endurance_measurements WHERE timestamp>=now()-interval '1 day' GROUP BY machine_id,node_key",
                );
                if (latencies.length < 100000) latencies.push(Date.now() - at);
              } catch {}
            }),
          ]);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        await delay(Math.max(0, 1000 / settings.hz - (Date.now() - tick)));
      }
    latencies.sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        received,
        pending: spool.count(),
        attempts,
        failedWrites,
        peakRss,
        queryP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
        elapsedMs: Date.now() - begin,
      }),
    );
  } finally {
    spool.close();
    await pool.end();
  }
} else {
  const token = randomUUID().replaceAll("-", ""),
    name = `pd-endurance-${token.slice(0, 12)}`,
    directory = resolve(o.directory || join(".local", name));
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  const password = randomBytes(24).toString("hex");
  let created = false,
    pool,
    expected = 0,
    cycles = 0;
  const began = Date.now();
  const receipt = {
    format: "endurance-v1",
    settings,
    startedAt: new Date().toISOString(),
    cycles: [],
    passed: false,
    limits:
      "Synthetic live acquisition through the production spool; owned PostgreSQL outages and separate collector processes. Query users are concurrent database readers, not signed-in browser sessions. This does not qualify OPC UA hardware or production limits.",
  };
  const args = Object.entries(o)
    .filter(([k]) => !["worker", "directory"].includes(k))
    .flatMap(([k, v]) => [`--${k}`, String(v)]);
  try {
    const listener = createServer().listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise((r) => listener.close(r));
    await run(docker, [
      "run",
      "-d",
      "--name",
      name,
      "--label",
      `pd.endurance.owner=${token}`,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-p",
      `127.0.0.1:${port}:5432`,
      "postgres:16-alpine",
    ]);
    created = true;
    pool = new pg.Pool({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database: "postgres",
      connectionTimeoutMillis: 1000,
    });
    pool.on("error", () => {});
    const ready = async () => {
      for (let i = 0; i < 60; i++) {
        try {
          await pool.query("SELECT 1");
          return;
        } catch {
          await delay(500);
        }
      }
      throw new Error("Owned database did not recover");
    };
    await ready();
    await pool.query(
      "CREATE TABLE endurance_measurements(event_id text NOT NULL,timestamp timestamptz NOT NULL,machine_id integer NOT NULL,node_key text NOT NULL,value double precision,raw_value jsonb,status_code text,received_at timestamptz,PRIMARY KEY(timestamp,event_id))",
    );
    await pool.query(
      "CREATE INDEX endurance_export ON endurance_measurements(event_id)",
    );
    const env = {
      ...process.env,
      PD_OWNED_ENDURANCE: "true",
      PD_ENDURANCE_PORT: String(port),
      PD_ENDURANCE_PASSWORD: password,
    };
    const worker = async (mode, seconds = settings.cycleSeconds) =>
      JSON.parse(
        (
          await run(
            process.execPath,
            [
              "scripts/test-endurance.mjs",
              ...args,
              "--cycle-seconds",
              String(seconds),
              "--worker",
              mode,
              "--directory",
              directory,
            ],
            env,
          )
        )
          .split("\n")
          .at(-1),
      );
    do {
      const live = await worker("live");
      expected += live.received;
      await run(docker, ["stop", "-t", "1", name]);
      const outage = await worker("live", settings.outageSeconds);
      expected += outage.received;
      assert(
        outage.pending > 0 && outage.failedWrites > 0,
        "Database outage must preserve pending measurements",
      );
      await run(docker, ["start", name]);
      await ready();
      const drained = await worker("drain");
      const count = (
        await pool.query(
          "SELECT count(*)::int n,count(*) FILTER(WHERE status_code='Bad' AND value IS NULL)::int unknown FROM endurance_measurements",
        )
      ).rows[0];
      assert.equal(count.n, expected);
      assert(count.unknown > 0);
      const exportFile = join(directory, "export-latest.csv");
      await writeFile(
        exportFile,
        "event_id,timestamp,machine_id,node_key,value,status_code\n",
      );
      // Keyset pagination keeps export memory bounded as a multi-day dataset grows.
      let last = "";
      let exported = 0;
      while (true) {
        const rows = (
          await pool.query(
            "SELECT event_id,timestamp,machine_id,node_key,value,status_code FROM endurance_measurements WHERE event_id>$1 ORDER BY event_id LIMIT 1000",
            [last],
          )
        ).rows;
        if (!rows.length) break;
        await appendFile(
          exportFile,
          rows
            .map((r) =>
              [
                r.event_id,
                r.timestamp.toISOString(),
                r.machine_id,
                r.node_key,
                r.value ?? "",
                r.status_code,
              ].join(","),
            )
            .join("\n") + "\n",
        );
        last = rows.at(-1).event_id;
        exported += rows.length;
      }
      assert.equal(exported, expected);
      const disk = (
        await pool.query(
          "SELECT pg_database_size(current_database())::float8 bytes",
        )
      ).rows[0];
      receipt.cycles.push({
        cycle: ++cycles,
        live,
        outage,
        drained,
        rows: count.n,
        exported,
        databaseBytes: disk.bytes,
        elapsedHours: (Date.now() - began) / 3600000,
      });
      await writeFile(
        join(directory, "receipt.json"),
        JSON.stringify(receipt, null, 2),
      );
      console.log(
        JSON.stringify({
          cycle: cycles,
          persisted: expected,
          elapsedHours: (Date.now() - began) / 3600000,
        }),
      );
    } while (Date.now() - began < settings.hours * 3600000);
    receipt.passed = true;
    receipt.elapsedHours = (Date.now() - began) / 3600000;
    await writeFile(
      join(directory, "receipt.json"),
      JSON.stringify(receipt, null, 2),
    );
  } finally {
    await pool?.end();
    if (created) {
      const owner = await run(docker, [
        "inspect",
        "--format",
        '{{index .Config.Labels "pd.endurance.owner"}}',
        name,
      ]);
      assert.equal(owner, token);
      await run(docker, ["rm", "-f", "-v", name]);
    }
  }
}
