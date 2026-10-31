import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export function enduranceBrowserOptions(directory) {
  return {
    headless: true,
    // Bound recent socket evidence; custom credential headers are redacted after close.
    args: [
      `--log-net-log=${join(directory, "chromium-netlog.json")}`,
      "--net-log-capture-mode=Default",
      "--net-log-max-size-mb=64",
    ],
  };
}

export async function redactBrowserNetLog(directory) {
  const path = join(directory, "chromium-netlog.json");
  const log = JSON.parse(await readFile(path, "utf8"), (_key, value) =>
    typeof value === "string" ? safeFailure(value) : value,
  );
  await writeReceipt(path, log);
}

export async function writeReceipt(path, value) {
  await writeFile(path + ".tmp", JSON.stringify(value, null, 2), {
    flush: true,
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(path + ".tmp", path);
      return;
    } catch (error) {
      // Windows readers can briefly prevent replacement; retain both durable files on failure.
      if (
        process.platform !== "win32" ||
        !["EPERM", "EACCES", "EBUSY"].includes(error.code) ||
        attempt >= 20
      )
        throw error;
      await delay(100);
    }
  }
}

// Exercise Chromium's authenticated transport, not Playwright's separate Node HTTP agent.
export async function browserGet(page, url, timeoutMs = 15000) {
  const result = await page.evaluate(
    async ({ url, timeoutMs }) => {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: response.status, body: await response.text() };
    },
    { url, timeoutMs },
  );
  assert.equal(
    result.status,
    200,
    `GET ${new URL(url).pathname}: HTTP ${result.status}`,
  );
  return result.body;
}

export function safeFailure(error) {
  return String(error instanceof Error ? (error.stack ?? error.message) : error)
    .replace(
      /\b(cookie|set-cookie|authorization|proxy-authorization|x-csrf-token|_?password|db_password|cookie_secret|session_secret)["']?\s*[:=]\s*[^\r\n]*/gi,
      "$1: [redacted]",
    )
    .replace(/connect\.sid=[^\s;"']+/gi, "connect.sid=[redacted]");
}

export async function captureFailurePages(browser, directory) {
  const failurePages = [];
  for (const [index, page] of (
    browser?.contexts().flatMap((context) => context.pages()) ?? []
  ).entries()) {
    const snapshot = { index, url: page.url() };
    try {
      snapshot.text = safeFailure(
        (await page.locator("body").innerText({ timeout: 5000 })).slice(
          0,
          4000,
        ),
      );
    } catch (captureError) {
      snapshot.captureError = safeFailure(captureError);
    }
    // A stalled DOM read must not discard the independent screenshot evidence.
    try {
      await page.screenshot({
        path: join(directory, `browser-failure-${index}.png`),
        timeout: 5000,
      });
    } catch (captureError) {
      snapshot.captureError = [snapshot.captureError, safeFailure(captureError)]
        .filter(Boolean).join("\n");
    }
    failurePages.push(snapshot);
  }
  return failurePages;
}
