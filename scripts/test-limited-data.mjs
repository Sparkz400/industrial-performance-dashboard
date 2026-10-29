import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// O10: a machine without automatic signals runs on reviewed manual declarations that are
// labelled as manual, fill only unknown time and never produce OEE from missing inputs.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Manual press','opc.tcp://192.0.2.10:4840','192.0.2.10',false) RETURNING id",
    )
  ).rows;
  for (const role of ["supervisor", "operator"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };

  // An administrator commissions it without signals; nothing connects to the endpoint.
  const admin = await actors.admin.newPage();
  await admin.goto(frontend + "/production");
  await admin.getByRole("tab", { name: "Commission machine" }).click();
  await admin.getByLabel("Machine to commission").click();
  await admin.getByRole("option", { name: "Manual press" }).click();
  await admin.getByLabel("Machine state declared manually (no state signal)").check();
  await admin.getByLabel("Counts declared manually (no counter signals)").check();
  await admin.getByLabel("Ideal cycle (milliseconds)").fill("1000");
  await admin.getByLabel("I reviewed the mappings, state meanings, units and counter policy for this machine.").check();
  await admin.getByRole("button", { name: "Save manual profile" }).click();
  await expect(
    admin.getByText("Manual profile saved. Plan shifts and record reviewed declarations in Production."),
  ).toBeVisible();
  await admin.close();
  const [saved] = (
    await pool.query(
      "SELECT p.profile,m.is_active FROM machine_profiles p JOIN machines m ON m.id=p.machine_id WHERE p.machine_id=$1",
      [machine],
    )
  ).rows;
  assert.deepEqual(saved.profile.signals, {});
  assert.equal(saved.is_active, false, "A machine without signals is never connected");

  const shift = async (name, start, end) =>
    ok("supervisor", "POST", "/production/shifts", {
      machineId: machine,
      name,
      timezone: "UTC",
      start,
      end,
      job: { reference: "J-manual", product: "Bracket", target: null },
    }, 201);
  const early = await shift("Manual early", "2026-03-02T06:00:00Z", "2026-03-02T08:00:00Z");
  const late = await shift("Manual late", "2026-03-02T08:00:00Z", "2026-03-02T10:00:00Z");
  const report = (id) => ok("supervisor", "GET", `/production/shifts/${id}/report`);
  let current = await report(early.id);
  assert.equal(current.seconds.unknown, 7200);
  assert.equal(current.oee.availability, null);
  assert.equal(current.stateSource, "measured");

  const entry = (body, status = 201) =>
    ok("operator", "POST", "/production/operator/entries", {
      requestId: randomUUID(),
      machineId: machine,
      text: "Declared from the shift log",
      priority: "normal",
      ownerId: null,
      dueAt: null,
      quantity: null,
      ...body,
    }, status);
  const declare = (shiftId, from, to, manualState) =>
    entry({ shiftId, kind: "state", manualState, intervalStart: from, intervalEnd: to });
  // Refusals: no interval, no shift, an unknown state.
  await entry({ shiftId: early.id, kind: "state", manualState: "running", intervalStart: null, intervalEnd: null }, 400);
  await entry({ shiftId: null, kind: "state", manualState: "running", intervalStart: "2026-03-02T06:00:00Z", intervalEnd: "2026-03-02T07:00:00Z" }, 400);
  await entry({ shiftId: early.id, kind: "state", manualState: "busy", intervalStart: "2026-03-02T06:00:00Z", intervalEnd: "2026-03-02T07:00:00Z" }, 400);
  const declarations = [
    await declare(early.id, "2026-03-02T06:00:00Z", "2026-03-02T07:00:00Z", "running"),
    await declare(early.id, "2026-03-02T07:00:00Z", "2026-03-02T07:30:00Z", "idle"),
    await declare(early.id, "2026-03-02T07:30:00Z", "2026-03-02T08:00:00Z", "running"),
    await entry({
      shiftId: early.id,
      kind: "quantity",
      intervalStart: null,
      intervalEnd: null,
      quantity: { total: 3000, good: 2950, reject: 50 },
    }),
    await declare(late.id, "2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", "running"),
  ];
  current = await report(early.id);
  assert.equal(current.seconds.unknown, 7200, "Unreviewed declarations are not used");

  const review = (role, item, status = 200) =>
    ok(role, "POST", `/production/operator/entries/${item.id}`, {
      text: item.text,
      priority: "normal",
      ownerId: null,
      dueAt: null,
      version: item.version,
      status: "resolved",
    }, status);
  await review("operator", declarations[0], 403);
  for (const item of declarations) await review("supervisor", item);

  current = await report(early.id);
  assert.deepEqual(
    { running: current.seconds.running, idle: current.seconds.idle, unknown: current.seconds.unknown },
    { running: 5400, idle: 1800, unknown: 0 },
  );
  assert.equal(current.stateSource, "manual");
  assert.equal(current.manualStateSeconds, 7200);
  assert.equal(current.quantitySource, "declaration");
  assert.equal(current.oee.availability, 0.75);
  assert.ok(Math.abs(current.oee.performance - 3000 / 5400) < 1e-9);
  assert.ok(Math.abs(current.oee.quality - 2950 / 3000) < 1e-9);
  assert.equal(current.verified, false, "Manual evidence never verifies a shift");
  assert.ok(current.intervals.every((i) => i.source === "manual"));
  assert.ok(current.issues.includes(
    "Reviewed manual state declarations fill 120.0 min of unknown machine state; they are declarations, not measurements.",
  ));
  // Half a shift declared: the rest stays unknown and no OEE is produced.
  const partial = await report(late.id);
  assert.equal(partial.seconds.unknown, 3600);
  assert.equal(partial.oee.availability, null);
  assert.equal(partial.oee.overall, null);
  const live = await ok("operator", "GET", `/production/operator/live?ids=${machine}`);
  assert.equal(live.machines[0].state, "unknown", "Manual declarations are not live state");

  // The operator declares a state in the handover workspace; the report labels manual state.
  const operator = await actors.operator.newPage();
  await operator.goto(frontend + "/production");
  await operator.getByRole("tab", { name: "Operator handover", exact: true }).click();
  await operator.getByRole("combobox", { name: "Handover machine", exact: true }).click();
  await operator.getByRole("option", { name: "Manual press", exact: true }).click();
  await operator.getByRole("combobox", { name: "Entry type" }).click();
  await operator.getByRole("option", { name: "Manual state interval" }).click();
  await operator.getByRole("textbox", { name: "Observation / action", exact: true }).fill("Tool change logged on paper");
  await operator.getByRole("combobox", { name: "Declared state" }).click();
  await operator.getByRole("option", { name: "fault" }).click();
  await operator.getByRole("combobox", { name: "Linked shift" }).click();
  await operator.getByRole("option", { name: "Manual late" }).click();
  await operator.getByLabel("Observation start (ISO with timezone, optional)").fill("2026-03-02T09:00:00Z");
  await operator.getByLabel("Observation end (ISO with timezone, optional)").fill("2026-03-02T09:20:00Z");
  await operator.getByRole("button", { name: "Save handover" }).click();
  await expect(operator.getByText("Manual state declaration: fault. Awaiting review; not used in the shift report.")).toBeVisible();
  await operator.close();
  assert.equal(
    (await pool.query("SELECT manual_state FROM operator_entries WHERE text='Tool change logged on paper'")).rows[0].manual_state,
    "fault",
  );

  const supervisor = await actors.supervisor.newPage();
  await supervisor.goto(frontend + "/production");
  await supervisor.getByLabel("Select shift").click();
  await supervisor.getByRole("option", { name: /^Manual early/ }).click();
  await expect(supervisor.getByText("State: reviewed manual declarations · 120.0 min")).toBeVisible();
  await expect(supervisor.getByText("Quantities: reviewed manual declaration")).toBeVisible();
  await supervisor.screenshot({ path: ".local/daily-evidence/limited-data-report.png", fullPage: true });
  await supervisor.close();
  console.log(JSON.stringify({ limitedData: "passed", availability: current.oee.availability }));
});
