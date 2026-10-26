import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { statSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
assert.equal(
  process.env.PD_OWNED_CAPACITY_TEST,
  "true",
  "Only run within the disposable operations acceptance installation",
);
const { default: db } = await import("../server/dist/src/database/db.js");
const { default: manager } =
  await import("../server/dist/src/database/dbConnection.js");
const { machines, opcuaData } =
  await import("../server/dist/src/database/schema.js");
const { MeasurementSpool, toMeasurementRow } =
  await import("../server/dist/src/queue/measurementSpool.js");
const { trendingDataService } =
  await import("../server/dist/src/services/trendingDataService.js");
const { writeReportPdf } =
  await import("../server/dist/src/services/reportPdf.js");
const existing = await db.select().from(machines);
assert.equal(existing.length, 1);
assert.equal(
  existing[0].name,
  "Owned restore fixture",
  "Refusing a non-fixture installation",
);
const [machine] = await db
  .insert(machines)
  .values({
    name: "Owned capacity fixture",
    ip: "127.0.0.1",
    port: 1,
    endpointUrl: "opc.tcp://127.0.0.1:1/capacity-fixture",
    resourcePath: "",
    securityMode: "None",
    securityPolicy: "None",
    isActive: false,
  })
  .returning();
const file = "/app/server/data/capacity-fixture.sqlite",
  spool = new MeasurementSpool(file);
const tags = 100,
  seconds = 60,
  replayCount = tags * seconds,
  liveCount = 200;
const start = new Date("2026-01-01T00:00:00Z");
let peakRss = process.memoryUsage().rss;
const cpuStart = process.cpuUsage(),
  began = performance.now();
const memoryTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 10);
const sample = (i) => ({
  key: `Capacity${i % tags}`,
  label: "Owned capacity tag",
  timestamp: new Date(start.getTime() + Math.floor(i / tags) * 1000),
  receivedAt: new Date().toISOString(),
  value: i,
  machineId: machine.id,
  statusCode: i % 97 === 0 ? "Uncertain" : "Good",
  dataType: "Double",
  sourceTimestamp: null,
});
try {
  const enqueueStart = performance.now();
  for (let i = 0; i < replayCount; i++) spool.enqueue(sample(i));
  const enqueueMs = performance.now() - enqueueStart;
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const spoolBytes = [file, file + "-wal", file + "-shm"]
    .filter(existsSync)
    .reduce((bytes, path) => bytes + statSync(path).size, 0);
  let received = 0,
    persisted = 0;
  const latencies = [];
  const liveLags = [],
    persistedLags = [];
  const live = async () => {
    for (let i = 0; i < liveCount; i++) {
      spool.enqueue(sample(replayCount + i));
      received++;
      await delay(2);
    }
  };
  const replay = async () => {
    while (received < liveCount || spool.count() > 0) {
      const batch = spool.peek(500);
      if (!batch.length) {
        await delay(2);
        continue;
      }
      await db
        .insert(opcuaData)
        .values(batch.map(toMeasurementRow))
        .onConflictDoNothing();
      for (const entry of batch) {
        const lag = Date.now() - Date.parse(entry.data.receivedAt);
        persistedLags.push(lag);
        if (
          Date.parse(entry.data.timestamp) >=
          start.getTime() + seconds * 1000
        )
          liveLags.push(lag);
      }
      spool.acknowledge(batch);
      persisted += batch.length;
    }
  };
  const query = async () => {
    for (let i = 0; i < 5; i++) {
      const then = performance.now();
      const result = await trendingDataService.queryTrendingData({
        machineId: machine.id,
        nodeKeys: Array.from({ length: 10 }, (_, tag) => `Capacity${tag}`),
        startDate: start,
        endDate: new Date(start.getTime() + 120000),
      });
      assert.ok(result.series.length <= 10);
      latencies.push(performance.now() - then);
      await delay(5);
    }
  };
  const replayStart = performance.now();
  const results = await Promise.allSettled([
    live(),
    replay(),
    ...Array.from({ length: 10 }, query),
    writeReportPdf("/app/server/reports/capacity-fixture.pdf", {
      title: "Concurrent capacity export",
      generatedAt: new Date(),
      period: "Owned fixture",
      sections: [
        {
          title: "Samples",
          table: {
            headers: ["Tag", "Value"],
            widths: [100, 411],
            rows: Array.from({ length: 1000 }, (_, i) => [
              String(i % tags),
              String(i),
            ]),
          },
        },
      ],
    }),
  ]);
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  const replayMs = performance.now() - replayStart;
  assert.equal(persisted, replayCount + liveCount);
  assert.equal(spool.count(), 0);
  const count = await manager.pool.query(
    "SELECT count(*)::int AS count, count(*) FILTER (WHERE status_code='Uncertain' AND value IS NULL)::int AS unknown FROM opcua_data WHERE machine_id=$1",
    [machine.id],
  );
  assert.equal(count.rows[0].count, replayCount + liveCount);
  assert.ok(count.rows[0].unknown > 0);
  const database = await manager.pool.query(
    "SELECT pg_database_size(current_database())::float AS bytes, pg_total_relation_size('opcua_data')::float AS measurement_bytes",
  );
  latencies.sort((a, b) => a - b);
  persistedLags.sort((a, b) => a - b);
  liveLags.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      format: "capacity-fixture-v1",
      platform: process.platform,
      node: process.version,
      cpu: cpus()[0]?.model,
      visibleCpuCount: cpus().length,
      visibleHostMemoryBytes: totalmem(),
      profile: {
        tags,
        recordedSeconds: seconds,
        simulatedHz: 1,
        replayCount,
        concurrentLiveSamples: liveCount,
        queryClients: 10,
        queries: latencies.length,
        exportRows: 1000,
      },
      enqueueMs,
      replayMs,
      elapsedMs: performance.now() - began,
      queryP95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
      cpuMicroseconds: process.cpuUsage(cpuStart),
      peakRssBytes: peakRss,
      spoolBytes,
      database: database.rows[0],
      persistedLagP95Ms:
        persistedLags[Math.ceil(persistedLags.length * 0.95) - 1],
      liveLagP95Ms: liveLags[Math.ceil(liveLags.length * 0.95) - 1],
      databaseBytesPerSample: database.rows[0].measurement_bytes / persisted,
      persisted,
      unknownPreserved: count.rows[0].unknown,
      limits:
        "Synthetic spool/database burst; excludes PLC/network latency, alarm evaluation and sustained customer load. Not a hardware capacity claim.",
    }),
  );
} finally {
  clearInterval(memoryTimer);
  spool.close();
  await manager.end();
}
