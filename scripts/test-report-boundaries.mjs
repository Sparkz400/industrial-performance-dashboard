import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dailyFixture } from "./daily-fixture.mjs";

// R05: report downloads stay administrator-only, deleted schedules stop delivering,
// and stored PDFs follow the declared opt-in retention policy.
await dailyFixture(async ({ pool, call, users }) => {
  const reports = process.env.REPORTS_DIR;
  await mkdir(reports, { recursive: true });
  const [{ id: template }] = (
    await pool.query(
      "INSERT INTO report_templates(name,type,template_config) VALUES ('Boundary template','shift','{}') RETURNING id",
    )
  ).rows;
  const [{ id: schedule }] = (
    await pool.query(
      "INSERT INTO report_schedules(template_id,name,cron_expression,recipients,next_run_at) VALUES ($1,'Boundary schedule','0 6 * * *','[\"ops@example.invalid\"]',now()+interval '1 day') RETURNING id",
      [template],
    )
  ).rows;
  const { reportJobService } = await import(
    "../server/dist/src/services/reportJobService.js"
  );
  const queued = await reportJobService.enqueueManual(schedule);
  const history = async (id) =>
    (await pool.query("SELECT * FROM report_history WHERE id=$1", [id])).rows[0];
  const old = new Date(Date.now() - 40 * 86_400_000);
  let owner = schedule;
  const stored = async (name, completedAt, extra = {}) => {
    const file = extra.file ?? join(reports, name);
    await writeFile(file, "%PDF-1.4 owned fixture");
    return (
      await pool.query(
        "INSERT INTO report_history(schedule_id,template_id,status,file_path,completed_at,email_status) VALUES ($1,$2,'completed',$3,$4,$5) RETURNING id",
        [owner, template, file, completedAt, extra.email ?? "sent"],
      )
    ).rows[0].id;
  };
  const awaitingEmail = await stored("awaiting.pdf", old, { email: "queued" });

  for (const role of ["supervisor", "operator", "viewer", "wallboard"]) {
    assert.equal((await call(role, "GET", "/api/v1/reports/history")).status(), 403, role);
    assert.equal(
      (await call(role, "GET", `/api/v1/reports/history/${awaitingEmail}/download`)).status(),
      403,
      role,
    );
  }
  assert.equal(
    (await call("admin", "GET", `/api/v1/reports/history/${awaitingEmail}/download`)).status(),
    200,
  );

  // Deleting the schedule cancels its queued run and undelivered email.
  assert.equal((await call("admin", "DELETE", `/api/v1/reports/schedules/${schedule}`)).status(), 200);
  assert.equal((await history(queued.id)).status, "cancelled");
  assert.equal((await history(awaitingEmail)).email_status, "cancelled");
  await reportJobService.processPending();
  assert.equal((await history(queued.id)).status, "cancelled", "A cancelled run is never generated");
  assert.equal((await history(queued.id)).file_path, null);
  owner = null;

  // Opt-in retention removes only old PDFs inside the reports directory.
  const expired = await stored("expired.pdf", old);
  const recent = await stored("recent.pdf", new Date());
  const outsideDir = await mkdtemp(join(tmpdir(), "pd-outside-"));
  const outsideFile = join(outsideDir, "outside.pdf");
  const outside = await stored("outside.pdf", old, { file: outsideFile });
  assert.equal(await reportJobService.pruneFiles(undefined), 0, "Unset retention keeps every file");
  await reportJobService.pruneFiles(30);
  assert.equal(existsSync(join(reports, "expired.pdf")), false);
  assert.equal((await history(expired)).file_path, null);
  assert.equal((await history(expired)).metadata.retentionDays, 30);
  assert.equal(existsSync(join(reports, "recent.pdf")), true);
  assert.equal(existsSync(outsideFile), true, "Files outside the reports directory are never deleted");
  assert.equal((await history(outside)).file_path, outsideFile);
  assert.equal((await call("admin", "GET", `/api/v1/reports/history/${expired}/download`)).status(), 410);
  assert.equal((await call("admin", "GET", `/api/v1/reports/history/${recent}/download`)).status(), 200);
  await rm(outsideDir, { recursive: true, force: true });

  // A stale session loses download access as soon as the account stops being an administrator.
  await pool.query(
    "UPDATE users SET role='supervisor', updated_at=now() WHERE id=$1",
    [users.admin.id],
  );
  assert.notEqual(
    (await call("admin", "GET", `/api/v1/reports/history/${recent}/download`)).status(),
    200,
  );
  // The delete route refreshes the scheduler; stop it before the owned database is dropped.
  (
    await import("../server/dist/src/services/reportSchedulerService.js")
  ).reportSchedulerService.stop();
  console.log(JSON.stringify({ reportBoundaries: "passed" }));
});
