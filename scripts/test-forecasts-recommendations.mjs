import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// X04: advisory completion estimates from comparable verified runs, reset by a declared process
// change and backtested on the installation's runs. X06: explicit, evidence-citing
// recommendations that supervisors accept with a linked action or dismiss with a reason.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const { canonicalJson } = await import("../server/dist/src/utils/canonicalJson.js");
  const [machine, other] = (
    await pool.query(
      `INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES
       ('Forecast press','opc.tcp://127.0.0.1:49981','127.0.0.1',false),
       ('Other press','opc.tcp://127.0.0.1:49982','127.0.0.1',false) RETURNING id`,
    )
  ).rows.map((r) => r.id);
  for (const role of ["supervisor", "operator", "viewer"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
  const profile = {
    version: 1, name: "Forecast profile", endpointModel: "fixture",
    signals: { state: { nodeKey: "State", namespaceUri: "urn:fixture", identifier: "s=State", dataType: "Double", unit: null, scale: 1 } },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000, maxGapSeconds: 60, counterPolicy: "reset-to-zero",
  };
  // Frozen, digest-checked shift revisions with known numbers.
  const revision = async (machineId, day, { good = 2400, product = "Bracket", verified = true, unknown = 0, losses, tamper = false } = {}) => {
    const start = new Date(Date.UTC(2026, 4, day, 6)).toISOString(),
      end = new Date(Date.UTC(2026, 4, day, 14)).toISOString();
    const [{ id }] = (
      await pool.query(
        `INSERT INTO production_shifts(machine_id,name,timezone,start,"end",profile,job,created_by)
         VALUES($1,$2,'UTC',$3,$4,$5,$6,$7) RETURNING id`,
        [machineId, `Day ${day}`, start, end, profile, { reference: `J${day}`, product, target: null }, users.admin.id],
      )
    ).rows;
    const snapshot = {
      revision: "shift-v1", id, machineId, name: `Day ${day}`, timezone: "UTC", start, end,
      generatedAt: new Date(Date.UTC(2026, 4, day, 15)).toISOString(), profile,
      job: { reference: `J${day}`, product, target: null }, intervals: [], reasons: [],
      seconds: { running: 21600, idle: 7200 - unknown, fault: 0, planned: 0, unknown },
      scheduledSeconds: 28800, plannedSeconds: 0, observedSeconds: 28800 - unknown,
      quantities: { total: good, good, reject: 0 },
      oee: { availability: 0.75, performance: 0.5, quality: 1, overall: 0.375 },
      losses: losses ?? [{ reason: "Belt jam", seconds: 3000 }, { reason: "Unclassified stop", seconds: 1500 }, { reason: "Planned break", seconds: 1800 }],
      issues: verified ? [] : ["Counter gap"], evidence: null, verified,
    };
    const digest = createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
    return (
      await pool.query(
        "INSERT INTO shift_report_revisions(shift_id,snapshot,digest,created_by) VALUES($1,$2,$3,$4) RETURNING id",
        [id, tamper ? { ...snapshot, quantities: { total: 9999, good: 9999, reject: 0 } } : snapshot, digest, users.supervisor.id],
      )
    ).rows[0].id;
  };
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, `${method} ${path}: ${await r.text()}`);
    return r.status() === 204 ? null : r.json().catch(() => null);
  };
  const days = Array.from({ length: 12 }, (_, i) => i + 1);
  const ids = {};
  for (const day of days) ids[day] = await revision(machine, day, { good: 2400 + (day % 4) * 80 });
  await revision(machine, 13, { verified: false });
  ids[14] = await revision(machine, 14, { unknown: 600 });
  ids[15] = await revision(machine, 15, { product: "Housing" });
  await revision(machine, 16, { tamper: true });
  await revision(other, 17);

  // X04: products and an estimate with a range; the backtest runs on the installation's runs.
  const forecast = (query, role = "supervisor", status = 200) =>
    ok(role, "GET", `/forecasts/machines/${machine}/completion${query}`, undefined, status);
  await forecast("?product=Bracket&remaining=1000", "operator", 403);
  await ok("supervisor", "GET", `/forecasts/machines/${other}/completion`, undefined, 403);
  const listing = await forecast("");
  assert.deepEqual(listing.products, ["Bracket", "Housing"]);
  assert.equal(listing.estimate, null);
  const estimated = await forecast("?product=Bracket&remaining=1000");
  assert.equal(estimated.comparableRuns, 12);
  assert.deepEqual(estimated.excluded, { unverified: 1, incompleteCoverage: 1, noGoodCount: 0, beforeProcessChange: 0, otherProduct: 1 });
  assert.equal(estimated.failedIntegrity, 1, "A tampered revision is not used");
  assert.equal(estimated.estimate.status, "estimate");
  const { fast, median, slow } = estimated.estimate.hours;
  assert.ok(fast < median && median < slow, JSON.stringify(estimated.estimate.hours));
  assert.ok(median > 3 && median < 3.5, "About 1000 parts at about 300 per planned hour");
  assert.equal(estimated.backtest.evaluated, 2);
  assert.match(estimated.advisory, /does not reschedule/);

  const page = await actors.supervisor.newPage();
  await page.goto(`${frontend}/operations`);
  await page.getByRole("combobox", { name: "Machine", exact: true }).fill("Forecast");
  await page.getByRole("option", { name: "Forecast press", exact: true }).click();
  const products = page.waitForResponse((r) => r.url().includes("/completion") && r.ok());
  await page.getByRole("tab", { name: "Completion forecast" }).click();
  await products; // the product list comes with the first forecast response
  await page.getByRole("combobox", { name: "Product", exact: true }).click();
  await page.getByRole("option", { name: "Bracket" }).click();
  await page.getByLabel("Remaining good parts").fill("1000");
  await expect(page.getByText(/Estimated planned hours: 3[.,]\d h/)).toBeVisible();
  await expect(page.getByText(/Comparable verified runs: 12/)).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/completion-forecast.png", fullPage: true });

  // A declared process change starts a new comparable history; too few runs withhold.
  const [{ id: change }] = (
    await pool.query(
      `INSERT INTO improvement_actions(machine_id,title,description,implemented_at,before_revision_ids,after_revision_ids,created_by)
       VALUES($1,'New feeder','Faster infeed','2026-05-04T00:00:00Z',$2,$3,$4) RETURNING id`,
      [machine, JSON.stringify([ids[1], ids[2]]), JSON.stringify([ids[5], ids[6]]), users.supervisor.id],
    )
  ).rows;
  const withheld = await forecast("?product=Bracket&remaining=1000");
  assert.equal(withheld.comparableRuns, 9);
  assert.equal(withheld.excluded.beforeProcessChange, 3);
  assert.deepEqual(withheld.estimate, { status: "withheld", reason: "9 comparable verified run(s); at least 10 are needed" });
  await page.reload();
  await page.getByRole("tab", { name: "Completion forecast" }).click();
  // Shown once the forecast data has loaded, so the product list is filled.
  await expect(page.getByText(/Comparable since the process change “New feeder”/)).toBeVisible();
  await page.getByRole("combobox", { name: "Product", exact: true }).click();
  await page.getByRole("option", { name: "Bracket" }).click();
  await page.getByLabel("Remaining good parts").fill("1000");
  await expect(page.getByText(/No estimate: 9 comparable verified run\(s\)/)).toBeVisible();

  // X06: rules over the last verified revisions; decisions need a link or a reason.
  const base = `/recommendations/machines/${machine}`;
  await ok("operator", "GET", base, undefined, 403);
  let recommendations = await ok("supervisor", "GET", base);
  assert.deepEqual(recommendations.map((r) => r.rule), ["classify-stops", "address-top-loss"]);
  const [classify, topLoss] = recommendations;
  // The last five verified, intact revisions of any product (13 is unverified, 16 tampered).
  assert.deepEqual(classify.evidence.revisionIds, [ids[10], ids[11], ids[12], ids[14], ids[15]]);
  assert.equal(Math.round(classify.evidence.share * 100), 33);
  assert.match(topLoss.title, /"Belt jam"/);
  const decide = (body, status) => ok("supervisor", "POST", `${base}/decisions`, body, status);
  await decide({ key: classify.key, decision: "accepted" }, 400);
  await decide({ key: classify.key, decision: "dismissed" }, 400);
  await decide({ key: "classify-stops:999", decision: "dismissed", reason: "Not current" }, 400);
  const [{ id: foreignAction }] = (
    await pool.query(
      `INSERT INTO improvement_actions(machine_id,title,description,implemented_at,before_revision_ids,after_revision_ids,created_by)
       VALUES($1,'Elsewhere','Other machine','2026-05-04T00:00:00Z','[]','[]',$2) RETURNING id`,
      [other, users.supervisor.id],
    )
  ).rows;
  await decide({ key: classify.key, decision: "accepted", improvementActionId: foreignAction }, 400);
  await decide({ key: classify.key, decision: "accepted", improvementActionId: change }, 201);
  await decide({ key: classify.key, decision: "dismissed", reason: "Second decision" }, 409);
  await ok("operator", "POST", `${base}/decisions`, { key: topLoss.key, decision: "dismissed", reason: "Operators cannot" }, 403);

  // In the browser: the evidence and assumptions are shown; a recommendation is dismissed.
  await page.getByRole("tab", { name: "Recommendations" }).click();
  const section = page.getByRole("region", { name: topLoss.title });
  await expect(section.getByText(/Evidence: report revisions/)).toBeVisible();
  await expect(section.getByText(/Assumptions: Largest classified loss/)).toBeVisible();
  await expect(page.getByText(/Accepted: improvement action “New feeder”/)).toBeVisible();
  await section.getByLabel(`Reason to dismiss ${topLoss.title}`).fill("Belt supplier change already scheduled");
  await section.getByRole("button", { name: "Dismiss" }).click();
  await expect(section.getByText("Dismissed: Belt supplier change already scheduled", { exact: false })).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/recommendations.png", fullPage: true });

  // The usefulness log compares what was shown and done for both lists, without a verdict.
  await ok("supervisor", "POST", `${base}/usefulness`, { source: "ranked-losses" }, 204);
  await ok("supervisor", "POST", `${base}/usefulness`, { source: "bogus" }, 400);
  const usefulness = await ok("supervisor", "GET", `${base}/usefulness`);
  assert.ok(usefulness.recommendations.shown >= 1);
  assert.equal(usefulness.recommendations.accepted, 1);
  assert.equal(usefulness.recommendations.dismissed, 1);
  assert.equal(usefulness.rankedLosses.shown, 1);
  assert.match(usefulness.note, /do not show that either list caused/);
  recommendations = await ok("supervisor", "GET", base);
  assert.deepEqual(recommendations.map((r) => r.decision?.decision), ["accepted", "dismissed"]);
  const audit = (await pool.query("SELECT action FROM audit_logs WHERE action LIKE 'recommendation.%' ORDER BY id")).rows.map((r) => r.action);
  assert.deepEqual(audit, ["recommendation.accepted", "recommendation.dismissed"]);
  await page.close();
  console.log(JSON.stringify({ forecastsRecommendations: "passed", comparableRuns: estimated.comparableRuns }));
});
