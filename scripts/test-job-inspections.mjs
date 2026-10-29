import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// Q03: inspection plans per product and manual inspections of a shift's job outside batches,
// with rework counted once and corrections that keep the original record.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Inspection press','opc.tcp://127.0.0.1:49995','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  for (const role of ["supervisor", "operator", "viewer"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
  const signal = { nodeKey: "State", namespaceUri: "urn:fixture", identifier: "s=State", dataType: "Double", unit: null, scale: 1 };
  await pool.query("INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)", [
    machine,
    {
      version: 1,
      name: "Inspection profile",
      endpointModel: "fixture",
      signals: { state: signal },
      states: { running: [1], idle: [0], fault: [2], planned: [3] },
      idealCycleMs: 1000,
      maxGapSeconds: 60,
      counterPolicy: "reset-to-zero",
    },
    users.admin.id,
  ]);
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const shift = await ok("supervisor", "POST", "/production/shifts", {
    machineId: machine,
    name: "Inspection shift",
    timezone: "UTC",
    start: "2026-04-01T06:00:00Z",
    end: "2026-04-01T14:00:00Z",
    job: { reference: "J-77", product: "Bracket", target: null },
  }, 201);
  await ok("supervisor", "PUT", `/planning/shifts/${shift.id}/runs`, {
    version: 1,
    runs: [
      { reference: "J-77", product: "Bracket", target: null, start: "2026-04-01T06:00:00Z", end: "2026-04-01T10:00:00Z", idealCycleMs: 1000 },
      { reference: "J-78", product: "Housing", target: null, start: "2026-04-01T10:00:00Z", end: "2026-04-01T14:00:00Z", idealCycleMs: 1000 },
    ],
  });

  const plans = `/production/machines/${machine}/inspection-plans`;
  await ok("operator", "POST", plans, { product: "Bracket", checks: ["Burr"] }, 403);
  const plan = await ok("supervisor", "POST", plans, { product: "Bracket", checks: ["Burr", "Length"] }, 201);

  const path = `/production/shifts/${shift.id}/inspections`;
  const inspect = (body, status = 201, role = "operator") =>
    ok(role, "POST", path, { requestId: randomUUID(), product: "Bracket", check: "Burr", note: "", ...body }, status);
  const passed = await inspect({ result: "pass", quantity: 40 });
  assert.equal(passed.planId, plan.id, "A planned check links its plan");
  const replay = { requestId: randomUUID(), product: "Bracket", check: "Burr", result: "fail", quantity: 10, defectReason: "Sharp edge", note: "" };
  const failed = await ok("operator", "POST", path, replay, 201);
  assert.equal((await ok("operator", "POST", path, replay, 201)).id, failed.id, "A retry records nothing new");
  await ok("operator", "POST", path, { ...replay, quantity: 11 }, 409);
  await inspect({ result: "fail", quantity: 1 }, 400); // no defect reason
  await inspect({ product: "Gear", result: "pass", quantity: 1 }, 400); // not a shift product
  await inspect({ result: "pass", quantity: 1 }, 403, "viewer");

  // Rework: six of ten failed parts pass reinspection; more than the remaining four is refused.
  await inspect({ result: "pass", quantity: 6, reinspectsId: failed.id });
  await inspect({ result: "pass", quantity: 5, reinspectsId: failed.id }, 400);
  await inspect({ result: "pass", quantity: 1, reinspectsId: passed.id }, 400);
  // Corrections keep the original, apply once, and wait for reinspections to be corrected first.
  await inspect({ result: "pass", quantity: 38, supersedesId: passed.id, correctionReason: "Recount" });
  await inspect({ result: "pass", quantity: 39, supersedesId: passed.id, correctionReason: "Again" }, 409);
  await inspect({ result: "fail", quantity: 9, defectReason: "Sharp edge", supersedesId: failed.id, correctionReason: "Recount" }, 409);
  const adHoc = await inspect({ product: "Housing", check: "Colour", result: "unknown", quantity: 3 });
  assert.equal(adHoc.planId, null);

  const view = await ok("viewer", "GET", path);
  assert.equal(view.source, "manual inspection");
  assert.deepEqual(view.products, ["Bracket", "Housing"]);
  assert.deepEqual(view.summary.checks, [
    { product: "Bracket", check: "Burr", inspected: 48, passed: 38, failed: 4, reworked: 6, unknown: 0 },
    { product: "Housing", check: "Colour", inspected: 3, passed: 0, failed: 0, reworked: 0, unknown: 3 },
  ]);
  assert.deepEqual(view.summary.missing, [{ product: "Bracket", check: "Length" }]);
  assert.equal(view.inspections.find((i) => i.id === passed.id).current, false, "The original stays readable");

  // An operator records the missing planned check in the shift workspace.
  const page = await actors.operator.newPage();
  await page.goto(frontend + "/production");
  await page.getByLabel("Select shift").click();
  await page.getByRole("option", { name: /^Inspection shift/ }).click();
  await expect(page.getByText("Planned checks without an inspection: Bracket · Length")).toBeVisible();
  await page.getByRole("combobox", { name: "Inspected product" }).click();
  await page.getByRole("option", { name: "Bracket" }).click();
  await page.getByRole("textbox", { name: "Check" }).fill("Length");
  await page.getByRole("combobox", { name: "Inspection result" }).click();
  await page.getByRole("option", { name: "fail" }).click();
  await page.getByLabel("Parts inspected").fill("2");
  await page.getByLabel("Defect reason").fill("Too short");
  await page.getByRole("button", { name: "Record inspection" }).click();
  const summary = page.getByRole("table", { name: "Inspection summary" });
  await expect(summary.getByRole("row", { name: "Bracket Length 2 0 2 0 0" })).toBeVisible();
  await expect(page.getByText(/Planned checks without an inspection/)).toHaveCount(0);
  await page.screenshot({ path: ".local/daily-evidence/job-inspections.png", fullPage: true });
  await page.close();
  console.log(JSON.stringify({ jobInspections: "passed", checks: view.summary.checks.length }));
});
