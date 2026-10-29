import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { dailyFixture } from "./daily-fixture.mjs";

// H06: time the real history endpoints on a sustained synthetic dataset and record which
// opcua_data indexes they use. Evidence for index decisions, not a capacity promise.
//   BENCH_MACHINES=10 BENCH_TAGS=10 BENCH_INTERVAL_S=10 BENCH_DAYS=6 node scripts/benchmark-history.mjs
const machines = Number(process.env.BENCH_MACHINES ?? 10),
  tags = Number(process.env.BENCH_TAGS ?? 10),
  intervalSeconds = Number(process.env.BENCH_INTERVAL_S ?? 10),
  days = Number(process.env.BENCH_DAYS ?? 6),
  runs = Number(process.env.BENCH_RUNS ?? 20);

await dailyFixture(async ({ pool, call }) => {
  const ids = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) SELECT 'Bench '||m,'opc.tcp://127.0.0.1:'||(50000+m),'127.0.0.1',false FROM generate_series(1,$1) m RETURNING id",
      [machines],
    )
  ).rows.map((r) => r.id);
  const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const start = new Date(end.getTime() - days * 86400000);
  const loadStarted = Date.now();
  // Every 50th sample is bad so quality coverage is part of each rollup.
  for (const id of ids)
    await pool.query(
      `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at)
       SELECT $1,'T'||t,ts,CASE WHEN n%50=0 THEN NULL ELSE (n%1000)::real END,to_jsonb(n%1000),
         CASE WHEN n%50=0 THEN 'BadSensorFailure' ELSE 'Good' END,ts
       FROM generate_series(0,$2-1) t,
         generate_series($3::timestamptz,$4::timestamptz-make_interval(secs=>$5),make_interval(secs=>$5)) WITH ORDINALITY AS g(ts,n)`,
      [id, tags, start, end, intervalSeconds],
    );
  // Serial vacuum: the local test container may keep Docker's 64 MB /dev/shm.
  await pool.query("VACUUM (ANALYZE, PARALLEL 0) opcua_data");
  const loadSeconds = (Date.now() - loadStarted) / 1000;
  const [{ rows: rowCount }] = (
    await pool.query("SELECT count(*)::bigint AS rows FROM opcua_data")
  ).rows;
  const sizes = (
    await pool.query(
      `SELECT pg_size_pretty(pg_relation_size('opcua_data')) AS heap,
        (SELECT json_object_agg(indexrelname, pg_size_pretty(pg_relation_size(indexrelid)))
         FROM pg_stat_user_indexes WHERE relname='opcua_data') AS indexes`,
    )
  ).rows[0];

  const usage = async () => {
    // Idle backends flush statistics up to 10 seconds later (PGSTAT_IDLE_INTERVAL).
    await new Promise((resolve) => setTimeout(resolve, 11000));
    await pool.query("SELECT pg_stat_clear_snapshot()");
    const { rows } = await pool.query(
      `SELECT indexrelname AS name, idx_scan::bigint AS scans FROM pg_stat_user_indexes WHERE relname='opcua_data'
       UNION ALL SELECT 'seq_scan', seq_scan::bigint FROM pg_stat_user_tables WHERE relname='opcua_data'`,
    );
    return Object.fromEntries(rows.map((r) => [r.name, Number(r.scans)]));
  };
  const machine = ids[0];
  const iso = (ms) => new Date(end.getTime() - ms).toISOString();
  const endpoints = {
    "history summaries, 6 days hourly": `/api/v1/history/${machine}/summaries?nodeKey=T0&start=${iso(days * 86400000)}&end=${end.toISOString()}`,
    "incident replay, 48 hours, 2 tags": `/api/v1/production/replay/${machine}?start=${iso(48 * 3600000)}&end=${end.toISOString()}&keys=T0&keys=T1`,
    "trend, 24 hours, 2 tags, 60 s buckets": `/api/v1/trending/data?machineId=${machine}&nodeKeys=T0,T1&startDate=${iso(86400000)}&endDate=${end.toISOString()}&downsampleBucketSeconds=60`,
    "aggregates, 6 days hourly": `/api/v1/aggregates?nodeKey=T0&machineId=${machine}&resolution=hourly&start=${iso(days * 86400000)}&end=${end.toISOString()}`,
    "latest value, one tag": `/api/v1/node-data?nodeKey=T0&machineId=${machine}&latest=true`,
  };
  const results = {};
  for (const [name, path] of Object.entries(endpoints)) {
    const before = await usage();
    const timings = [];
    for (let i = 0; i < runs; i++) {
      const started = performance.now();
      const response = await call("admin", "GET", path);
      assert.equal(response.status(), 200, `${name}: ${await response.text()}`);
      await response.body();
      timings.push(performance.now() - started);
    }
    const after = await usage();
    timings.sort((a, b) => a - b);
    results[name] = {
      p50Ms: Math.round(timings[Math.floor(runs / 2)]),
      p95Ms: Math.round(timings[Math.floor(runs * 0.95)]),
      scansPerRequest: Object.fromEntries(
        Object.entries(after)
          .map(([k, v]) => [k, (v - (before[k] ?? 0)) / runs])
          .filter(([, v]) => v > 0),
      ),
    };
  }
  const evidence = {
    benchmark: "history-indexes-v1",
    recordedAt: new Date().toISOString(),
    host: { node: process.version, cpus: cpus().length, memoryGiB: +(totalmem() / 2 ** 30).toFixed(1) },
    postgres: (await pool.query("SHOW server_version")).rows[0].server_version,
    dataset: { machines, tags, intervalSeconds, days, rows: Number(rowCount), badEvery: 50, loadSeconds },
    sizes,
    runsPerEndpoint: runs,
    results,
    exclusions:
      "Synthetic regular samples on one host with a warm cache; no concurrent ingestion, PLC latency or browser rendering",
  };
  await writeFile(
    ".local/daily-evidence/history-benchmark.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
});
