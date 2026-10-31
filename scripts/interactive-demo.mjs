import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  open,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import dotenv from "dotenv";
import pg from "pg";
import { dailyFixture, publicUrl } from "./daily-fixture.mjs";
import { factoryScenario, scenarios } from "./factory-scenario.mjs";

const directory = resolve(".local/interactive-demo");
await mkdir(directory, { recursive: true });
assert.equal(
  await realpath(directory),
  directory,
  "Demo directory must not be a junction/symlink",
);
const statePath = join(directory, "owner.json"),
  lockPath = join(directory, "running.json");
const command = process.argv[2] ?? "start";
assert(
  ["start", "reset"].includes(command),
  "Usage: node scripts/interactive-demo.mjs [start|reset]",
);
try {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert(Number.isSafeInteger(lock.pid) && lock.pid > 0, "Invalid demo lock");
  let alive = true;
  try {
    process.kill(lock.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") alive = false;
    else throw error;
  }
  assert(
    !alive,
    "Demo is already running. Stop it before restarting or resetting.",
  );
  await rm(lockPath);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const lock = await open(lockPath, "wx", 0o600);
await lock.writeFile(JSON.stringify({ pid: process.pid }));
await lock.close();
try {
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const id = randomUUID();
    state = {
      id,
      database: "pd_demo_" + id.replaceAll("-", ""),
      password: randomUUID(),
    };
    await writeFile(statePath, JSON.stringify(state), {
      flag: "wx",
      mode: 0o600,
    });
  }
  assert(
    /^[a-f0-9-]{36}$/.test(state.id) &&
      state.database === "pd_demo_" + state.id.replaceAll("-", ""),
    "Invalid demo ownership record",
  );
  assert(
    typeof state.password === "string" &&
      /^[a-f0-9-]{36}$/.test(state.password),
    "Invalid demo password",
  );
  if (command === "reset") {
    dotenv.config({ path: "server/.env", quiet: true });
    dotenv.config({ path: "server/.env.example", quiet: true });
    assert(
      ["localhost", "127.0.0.1"].includes(process.env.DB_HOST) &&
        process.env.DB_PORT === "55432",
      "Reset only supports the owned local database service",
    );
    const admin = new pg.Client({
      host: process.env.DB_HOST,
      port: 55432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: "postgres",
    });
    try {
      await admin.connect();
      const { rows } = await admin.query(
        "SELECT shobj_description(oid, 'pg_database') AS owner FROM pg_database WHERE datname=$1",
        [state.database],
      );
      if (rows.length) {
        assert.equal(
          rows[0].owner,
          `performance-dashboard-demo:${state.id}`,
          "Refusing to reset a database without matching ownership",
        );
        // No FORCE: active sessions must close before an owned database can be reset.
        await admin.query(`DROP DATABASE "${state.database}"`);
      }
      console.log(
        "Owned demo database reset. Start the demo to create a fresh scenario.",
      );
    } finally {
      await admin.end();
    }
  } else {
    await dailyFixture(
      async ({ pool, users, frontend, password }) => {
        let current =
          (
            await pool.query(
              'SELECT id AS "shiftId", machine_id AS "machineId" FROM production_shifts ORDER BY id DESC LIMIT 1',
            )
          ).rows[0] ?? (await factoryScenario(pool, users.admin.id));
        const csrf = randomUUID();
        let busy = false;
        const guide = createServer(async (req, res) => {
          try {
            if (
              ![url, publicUrl(url)]
                .map((address) => new URL(address).host)
                .includes(req.headers.host)
            ) {
              res.writeHead(403).end();
              return;
            }
            res.setHeader("Cache-Control", "no-store");
            res.setHeader(
              "Content-Security-Policy",
              "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            );
            if (req.method === "POST") {
              if (
                ![url, publicUrl(url)].includes(req.headers.origin) ||
                req.url !== "/scenario" ||
                busy
              ) {
                res.writeHead(403).end();
                return;
              }
              busy = true;
              try {
                let body = "";
                for await (const chunk of req) {
                  body += chunk;
                  assert(body.length <= 1024, "Request too large");
                }
                const fields = new URLSearchParams(body);
                assert.equal(fields.get("csrf"), csrf, "Invalid request");
                assert(
                  (
                    await pool.query(
                      "SELECT count(*)::int AS n FROM production_shifts",
                    )
                  ).rows[0].n < 100,
                  "100 demo shifts reached. Stop and reset the demo.",
                );
                current = await factoryScenario(
                  pool,
                  users.admin.id,
                  fields.get("scenario"),
                );
                res.writeHead(303, { Location: "/" }).end();
              } finally {
                busy = false;
              }
              return;
            }
            if (req.method !== "GET" || req.url !== "/") {
              res.writeHead(404).end();
              return;
            }
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(
              `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factory demo</title><style>body{font:18px/1.6 system-ui;margin:3rem auto;padding:0 1rem;max-width:48rem;color:#172b35;background:#f4f7f8}a{color:#075984}button{font:inherit;padding:.5rem 1rem;margin:.25rem;border:1px solid #617680;border-radius:.3rem;cursor:pointer}code{overflow-wrap:anywhere}h1{line-height:1.1}section{margin:2rem 0}a:focus-visible,button:focus-visible{outline:3px solid #075984;outline-offset:3px}</style><body><main><h1>Your factory demo</h1><p><strong>Synthetic data · local computer only</strong></p><p>Explore a known shift, change its stop reason, and export evidence you can reproduce offline. Your changes remain after restarting.</p><ol><li><a href="${publicUrl(frontend)}/login" target="_blank" rel="noopener">Open the dashboard</a>. Sign in as <code>admin</code> with password <code>${password}</code>.</li><li><a href="${publicUrl(frontend)}/production?shift=${current.shiftId}" target="_blank" rel="noopener">Review the current demo shift</a>. The known scenario has 30 seconds running, 30 seconds stopped, 15 total parts, 13 good and 2 rejected. OEE is 43.33%.</li><li>Classify a stop, export reproducible evidence, and follow <code>docs/SHIFT_EVIDENCE.md</code> to check it offline.</li></ol><section><h2>Try a different situation</h2><p>Each button adds a fresh shift. Earlier edits remain available in the shift selector. Gaps, bad quality and counter resets must make affected totals or OEE unknown.</p><form method="post" action="/scenario"><input type="hidden" name="csrf" value="${csrf}">${scenarios.map((s) => `<button name="scenario" value="${s}">${{ known: "Known shift", gap: "Missing measurements", "bad-quality": "Bad signal quality", "counter-reset": "Counter reset" }[s]}</button>`).join("")}</form></section><section><h2>Stop or start again</h2><p>Press Ctrl+C in the demo terminal to stop. Run <code>npm run demo</code> to resume. To erase only this demo, stop it and run <code>npm run demo:reset</code>.</p><p>This replay does not connect to a machine or qualify a physical device. Production names and quantities shown here are invented.</p></section></main></body></html>`,
            );
          } catch (error) {
            console.error(error.message);
            res
              .writeHead(400, { "Content-Type": "text/plain" })
              .end("Demo action failed. See the terminal for details.");
          }
        }).listen(0, "127.0.0.1");
        await once(guide, "listening");
        const url = `http://127.0.0.1:${guide.address().port}`;
        await writeFile(
          join(directory, "ready.json"),
          JSON.stringify({ url, frontend, pid: process.pid, ...current }),
        );
        console.log(
          `Factory demo: ${publicUrl(url)}\nOpen this address for login and guided scenarios. Ctrl+C stops; data is preserved.`,
        );
        try {
          await new Promise((done) => {
            const message = (value) => {
              if (value === "demo-stop") stop();
            };
            const stop = () => {
              process.off("SIGINT", stop);
              process.off("SIGTERM", stop);
              process.off("message", message);
              done();
            };
            if (process.send) process.on("message", message);
            process.on("SIGINT", stop);
            process.on("SIGTERM", stop);
          });
        } finally {
          guide.closeAllConnections();
          await new Promise((done) => guide.close(done));
          await rm(join(directory, "ready.json"), { force: true });
        }
      },
      { ...state, directory },
    );
  }
} finally {
  await rm(lockPath, { force: true });
}
