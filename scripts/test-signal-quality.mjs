import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";
process.env.COMPLIANCE_MODE_ENABLED = "true";
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const ok = async (method, path, body, status = 200, role = "supervisor") => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const machines = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,status) VALUES('Signal line','opc.tcp://127.0.0.1:49991','127.0.0.1','connected'),('Private line','opc.tcp://127.0.0.1:49992','127.0.0.1','connected') RETURNING id",
    )
  ).rows.map((r) => r.id);
  const machine = machines[0];
  const widgets = [
    "upTimeRate",
    "operationModePie",
    "currentAirConsumptionWidget",
    "operationMode",
  ].map((type, i) => ({
    id: `evidence-${i}`,
    type,
    config: { machineId: machine },
  }));
  await pool.query(
    "INSERT INTO dashboards(id,name,widgets,layout) VALUES($1,$2,$3,$4)",
    [
      "signal-evidence",
      "Measured evidence",
      JSON.stringify(widgets),
      JSON.stringify(
        widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 7, w: 12, h: 7 })),
      ),
    ],
  );
  await pool.query(
    "INSERT INTO dashboard_assets(dashboard_id,machine_id) VALUES($1,$2)",
    ["signal-evidence", machine],
  );
  for (const role of ["supervisor", "operator", "viewer", "wallboard"])
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users[role].id, machine],
    );
  const signal = (key) => ({
    nodeKey: key,
    namespaceUri: "urn:signals",
    identifier: "s=" + key,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  const profile = {
    version: 1,
    name: "Measured states",
    endpointModel: "Owned fixture",
    signals: {
      state: signal("State"),
      total: signal("Count"),
      good: signal("Count"),
      reject: signal("Reject"),
    },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000,
    maxGapSeconds: 60,
    counterPolicy: "reject-decrease",
  };
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [machine, profile, users.admin.id],
  );
  for (const key of [
    "Energy",
    "Count",
    "State",
    "AirConsumption",
    "OperationMode",
  ])
    await pool.query(
      "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name) VALUES($1,$2,$3,$3)",
      [machine, "ns=2;s=" + key, key],
    );
  const base = Math.floor((Date.now() - 300000) / 1000) * 1000;
  const insert = async (
    key,
    at,
    value,
    status = "Good",
    revision = 0,
    raw = value,
  ) =>
    pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at,source_timestamp,signal_metadata,correction_revision) VALUES($1,$2,$3,$4,$5,$6,$3,$3,$7,$8)",
      [
        machine,
        key,
        new Date(at),
        value,
        JSON.stringify(raw),
        status,
        signal(key),
        revision,
      ],
    );
  for (const [key, value] of [
    ["Energy", 1000],
    ["Count", 2],
    ["State", 1],
    ["AirConsumption", 0],
    ["OperationMode", 0],
  ])
    await insert(key, base, value);
  await insert("Energy", base + 20000, 0, "GoodManualCorrection", 1, 1500);
  await insert("Energy", base + 30000, 9, "BadSensorFailure");
  await insert("Energy", base + 40000, 2000);
  await insert("State", base + 30000, 0, "GoodManualCorrection", 1, 1);
  const spc = (
    await pool.query(
      "INSERT INTO spc_profiles(name,machine_id,node_key,method,ucl,lcl,mean) VALUES('Measured SPC',$1,'Energy','zscore',2500,0,1000) RETURNING id",
      [machine],
    )
  ).rows[0].id;
  const batch = (
    await pool.query(
      "INSERT INTO batches(batch_number,machine_id,status,started_at,recipe_snapshot) VALUES('Evidence batch',$1,'running',$2,$3) RETURNING id",
      [
        machine,
        new Date(base - 60000),
        {
          id: 1,
          name: "Evidence recipe",
          version: 1,
          parameters: [
            {
              nodeKey: "Energy",
              displayName: "Energy",
              targetValue: 1000,
              tolerance: 100,
            },
          ],
          setpoints: {},
        },
      ],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO oee_config(machine_id,running_mode_values,idle_mode_values,ideal_cycle_time_ms,production_count_node_key,good_count_node_key,reject_count_node_key) VALUES($1,'[1]','[0]',1000,'Count','Count','Reject')",
    [machine],
  );
  for (let i = 0; i < 7; i++)
    await pool.query(
      "INSERT INTO alert_history(machine_id,node_key,message,severity,status) VALUES($1,'Energy','Measured alarm','high','active')",
      [machine],
    );
  const extended = [
    { id: "spc", type: "spcChart", config: { profileId: spc } },
    { id: "batch", type: "batchMonitor", config: { machineId: machine } },
    { id: "oee", type: "oeeGauge", config: { machineId: machine } },
    { id: "alerts", type: "alertSummary", config: {} },
    { id: "health", type: "systemStatus", config: { showDetails: false } },
  ];
  await pool.query(
    "INSERT INTO dashboards(id,name,widgets,layout) VALUES($1,$2,$3,$4)",
    [
      "extended-evidence",
      "Coverage evidence",
      JSON.stringify(extended),
      JSON.stringify(
        extended.map((widget, i) => ({
          i: widget.id,
          x: 0,
          y: i * 10,
          w: 12,
          h: 10,
        })),
      ),
    ],
  );
  await pool.query(
    "INSERT INTO dashboard_assets(dashboard_id,machine_id) VALUES($1,$2)",
    ["extended-evidence", machine],
  );
  const spcEvidence = await ok(
    "GET",
    `/spc/profiles/${spc}/chart-data?${new URLSearchParams({ startDate: new Date(base - 1000).toISOString(), endDate: new Date(base + 60000).toISOString() })}`,
    undefined,
    200,
    "admin",
  );
  assert.equal(spcEvidence.dataPoints[1].correctionRevision, 1);
  assert.equal(spcEvidence.dataPoints[1].rawValue, 1500);
  assert.equal(spcEvidence.dataPoints[2].value, null);
  assert.equal(spcEvidence.truncated, false);
  const batchEvidence = await ok(
    "GET",
    `/batches/${batch}/data`,
    undefined,
    200,
    "admin",
  );
  assert.equal(batchEvidence[0].dataPoints[1].correctionRevision, 1);
  assert(batchEvidence[0].dataPoints[1].sourceTimestamp);
  const leaf = (key, unit) => ({
    kind: "input",
    key,
    unit,
    namespaceUri: "urn:signals",
    identifier: "s=" + key,
  });
  const spec = {
    expression: {
      kind: "divide",
      left: leaf("Energy", "Wh"),
      right: leaf("Count", "count"),
    },
    maxAgeSeconds: 60,
  };
  const path = `/derived-signals/machines/${machine}`;
  const definition = await ok(
    "POST",
    path,
    { name: "Energy per part", expectedVersion: 0, expression: spec },
    201,
  );
  await ok(
    "GET",
    `${path}/${definition.id}/evaluate?start=2026-01-01T00:00:00&end=2026-01-01T01:00:00`,
    undefined,
    400,
  );
  await ok(
    "POST",
    path,
    { name: "Energy per part", expectedVersion: 0, expression: spec },
    409,
  );
  for (const role of ["operator", "viewer", "wallboard"])
    await ok(
      "POST",
      path,
      { name: "Denied", expectedVersion: 0, expression: spec },
      403,
      role,
    );
  await ok(
    "GET",
    `/derived-signals/machines/${machines[1]}`,
    undefined,
    403,
    "viewer",
  );
  await ok(
    "GET",
    `/widget-evidence/machines/${machines[1]}`,
    undefined,
    403,
    "viewer",
  );
  await ok(
    "POST",
    path,
    {
      name: "Unsafe",
      expectedVersion: 0,
      expression: { ...spec, expression: { kind: "eval", code: "1" } },
    },
    400,
  );
  await ok(
    "POST",
    path,
    {
      name: "Bad units",
      expectedVersion: 0,
      expression: { ...spec, expression: { ...spec.expression, kind: "add" } },
    },
    400,
  );
  const replay = await ok(
    "GET",
    `${path}/${definition.id}/evaluate?${new URLSearchParams({ start: new Date(base).toISOString(), end: new Date(base + 70000).toISOString() })}`,
    undefined,
    200,
    "viewer",
  );
  const point = (ms) =>
    replay.points.find((p) => Date.parse(p.timestamp) === base + ms);
  assert.equal(point(0).value, 0.5);
  assert.equal(point(20000).value, 0);
  assert.equal(
    point(20000).inputs.find((r) => r.key === "Energy").rawValue,
    1500,
  );
  assert.equal(
    point(20000).inputs.find((r) => r.key === "Energy").correctionRevision,
    1,
  );
  assert.equal(point(30000).value, null);
  assert.equal(replay.current.value, null);
  assert(replay.current.reasons.some((r) => r.includes("stale")));
  const version2 = await ok(
    "POST",
    path,
    {
      name: "Energy per part",
      expectedVersion: 1,
      expression: { ...spec, maxAgeSeconds: 120 },
    },
    201,
  );
  assert.equal(version2.version, 2);
  assert.deepEqual(
    (await ok("GET", path + "?name=Energy%20per%20part")).definitions.map(
      (d) => d.version,
    ),
    [2, 1],
  );
  assert.equal(replay.definition.version, 1);
  const again = await ok(
    "GET",
    `${path}/${definition.id}/evaluate?${new URLSearchParams({ start: new Date(base).toISOString(), end: new Date(base + 70000).toISOString() })}`,
  );
  assert.deepEqual(again.points, replay.points);
  assert.equal(again.definitionDigest, replay.definitionDigest);
  const evidence = await ok("GET", `/widget-evidence/machines/${machine}`);
  assert.equal(evidence.days.length, 7);
  assert(evidence.days.every((d) => d.uptimePercent === null));
  assert.equal(
    evidence.days.reduce((n, d) => n + d.seconds.running, 0),
    30,
  );
  assert.equal(
    evidence.days.reduce((n, d) => n + d.seconds.idle, 0),
    60,
  );
  assert(evidence.days.at(-1).corrected > 0);
  await ok("GET", "/node-data?nodeKey=Energy", undefined, 400, "admin");
  await ok("GET", "/operation-mode-data", undefined, 400, "admin");
  const modes = await ok("GET", `/operation-mode-data?machineId=${machine}`);
  assert.equal(modes[0].mode, 0);
  assert.equal(modes[0].rawValue, 0);
  assert.equal(modes[0].statusCode, "Good");
  const newest = await ok(
    "GET",
    `/node-data?machineId=${machine}&nodeKey=Energy&latest=true&limit=1`,
  );
  const oldest = await ok(
    "GET",
    `/node-data?machineId=${machine}&nodeKey=Energy&limit=1`,
  );
  assert.equal(newest[0].value, 2000);
  assert.equal(oldest[0].value, 1000);
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [machines[1], profile, users.admin.id],
  );
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  for (const [offset, value] of [
    [-30000, 1],
    [30000, 0],
  ])
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        machines[1],
        "State",
        new Date(+midnight + offset),
        value,
        "Good",
        signal("State"),
      ],
    );
  const { widgetEvidence } =
    await import("../server/dist/src/services/widgetEvidence.js");
  const boundary = await widgetEvidence(
    machines[1],
    new Date(+midnight + 60000),
  );
  assert.equal(boundary.days.at(-2).seconds.running, 30);
  assert.equal(boundary.days.at(-1).seconds.running, 30);
  assert.equal(boundary.days.at(-1).seconds.idle, 30);
  assert.equal(boundary.days.at(-1).uptimePercent, 50);
  await pool.query(
    "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [
      machines[1],
      "State",
      new Date(+midnight + 40000),
      1,
      "BadSensorFailure",
      signal("State"),
    ],
  );
  const badBoundary = await widgetEvidence(
    machines[1],
    new Date(+midnight + 60000),
  );
  assert.equal(badBoundary.days.at(-1).seconds.unknown, 20);
  assert.equal(badBoundary.days.at(-1).uptimePercent, null);
  const page = await actors.supervisor.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const board = await actors.supervisor.newPage();
  board.on("pageerror", (error) => errors.push(error.message));
  await board.goto(frontend + "/dashboard/signal-evidence");
  await expect(
    board.getByText("Uptime — last seven UTC days", { exact: true }),
  ).toBeVisible();
  await expect(
    board.getByText("Observed state distribution", { exact: true }),
  ).toBeVisible();
  await expect(board.getByText(/Current reading: stale/).first()).toBeVisible();
  await board.screenshot({
    path: ".local/daily-evidence/widgets-desktop-en.png",
    fullPage: true,
  });
  await board.setViewportSize({ width: 390, height: 844 });
  await board
    .getByText("Measurement evidence (last 20)", { exact: true })
    .first()
    .click();
  await board
    .getByRole("region", { name: "Measurement evidence", exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  await expect(
    board
      .getByRole("region", { name: "Measurement evidence", exact: true })
      .first(),
  ).toContainText("Good");
  await board.screenshot({
    path: ".local/daily-evidence/widgets-source-evidence.png",
    fullPage: true,
  });
  await insert("AirConsumption", Date.now(), 123, "BadSensorFailure");
  await expect(board.getByText(/Current reading: bad-quality/)).toBeVisible({
    timeout: 15000,
  });
  await expect(
    board
      .getByRole("region", { name: "Measurement evidence", exact: true })
      .first(),
  ).toContainText("BadSensorFailure");
  await board.screenshot({
    path: ".local/daily-evidence/widgets-mobile-en.png",
    fullPage: true,
  });
  await page.goto(frontend + "/operations");
  await page.getByLabel("Machine", { exact: true }).click();
  await page.getByRole("option", { name: "Signal line", exact: true }).click();
  await selectOperation(page, "Calculated signals");
  await page
    .getByLabel("Calculation name", { exact: true })
    .fill("Browser calculation");
  for (const [label, value] of [
    ["First input", "Energy"],
    ["First input unit", "Wh"],
    ["Second input", "Count"],
    ["Second input unit", "count"],
  ]) {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Save reviewed definition", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("immutable version");
  await page
    .getByRole("button", { name: "Evaluate history", exact: true })
    .click();
  await expect(
    page.getByText("At selected end:", { exact: false }),
  ).toContainText("Unknown");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export calculation evidence", exact: true })
    .click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^calculated-signal-\d+\.json$/);
  await page.getByLabel("Saved calculation", { exact: true }).click();
  await page
    .getByRole("option", { name: "Energy per part · v2", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Show previous definition versions",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Definition version (latest 100)", { exact: true })
    .click();
  await page.getByRole("option", { name: /Energy per part · v1/ }).click();
  await page
    .getByRole("button", { name: "Evaluate history", exact: true })
    .click();
  await expect(page.getByText(/Definition: Energy per part v1/)).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/signals-desktop-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Calculated signals", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/signals-mobile-en.png",
    fullPage: true,
  });
  await page
    .getByRole("region", { name: "Calculation history", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/signals-result-mobile-en.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel("Language / Sprache")).toBeVisible();
  await page.getByLabel("Language / Sprache").click();
  await page.getByRole("option", { name: "Deutsch", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Berechnete Signale", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/signals-mobile-de.png",
    fullPage: true,
  });
  await board.reload();
  await expect(
    board.getByText("Betriebszeit — letzte sieben UTC-Tage", { exact: true }),
  ).toBeVisible();
  await board.screenshot({
    path: ".local/daily-evidence/widgets-mobile-de.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  const more = await actors.admin.newPage();
  more.on("pageerror", (error) => errors.push(error.message));
  await more.goto(frontend + "/dashboard/extended-evidence");
  await expect(more.getByText("99.2%", { exact: true })).toHaveCount(0);
  await expect(
    more.getByText("All systems operational", { exact: true }),
  ).toHaveCount(0);
  await expect(more.getByText(/Latest active alerts shown: 5/)).toBeVisible();
  await expect(
    more.getByText(/Sampled observations; continuity is not verified/),
  ).toBeVisible();
  await expect(more.getByText("Stale", { exact: true })).toBeVisible();
  await more.getByText("OEE coverage evidence", { exact: true }).click();
  await expect(
    more.getByRole("region", { name: "OEE coverage evidence", exact: true }),
  ).toContainText("Incomplete");
  await more.setViewportSize({ width: 390, height: 844 });
  await more
    .getByRole("region", { name: "OEE coverage evidence", exact: true })
    .scrollIntoViewIfNeeded();
  await more.screenshot({
    path: ".local/daily-evidence/extended-quality-mobile.png",
    fullPage: true,
  });
  await more.route("**/api/v1/status", (route) => route.abort());
  await more
    .getByRole("button", { name: "Refresh Status", exact: true })
    .click();
  await expect(
    more.getByText(
      "Current system status unknown: stale or unavailable observation.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  const locker = await pool.connect();
  await locker.query("BEGIN");
  await locker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `derived:${machine}`,
  ]);
  const waiting = call("supervisor", "POST", "/api/v1" + path, {
    name: "Revoked waiting definition",
    expectedVersion: 0,
    expression: spec,
  });
  try {
    await expect
      .poll(async () =>
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
            )
          ).rows[0].count,
        ),
      )
      .toBeGreaterThan(0);
    await pool.query(
      "UPDATE users SET updated_at=updated_at+interval '1 second' WHERE id=$1",
      [users.supervisor.id],
    );
  } finally {
    await locker.query("COMMIT");
    locker.release();
  }
  const denied = await waiting;
  assert.equal(denied.status(), 403, await denied.text());
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM derived_signal_definitions WHERE name='Revoked waiting definition'",
        )
      ).rows[0].count,
    ),
    0,
  );
  await writeFile(
    ".local/daily-evidence/signal-quality.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "role and machine scope",
          "bounded typed expressions and units",
          "immutable versions and deterministic historical replay",
          "zero bad stale and corrected raw evidence",
          "actual UTC state duration with unknown gaps",
          "browser create evaluate export",
          "EN DE 390px",
          "SPC and batch quality clocks and correction provenance",
          "OEE aggregate coverage and explicit source-provenance limits",
          "administrator evidence disclosures remain clickable",
          "truthful latest-five alerts and no fabricated uptime",
          "unknown OPC UA and failed health requests never appear fully healthy",
          "mid-request user-version revocation denies calculated definition write",
        ],
        physicalQualification: false,
      },
      null,
      2,
    ),
  );
  console.log("Signal quality API and browser acceptance passed");
});
