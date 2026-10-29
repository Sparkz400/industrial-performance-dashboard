import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";
// Batches belong to the experimental module that compliance mode enables.
process.env.COMPLIANCE_MODE_ENABLED = "true";
process.env.VITE_COMPLIANCE_MODE_ENABLED = "true";

// Q05: declared lot links are corrected by appended records; balances, cycles and the trace
// always use the latest correction, and voided links stop connecting batches.
await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
  const request = async (method, path, body, status = 200) => {
    const r = await call("admin", method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const machines = (
    await pool.query(
      `INSERT INTO machines(name,endpoint_url,ip) VALUES
       ('Lot producer','opc.tcp://127.0.0.1:49981','127.0.0.1'),
       ('Lot consumer','opc.tcp://127.0.0.1:49982','127.0.0.1'),
       ('Lot second consumer','opc.tcp://127.0.0.1:49983','127.0.0.1') RETURNING id`,
    )
  ).rows.map((r) => r.id);
  const recipe = (
    await pool.query("INSERT INTO recipes(name,parameters,setpoints) VALUES('Lot fixture','[]','{}') RETURNING id")
  ).rows[0].id;
  const batches = [];
  for (const [i, name] of ["Correction producer", "Correction consumer", "Correction second consumer"].entries())
    batches.push(await request("POST", "/batches", { batchNumber: name, recipeId: recipe, machineId: machines[i] }, 201));
  const [producer, consumer, second] = batches;
  const link = (batch, lot, direction, quantity, extra = {}, status = 201) =>
    request("POST", `/quality/batches/${batch.id}/lots`, { lot, direction, quantity, unit: "pieces", ...extra }, status);
  const correct = (linkId, quantity, previousCorrectionId, status = 201, reason = "Recount") =>
    request("POST", `/quality/lots/${linkId}/corrections`, { quantity, reason, previousCorrectionId }, status);

  const pOut = await link(producer, "L-9", "output", 10);
  const xIn = await link(consumer, "L-9", "input", 6);
  const yIn = await link(second, "L-9", "input", 3);
  // The producer cannot fall below what was consumed; a stale correction is refused.
  await correct(pOut.id, 8, null, 400);
  const c1 = await correct(pOut.id, 9, null);
  await correct(pOut.id, 9.5, null, 409);
  await correct(xIn.id, 7, null, 400);
  await correct(xIn.id, 6, null, 400);
  const c2 = await correct(xIn.id, 5, null);
  // A consumed lot's output cannot be voided until its consumption is.
  await correct(pOut.id, null, c1.id, 409);
  await correct(yIn.id, null, null);
  const c4 = await correct(xIn.id, null, c2.id);
  const c5 = await correct(pOut.id, null, c1.id);
  let trace = await request("GET", `/quality/batches/${consumer.id}/trace`);
  assert.deepEqual(
    trace.links.map((l) => [l.id, l.quantity]),
    [[xIn.id, null]],
    "Void links do not connect batches",
  );
  assert.deepEqual(trace.corrections.map((c) => c.id), [c2.id, c4.id]);
  // Restoring a consumption needs an active producer or a supplier reference.
  await correct(xIn.id, 5, c4.id, 400);
  await correct(pOut.id, 9, c5.id);
  await correct(xIn.id, 5, c4.id);
  trace = await request("GET", `/quality/batches/${consumer.id}/trace`);
  assert.deepEqual(
    trace.links.map((l) => [l.batch_id, l.quantity, l.declared_quantity]),
    [
      [producer.id, 9, 10],
      [consumer.id, 5, 6],
    ],
  );
  assert.equal(trace.corrections.length, 6, "Every correction of the traced links is exported");

  // Restoring a voided output must not close a cycle that later links made possible.
  const xOut = await link(consumer, "L-10", "output", 1);
  const voidedOut = await correct(xOut.id, null, null);
  await link(producer, "L-10", "input", 1, {}, 400);
  await link(producer, "L-10", "input", 1, { supplierReference: "Supplier S-1" });
  await correct(xOut.id, 1, voidedOut.id, 409);

  const detail = await request("GET", `/quality/batches/${consumer.id}`);
  assert.deepEqual(
    detail.lots.map((l) => [l.lot, l.quantity, l.declared_quantity, l.correction_id != null]),
    [
      ["L-9", 5, 6, true],
      ["L-10", null, 1, true],
    ],
  );
  assert.equal(detail.lotCorrections.length, 4);
  assert.equal(
    (await pool.query("SELECT quantity FROM batch_lots WHERE id=$1", [xIn.id])).rows[0].quantity,
    6,
    "The declared link is never rewritten",
  );

  // An administrator corrects the producer in the batch view; a refused change is explained.
  const page = await actors.admin.newPage();
  await page.goto(frontend + "/batches");
  await page
    .getByRole("row")
    .filter({ hasText: "Correction producer" })
    .getByRole("button", { name: /view|detail|data/i })
    .click();
  await page.getByRole("combobox", { name: "Lot link to correct" }).click();
  await page.getByRole("option", { name: /^output · L-9/ }).click();
  await page.getByLabel("Corrected lot quantity").fill("4");
  await page.getByLabel("Correction reason").fill("Recount");
  await page.getByRole("button", { name: "Record lot correction" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Produced quantity cannot fall below recorded consumption" })).toBeVisible();
  await page.getByLabel("Corrected lot quantity").fill("12");
  await page.getByLabel("Correction reason").fill("Recount after scale check");
  await page.getByRole("button", { name: "Record lot correction" }).click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: "output · L-9 · 12 pieces (declared 10 pieces, corrected)" }),
  ).toBeVisible();
  await expect(page.getByText(/Correction \d+ of link \d+: 12 · Recount after scale check/)).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/lot-corrections.png", fullPage: true });
  await page.close();
  console.log(JSON.stringify({ lotCorrections: "passed", traced: trace.links.length }));
});
