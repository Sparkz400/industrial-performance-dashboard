import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// D07: without internet access, mail and webhook destinations fail visibly and within
// their timeouts; the report itself still completes and the webhook keeps its event.
process.env.SMTP_HOST = "smtp.offline.invalid";
process.env.SMTP_PORT = "587";
process.env.SMTP_FROM = "reports@example.invalid";

await dailyFixture(async ({ pool, call, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Offline press','opc.tcp://127.0.0.1:49988','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const template = await call("admin", "POST", "/api/v1/reports/templates", {
    name: "Offline report",
    type: "shift",
    templateConfig: {
      title: "Offline report",
      lookbackHours: 1,
      sections: [{ type: "alerts", title: "Alarms", machineId: machine }],
    },
  });
  assert.equal(template.status(), 201, await template.text());
  const schedule = await call("admin", "POST", "/api/v1/reports/schedules", {
    templateId: (await template.json()).id,
    name: "Offline mail",
    cronExpression: "0 6 * * *",
    machineIds: [machine],
    recipients: ["supervisor@example.com"],
  });
  assert.equal(schedule.status(), 201, await schedule.text());
  const started = Date.now();
  const { historyId } = await (
    await call("admin", "POST", `/api/v1/reports/schedules/${(await schedule.json()).id}/run-now`, {})
  ).json();
  const row = async () =>
    (await pool.query("SELECT * FROM report_history WHERE id=$1", [historyId])).rows[0];
  await expect.poll(async () => (await row()).email_error ?? null, { timeout: 60_000 }).not.toBeNull();
  const report = await row();
  assert.equal(report.status, "completed", "The PDF completes even when mail cannot leave");
  assert.notEqual(report.email_status, "sent");
  assert.equal(report.email_error, "Mail server unreachable; check the network and SMTP_HOST, then retry");
  assert.ok(Date.now() - started < 60_000);

  // A webhook to an unresolvable host is refused by the outbound checks and kept.
  await pool.query(
    "INSERT INTO webhooks(name,url,secret,events,is_active) VALUES('Offline hook','https://hooks.offline.invalid/alarm','whsec_owned','[\"alarm.triggered\"]',true)",
  );
  const [{ id: hook }] = (await pool.query("SELECT id FROM webhooks WHERE name='Offline hook'")).rows;
  const [{ id: delivery }] = (
    await pool.query(
      "INSERT INTO webhook_deliveries(webhook_id,event) VALUES($1,$2) RETURNING id",
      [hook, { type: "alarm.triggered", payload: { machineId: machine }, timestamp: new Date().toISOString() }],
    )
  ).rows;
  const { webhookService } = await import("../server/dist/src/services/webhookService.js");
  await webhookService.processDeliveries();
  const [kept] = (await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [delivery])).rows;
  assert.equal(kept.delivered_at, null);
  assert.equal(kept.attempts, 1);
  assert.equal(kept.last_status, 0);
  assert.ok(kept.last_error, "The delivery records why it failed");
  const listed = await (await call("admin", "GET", "/api/v1/webhooks/deliveries")).json();
  assert.ok(listed.some((d) => d.id === delivery && d.lastError));
  // Run-now started the scheduler; stop it before the owned database is dropped.
  (
    await import("../server/dist/src/services/reportSchedulerService.js")
  ).reportSchedulerService.stop();
  console.log(
    JSON.stringify({
      offlineDestinations: "passed",
      mailError: report.email_error.slice(0, 80),
      webhookError: kept.last_error.slice(0, 80),
    }),
  );
});
