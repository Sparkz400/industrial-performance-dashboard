import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// H06: retention keeps state durations and counter increments of commissioned production
// signals, so they equal the shift-report calculation on the raw readings it removed.
await dailyFixture(async ({ pool, call, users }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Rollup press','opc.tcp://127.0.0.1:49992','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [
    users.viewer.id,
    machine,
  ]);
  const signal = (nodeKey) => ({ nodeKey, namespaceUri: "urn:fixture", identifier: `s=${nodeKey}`, dataType: "Double", unit: null, scale: 1 });
  const profile = {
    version: 1,
    name: "Rollup profile",
    endpointModel: "fixture",
    signals: { state: signal("State"), total: signal("Count") },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000,
    maxGapSeconds: 120,
    counterPolicy: "reset-to-zero",
  };
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by,created_at) VALUES($1,$2,$3,'2025-12-31T00:00:00Z')",
    [machine, profile, users.admin.id],
  );
  // 6,000 state readings at 1 s (two retention batches): blocks of 100 running/idle/fault,
  // one bad reading, then a 10-minute gap and a final reading.
  await pool.query(
    `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code)
     SELECT $1,'State','2026-01-01T00:30:00Z'::timestamptz + i*interval '1 second',
       CASE WHEN i=4000 THEN NULL ELSE ((i/100)%3) END,
       CASE WHEN i=4000 THEN 'BadSensorFailure' ELSE 'Good' END
     FROM generate_series(0,5999) i`,
    [machine],
  );
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'State','2026-01-01T02:20:00.123456Z',1,'Good')",
    [machine],
  );
  // Counter: increments, a reset to zero, a reading after a gap, a microsecond timestamp.
  for (const [at, value] of [
    ["2026-01-01T00:59:00Z", 100],
    ["2026-01-01T01:00:30Z", 130],
    ["2026-01-01T01:01:30Z", 4],
    ["2026-01-01T01:02:30.654321Z", 20],
    ["2026-01-01T01:30:00Z", 25],
  ])
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Count',$2,$3,'Good')",
      [machine, at, value],
    );

  // Expected values from the shift-report functions on the raw readings.
  const { stateTimeline, counterDeltas } = await import(
    "../server/dist/src/services/shiftCalculation.js"
  );
  const raw = async (key) =>
    (
      await pool.query(
        "SELECT timestamp,value,status_code FROM opcua_data WHERE machine_id=$1 AND node_key=$2 ORDER BY timestamp,id",
        [machine, key],
      )
    ).rows.map((r) => ({ timestamp: r.timestamp, value: r.value, statusCode: r.status_code }));
  const states = await raw("State");
  const timeline = stateTimeline(
    states,
    profile,
    states[0].timestamp,
    new Date(states.at(-1).timestamp.getTime() + 120000),
  );
  const expectedSeconds = {};
  for (const i of timeline)
    if (i.state !== "unknown")
      expectedSeconds[i.state] =
        (expectedSeconds[i.state] ?? 0) + (Date.parse(i.end) - Date.parse(i.start)) / 1000;
  const counts = await raw("Count");
  const expectedCount = counterDeltas(counts, profile, 1, counts[0].timestamp, counts.at(-1).timestamp).count;
  assert.equal(expectedCount, 30 + 4 + 16); // the 27-minute pair exceeds the 2-minute gap

  // Retention through the reviewed API, as an administrator would run it.
  assert.equal((await call("admin", "PUT", `/api/v1/history/${machine}/policy`, { days: 30 })).status(), 200);
  const preview = await (await call("admin", "POST", `/api/v1/history/${machine}/preview`)).json();
  assert.equal(preview.rows, 6006);
  let result;
  let applies = 0;
  do {
    const response = await call("admin", "POST", `/api/v1/history/${machine}/apply`, {
      previewId: preview.id,
      confirmRows: preview.rows,
    });
    assert.equal(response.status(), 200, await response.text());
    result = await response.json();
    applies++;
  } while (!result.completed);
  assert.equal(applies, 2, "Two batches of at most 5,000");
  assert.equal(result.deleted, 6006, "Microsecond timestamps are removed too");
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM opcua_data WHERE machine_id=$1", [machine])).rows[0].n,
    0,
  );

  const summaries = async (key) => {
    const response = await call(
        "viewer",
        "GET",
        `/api/v1/history/${machine}/summaries?nodeKey=${key}&start=2026-01-01T00:00:00Z&end=2026-01-01T04:00:00Z`,
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const kept = {};
  for (const row of await summaries("State"))
    for (const [state, seconds] of Object.entries(row.retained_state_seconds ?? {}))
      kept[state] = (kept[state] ?? 0) + seconds;
  for (const state of Object.keys(expectedSeconds))
    assert.ok(Math.abs(kept[state] - expectedSeconds[state]) < 1e-6, `${state}: ${kept[state]} vs ${expectedSeconds[state]}`);
  assert.deepEqual(Object.keys(kept).sort(), Object.keys(expectedSeconds).sort());
  const countRows = await summaries("Count");
  assert.equal(countRows.reduce((n, r) => n + (r.retained_increment ?? 0), 0), expectedCount);
  assert.equal(countRows.reduce((n, r) => n + (r.retained_unknown_pairs ?? 0), 0), 1);
  // Averages of a counter are still withheld where readings are not all good.
  console.log(JSON.stringify({ historyRollups: "passed", states: kept, increment: expectedCount }));
});
