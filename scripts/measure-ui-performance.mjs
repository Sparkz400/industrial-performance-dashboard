// U10: repeatable UI cost measurement on a fixed synthetic workload.
// Serves the production client build (not the Vite dev server) against an owned,
// isolated database, then records startup, in-app navigation and JS heap per run.
//
//   npm run build && node scripts/measure-ui-performance.mjs [--runs 5] [--cpu-slowdown 4]
//
// Run it unchanged on the operator device to compare before/after on the same workload.
// Timings from a developer machine or CI are not operator-device evidence.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { dailyFixture } from "./daily-fixture.mjs";
import { factoryScenario } from "./factory-scenario.mjs";

const { values: options } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    "cpu-slowdown": { type: "string", default: "1" },
  },
});
const runs = Number(options.runs);
const cpuSlowdown = Number(options["cpu-slowdown"]);
assert(
  Number.isInteger(runs) && runs >= 1 && runs <= 50,
  "--runs must be 1-50",
);
assert(cpuSlowdown >= 1 && cpuSlowdown <= 20, "--cpu-slowdown must be 1-20");
await stat("client/dist/index.html").catch(() => {
  throw new Error(
    "Run npm run build first; this measures the production client build",
  );
});

const median = (values) => {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => (value == null ? null : Math.round(value));

await dailyFixture(async ({ pool, users, frontend, browser, password }) => {
  // Fixed workload: four synthetic shifts, one per scenario, on owned machines.
  for (const scenario of ["known", "gap", "bad-quality", "counter-reset"])
    await factoryScenario(pool, users.admin.id, scenario);

  const { preview } = await import("vite");
  const api = new URL(process.env.VITE_API_BASE_URL).origin;
  // The API accepts the fixture's client origin; present the preview the same way.
  const asClient = (proxy) => {
    const rewrite = (request) => request.setHeader("origin", frontend);
    proxy.on("proxyReq", rewrite);
    proxy.on("proxyReqWs", rewrite);
    // Closing a measured browser context aborts its live socket; that is expected.
    proxy.on("error", (error) => {
      if (error.code !== "ECONNABORTED" && error.code !== "ECONNRESET")
        console.error(error);
    });
  };
  const server = await preview({
    configFile: resolve("client/vite.config.ts"),
    root: resolve("client"),
    // Vite logs every aborted proxied socket; asClient reports any other proxy error.
    logLevel: "silent",
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      proxy: {
        "/api": { target: api, changeOrigin: true, configure: asClient },
        "/socket.io": {
          target: api,
          changeOrigin: true,
          ws: true,
          configure: asClient,
        },
      },
    },
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const samples = [];
  try {
    for (let run = 0; run < runs; run++) {
      // A fresh context per run: cold cache, as after an operator logs in.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      if (cpuSlowdown > 1)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(`${origin}/login`);
      await page.getByLabel("Username").fill("admin");
      await page.getByLabel(/^password/i).fill(password);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL((url) => !url.pathname.includes("login"));

      // Startup: a full load of the production page with a known shift.
      const started = Date.now();
      await page.goto(`${origin}/production`, { waitUntil: "load" });
      await page
        .getByRole("heading", { name: "Production shift" })
        .waitFor({ timeout: 60000 });
      const visibleMs = Date.now() - started;
      const startup = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType("navigation");
        const paint = performance
          .getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint");
        const scripts = performance
          .getEntriesByType("resource")
          .filter((entry) => entry.initiatorType === "script");
        return {
          domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
          loadMs: nav?.loadEventEnd ?? null,
          firstContentfulPaintMs: paint?.startTime ?? null,
          scriptTransferBytes: scripts.reduce(
            (sum, entry) => sum + (entry.transferSize || entry.encodedBodySize),
            0,
          ),
        };
      });

      // In-app navigation: click through the main operator/supervisor views.
      const navigation = {};
      for (const [path, heading] of [
        ["/operations", /operations/i],
        ["/wallboard", /wallboard|supervisor/i],
        ["/production", /production shift/i],
      ]) {
        const at = Date.now();
        await page.evaluate((target) => {
          history.pushState({}, "", target);
          dispatchEvent(new PopStateEvent("popstate"));
        }, path);
        await page
          .getByRole("heading", { name: heading })
          .first()
          .waitFor({ timeout: 60000 });
        navigation[path] = Date.now() - at;
      }

      await cdp.send("HeapProfiler.collectGarbage");
      const { metrics } = await cdp.send("Performance.getMetrics");
      const metric = (name) => metrics.find((m) => m.name === name)?.value;
      samples.push({
        run: run + 1,
        startup: { ...startup, headingVisibleMs: visibleMs },
        navigationMs: navigation,
        jsHeapUsedBytes: metric("JSHeapUsedSize") ?? null,
        domNodes: metric("Nodes") ?? null,
        pageErrors: errors,
      });
      await context.close();
    }
  } finally {
    await new Promise((done) => server.httpServer.close(done));
  }

  assert.deepEqual(
    samples.flatMap((s) => s.pageErrors),
    [],
    "Page errors during measurement",
  );
  const pick = (fn) => round(median(samples.map(fn)));
  const summary = {
    headingVisibleMs: pick((s) => s.startup.headingVisibleMs),
    firstContentfulPaintMs: pick((s) => s.startup.firstContentfulPaintMs),
    loadMs: pick((s) => s.startup.loadMs),
    scriptTransferBytes: pick((s) => s.startup.scriptTransferBytes),
    navigationMs: Object.fromEntries(
      Object.keys(samples[0].navigationMs).map((path) => [
        path,
        pick((s) => s.navigationMs[path]),
      ]),
    ),
    jsHeapUsedBytes: pick((s) => s.jsHeapUsedBytes),
    domNodes: pick((s) => s.domNodes),
  };
  const git = (...args) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  const receipt = {
    format: "pd-ui-performance-v1",
    measuredAt: new Date().toISOString(),
    sourceRevision: git("rev-parse", "HEAD"),
    sourceDirty: Boolean(git("status", "--porcelain")),
    workload:
      "Production client build; 4 synthetic one-minute shifts (known, gap, bad-quality, counter-reset); admin; 1280x800; cold context per run; /production load then /operations, /wallboard, /production",
    runs,
    cpuSlowdown,
    host: {
      platform: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model ?? null,
      cpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      browser: browser.version(),
    },
    notMeasured: [
      "Live-update latency: the wallboard and operator views poll; a latency budget needs the D04 workload definition",
    ],
    medians: summary,
    samples,
  };
  await mkdir(".local/ui-performance", { recursive: true });
  const file = `.local/ui-performance/${receipt.measuredAt.replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ receipt: file, medians: summary }, null, 2));
});
