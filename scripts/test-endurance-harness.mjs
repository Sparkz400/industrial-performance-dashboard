import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { browserGet, safeFailure, writeReceipt } from "./endurance-harness.mjs";

const receiptDirectory = await mkdtemp(join(tmpdir(), "pd-endurance-receipt-"));
const receipt = join(receiptDirectory, "status.json");
try {
  await writeReceipt(receipt, { cycle: 1 });
  assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), { cycle: 1 });
  if (process.platform === "win32") {
    const lock = async () => {
      const child = spawn(
        join(
          process.env.SystemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$f=[IO.File]::Open($env:PD_RECEIPT_PATH,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { [Console]::WriteLine('locked'); [Console]::ReadLine() | Out-Null } finally { $f.Dispose() }",
        ],
        {
          env: { ...process.env, PD_RECEIPT_PATH: receipt },
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const [message] = await Promise.race([
        once(child.stdout, "data"),
        once(child, "exit").then(() => {
          throw new Error("Receipt lock fixture exited early");
        }),
      ]);
      assert.equal(String(message).trim(), "locked");
      return child;
    };
    const release = async (child) => {
      const exited = once(child, "exit");
      child.stdin.end("\n");
      await exited;
    };
    const transient = await lock();
    let released;
    const timer = setTimeout(() => {
      released = release(transient);
    }, 300);
    try {
      await writeReceipt(receipt, { cycle: 2 });
      assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), {
        cycle: 2,
      });
    } finally {
      clearTimeout(timer);
      await (released ?? release(transient));
    }
    const persistent = await lock();
    try {
      await assert.rejects(writeReceipt(receipt, { cycle: 3 }), (error) =>
        ["EPERM", "EACCES", "EBUSY"].includes(error.code),
      );
      assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), {
        cycle: 2,
      });
      assert.deepEqual(JSON.parse(await readFile(receipt + ".tmp", "utf8")), {
        cycle: 3,
      });
    } finally {
      await release(persistent);
    }
  }
} finally {
  await rm(receipt, { force: true });
  await rm(receipt + ".tmp", { force: true });
  await rmdir(receiptDirectory);
}

const counts = new Map();
const server = createServer((req, res) => {
  counts.set(req.url, (counts.get(req.url) ?? 0) + 1);
  if (req.url === "/") {
    res.setHeader(
      "Set-Cookie",
      "fixture-session=private-test-value; HttpOnly; SameSite=Lax; Path=/",
    );
    res.end("<!doctype html><title>Owned browser transport fixture</title>");
  } else if (req.url === "/good") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        authenticated:
          req.headers.cookie === "fixture-session=private-test-value",
        transport: req.headers["sec-fetch-mode"],
      }),
    );
  } else if (req.url === "/unauthorized")
    res.writeHead(401).end("Unauthorized");
  else if (req.url === "/failure")
    res.writeHead(500).end("Application failure");
  else if (req.url === "/partial") {
    res.writeHead(200, {
      "Content-Length": "100",
      "Content-Type": "application/json",
    });
    res.write('{"incomplete":');
    setTimeout(() => res.destroy(), 20);
  } else if (req.url === "/slow") {
    // Deliberately no response: the bounded browser timeout must fail the check.
  } else res.writeHead(404).end();
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(JSON.parse(await browserGet(page, url + "/good")), {
      authenticated: true,
      transport: "cors",
    });
    // Closing idle HTTP connections is normal server behavior; a browser opens a new connection.
    server.closeIdleConnections();
    await delay(25);
  }
  assert.equal(counts.get("/good"), 3);
  for (const [path, code] of [
    ["/unauthorized", 401],
    ["/failure", 500],
    ["/missing", 404],
  ]) {
    await assert.rejects(
      browserGet(page, url + path),
      new RegExp(`HTTP ${code}`),
    );
    assert.equal(
      counts.get(path),
      1,
      "HTTP failures must not be retried or accepted",
    );
  }
  await assert.rejects(
    browserGet(page, url + "/partial"),
    /fetch|network|body/i,
  );
  assert.equal(
    counts.get("/partial"),
    1,
    "A truncated application response must fail without a harness retry",
  );
  await assert.rejects(browserGet(page, url + "/slow", 100), /timeout|abort/i);
  assert.equal(counts.get("/slow"), 1);
  const redacted = safeFailure(
    new Error(
      "ECONNRESET\n - cookie: connect.sid=private-session\nAuthorization: Bearer private-token\nx-csrf-token: private-csrf\nSet-Cookie: fixture-session=private-value\nsource connect.sid=private-inline; retained",
    ),
  );
  for (const secret of [
    "private-session",
    "private-token",
    "private-csrf",
    "private-value",
    "private-inline",
  ])
    assert(!redacted.includes(secret));
  assert(redacted.includes("ECONNRESET") && redacted.includes("retained"));
  console.log(
    "PASS: durable receipts tolerate transient Windows reader locks and preserve evidence on persistent locks; browser GETs survive idle closure; HTTP/auth/truncated/timeout failures remain failures; credentials are redacted",
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
