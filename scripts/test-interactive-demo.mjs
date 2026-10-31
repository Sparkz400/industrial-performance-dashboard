import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import {
  readFile,
  access,
  rm,
  realpath,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import pg from "pg";
import dotenv from "dotenv";

const directory = resolve(".local/interactive-demo");
await assert.rejects(
  () => access(directory + "/owner.json"),
  { code: "ENOENT" },
  "Refusing to test over an existing demo",
);
await mkdir(".local/community-evidence", { recursive: true });
let child, browser, admin;
let log = "",
  passed = false;
const launch = async () => {
  child = fork("scripts/interactive-demo.mjs", [], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    assert(child.exitCode === null, log);
    try {
      const state = JSON.parse(
        await readFile(directory + "/ready.json", "utf8"),
      );
      if (state.pid === child.pid) return state;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error("Demo did not become ready: " + log);
};
const stop = async () => {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.send("demo-stop");
  const timer = setTimeout(() => child.kill(), 20000);
  try {
    const [code] = await ended;
    assert.equal(code, 0, log);
  } finally {
    clearTimeout(timer);
  }
};
const reset = async () => {
  const process = spawn(
    globalThis.process.execPath,
    ["scripts/interactive-demo.mjs", "reset"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  process.stdout.on("data", (data) => {
    output += data;
  });
  process.stderr.on("data", (data) => {
    output += data;
  });
  const [code] = await once(process, "exit");
  return { code, output };
};
try {
  const first = await launch();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(first.url);
  assert.equal(await page.title(), "Factory demo");
  assert.equal((await reset()).code, 1, "Reset must refuse a running demo");
  assert.equal(
    (
      await page.request.post(first.url + "/scenario", {
        form: { scenario: "gap", csrf: "wrong" },
        headers: { origin: "http://untrusted.invalid" },
      })
    ).status(),
    403,
  );
  await page
    .getByRole("button", { name: "Missing measurements", exact: true })
    .click();
  const link = await page
    .getByRole("link", { name: "Review the current demo shift" })
    .getAttribute("href");
  const latest = new URL(link).searchParams.get("shift");
  assert.notEqual(latest, String(first.shiftId));
  await page.screenshot({
    path: ".local/community-evidence/demo-guide.png",
    fullPage: true,
  });
  const owner = JSON.parse(await readFile(directory + "/owner.json", "utf8"));
  await page.goto(first.frontend + "/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel(/^password/i).fill(owner.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("login"));
  await page.goto(link);
  await page
    .getByRole("button", { name: "Export reproducible evidence", exact: true })
    .waitFor();
  await stop();
  const resumed = await launch();
  assert.equal(
    resumed.shiftId,
    Number(latest),
    "Scenario data must survive restart",
  );
  await stop();
  dotenv.config({ path: "server/.env", quiet: true });
  dotenv.config({ path: "server/.env.example", quiet: true });
  admin = new pg.Client({
    host: process.env.DB_HOST,
    port: 55432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "postgres",
  });
  await admin.connect();
  await admin.query(
    `COMMENT ON DATABASE "${owner.database}" IS 'different-owner'`,
  );
  try {
    const refused = await reset();
    assert.equal(refused.code, 1);
    assert.match(refused.output, /ownership/);
    assert.equal(
      (
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          owner.database,
        ])
      ).rowCount,
      1,
    );
  } finally {
    await admin.query(
      `COMMENT ON DATABASE "${owner.database}" IS 'performance-dashboard-demo:${owner.id}'`,
    );
  }
  const cleared = await reset();
  assert.equal(cleared.code, 0, cleared.output);
  assert.equal(
    (
      await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        owner.database,
      ])
    ).rowCount,
    0,
  );
  const fresh = await launch();
  assert.equal(fresh.shiftId, 1, "Reset must recreate the initial scenario");
  await stop();
  assert.equal((await reset()).code, 0);
  passed = true;
  console.log(
    JSON.stringify({
      interactiveDemo: "passed",
      browserLogin: true,
      persistence: true,
      resetOwnership: true,
      crossOriginRefused: true,
    }),
  );
} finally {
  await browser?.close();
  await stop();
  await admin?.end();
  await writeFile(".local/community-evidence/demo-process.log", log);
  // This test refused a pre-existing owner record and owns only this fixed directory.
  if (passed) {
    assert.equal(await realpath(directory), directory);
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}
