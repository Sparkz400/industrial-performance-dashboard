import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// Q04: concurrent batch transitions leave exactly one consistent outcome, and the
// batch page describes application records rather than machine control.
process.env.COMPLIANCE_MODE_ENABLED = "true";
process.env.VITE_COMPLIANCE_MODE_ENABLED = "true";

await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
  const [press, oven] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Batch press','opc.tcp://127.0.0.1:49981','127.0.0.1',false),('Batch oven','opc.tcp://127.0.0.1:49982','127.0.0.1',false) RETURNING id",
    )
  ).rows.map((r) => r.id);
  const create = async (batchNumber, machineId) => {
    const response = await call("admin", "POST", "/api/v1/batches", {
      batchNumber,
      machineId,
    });
    assert.equal(response.status(), 201, await response.text());
    return (await response.json()).id;
  };
  const act = (id, action, data) =>
    call("admin", "POST", `/api/v1/batches/${id}/${action}`, data);
  const statuses = async (...ids) =>
    (
      await pool.query(
        "SELECT id, status FROM batches WHERE id = ANY($1) ORDER BY id",
        [ids],
      )
    ).rows.map((r) => r.status);

  // Two different batches started at once on one machine: one runs, one is refused.
  const [a, b] = [await create("PRESS-A", press), await create("PRESS-B", press)];
  for (let round = 0; round < 5; round++) {
    const results = await Promise.all([act(a, "start"), act(b, "start")]);
    const codes = results.map((r) => r.status()).sort();
    assert.deepEqual(codes, [200, 409], `round ${round}: ${codes}`);
    assert.equal(
      (await statuses(a, b)).filter((s) => s === "running").length,
      1,
    );
    // Put the running one back to planned for the next round (fixture-only SQL).
    await pool.query(
      "UPDATE batches SET status='planned', started_at=NULL, started_by=NULL WHERE id = ANY($1)",
      [[a, b]],
    );
  }

  // The same batch started twice at once: one start is recorded.
  const c = await create("OVEN-C", oven);
  const twice = await Promise.all([act(c, "start"), act(c, "start")]);
  // The loser sees either the already-running state (400) or the lost race (409).
  assert.equal(twice.filter((r) => r.status() === 200).length, 1);
  assert.ok(twice.every((r) => [200, 400, 409].includes(r.status())));

  // Complete and abort racing on the running batch: exactly one final state and one audit row.
  const finish = await Promise.all([
    act(c, "complete"),
    act(c, "abort", { reason: "Owned race fixture" }),
  ]);
  assert.equal(finish.filter((r) => r.status() === 200).length, 1);
  const [finalStatus] = await statuses(c);
  assert.ok(["completed", "aborted"].includes(finalStatus));
  const audits = (
    await pool.query(
      "SELECT action FROM audit_logs WHERE entity_type='batch' AND entity_id=$1 AND action IN ('batch.completed','batch.aborted')",
      [String(c)],
    )
  ).rows.map((r) => r.action);
  assert.deepEqual(audits, [`batch.${finalStatus}`]);

  // A partial (aborted) batch makes no compliance claim.
  const d = await create("OVEN-D", oven);
  assert.equal((await act(d, "start")).status(), 200);
  assert.equal((await act(d, "abort", { reason: "Owned partial" })).status(), 200);
  const aborted = (await pool.query("SELECT * FROM batches WHERE id=$1", [d]))
    .rows[0];
  assert.equal(aborted.status, "aborted");
  assert.equal(aborted.summary, null);

  // Browser: labels say "record", and a refused start is shown instead of failing silently.
  const e = await create("PRESS-E", press);
  assert.equal((await act(a, "start")).status(), 200);
  const page = await actors.admin.newPage();
  await page.goto(`${frontend}/batches`);
  await expect(page.getByText(/never\s+control the machine/)).toBeVisible();
  const row = page.getByRole("row", { name: /PRESS-E/ });
  await row
    .getByRole("button", { name: "Record batch start (does not control the machine)" })
    .click();
  await expect(page.getByText(/already has a running batch/)).toBeVisible();
  assert.deepEqual(await statuses(e), ["planned"]);
  console.log(JSON.stringify({ batchLifecycle: "passed", raceRounds: 5 }));
});
