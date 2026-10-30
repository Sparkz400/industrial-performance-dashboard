import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// O06: expected-versus-actual changeovers from product runs, observed state and operator reasons.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Changeover press','opc.tcp://127.0.0.1:49993','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  for (const role of ["supervisor", "operator", "viewer"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [
      users[role].id,
      machine,
    ]);
  const state = {
    nodeKey: "State",
    namespaceUri: "urn:fixture",
    identifier: "s=State",
    dataType: "Double",
    unit: null,
    scale: 1,
  };
  await pool.query("INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)", [
    machine,
    {
      version: 1,
      name: "Changeover profile",
      endpointModel: "fixture",
      signals: { state },
      states: { running: [1], idle: [0], fault: [2], planned: [3] },
      idealCycleMs: 1000,
      maxGapSeconds: 120,
      counterPolicy: "reset-to-zero",
    },
    users.admin.id,
  ]);
  // One reading a minute from 06:00: A runs until 06:55, idle until B runs at 07:40, B stops
  // at 08:55 and four bad readings leave the B→A changeover unknown until A runs at 09:00.
  await pool.query(
    `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata)
     SELECT $1,'State','2026-02-02T06:00:00Z'::timestamptz + i*interval '1 minute',
       CASE WHEN i<55 THEN 1 WHEN i<100 THEN 0 WHEN i<175 THEN 1 WHEN i=175 THEN 0 WHEN i<180 THEN NULL ELSE 1 END,
       CASE WHEN i BETWEEN 176 AND 179 THEN 'BadSensorFailure' ELSE 'Good' END,
       jsonb_build_object('namespaceUri','urn:fixture','identifier','s=State')
     FROM generate_series(0,239) i`,
    [machine],
  );
  const created = async (role, method, path, body, status = 201) => {
    const response = await call(role, method, path, body);
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const shift = await created("supervisor", "POST", "/api/v1/production/shifts", {
    machineId: machine,
    name: "Early 2 Feb",
    timezone: "UTC",
    start: "2026-02-02T06:00:00Z",
    end: "2026-02-02T14:00:00Z",
    breaks: [{ start: "2026-02-02T07:00:00Z", end: "2026-02-02T07:10:00Z" }],
    job: { reference: "J-1", product: "A", target: null },
  });
  const run = (reference, product, start, end) => ({
    reference,
    product,
    target: null,
    start: `2026-02-02T${start}:00+00:00`,
    end: `2026-02-02T${end}:00+00:00`,
    idealCycleMs: 1000,
  });
  await created(
    "supervisor",
    "PUT",
    `/api/v1/planning/shifts/${shift.id}/runs`,
    {
      version: 1,
      runs: [run("RA", "A", "06:00", "07:00"), run("RB", "B", "07:30", "09:00"), run("RA2", "A", "09:00", "10:00")],
    },
    200,
  );
  await created("operator", "POST", `/api/v1/production/shifts/${shift.id}/reasons`, {
    start: "2026-02-02T06:55:00Z",
    end: "2026-02-02T07:40:00Z",
    category: "changeover",
    reason: "Tool change A to B",
  });
  await created("supervisor", "POST", "/api/v1/production/shifts", {
    machineId: machine,
    name: "Early 3 Feb",
    timezone: "UTC",
    start: "2026-02-03T06:00:00Z",
    end: "2026-02-03T14:00:00Z",
    job: { reference: "J-2", product: "C", target: null },
  });

  const standards = `/api/v1/planning/machines/${machine}/changeover-standards`;
  await created("supervisor", "POST", standards, { fromProduct: "A", toProduct: "B", expectedSeconds: 1800 });
  const latest = await created("supervisor", "POST", standards, {
    fromProduct: "A",
    toProduct: "B",
    expectedSeconds: 2400,
    note: "Timed study after new clamps",
  });
  assert.equal((await call("operator", "POST", standards, { fromProduct: "B", toProduct: "A", expectedSeconds: 600 })).status(), 403);
  assert.equal((await call("supervisor", "POST", standards, { fromProduct: "A", toProduct: "A", expectedSeconds: 600 })).status(), 400);
  assert.equal((await created("viewer", "GET", standards, undefined, 200)).length, 2, "History is kept");

  const window = (start, end) =>
    `/api/v1/planning/machines/${machine}/changeovers?start=${start}&end=${end}`;
  assert.equal((await call("wallboard", "GET", window("2026-02-02T00:00:00Z", "2026-02-04T00:00:00Z"))).status(), 403);
  assert.equal((await call("viewer", "GET", window("2026-01-01T00:00:00Z", "2026-02-04T00:00:00Z"))).status(), 400);
  const analysis = await created("viewer", "GET", window("2026-02-02T00:00:00Z", "2026-02-04T00:00:00Z"), undefined, 200);
  assert.deepEqual(
    analysis.transitions.map((t) => [t.from.product, t.to.product, t.status, t.issue]),
    [
      ["A", "B", "observed", null],
      ["B", "A", "unobserved", "Machine state unknown during the changeover"],
      ["A", "C", "across-shifts", "Spans two shifts; not measured"],
    ],
  );
  assert.deepEqual(
    {
      stoppedAt: analysis.transitions[0].stoppedAt,
      resumedAt: analysis.transitions[0].resumedAt,
      actual: analysis.transitions[0].actualSeconds,
      breaks: analysis.transitions[0].breakSeconds,
      confirmed: analysis.transitions[0].confirmedSeconds,
    },
    {
      stoppedAt: "2026-02-02T06:55:00.000Z",
      resumedAt: "2026-02-02T07:40:00.000Z",
      actual: 45 * 60 - 600,
      breaks: 600,
      confirmed: 45 * 60 - 600,
    },
  );
  assert.equal(analysis.transitions[1].actualSeconds, null, "Unknown state is not measured");
  assert.deepEqual(analysis.groups[0], {
    fromProduct: "A",
    toProduct: "B",
    transitions: 1,
    observed: 1,
    medianActualSeconds: 2100,
    expectedSeconds: 2400,
    standardId: latest.id,
    medianDifferenceSeconds: -300,
  });

  // A supervisor reviews the same result and records a standard in the browser.
  const local = (iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const page = await actors.supervisor.newPage();
  await page.goto(`${frontend}/operations`);
  await page.getByRole("combobox", { name: "Machine", exact: true }).fill("Changeover");
  await page.getByRole("option", { name: "Changeover press", exact: true }).click();
  await selectOperation(page, "Changeovers");
  await page.getByLabel("Changeover window start").fill(local("2026-02-02T00:00:00Z"));
  await page.getByLabel("Changeover window end").fill(local("2026-02-04T00:00:00Z"));
  await page.getByRole("button", { name: "Analyze changeovers" }).click();
  const groups = page.getByRole("table", { name: "Comparable changeovers" });
  await expect(groups.getByRole("row", { name: /A → B 1 \/ 1 35\.0 min 40\.0 min -5\.0 min/ })).toBeVisible();
  const transitions = page.getByRole("table", { name: "Product transitions" });
  await expect(transitions.getByText("Spans two shifts; not measured")).toBeVisible();
  await expect(transitions.getByText("Machine state unknown during the changeover")).toBeVisible();
  await page.getByLabel("From product").fill("B");
  await page.getByLabel("To product").fill("A");
  await page.getByLabel("Expected minutes").fill("20");
  await page.getByLabel("Basis of the standard").fill("Fixture study");
  await page.getByRole("button", { name: "Save changeover standard" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changeover standard saved" })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Changeover standard history" }).getByRole("row", { name: /B → A 20\.0 min Fixture study/ }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/changeovers.png", fullPage: true });
  await page.close();
  console.log(JSON.stringify({ changeovers: "passed", groups: analysis.groups.length }));
});
