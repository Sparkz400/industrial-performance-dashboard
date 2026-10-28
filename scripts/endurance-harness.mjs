import assert from "node:assert/strict";
import { writeFile, rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

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
      /\b(cookie|set-cookie|authorization|proxy-authorization|x-csrf-token)\s*[:=]\s*[^\r\n]*/gi,
      "$1: [redacted]",
    )
    .replace(/connect\.sid=[^\s;"']+/gi, "connect.sid=[redacted]");
}
