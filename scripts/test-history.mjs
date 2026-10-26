import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, users, actors, api, expect }) => {
  const machine = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('History fixture','opc.tcp://127.0.0.1:49620','127.0.0.1') RETURNING id",
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
    [users.viewer.id, machine],
  );
  await pool.query(
    `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at)
    SELECT $1,'Count','2026-01-01'::timestamptz + i*interval '1 second',i,to_jsonb(i),CASE WHEN i%10=0 THEN 'Bad' ELSE 'Good' END,now() FROM generate_series(0,199999) i`,
    [machine],
  );
  const path = `/api/v1/trending/export-csv?machineId=${machine}&nodeKeys=Count&startDate=2026-01-01T00:00:00Z&endDate=2026-01-04T00:00:00Z`;
  const controller = new AbortController();
  const interrupted = await fetch(api + path, {
    signal: controller.signal,
    headers: {
      Cookie: (await actors.viewer.cookies(api))
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    },
  });
  assert.equal(interrupted.status, 200);
  const reader = interrupted.body.getReader();
  assert.equal((await reader.read()).done, false);
  controller.abort();
  await reader.cancel().catch(() => undefined);
  await expect
    .poll(
      async () =>
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE 'FETCH FORWARD%' AND state<>'idle'",
          )
        ).rows[0].n,
    )
    .toBe(0);
  const started = Date.now();
  const exporting = call("viewer", "GET", path);
  const latencies = [];
  let ingested = 0;
  const loadUntil = Date.now() + 60000;
  while (Date.now() < loadUntil) {
    const start = Date.now();
    const response = await call(
      "viewer",
      "GET",
      `/api/v1/trending/data?machineId=${machine}&nodeKeys=Count&startDate=2026-01-01T00:00:00Z&endDate=2026-01-04T00:00:00Z`,
    );
    assert.equal(response.status(), 200, await response.text());
    latencies.push(Date.now() - start);
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,received_at) VALUES($1,'Count',now(),1,'Good',now())",
      [machine],
    );
    ingested++;
  }
  const response = await exporting;
  assert.equal(response.status(), 200, await response.text());
  const csv = await response.text();
  assert.equal(csv.trim().split("\n").length, 200001);
  assert.match(csv, /"Bad"/);
  assert.match(csv, /rawValue,statusCode/);
  const aggregate = await call(
    "viewer",
    "GET",
    path + "&downsampleBucketSeconds=3600&aggregation=avg",
  );
  assert.equal(aggregate.status(), 200, await aggregate.text());
  const aggregateCsv = await aggregate.text();
  assert.match(aggregateCsv, /sampleCount,goodSampleCount/);
  assert.match(aggregateCsv, /"MixedOrBad"/);
  assert.equal(aggregateCsv.trim().split("\n").length, 57);
  const last = await call(
    "viewer",
    "GET",
    `/api/v1/trending/export-csv?machineId=${machine}&nodeKeys=Count&startDate=2026-01-01T00:00:01Z&endDate=2026-01-01T00:00:02Z&downsampleBucketSeconds=60&aggregation=last`,
  );
  assert.equal(last.status(), 200, await last.text());
  assert.match(await last.text(), /"Count","2","2","2","Good"/);
  assert.equal(
    (
      await call("viewer", "PUT", `/api/v1/history/${machine}/policy`, {
        days: 30,
      })
    ).status(),
    403,
  );
  const save = await call("admin", "PUT", `/api/v1/history/${machine}/policy`, {
    days: 30,
  });
  assert.equal(save.status(), 200, await save.text());
  const oldPreview = await (
    await call("admin", "POST", `/api/v1/history/${machine}/preview`)
  ).json();
  await call("admin", "PUT", `/api/v1/history/${machine}/policy`, { days: 31 });
  assert.equal(
    (
      await call("admin", "POST", `/api/v1/history/${machine}/apply`, {
        previewId: oldPreview.id,
        confirmRows: oldPreview.rows,
      })
    ).status(),
    400,
  );
  const preview = await (
    await call("admin", "POST", `/api/v1/history/${machine}/preview`)
  ).json();
  assert.equal(preview.rows, 200000);
  // A late arrival is newer than the reviewed ID boundary and must survive.
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Count','2026-01-02',999999,'Good')",
    [machine],
  );
  let result;
  do {
    const response = await call(
      "admin",
      "POST",
      `/api/v1/history/${machine}/apply`,
      { previewId: preview.id, confirmRows: preview.rows },
    );
    assert.equal(response.status(), 200, await response.text());
    result = await response.json();
  } while (!result.completed);
  assert.equal(result.deleted, 200000);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM opcua_data WHERE machine_id=$1",
        [machine],
      )
    ).rows[0].n,
    1 + ingested,
  );
  const totals = (
    await pool.query(
      "SELECT sum(samples)::int AS n,sum(good)::int AS good FROM history_summaries WHERE machine_id=$1",
      [machine],
    )
  ).rows[0];
  assert.equal(totals.n, 200000);
  assert.equal(totals.good, 180000);
  const summaries = await call(
    "viewer",
    "GET",
    `/api/v1/history/${machine}/summaries?nodeKey=Count&start=2026-01-01&end=2026-01-04`,
  );
  assert.equal(summaries.status(), 200);
  assert.equal((await summaries.json())[0].average, null);
  const metrics = {
    rows: 200000,
    concurrentHistoryRequests: latencies.length,
    concurrentIngestedRows: ingested,
    elapsedMs: Date.now() - started,
    p95Ms: latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)],
    retainedGoodSamples: totals.good,
  };
  await writeFile(
    ".local/daily-evidence/history-load.json",
    JSON.stringify(metrics, null, 2),
  );
  console.log(
    "PASS: complete streamed export, concurrent queries, policy revision guard, bounded retention, late arrivals and quality-preserving summaries",
    metrics,
  );
});
