import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

if (process.argv[2] === "child") {
  const manager = (await import("../server/dist/src/database/dbConnection.js"))
    .default;
  const client = await manager.pool.connect();
  let released = false;
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS interrupted_write (id integer)",
    );
    await client.query("BEGIN");
    await client.query("INSERT INTO interrupted_write VALUES (1)");
    const backend = (await client.query("SELECT pg_backend_pid() AS pid"))
      .rows[0].pid;
    // Do not attach an error listener here: the manager must protect checked-out clients.
    const ended = new Promise((done) => client.once("end", done));
    const pending =
      process.argv[3] === "active"
        ? client.query("SELECT pg_sleep(30)").then(
            () => ({ succeeded: true }),
            (error) => ({ error }),
          )
        : undefined;
    process.send({ backend });
    await ended;
    if (pending)
      assert((await pending).error, "Interrupted active query must reject");
    await assert.rejects(client.query("SELECT 1"));
    client.release();
    released = true;
    const result = await manager.pool.query(
      "SELECT count(*)::int AS count FROM interrupted_write",
    );
    assert.equal(
      result.rows[0].count,
      0,
      "Disconnected transaction must not commit",
    );
    assert.equal(
      (await manager.pool.query("SELECT 1 AS value")).rows[0].value,
      1,
    );
  } finally {
    if (!released) client.release();
    await manager.end();
  }
  process.disconnect();
} else {
  dotenv.config({ path: "server/.env", quiet: true });
  assert.equal(process.env.DB_PORT, "55432");
  assert(["localhost", "127.0.0.1"].includes(process.env.DB_HOST));
  const database = "pd_client_error_" + randomUUID().replaceAll("-", "");
  const directory = resolve(".local", database);
  await mkdir(resolve(".local"), { recursive: true });
  await mkdir(directory, { recursive: false });
  const admin = new pg.Client({
    host: process.env.DB_HOST,
    port: 55432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });
  let created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    for (const mode of ["idle", "active"]) {
      const child = fork(fileURLToPath(import.meta.url), ["child", mode], {
        cwd: directory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          DB_NAME: database,
          DB_READ_REPLICA_URLS: "",
          DB_HEALTH_CHECK_INTERVAL: "0",
          NODE_ENV: "test",
          LOG_LEVEL: "error",
        },
      });
      let stderr = "";
      child.stdout.resume();
      child.stderr.on("data", (data) => {
        stderr = (stderr + data).slice(-3000);
      });
      const closed = new Promise((done) => child.once("close", done));
      const timeout = setTimeout(() => child.kill(), 20000);
      let terminated = false;
      try {
        const backend = await new Promise((done, fail) => {
          child.once("message", (message) => done(message.backend));
          child.once("error", fail);
          child.once("exit", () =>
            fail(new Error("Child exited before acquiring its connection")),
          );
        });
        assert(Number.isInteger(backend));
        const result = await admin.query(
          "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND datname=$2",
          [backend, database],
        );
        terminated = result.rows[0]?.terminated === true;
        assert(
          terminated,
          "Only the owned fixture connection may be terminated",
        );
        assert.equal(
          await closed,
          0,
          `${mode} checked-out client crashed: ${stderr}`,
        );
        console.log(
          `PASS: ${mode} checked-out client survives disconnect; query fails, write rolls back, pool recovers`,
        );
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await closed;
      }
    }
  } finally {
    if (created) {
      assert.match(database, /^pd_client_error_[a-f0-9]{32}$/);
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    }
    await admin.end();
  }
}
