import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";
process.env.COMPLIANCE_MODE_ENABLED = "true";
process.env.VITE_COMPLIANCE_MODE_ENABLED = "true";

await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const request = async (method, path, body, status = 200) => {
    const r = await call("admin", method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const m = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Quality fixture','opc.tcp://127.0.0.1:49999','127.0.0.1'),('Line fixture','opc.tcp://127.0.0.1:49998','127.0.0.1') RETURNING id",
    )
  ).rows.map((r) => r.id);
  const recipe = (
    await pool.query(
      "INSERT INTO recipes(name,parameters,setpoints) VALUES('Frozen fixture',$1,'{}') RETURNING id",
      [
        JSON.stringify([
          {
            nodeKey: "Pressure",
            displayName: "Pressure",
            targetValue: 0,
            tolerance: 1,
          },
          {
            nodeKey: "Missing",
            displayName: "Missing",
            targetValue: 0,
            tolerance: 1,
          },
        ]),
      ],
    )
  ).rows[0].id;
  const batch = await request(
    "POST",
    "/batches",
    { batchNumber: "Quality fixture batch", recipeId: recipe, machineId: m[0] },
    201,
  );
  await pool.query("UPDATE recipes SET parameters='[]',version=2 WHERE id=$1", [
    recipe,
  ]);
  await pool.query(
    "UPDATE batches SET started_at='2026-01-01',completed_at='2026-01-02',status='completed' WHERE id=$1",
    [batch.id],
  );
  await pool.query(
    `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code) VALUES
 ($1,'Pressure','2026-01-01',0,'0','Good'),($1,'Pressure','2026-01-01 01:00Z',900,'900','Bad'),($1,'Pressure','2026-01-02',999,'999','Good')`,
    [m[0]],
  );
  const summary = await request("POST", `/batches/${batch.id}/summary`, {});
  assert.equal(summary.overallCompliance, null);
  assert.equal(summary.parameterResults[0].actualAvg, 0);
  assert.equal(summary.parameterResults[0].excludedCount, 1);
  assert.equal(summary.parameterResults[1].actualAvg, null);
  const data = await request("GET", `/batches/${batch.id}/data`);
  assert.equal(data[0].dataPoints.length, 2);
  assert.equal(data[0].dataPoints[1].value, null);
  assert.equal(data[0].dataPoints[1].rawValue, 900);
  assert.equal(data[0].targetValue, 0);
  assert.equal(data[0].tolerance, 1);
  const inspection = {
    requestId: randomUUID(),
    check: "Seal",
    result: "fail",
    quantity: 2,
    defectReason: "Leak",
  };
  const failed = await request(
    "POST",
    `/quality/batches/${batch.id}/inspections`,
    inspection,
    201,
  );
  assert.equal(
    (
      await request(
        "POST",
        `/quality/batches/${batch.id}/inspections`,
        inspection,
        201,
      )
    ).id,
    failed.id,
  );
  await request(
    "POST",
    `/quality/batches/${batch.id}/inspections`,
    { ...inspection, quantity: 3 },
    409,
  );
  const rework = await request(
    "POST",
    `/quality/batches/${batch.id}/rework`,
    {
      inspectionId: failed.id,
      ownerId: users.admin.id,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      action: "Replace seal",
    },
    201,
  );
  await request(
    "POST",
    `/quality/rework/${rework.id}/complete`,
    { inspectionId: failed.id, note: "Cannot close failed inspection" },
    400,
  );
  const passed = await request(
    "POST",
    `/quality/batches/${batch.id}/inspections`,
    { requestId: randomUUID(), check: "Seal", result: "pass", quantity: 2 },
    201,
  );
  await request("POST", `/quality/rework/${rework.id}/complete`, {
    inspectionId: passed.id,
    note: "Rechecked both pieces",
  });
  await request(
    "POST",
    `/quality/batches/${batch.id}/lots`,
    { lot: "L-1", direction: "output", quantity: 5, unit: "pieces" },
    201,
  );
  const next = await request(
    "POST",
    "/batches",
    { batchNumber: "Next fixture batch", recipeId: recipe, machineId: m[1] },
    201,
  );
  await request(
    "POST",
    `/quality/batches/${next.id}/lots`,
    { lot: "L-1", direction: "input", quantity: 6, unit: "pieces" },
    400,
  );
  await request(
    "POST",
    `/quality/batches/${next.id}/lots`,
    { lot: "L-1", direction: "input", quantity: 5, unit: "pieces" },
    201,
  );
  assert.equal(
    (await request("GET", `/quality/batches/${next.id}/trace`)).links.length,
    2,
  );
  await request(
    "POST",
    `/quality/batches/${next.id}/lots`,
    { lot: "L-2", direction: "output", quantity: 5, unit: "pieces" },
    201,
  );
  await request(
    "POST",
    `/quality/batches/${batch.id}/lots`,
    { lot: "L-2", direction: "input", quantity: 1, unit: "pieces" },
    409,
  );
  const spc = await request(
    "POST",
    "/spc/profiles",
    {
      name: "Reference fixture",
      machineId: m[0],
      nodeKey: "Reference",
      method: "std_bands",
    },
    201,
  );
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) SELECT $1,'Reference',now()-interval '1 hour'+i*interval '1 second',CASE WHEN i%2=0 THEN 9 ELSE 11 END,'Good' FROM generate_series(1,100)i",
    [m[0]],
  );
  const candidate = await request(
    "POST",
    `/spc/profiles/${spc.id}/compute`,
    {},
  );
  await request(
    "GET",
    `/spc/profiles/${spc.id}/capability?lsl=5&usl=15`,
    undefined,
    400,
  );
  await request("POST", `/spc/baselines/${candidate.id}/approve`, {
    review: "Synthetic API acceptance fixture; not a real process approval",
    stableProcess: true,
    independentNormalObservations: true,
  });
  assert.ok(
    (await request("GET", `/spc/profiles/${spc.id}/capability?lsl=5&usl=15`))
      .cp > 1,
  );
  const alternatives = await Promise.all(
    [1, 2].map(() => request("POST", `/spc/profiles/${spc.id}/compute`, {})),
  );
  const { approveBaseline } =
    await import("../server/dist/src/services/spcBaseline.js");
  await Promise.all(
    alternatives.map((b) =>
      approveBaseline(
        b.id,
        users.admin.id,
        "Synthetic concurrent approval regression only",
      ),
    ),
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM spc_baselines WHERE profile_id=$1 AND approved_at IS NOT NULL AND NOT superseded",
        [spc.id],
      )
    ).rows[0].n,
    1,
  );
  await request("PUT", `/spc/profiles/${spc.id}`, { sensitivity: 2 });
  await request(
    "GET",
    `/spc/profiles/${spc.id}/capability?lsl=5&usl=15`,
    undefined,
    400,
  );
  const states = {
    running: [1],
    idle: [0],
    fault: [2],
    blocked: [3],
    starved: [4],
  };
  const line = await request(
    "POST",
    "/lines",
    {
      name: "Acceptance line",
      maxGapSeconds: 60,
      microstopSeconds: 10,
      machines: m.map((machineId) => ({
        machineId,
        stateKey: "State",
        cycleKey: null,
        outputKey: null,
        states,
      })),
      buffers: [
        {
          from: m[0],
          to: m[1],
          machineId: m[0],
          nodeKey: "Buffer",
          capacity: 10,
        },
      ],
    },
    201,
  );
  const lineReport = await request(
    "GET",
    `/lines/${line.id}/report?start=2026-01-01T00:00:00Z&end=2026-01-01T01:00:00Z&target=100`,
  );
  assert.equal(lineReport.targetShortfall, null);
  assert.equal(lineReport.machines[0].seconds.unknown, 3600);
  const alarm = (
    await pool.query(
      "INSERT INTO alert_history(machine_id,message) VALUES($1,'Fixture alarm') RETURNING id",
      [m[0]],
    )
  ).rows[0].id;
  const action = await request(
    "POST",
    `/maintenance-actions/machines/${m[0]}`,
    {
      alarmId: alarm,
      ownerId: users.admin.id,
      escalationOwnerId: users.supervisor.id,
      dueAt: new Date(Date.now() + 60000).toISOString(),
      action: "Inspect fixture",
      quietStart: 1320,
      quietEnd: 360,
    },
    201,
  );
  await pool.query(
    "UPDATE maintenance_actions SET due_at=now()-interval '1 second' WHERE id=$1",
    [action.id],
  );
  await pool.query(
    "INSERT INTO webhooks(name,url,secret,events,is_active) VALUES('No-send fixture','https://example.invalid','fixture','[\"maintenance.escalated\"]',true)",
  );
  const { escalateMaintenanceActions } =
    await import("../server/dist/src/services/maintenanceActions.js");
  await escalateMaintenanceActions();
  await escalateMaintenanceActions();
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM webhook_deliveries WHERE event->>'type'='maintenance.escalated'",
      )
    ).rows[0].n,
    1,
  );
  await request(
    "POST",
    `/maintenance-actions/${action.id}/complete`,
    { serviceEventId: 999999, note: "No inspection" },
    400,
  );
  const plan = (
    await pool.query(
      "INSERT INTO maintenance_plans(machine_id,config,profile,created_by) VALUES($1,'{}','{}',$2) RETURNING id",
      [m[0], users.admin.id],
    )
  ).rows[0].id;
  const event = (
    await pool.query(
      "INSERT INTO maintenance_events(request_id,plan_id,serviced,checks,note,created_by) VALUES($1,$2,true,'{\"seal\":true}','Fixture inspection',$3) RETURNING id",
      [randomUUID(), plan, users.admin.id],
    )
  ).rows[0].id;
  await request("POST", `/maintenance-actions/${action.id}/complete`, {
    serviceEventId: event,
    note: "Fixture service complete",
  });
  assert.equal(
    (await request("GET", `/maintenance-actions/machines/${m[0]}`))[0].outcome,
    "awaiting-recovery",
  );
  await pool.query("UPDATE alert_history SET resolved_at=now() WHERE id=$1", [
    alarm,
  ]);
  assert.equal(
    (await request("GET", `/maintenance-actions/machines/${m[0]}`))[0].outcome,
    "recovered-observed",
  );
  await pool.query(
    "UPDATE alert_history SET resolved_at=(SELECT created_at-interval '1 second' FROM maintenance_events WHERE id=$2) WHERE id=$1",
    [alarm, event],
  );
  assert.equal(
    (await request("GET", `/maintenance-actions/machines/${m[0]}`))[0].outcome,
    "awaiting-recovery",
  );
  await pool.query(
    'UPDATE alert_history SET resolved_at=now(),metadata=\'{"healthKey":"fixture"}\' WHERE id=$1',
    [alarm],
  );
  await pool.query(
    "INSERT INTO alert_history(machine_id,message,metadata,created_at) SELECT $1,'Repeated fixture alarm','{\"healthKey\":\"fixture\"}',created_at+interval '1 microsecond' FROM maintenance_events WHERE id=$2",
    [m[0], event],
  );
  const repeated = (
    await request("GET", `/maintenance-actions/machines/${m[0]}`)
  )[0];
  assert.equal(repeated.outcome, "recurred");
  assert.equal(repeated.repeated_alarms, 1);
  const recurrence = (
    await pool.query(
      "SELECT max(id) AS id FROM alert_history WHERE machine_id=$1",
      [m[0]],
    )
  ).rows[0].id;
  await request(
    "POST",
    `/maintenance-actions/machines/${m[0]}`,
    {
      alarmId: recurrence,
      ownerId: users.admin.id,
      escalationOwnerId: users.supervisor.id,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      action: "Suppression fixture",
      suppressionUntil: new Date(Date.now() + 3600000).toISOString(),
      quietStart: null,
      quietEnd: null,
    },
    201,
  );
  await pool.query(
    "UPDATE webhook_deliveries SET next_attempt_at=now()+interval '2 hours'",
  );
  const notification = (
    await pool.query(
      "INSERT INTO webhook_deliveries(webhook_id,event) SELECT id,$1 FROM webhooks WHERE name='No-send fixture' RETURNING id",
      [{ type: "alarm.triggered", payload: { id: alarm, machineId: m[0] } }],
    )
  ).rows[0].id;
  const { webhookService } =
    await import("../server/dist/src/services/webhookService.js");
  await webhookService.processDeliveries();
  const deferred = (
    await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [
      notification,
    ])
  ).rows[0];
  assert.equal(deferred.attempts, 0);
  assert.equal(deferred.delivered_at, null);
  assert.ok(deferred.next_attempt_at.getTime() > Date.now());
  await pool.query(
    "UPDATE maintenance_actions SET suppression_until=now()-interval '1 second' WHERE alarm_id=$1",
    [recurrence],
  );
  await pool.query(
    "UPDATE webhooks SET is_active=false WHERE name='No-send fixture'",
  );
  await pool.query(
    "UPDATE webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
    [notification],
  );
  await webhookService.processDeliveries();
  assert.equal(
    (
      await pool.query("SELECT attempts FROM webhook_deliveries WHERE id=$1", [
        notification,
      ])
    ).rows[0].attempts,
    1,
  );
  await request("PUT", `/history/${m[1]}/policy`, { days: 1 });
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,received_at) VALUES($1,'Retain','2026-01-01',1,'Good',now()-interval '2 days'),($1,'Late','2026-01-01',2,'Good',now())",
    [m[1]],
  );
  const preview = await request("POST", `/history/${m[1]}/preview`, {}, 201);
  assert.equal(preview.rows, 1);
  const scheduled = await request(
    "POST",
    `/history/${m[1]}/schedule`,
    {
      previewId: preview.id,
      confirmRows: preview.rows,
      runAt: new Date(Date.now() + 60000).toISOString(),
    },
    201,
  );
  // Becoming old enough after review must not add a measurement to the approved set.
  await pool.query(
    "UPDATE opcua_data SET received_at=now()-interval '2 days' WHERE machine_id=$1 AND node_key='Late'",
    [m[1]],
  );
  await pool.query(
    "UPDATE retention_schedules SET run_at=now()-interval '1 second' WHERE id=$1",
    [scheduled.id],
  );
  const { runRetentionSchedules } =
    await import("../server/dist/src/services/historyRetention.js");
  await runRetentionSchedules();
  assert.equal(
    (
      await pool.query("SELECT status FROM retention_schedules WHERE id=$1", [
        scheduled.id,
      ])
    ).rows[0].status,
    "completed",
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM opcua_data WHERE machine_id=$1 AND node_key='Late'",
        [m[1]],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await call("viewer", "GET", `/api/v1/quality/batches/${batch.id}`)
    ).status(),
    403,
  );
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,received_at) SELECT $1,'BadAggregate','2026-01-03'::timestamptz+i*interval '1 millisecond',NULL,'Bad',now()-interval '2 days' FROM generate_series(1,5001)i",
    [m[1]],
  );
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,received_at) SELECT $1,'NonFinite','2026-01-03'::timestamptz,v::real,'Good',now()-interval '2 days' FROM unnest(ARRAY['NaN','Infinity','-Infinity']) v",
    [m[1]],
  );
  const aggregatePreview = await request(
    "POST",
    `/history/${m[1]}/preview`,
    {},
    201,
  );
  let aggregateResult;
  do {
    aggregateResult = await request("POST", `/history/${m[1]}/apply`, {
      previewId: aggregatePreview.id,
      confirmRows: aggregatePreview.rows,
    });
  } while (!aggregateResult.completed);
  const aggregates = (
    await pool.query(
      "SELECT node_key,good,sum,min,max FROM history_summaries WHERE machine_id=$1 AND node_key IN ('BadAggregate','NonFinite')",
      [m[1]],
    )
  ).rows;
  assert.equal(aggregates.length, 2);
  for (const row of aggregates) {
    assert.equal(Number(row.good), 0);
    assert.equal(row.sum, null);
    assert.equal(row.min, null);
    assert.equal(row.max, null);
  }
  const storage = await request("GET", `/history/${m[0]}/storage`);
  assert.ok(
    storage.disks.some(
      (d) => d.kind === "database" && d.daysToReserve === null,
    ),
  );
  const page = await actors.admin.newPage();
  await page.goto(frontend + "/batches");
  await expect(
    page.getByText("Quality fixture batch", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: "Quality fixture batch" })
    .getByRole("button", { name: /view|detail|data/i })
    .click();
  await expect(
    page.getByText("Overall Compliance: Unknown", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Inspection check", { exact: true })
    .fill("Visual acceptance");
  const inspectionPath = `**/api/v1/quality/batches/${batch.id}/inspections`;
  await page.route(
    inspectionPath,
    async (route) => {
      const committed = await route.fetch();
      assert.equal(committed.status(), 201);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Record inspection", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /fetch|network/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record inspection", exact: true })
    .click();
  await expect(page.getByText(/Visual acceptance — unknown/)).toBeVisible();
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM quality_inspections WHERE batch_id=$1 AND check_name='Visual acceptance'",
        [batch.id],
      )
    ).rows[0].n,
    1,
  );
  await page.screenshot({
    path: ".local/daily-evidence/quality-batch.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await pool.query("UPDATE batches SET summary=NULL WHERE id=$1", [batch.id]);
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Quality fixture batch" })
    .getByRole("button", { name: /view|detail|data/i })
    .click();
  const pressure = page.getByRole("row").filter({ hasText: "Pressure" });
  await expect(pressure.getByRole("cell").nth(2)).toHaveText("Unknown");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Pressure','2026-01-01 02:00Z',0.5,'Good')",
    [m[0]],
  );
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "Quality fixture batch" })
    .getByRole("button", { name: /view|detail|data/i })
    .click();
  await expect(pressure.getByRole("cell").nth(2)).toHaveText("0.50");
  assert.ok(
    ["rgb(37, 98, 72)", "rgb(161, 215, 184)"].includes(
      await pressure
        .getByRole("cell")
        .nth(2)
        .evaluate((cell) => getComputedStyle(cell).color),
    ),
  );
  await page.goto(frontend + "/operations");
  await page.getByRole("combobox", { name: "Machine", exact: true }).click();
  await page
    .getByRole("option", { name: "Quality fixture", exact: true })
    .click();
  await page.getByRole("tab", { name: "Production line", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Production line", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Acceptance line", exact: true })
    .click();
  await page.getByRole("button", { name: "Analyze line", exact: true }).click();
  await expect(page.getByText(/Target shortfall: Unknown/)).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/production-line.png",
    fullPage: true,
  });
  await pool.query(
    `UPDATE maintenance_plans SET config='{"name":"Fixture service","days":7,"runtimeHours":null,"cycles":null,"checks":["seal"],"active":false}',profile='{"signals":{}}' WHERE id=$1`,
    [plan],
  );
  await page.getByRole("tab", { name: "Alarm actions", exact: true }).click();
  await expect(page.getByText(/recurred/)).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/maintenance-actions.png",
    fullPage: true,
  });
  await page.goto(frontend + "/spc");
  await page
    .getByRole("combobox", { name: "Baseline profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Reference fixture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Prepare baseline for review", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Reference baseline", exact: true })
    .click();
  await page
    .getByRole("option", { name: /pending review/ })
    .first()
    .click();
  await page
    .getByLabel("Stability review and reference evidence", { exact: true })
    .fill(
      "Synthetic browser workflow acceptance only; no actual process is approved.",
    );
  await page
    .getByLabel("I reviewed evidence of a stable process", { exact: true })
    .check();
  await page
    .getByLabel("I reviewed independence and approximate normality", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Approve reference baseline", exact: true })
    .click();
  await page.getByLabel("Lower specification limit", { exact: true }).fill("5");
  await page
    .getByLabel("Upper specification limit", { exact: true })
    .fill("15");
  await page
    .getByRole("button", {
      name: "Calculate reference capability",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Cp 1\.658/)).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/spc-baseline.png",
    fullPage: true,
  });
  await writeFile(
    ".local/daily-evidence/quality-line.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "batch unknown/zero/quality/boundary/frozen recipe",
          "inspection idempotency and rework verification",
          "browser inspection retry after lost committed response",
          "lot quantity and trace",
          "SPC approval and invalidation",
          "concurrent SPC approval keeps one current baseline",
          "line unknown coverage",
          "durable escalation exactly once",
          "maintenance recovery chronology, health recurrence and durable notification suppression",
          "authorization",
          "actual browser inspection and line report",
          "actual browser SPC approval/capability and maintenance outcome",
          "reviewed retention membership and scheduled execution",
          "multi-chunk retention excludes non-finite and preserves unknown aggregates",
        ],
        hardwareQualified: false,
      },
      null,
      2,
    ),
  );
  console.log("Quality, line, maintenance and storage acceptance passed");
});
