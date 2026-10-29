import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// A08: replayed samples are judged by the rule version in force when they were received.
await dailyFixture(async ({ pool }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Replay press','opc.tcp://127.0.0.1:49993','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const t0 = new Date(Date.now() - 3 * 3_600_000),
    t1 = new Date(Date.now() - 3_600_000);
  // Plain SQL on purpose: the trigger, not application code, must record every version.
  const [rule] = (
    await pool.query(
      "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold,severity,cooldown_seconds,created_at,updated_at) VALUES ('Replay pressure',$1,'Pressure','gt',10,'high',0,$2,$2) RETURNING *",
      [machine, t0],
    )
  ).rows;
  await pool.query(
    "UPDATE alert_rules SET threshold=100, updated_at=$2 WHERE id=$1",
    [rule.id, t1],
  );
  const versions = (
    await pool.query(
      "SELECT effective_at, rule->>'threshold' AS threshold FROM alert_rule_versions WHERE rule_id=$1 ORDER BY effective_at,id",
      [rule.id],
    )
  ).rows;
  assert.deepEqual(
    versions.map((v) => [v.effective_at.toISOString(), Number(v.threshold)]),
    [
      [t0.toISOString(), 10],
      [t1.toISOString(), 100],
    ],
  );

  const { AlarmEvaluator } = await import(
    "../server/dist/src/services/alarmService.js"
  );
  const evaluator = new AlarmEvaluator();
  await evaluator.loadRules();
  const sample = (at, value) => ({
    id: randomUUID(),
    data: {
      machineId: machine,
      key: "Pressure",
      label: "Pressure",
      timestamp: at,
      receivedAt: at,
      sourceTimestamp: at,
      value,
      statusCode: "Good",
    },
  });
  const incidents = async () =>
    (
      await pool.query(
        "SELECT * FROM alert_history WHERE rule_id=$1 ORDER BY id",
        [rule.id],
      )
    ).rows;

  // Received before the rule existed: never evaluated.
  await evaluator.evaluate(sample(new Date(t0.getTime() - 60_000), 500));
  assert.equal((await incidents()).length, 0);
  // Received under threshold 10 but replayed after the edit: the old version triggers.
  await evaluator.evaluate(sample(new Date(t0.getTime() + 60_000), 50));
  const [replayed] = await incidents();
  assert.equal(replayed.threshold, 10);
  assert.equal(replayed.metadata.ruleVersion, t0.toISOString());
  assert.equal(replayed.created_at.getTime(), t0.getTime() + 60_000);
  // Received under threshold 100: the current version clears it.
  await evaluator.evaluate(sample(new Date(t1.getTime() + 60_000), 50));
  const [cleared] = await incidents();
  assert.equal(cleared.status, "resolved");
  assert.equal((await incidents()).length, 1, "No duplicate incident on replay");
  console.log(
    JSON.stringify({
      alarmReplay: "passed",
      versionsRecordedByTrigger: versions.length,
    }),
  );
});
