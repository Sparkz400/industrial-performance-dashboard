import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

// H09: a record PostgreSQL refuses (here a NUL character, common in fixed-length PLC
// strings) is quarantined on the collector instead of blocking every later sample,
// and administrators export or retry it in the browser with audit evidence.
await dailyFixture(async ({ pool, actors, frontend, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Quarantine press','opc.tcp://127.0.0.1:49997','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const { default: worker } = await import(
    "../server/dist/src/queue/opcuaQueueWorker.js"
  );
  const sample = (key, value) => ({
    key,
    label: key,
    timestamp: new Date(),
    value,
    statusCode: "Good",
    machineId: machine,
  });
  worker.enqueue(sample("Count", 7));
  worker.enqueue(sample("Recipe", "PART-7\u0000\u0000"));
  worker.enqueue(sample("Count", 8));
  await worker.processBatch();
  const stored = (
    await pool.query(
      "SELECT node_key, value FROM opcua_data WHERE machine_id=$1 ORDER BY id",
      [machine],
    )
  ).rows;
  assert.deepEqual(
    stored.map((r) => [r.node_key, r.value]),
    [
      ["Count", 7],
      ["Count", 8],
    ],
  );
  assert.deepEqual(
    [worker.getHealth().pendingMeasurements, worker.getHealth().quarantinedMeasurements],
    [0, 1],
  );
  assert.equal(worker.getHealth().writeFailure, null);

  const { healthIncidentService } = await import(
    "../server/dist/src/services/healthIncidentService.js"
  );
  const incident = async () =>
    (
      await pool.query(
        "SELECT * FROM alert_history WHERE metadata->>'healthKey'='collector-quarantine' ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
  await healthIncidentService.check();
  assert.equal((await incident()).resolved_at, null);

  const page = await actors.admin.newPage();
  await page.goto(`${frontend}/production`);
  await expect(
    page.getByText(/Quarantined \(refused by the database\): 1/),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export quarantined" }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), "utf8"));
  assert.equal(exported.format, "measurement-quarantine-v1");
  assert.equal(exported.entries[0].data.value, "PART-7\u0000\u0000");
  assert.match(exported.entries[0].reason, /Unicode|0x00|null character/i);

  await page.getByRole("button", { name: "Retry quarantined" }).click();
  await expect(page.getByText(/Quarantined \(refused/)).toHaveCount(0);
  assert.deepEqual(
    [worker.getHealth().pendingMeasurements, worker.getHealth().quarantinedMeasurements],
    [1, 0],
  );
  // Still refused: it returns to quarantine instead of stalling the queue.
  worker.enqueue(sample("Count", 9));
  await worker.processBatch();
  assert.deepEqual(
    [worker.getHealth().pendingMeasurements, worker.getHealth().quarantinedMeasurements],
    [0, 1],
  );
  const actions = (
    await pool.query(
      "SELECT action, username FROM audit_logs WHERE entity_type='measurement_quarantine' ORDER BY id",
    )
  ).rows;
  assert.deepEqual(actions, [
    { action: "collector.quarantine.exported", username: "admin" },
    { action: "collector.quarantine.requeued", username: "admin" },
  ]);
  await healthIncidentService.stop();
  console.log(
    JSON.stringify({
      spoolQuarantine: "passed",
      stored: stored.length + 1,
      quarantined: worker.getHealth().quarantinedMeasurements,
    }),
  );
});
