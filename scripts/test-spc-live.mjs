import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// Q01: after a restart the live SPC window is rebuilt from stored good samples only, so a
// CUSUM shift is signalled at the same sample as without the restart.
await dailyFixture(async ({ pool, users }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('SPC press','opc.tcp://127.0.0.1:49983','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const [{ id: profile }] = (
    await pool.query(
      "INSERT INTO spc_profiles(name,machine_id,node_key,method,window_size,mean,stddev,sensitivity) VALUES ('Pressure CUSUM',$1,'Pressure','cusum',30,10,1,3) RETURNING id",
      [machine],
    )
  ).rows;
  const t0 = Date.UTC(2026, 0, 1);
  const at = (i) => new Date(t0 + i * 1000);
  // Stored before the restart: 5 shifted samples behind a bad one, then 30 in control and
  // 4 shifted (C+ = 4). The shifted samples before the bad one must not count.
  const stored = [
    ...Array(5).fill([11.5, "Good"]),
    [null, "BadSensorFailure"],
    ...Array(30).fill([10, "Good"]),
    ...Array(4).fill([11.5, "Good"]),
  ];
  for (const [i, [value, status]] of stored.entries())
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Pressure',$2,$3,$4)",
      [machine, at(i), value, status],
    );

  const { spcRepository } = await import(
    "../server/dist/src/repositories/spcRepository.js"
  );
  const run = await spcRepository.recentGoodRun(machine, "Pressure", at(stored.length), 100);
  assert.equal(run.length, 34, "The run ends at the bad sample");
  assert.deepEqual(run.slice(-5).map((r) => r.value), [10, 11.5, 11.5, 11.5, 11.5]);

  // A freshly started process: the next shifted sample makes C+ = 5 (not above h = 5),
  // the one after makes C+ = 6 and signals.
  const { spcService } = await import("../server/dist/src/services/spcService.js");
  const alerts = async () =>
    (await pool.query("SELECT * FROM spc_alerts WHERE profile_id=$1", [profile])).rows;
  await spcService.evaluateDataPoint("Pressure", 11.5, machine, at(stored.length));
  assert.equal((await alerts()).length, 0);
  await spcService.evaluateDataPoint("Pressure", 11.5, machine, at(stored.length + 1));
  const [alert] = await alerts();
  assert.equal(alert.alert_type, "ucl_breach");
  assert.equal(alert.threshold, 5);
  // A reference window never silently learns from a fault: an overlapping alarm blocks
  // approval, and the product made in the window is recorded with the candidate.
  const [{ id: reference }] = (
    await pool.query(
      "INSERT INTO spc_profiles(name,machine_id,node_key,method,window_size,sensitivity) VALUES ('Reference',$1,'Reference','zscore',30,3) RETURNING id",
      [machine],
    )
  ).rows;
  const r0 = Date.UTC(2026, 0, 2);
  for (let i = 0; i < 120; i++)
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Reference',$2,$3,'Good')",
      [machine, new Date(r0 + i * 60000), 10 + (i % 3) * 0.1],
    );
  const window = {
    start: new Date(r0).toISOString(),
    end: new Date(r0 + 120 * 60000).toISOString(),
  };
  await pool.query(
    "INSERT INTO production_shifts(machine_id,name,timezone,start,\"end\",profile,job,runs,created_by) VALUES($1,'Reference shift','UTC',$2,$3,'{}',$4,'[]',$5)",
    [machine, window.start, window.end, JSON.stringify({ reference: "R-1", product: "Bracket A", target: null }), users.admin.id],
  );
  await pool.query(
    "INSERT INTO alert_history(machine_id,node_key,rule_name,message,severity,status,created_at,resolved_at) VALUES($1,'Reference','Owned fault','Fault inside window','high','resolved',$2,$3)",
    [machine, new Date(r0 + 30 * 60000), new Date(r0 + 40 * 60000)],
  );
  const { proposeBaseline, approveBaseline } = await import(
    "../server/dist/src/services/spcBaseline.js"
  );
  const candidate = await proposeBaseline(reference, window);
  assert.deepEqual(candidate.evidence.context, { alarms: 1, stops: 0, products: ["Bracket A"] });
  await assert.rejects(
    approveBaseline(candidate.id, 1, "Owned review"),
    /overlaps 1 alarms/,
  );
  console.log(JSON.stringify({ spcLive: "passed", reloadedSamples: run.length }));
});
