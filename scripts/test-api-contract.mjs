import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";
import { integrationClient } from "./examples/integration-client.mjs";

// I02: the documented integration endpoints (docs/INTEGRATION_API.md), exercised by the
// published example client: shapes, quality, scopes, bounds, errors and rate-limit headers.
const isIso = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const errorBody = (body, code) => {
  assert.equal(body.status, "error");
  assert.equal(body.code, code);
  assert.equal(typeof body.error, "string");
  assert.equal(typeof body.requestId, "string");
};

await dailyFixture(async ({ pool, users, api, password }) => {
  const [granted, other] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Contract press','opc.tcp://127.0.0.1:49995','127.0.0.1',false),('Ungranted press','opc.tcp://127.0.0.1:49996','127.0.0.1',false) RETURNING id",
    )
  ).rows.map((row) => row.id);
  for (const role of ["viewer", "supervisor"])
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users[role].id, granted],
    );
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000 - 3600000);
  const at = (minutes) => new Date(hour.getTime() + minutes * 60000);
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at) VALUES ($1,'Pressure',$2,4,'4','Good',$2),($1,'Pressure',$3,8,'8','Good',$3),($1,'Pressure',$4,NULL,'99','BadSensorFailure',$4)",
    [granted, at(5), at(10), at(15)],
  );

  const viewer = await integrationClient({
    api: api + "/api/v1",
    username: "viewer",
    password,
  });
  assert.deepEqual(
    (await viewer.assets()).map((asset) => asset.id),
    [granted],
    "Only granted machines are listed",
  );
  const [asset] = await viewer.assets();
  assert.deepEqual(Object.keys(asset).sort(), ["id", "name", "status"]);

  const start = hour.toISOString(),
    end = new Date(hour.getTime() + 3600000).toISOString();
  const [summary] = await viewer.summaries(granted, "Pressure", start, end);
  assert.equal(new Date(summary.bucket).toISOString(), start);
  assert.equal(summary.samples, 3);
  assert.equal(summary.good, 2);
  assert.equal(summary.min, 4);
  assert.equal(summary.max, 8);
  // A bad sample makes the hour incomplete: no average is invented.
  assert.equal(summary.average, null);
  assert.equal(summary.continuity, "unverified");

  const replay = await viewer.replay(granted, ["Pressure"], start, end);
  assert.equal(replay.revision, "incident-replay-v1");
  assert.equal(replay.machine.id, granted);
  const samples = replay.signals[0].samples;
  assert.equal(samples.length, 3);
  assert.equal(replay.signals[0].truncated, false);
  for (const sample of samples) {
    assert.ok(isIso(sample.at));
    assert.equal(typeof sample.quality, "string");
  }
  assert.deepEqual(
    samples.map((s) => [s.value, s.raw, s.quality]),
    [
      [4, 4, "Good"],
      [8, 8, "Good"],
      [null, 99, "BadSensorFailure"],
    ],
  );

  // Errors share one shape; scopes and bounds are enforced.
  const failure = async (call, status, code) => {
    const error = await call().then(
      () => assert.fail("Expected an error"),
      (e) => e,
    );
    assert.equal(error.status, status, error.message);
    errorBody(error.body, code);
  };
  await failure(() => viewer.summaries(other, "Pressure", start, end), 403, "FORBIDDEN");
  await failure(() => viewer.replay(other, ["Pressure"], start, end), 403, "FORBIDDEN");
  await failure(() => viewer.completions(granted), 403, "FORBIDDEN");
  await failure(
    () =>
      viewer.replay(
        granted,
        ["Pressure"],
        start,
        new Date(hour.getTime() + 49 * 3600000).toISOString(),
      ),
    400,
    "VALIDATION_ERROR",
  );
  await failure(
    () =>
      viewer.replay(
        granted,
        Array.from({ length: 9 }, (_, i) => `K${i}`),
        start,
        end,
      ),
    400,
    "VALIDATION_ERROR",
  );
  await failure(
    () =>
      viewer.summaries(
        granted,
        "Pressure",
        start,
        new Date(hour.getTime() + 367 * 86400000).toISOString(),
      ),
    400,
    "VALIDATION_ERROR",
  );
  const anonymous = await fetch(api + "/api/v1/production/assets");
  assert.equal(anonymous.status, 401);
  errorBody(await anonymous.json(), "UNAUTHORIZED");
  assert.ok(anonymous.headers.get("ratelimit-limit"), "Rate-limit headers");
  assert.ok(anonymous.headers.get("ratelimit-remaining"));

  const supervisor = await integrationClient({
    api: api + "/api/v1",
    username: "supervisor",
    password,
  });
  const completions = await supervisor.completions(granted);
  assert.equal(completions.version, "work-order-completions-v1");
  assert.equal(completions.machineId, granted);
  assert.ok(isIso(completions.generatedAt));
  assert.ok(Array.isArray(completions.rows));
  assert.equal(completions.truncated, false);
  console.log(
    JSON.stringify({
      apiContract: "passed",
      endpoints: ["assets", "summaries", "replay", "completions"],
    }),
  );
});
