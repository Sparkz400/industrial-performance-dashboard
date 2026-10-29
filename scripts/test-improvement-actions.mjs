import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// M06: an improvement action is judged against frozen shift revisions before and after it,
// per scheduled hour, with product mix, hours and meter coverage visible and unfair deltas withheld.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const { canonicalJson } = await import("../server/dist/src/utils/canonicalJson.js");
  const [machine, other] = (
    await pool.query(
      `INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES
       ('Kaizen press','opc.tcp://127.0.0.1:49984','127.0.0.1',false),
       ('Unrelated press','opc.tcp://127.0.0.1:49985','127.0.0.1',false) RETURNING id`,
    )
  ).rows.map((r) => r.id);
  for (const role of ["supervisor", "operator"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
  const profile = {
    version: 1,
    name: "Kaizen profile",
    endpointModel: "fixture",
    signals: { state: { nodeKey: "State", namespaceUri: "urn:fixture", identifier: "s=State", dataType: "Double", unit: null, scale: 1 } },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000,
    maxGapSeconds: 60,
    counterPolicy: "reset-to-zero",
  };
  // Fixture: frozen, verified shift revisions with known numbers and matching digests.
  const revision = async (machineId, day, { good = 2880, availability = 0.8, idle = 3600, product = "Bracket", kWh = 0.5 } = {}) => {
    const start = new Date(Date.UTC(2026, 4, day, 6)).toISOString(),
      end = new Date(Date.UTC(2026, 4, day, 14)).toISOString();
    const [{ id }] = (
      await pool.query(
        `INSERT INTO production_shifts(machine_id,name,timezone,start,"end",profile,job,created_by)
         VALUES($1,$2,'UTC',$3,$4,$5,$6,$7) RETURNING id`,
        [machineId, `Day ${day}`, start, end, profile, { reference: "J", product, target: null }, users.admin.id],
      )
    ).rows;
    const snapshot = {
      revision: "shift-v1", id, machineId, name: `Day ${day}`, timezone: "UTC", start, end,
      generatedAt: new Date(Date.UTC(2026, 4, day, 15)).toISOString(), profile,
      job: { reference: "J", product, target: null }, intervals: [], reasons: [],
      seconds: { running: 21600, idle, fault: 0, planned: 0, unknown: 0 },
      scheduledSeconds: 28800, plannedSeconds: 0, observedSeconds: 28800,
      quantities: { total: good, good, reject: 0 },
      oee: { availability, performance: 0.5, quality: 1, overall: availability * 0.5 },
      losses: [], issues: [], evidence: null, verified: true,
      energy: { configured: true, complete: true, meter: { id: 1 }, kWhPerGoodPart: kWh },
    };
    const digest = createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
    return (
      await pool.query(
        "INSERT INTO shift_report_revisions(shift_id,snapshot,digest,created_by) VALUES($1,$2,$3,$4) RETURNING id",
        [id, snapshot, digest, users.supervisor.id],
      )
    ).rows[0].id;
  };
  const a = await revision(machine, 1),
    b = await revision(machine, 2),
    c = await revision(machine, 11, { good: 3600, availability: 0.9, idle: 1800, kWh: 0.45 }),
    d = await revision(machine, 12, { product: "Housing" }),
    foreign = await revision(other, 3);
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const base = `/comparisons/machines/${machine}`;
  assert.deepEqual((await ok("supervisor", "GET", `${base}/revisions`)).map((r) => r.revisionId), [d, c, b, a]);
  await ok("operator", "GET", `${base}/revisions`, undefined, 403);
  const action = (body, status = 201, role = "supervisor") =>
    ok(role, "POST", `${base}/actions`, {
      title: "New feeder guide",
      description: "Reduces jams at the infeed",
      implementedAt: "2026-05-10T00:00:00Z",
      beforeRevisionIds: [a, b],
      afterRevisionIds: [c],
      ...body,
    }, status);
  await action({}, 403, "operator");
  await action({ afterRevisionIds: [c, a] }, 400); // one shift on both sides
  await action({ beforeRevisionIds: [a, c] }, 400); // a "before" shift after the action
  await action({ beforeRevisionIds: [foreign] }, 404);
  const saved = await action({});
  assert.equal(saved.evaluation.comparable, true);
  const metric = (result, key) => result.evaluation.metrics.find((m) => m.key === key);
  assert.deepEqual(
    { ...metric(saved, "goodPerScheduledHour") },
    { key: "goodPerScheduledHour", before: 360, after: 450, delta: 90, reasons: [] },
  );
  assert.ok(Math.abs(metric(saved, "kWhPerGoodPart").delta + 0.05) < 1e-9);
  const mixed = await action({ title: "Second guide", afterRevisionIds: [d] });
  assert.deepEqual(mixed.evaluation.reasons, ["product-mix"]);
  assert.ok(mixed.evaluation.metrics.every((m) => m.delta === null));

  // A revision that no longer matches its digest marks only the actions using it.
  await pool.query("UPDATE shift_report_revisions SET snapshot=jsonb_set(snapshot,'{quantities,good}','9999') WHERE id=$1", [d]);
  const listed = await ok("supervisor", "GET", `${base}/actions`);
  assert.equal(listed.find((x) => x.id === mixed.id).evaluation, null);
  assert.match(listed.find((x) => x.id === mixed.id).problem, /cannot be verified/);
  assert.equal(listed.find((x) => x.id === saved.id).evaluation.comparable, true);

  // A supervisor records an action in Daily operations and reads the normalised result.
  const local = (iso) => {
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const page = await actors.supervisor.newPage();
  await page.goto(`${frontend}/operations`);
  await page.getByRole("combobox", { name: "Machine", exact: true }).fill("Kaizen");
  await page.getByRole("option", { name: "Kaizen press", exact: true }).click();
  await page.getByRole("tab", { name: "Improvement actions" }).click();
  await page.getByLabel("Action title").fill("Infeed sensor moved");
  await page.getByLabel("What changed and the expected effect").fill("Fewer false stops");
  await page.getByLabel("Implemented at").fill(local("2026-05-10T00:00:00Z"));
  await page.getByRole("checkbox", { name: "Before Day 1", exact: true }).check();
  await page.getByRole("checkbox", { name: "Before Day 2", exact: true }).check();
  await page.getByRole("checkbox", { name: "After Day 11", exact: true }).check();
  await page.getByRole("button", { name: "Record improvement action" }).click();
  const table = page.getByRole("table", { name: "Before and after: Infeed sensor moved" });
  await expect(table.getByRole("row", { name: "Good parts per scheduled hour 360 450 90" })).toBeVisible();
  await expect(page.getByText(/not proof that the action caused it/)).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/improvement-actions.png", fullPage: true });
  await page.close();
  console.log(JSON.stringify({ improvementActions: "passed" }));
});
