import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { chromium, expect } from "@playwright/test";

export async function dailyFixture(test) {
  dotenv.config({ path: "server/.env", quiet: true });
  assert.equal(process.env.DB_PORT, "55432");
  assert(["localhost", "127.0.0.1"].includes(process.env.DB_HOST));
  const database = "pd_daily_" + randomUUID().replaceAll("-", "");
  const directory = await mkdtemp(join(tmpdir(), "pd-daily-"));
  console.log(
    JSON.stringify({ ownedDatabase: database, ownedDirectory: directory }),
  );
  const base = {
    host: process.env.DB_HOST,
    port: 55432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
  const admin = new pg.Client({ ...base, database: "postgres" });
  let pool,
    browser,
    vite,
    server,
    sockets,
    store,
    manager,
    created = false;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    Object.assign(process.env, {
      DB_NAME: database,
      DB_READ_REPLICA_URLS: "",
      DB_HEALTH_CHECK_INTERVAL: "0",
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      OPCUA_PKI_DIR: join(directory, "pki"),
      OPCUA_SPOOL_PATH: join(directory, "measurements.sqlite"),
      MACHINE_SECRETS_KEY_FILE: join(directory, "key"),
      REPORTS_DIR: join(directory, "reports"),
      RECOVERY_MODE: "false",
      ENABLE_LEGACY_GATEWAY: "false",
    });
    pool = new pg.Pool({ ...base, database });
    await migrate(drizzle(pool), { migrationsFolder: "server/drizzle" });
    const password = randomUUID(),
      hash = await bcrypt.hash(password, 4);
    const users = {};
    for (const role of [
      "admin",
      "supervisor",
      "operator",
      "viewer",
      "wallboard",
    ])
      users[role] = (
        await pool.query(
          "INSERT INTO users(username,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *",
          [role, `${role}@example.invalid`, hash, role],
        )
      ).rows[0];
    server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const api = `http://127.0.0.1:${server.address().port}`;
    process.env.VITE_API_BASE_URL = api + "/api/v1";
    process.env.VITE_WEBSOCKET_ADDR = api;
    const { createServer: createVite } = await import("vite");
    vite = await createVite({
      configFile: resolve("client/vite.config.ts"),
      root: resolve("client"),
      cacheDir: join(directory, "vite"),
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      logLevel: "error",
    });
    await vite.listen();
    const frontend = `http://127.0.0.1:${vite.httpServer.address().port}`;
    process.env.CLIENT_URL = frontend;
    manager = (await import("../server/dist/src/database/dbConnection.js"))
      .default;
    const application = (await import("../server/dist/app.js")).createApp();
    store = application.sessionStore;
    server.on("request", application.app);
    sockets = (
      await import("../server/dist/src/socket/socketServer.js")
    ).createSocketServer(server, store, application.sessionMiddleware);
    manager = (await import("../server/dist/src/database/dbConnection.js"))
      .default;
    browser = await chromium.launch({ headless: true });
    const actors = {};
    const call = async (role, method, path, data) => {
      const request = actors[role].request;
      const token = await (
        await request.get(api + "/api/v1/csrf-token")
      ).json();
      return request.fetch(api + path, {
        method,
        data,
        headers: { "x-csrf-token": token.csrfToken },
      });
    };
    const login = async (role) => {
      actors[role] ??= await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const result = await call(role, "POST", "/api/v1/auth/login", {
        username: role,
        password,
      });
      assert.equal(result.status(), 200, await result.text());
    };
    for (const role of Object.keys(users)) await login(role);
    await mkdir(".local/daily-evidence", { recursive: true });
    await test({
      pool,
      users,
      actors,
      api,
      frontend,
      sockets,
      call,
      login,
      password,
      expect,
      browser,
    });
  } catch (error) {
    console.error("Daily acceptance failed:", error);
    throw error;
  } finally {
    await browser?.close();
    await vite?.close();
    if (sockets) await new Promise((resolve) => sockets.io.close(resolve));
    else if (server) await new Promise((resolve) => server.close(resolve));
    await store?.close();
    if (manager) {
      await (
        await import("../server/dist/src/opc-ua/services/multiMachineManager.js")
      ).default.disconnectAll();
      await (
        await import("../server/dist/src/queue/opcuaQueueWorker.js")
      ).default.stop();
      await (
        await import("../server/dist/src/opc-ua/services/certificateManager.js")
      ).default.dispose();
      await (await import("node-opcua")).OPCUACertificateManager.disposeAll();
    }
    await manager?.end();
    await pool?.end();
    if (created) {
      for (let i = 0; i < 100; i++) {
        if (
          !(
            await admin.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname=$1",
              [database],
            )
          ).rowCount
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await admin.query(`DROP DATABASE "${database}"`);
    }
    await admin.end();
    assert.equal(dirname(directory), resolve(tmpdir()));
    // Vite's optimizer can finish a filesystem write after its server closes on Windows.
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
