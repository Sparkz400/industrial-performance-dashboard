import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";
import { factoryScenario, scenarios } from "./factory-scenario.mjs";
import { validateCatalog } from "./profile-catalog.mjs";
import { verifyShiftEvidence } from "./verify-shift-evidence.mjs";
import { canonicalJson } from "../server/src/utils/canonicalJson.ts";

const catalog = JSON.parse(await readFile("profiles/catalog.json", "utf8"));
assert.equal((await validateCatalog(catalog)).length, 2);
assert.deepEqual(
  JSON.parse(await readFile("profiles/owned-legacy.json", "utf8")),
  JSON.parse(await readFile("examples/legacy-production-profile.json", "utf8")),
  "Catalog legacy profile must match the exercised gateway fixture",
);
for (const change of [
  (v) => v.push(v[0]),
  (v) => {
    v[0].qualification.level = "physically-verified";
  },
  (v) => {
    v[0].password = "forbidden";
  },
  (v) => {
    v[0].qualification.evidence = ["../outside.md"];
  },
  (v) => {
    v[0].profile = "../examples/legacy-production-profile.json";
  },
]) {
  const copy = structuredClone(catalog);
  change(copy);
  await assert.rejects(() => validateCatalog(copy));
}
const rehash = (bundle) => {
  bundle.sha256 = createHash("sha256")
    .update(canonicalJson(bundle.payload))
    .digest("hex");
  return bundle;
};
await mkdir(".local/community-evidence", { recursive: true });
await dailyFixture(async ({ pool, users, call, actors, frontend, expect }) => {
  let known;
  for (const scenario of scenarios) {
    const seeded = await factoryScenario(pool, users.admin.id, scenario);
    const response = await call(
      "admin",
      "GET",
      `/api/v1/production/shifts/${seeded.shiftId}/evidence`,
    );
    assert.equal(response.status(), 200, await response.text());
    const bundle = await response.json();
    const verified = await verifyShiftEvidence(bundle);
    assert.equal(verified.authenticated, false);
    if (scenario === "known") {
      known = { ...seeded, bundle };
      assert(Math.abs(verified.oee.overall - 13 / 30) < 1e-10);
      assert.deepEqual(bundle.payload.report.quantities, {
        total: 15,
        good: 13,
        reject: 2,
      });
      assert.equal(bundle.payload.report.seconds.running, 30);
      assert.equal(bundle.payload.report.seconds.fault, 30);
      assert.equal(bundle.payload.report.verified, true);
    } else {
      assert.equal(verified.oee.overall, null, scenario);
      assert(verified.issues.length > 0, scenario);
    }
    assert.equal(
      bundle.payload.calculations[0].samples.ProductionCount[0].rawValue,
      scenario === "counter-reset" ? 10 : 0,
    );
    await writeFile(
      `.local/community-evidence/${scenario}.json`,
      JSON.stringify(bundle, null, 2),
    );
  }
  const corrupted = structuredClone(known.bundle);
  corrupted.payload.report.quantities.good++;
  await assert.rejects(() => verifyShiftEvidence(corrupted), /hash mismatch/);
  await assert.rejects(
    () => verifyShiftEvidence(rehash(corrupted)),
    /does not reproduce/,
  );
  const identity = structuredClone(known.bundle);
  identity.payload.calculations[0].samples.ProductionCount[0].signalMetadata.identifier =
    "s=Other";
  await assert.rejects(
    () => verifyShiftEvidence(rehash(identity)),
    /source identity/,
  );
  const algorithm = structuredClone(known.bundle);
  algorithm.payload.calculatorSha256 = "0".repeat(64);
  await assert.rejects(
    () => verifyShiftEvidence(rehash(algorithm)),
    /Calculator differs/,
  );

  // Existing asset grants protect both the report and the raw evidence.
  await pool.query("DELETE FROM machine_grants WHERE user_id=$1", [
    users.viewer.id,
  ]);
  assert.equal(
    (
      await call(
        "viewer",
        "GET",
        `/api/v1/production/shifts/${known.shiftId}/evidence`,
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await call(
        "operator",
        "GET",
        `/api/v1/production/shifts/${known.shiftId}/evidence`,
      )
    ).status(),
    200,
  );

  await expect
    .poll(
      async () =>
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM audit_logs WHERE action='export.shift_evidence' AND entity_id=$1 AND user_id=$2",
            [String(known.shiftId), users.operator.id],
          )
        ).rows[0].n,
    )
    .toBe(1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_logs WHERE action='export.shift_evidence' AND user_id=$1",
        [users.viewer.id],
      )
    ).rows[0].n,
    0,
  );

  // Corrections, late arrivals and revision references survive an offline export.
  await pool.query(
    "UPDATE opcua_data SET correction_revision=1, received_at=timestamp + interval '10 minutes' WHERE machine_id=$1",
    [known.machineId],
  );
  await pool.query(
    "INSERT INTO shift_report_revisions(shift_id,snapshot,digest,created_by) VALUES ($1,$2,$3,$4)",
    [
      known.shiftId,
      known.bundle.payload.report,
      "a".repeat(64),
      users.admin.id,
    ],
  );
  const corrected = await (
    await call(
      "admin",
      "GET",
      `/api/v1/production/shifts/${known.shiftId}/evidence`,
    )
  ).json();
  assert.equal((await verifyShiftEvidence(corrected)).revisionsReferenced, 1);
  assert.equal(
    corrected.payload.report.measurementEvidence.correctedSamples,
    20,
  );
  assert.equal(corrected.payload.report.measurementEvidence.lateSamples, 20);

  // Multiple product standards use exactly the same aggregation online and offline.
  const { start, end } = known.bundle.payload.report;
  const middle = new Date(Date.parse(start) + 30000).toISOString();
  const runs = [
    {
      start,
      end: middle,
      reference: "R1",
      product: "A",
      target: 15,
      idealCycleMs: 1000,
    },
    {
      start: middle,
      end,
      reference: "R2",
      product: "B",
      target: 0,
      idealCycleMs: 2000,
    },
  ];
  await pool.query(
    "UPDATE production_shifts SET runs=$1, plan_version=2 WHERE id=$2",
    [JSON.stringify(runs), known.shiftId],
  );
  const multi = await (
    await call(
      "admin",
      "GET",
      `/api/v1/production/shifts/${known.shiftId}/evidence`,
    )
  ).json();
  assert.equal(multi.payload.calculations.length, 3);
  assert(
    Math.abs((await verifyShiftEvidence(multi)).oee.overall - 13 / 60) < 1e-10,
  );
  await writeFile(
    ".local/community-evidence/multiple-products.json",
    JSON.stringify(multi, null, 2),
  );

  const manual = await factoryScenario(pool, users.admin.id, "gap");
  const {
    rows: [manualShift],
  } = await pool.query(
    'SELECT start, "end" FROM production_shifts WHERE id=$1',
    [manual.shiftId],
  );
  await pool.query(
    "INSERT INTO operator_entries(request_id,machine_id,shift_id,kind,text,status,quantity,created_by) VALUES ($1,$2,$3,'quantity','Reviewed fixture','resolved',$4,$5)",
    [
      randomUUID(),
      manual.machineId,
      manual.shiftId,
      { total: 15, good: 13, reject: 2 },
      users.admin.id,
    ],
  );
  await pool.query(
    "INSERT INTO operator_entries(request_id,machine_id,shift_id,kind,text,status,manual_state,interval_start,interval_end,created_by) VALUES ($1,$2,$3,'state','Reviewed fixture','resolved','running',$4,$5,$6)",
    [
      randomUUID(),
      manual.machineId,
      manual.shiftId,
      manualShift.start,
      new Date(+manualShift.start + 30000),
      users.admin.id,
    ],
  );
  await pool.query(
    "INSERT INTO operator_entries(request_id,machine_id,shift_id,kind,text,created_by) VALUES ($1,$2,$3,'note','PRIVATE-HANDOVER-NOTE',$4)",
    [randomUUID(), manual.machineId, manual.shiftId, users.admin.id],
  );
  const declared = await (
    await call(
      "admin",
      "GET",
      `/api/v1/production/shifts/${manual.shiftId}/evidence`,
    )
  ).json();
  assert.equal(declared.payload.report.quantitySource, "declaration");
  assert.equal(declared.payload.report.stateSource, "mixed");
  assert.equal(declared.payload.report.verified, false);
  assert(!JSON.stringify(declared).includes("PRIVATE-HANDOVER-NOTE"));
  assert(
    Math.abs((await verifyShiftEvidence(declared)).oee.overall - 13 / 30) <
      1e-10,
  );
  await writeFile(
    ".local/community-evidence/manual-declarations.json",
    JSON.stringify(declared, null, 2),
  );

  const page = await actors.admin.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${frontend}/production?shift=${known.shiftId}`);
  await expect(
    page.getByRole("button", {
      name: "Export reproducible evidence",
      exact: true,
    }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export reproducible evidence", exact: true })
    .click();
  const download = await pending;
  await download.saveAs(".local/community-evidence/browser-download.json");
  await verifyShiftEvidence(
    JSON.parse(
      await readFile(".local/community-evidence/browser-download.json", "utf8"),
    ),
  );
  await page.screenshot({
    path: ".local/community-evidence/evidence-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Export reproducible evidence", exact: true })
    .scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: ".local/community-evidence/evidence-mobile.png",
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      communityWorkflows: "passed",
      scenarios: scenarios.length,
      catalogProfiles: catalog.length,
      offlineTamperAndAccessChecks: true,
      browserDownload: true,
    }),
  );
});
