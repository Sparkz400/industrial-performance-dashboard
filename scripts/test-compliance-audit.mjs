import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// Q07: the audit chain stays linear under concurrent writes, covers every recorded field,
// detects edits and deletions, accepts only verified signatures with a meaning, and the
// UI makes no regulatory claim.
process.env.COMPLIANCE_MODE_ENABLED = "true";
process.env.VITE_COMPLIANCE_MODE_ENABLED = "true";

await dailyFixture(async ({ pool, call, actors, frontend, expect, password }) => {
  // A record written by the previous (version 1) algorithm stays verifiable.
  const legacyAt = new Date(Date.now() - 60000);
  const legacy = createHash("sha256")
    .update(
      ["legacy.event", "fixture", "1", "Legacy record", JSON.stringify({ a: 1 }), "", legacyAt.toISOString(), ""].join("|"),
    )
    .digest("hex");
  await pool.query(
    "INSERT INTO compliance_audit_logs(action,entity_type,entity_id,message,metadata,checksum,created_at) VALUES('legacy.event','fixture','1','Legacy record','{\"a\":1}',$1,$2)",
    [legacy, legacyAt],
  );

  const { complianceService } = await import(
    "../server/dist/src/services/complianceService.js"
  );
  const { complianceAuditRepository } = await import(
    "../server/dist/src/repositories/complianceAuditRepository.js"
  );
  // Concurrent writers with keys jsonb will reorder.
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      complianceService.recordComplianceEvent(
        {
          action: "fixture.changed",
          entityType: "fixture",
          entityId: i,
          message: `Change ${i}`,
          metadata: { zeta: i, ab: { y: 2, x: [3, { q: 1, b: 2 }] } },
          reasonForChange: `Owned reason ${i}`,
          snapshotAfter: { value: i, unit: "bar" },
        },
        { userId: 1, username: "fixture", userRole: "admin" },
      ),
    ),
  );
  const rows = (
    await pool.query(
      "SELECT id, checksum, previous_checksum, checksum_version FROM compliance_audit_logs ORDER BY id",
    )
  ).rows;
  assert.equal(rows.length, 26);
  assert.equal(
    new Set(rows.map((r) => r.previous_checksum)).size,
    rows.length,
    "No two records claim the same predecessor",
  );
  assert.ok(rows.slice(1).every((r) => r.checksum_version === 2));
  const check = async () =>
    (await call("admin", "GET", "/api/v1/compliance/integrity-check")).json();
  let integrity = await check();
  assert.deepEqual(
    [integrity.valid, integrity.checkedRecords, integrity.lastChecksum],
    [true, 26, rows.at(-1).checksum],
  );

  // Edits to fields the old checksum ignored are now detected; deletions break the link.
  const middle = rows[10].id;
  await pool.query(
    "UPDATE compliance_audit_logs SET reason_for_change='Edited later' WHERE id=$1",
    [middle],
  );
  integrity = await check();
  assert.deepEqual(
    [integrity.valid, integrity.firstBrokenId, integrity.brokenReason],
    [false, middle, "checksum"],
  );
  await pool.query(
    "UPDATE compliance_audit_logs SET reason_for_change='Owned reason '||entity_id WHERE id=$1",
    [middle],
  );
  assert.equal((await check()).valid, true);
  const [removed] = (
    await pool.query("DELETE FROM compliance_audit_logs WHERE id=$1 RETURNING *", [middle])
  ).rows;
  integrity = await check();
  assert.deepEqual(
    [integrity.valid, integrity.firstBrokenId, integrity.brokenReason],
    [false, rows[11].id, "link"],
  );
  // A range that starts after the gap still compares with the record before it.
  const ranged = await complianceAuditRepository.verifyIntegrity(rows[11].id);
  assert.deepEqual([ranged.valid, ranged.brokenReason], [false, "link"]);
  await pool.query(
    "INSERT INTO compliance_audit_logs SELECT * FROM json_populate_record(NULL::compliance_audit_logs, $1)",
    [JSON.stringify(removed)],
  );
  assert.equal((await check()).valid, true);

  // Signatures: client-made signature metadata is refused; a verified one records its meaning.
  const save = (electronicSignature) =>
    call("admin", "POST", "/api/v1/dashboards/compliance-fixture", {
      name: "Compliance fixture",
      widgets: [],
      layout: [],
      reasonForChange: "Owned signature check",
      electronicSignature,
    });
  for (const forged of [
    { userId: 1, username: "admin", passwordVerified: true },
    { password: "wrong-password", meaning: "approved" },
    { password, meaning: "rubber-stamped" },
  ])
    assert.equal((await save(forged)).status(), 400, JSON.stringify(forged));
  assert.equal((await save({ password, meaning: "approved" })).status(), 200);
  const [signed] = (
    await pool.query(
      "SELECT electronic_signature, reason_for_change FROM compliance_audit_logs WHERE action='dashboard.saved' ORDER BY id DESC LIMIT 1",
    )
  ).rows;
  assert.equal(signed.electronic_signature.meaning, "approved");
  assert.equal(signed.electronic_signature.passwordVerified, true);
  assert.equal(signed.electronic_signature.password, undefined);
  assert.equal(signed.reason_for_change, "Owned signature check");
  assert.equal((await check()).valid, true);

  // Browser: no regulatory claim; the anchor checksum is shown.
  const page = await actors.admin.newPage();
  await page.goto(`${frontend}/compliance`);
  await page.getByRole("tab", { name: /Configuration/ }).click();
  await expect(page.getByText("Audit feature status")).toBeVisible();
  await expect(page.getByText("Not enforced per action")).toBeVisible();
  await expect(page.getByText("21 CFR Part 11 Checklist")).toHaveCount(0);
  await page.getByRole("tab", { name: /Audit Trail/ }).click();
  await page.getByRole("button", { name: "Integrity Check" }).click();
  await expect(page.getByText(/Latest checksum [0-9a-f]{64}/)).toBeVisible();
  console.log(JSON.stringify({ complianceAudit: "passed", records: 27 }));
});
