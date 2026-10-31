import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import {
  captureBrowserResources,
  createBrowserResourceTracker,
  browserResourcePolicy,
} from "./browser-resources.mjs";

let detached = false;
const stalled = {
  contexts: () => [
    {
      pages: () => [{}],
      newCDPSession: async () => ({
        send: () => new Promise(() => {}),
        detach: async () => {
          detached = true;
        },
      }),
    },
  ],
};
await assert.rejects(
  captureBrowserResources(stalled),
  /resource timeout: heap/,
);
assert(detached, "A stalled sample must detach its diagnostic session");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(
    "<!doctype html><title>Owned resource fixture</title><main></main>",
  );
  const before = await captureBrowserResources(browser);
  await page.evaluate(() => {
    window.heldBuffer = new Uint8Array(16 * 1024 * 1024).fill(7);
    for (let i = 0; i < 1000; i++) {
      const button = document.createElement("button");
      button.textContent = `Owned ${i}`;
      button.addEventListener("click", () => i);
      document.querySelector("main").append(button);
    }
  });
  const after = await captureBrowserResources(browser);
  assert(after.pages[0].domNodes >= before.pages[0].domNodes + 1000);
  assert(
    after.pages[0].eventListeners >= before.pages[0].eventListeners + 1000,
  );
  assert(
    after.pages[0].backingStorageBytes >=
      before.pages[0].backingStorageBytes + 16 * 1024 * 1024,
  );
  const stable = createBrowserResourceTracker(1);
  for (let i = 0; i < 4; i++) assert.equal(stable(before).status, "warming-up");
  assert.equal(stable(before).status, "within-budget");
  const growing = createBrowserResourceTracker(1);
  growing(before);
  growing(before);
  const large = structuredClone(before);
  for (const [metric, limit] of Object.entries(
    browserResourcePolicy.growthLimits,
  ))
    large.pages[0][metric] += limit + 1;
  assert.equal(growing(large).status, "warming-up");
  assert.equal(growing(large).status, "warming-up");
  const exceeded = growing(large);
  assert.equal(exceeded.status, "exceeded");
  assert.equal(exceeded.violations.length, 4);
  const spike = createBrowserResourceTracker(1);
  spike(before);
  spike(before);
  spike(large);
  spike(before);
  assert.equal(
    spike(before).status,
    "within-budget",
    "One transient peak is not sustained growth",
  );
  assert.throws(() => createBrowserResourceTracker(2)(before), /context count/);
  const missing = structuredClone(before);
  delete missing.pages[0].jsHeapUsedBytes;
  assert.throws(
    () => createBrowserResourceTracker(1)(missing),
    /Invalid resource sample/,
  );
  console.log(
    "PASS: real Chromium heap backing storage/DOM/listeners measured; sustained growth fails, isolated peaks do not, missing metrics and page/context leaks fail",
  );
} finally {
  await browser.close();
}
