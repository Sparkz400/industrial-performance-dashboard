import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";
import { createSmtpFixture } from "./test-report-jobs.mjs";

// A05: alarm email destinations use the durable outbox: routing by severity and
// machine, retries through a mail-server outage as one message, and a browser setup.
const smtp = await createSmtpFixture();
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = String(smtp.port);
process.env.SMTP_FROM = "alarms@example.com";

try {
  await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
    const [a, b] = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Mail press A','opc.tcp://127.0.0.1:49990','127.0.0.1',false),('Mail press B','opc.tcp://127.0.0.1:49991','127.0.0.1',false) RETURNING id",
      )
    ).rows.map((r) => r.id);
    for (const invalid of [
      { kind: "email", recipients: ["ops@example.com"], url: "https://x.example", events: ["alarm.triggered"] },
      { kind: "email", recipients: ["ops@example.com"], events: ["cmms.handoff"] },
      { kind: "email", recipients: [], events: ["alarm.triggered"] },
      { kind: "webhook", url: "https://x.example/hook", recipients: ["ops@example.com"], events: ["alarm.triggered"] },
    ])
      assert.equal(
        (await call("admin", "POST", "/api/v1/webhooks", { name: "Invalid", ...invalid })).status(),
        400,
        JSON.stringify(invalid),
      );
    const created = await call("admin", "POST", "/api/v1/webhooks", {
      name: "Shift lead mail",
      kind: "email",
      recipients: ["shift-lead@example.com"],
      events: ["alarm.triggered"],
      minSeverity: "high",
      machineIds: [a],
    });
    assert.equal(created.status(), 201, await created.text());
    const destination = await created.json();

    // Three alarms; only machine A's high-severity one is routed to this destination.
    for (const [machine, key, severity] of [
      [a, "Pressure", "high"],
      [a, "Temperature", "low"],
      [b, "Pressure", "high"],
    ])
      await pool.query(
        "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold,severity,cooldown_seconds) VALUES($1,$2,$3,'gt',10,$4,0)",
        [`${key} ${severity} on ${machine}`, machine, key, severity],
      );
    const { AlarmEvaluator } = await import("../server/dist/src/services/alarmService.js");
    const evaluator = new AlarmEvaluator();
    await evaluator.loadRules();
    const at = new Date();
    for (const [machine, key] of [
      [a, "Pressure"],
      [a, "Temperature"],
      [b, "Pressure"],
    ])
      await evaluator.evaluate({
        id: randomUUID(),
        data: { machineId: machine, key, label: key, timestamp: at, receivedAt: at, sourceTimestamp: at, value: 50, statusCode: "Good" },
      });
    const deliveries = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE webhook_id=$1", [destination.id])
    ).rows;
    assert.equal(deliveries.length, 1, "Routing by severity and machine");
    assert.equal(deliveries[0].event.payload.machineId, a);

    // Mail server outage: two transient failures, then one accepted message.
    const { webhookService } = await import("../server/dist/src/services/webhookService.js");
    smtp.failures = 2;
    for (let i = 0; i < 3; i++) {
      await pool.query("UPDATE webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [deliveries[0].id]);
      await webhookService.processDeliveries();
    }
    const [sent] = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [deliveries[0].id])
    ).rows;
    assert.ok(sent.delivered_at, sent.last_error);
    assert.equal(sent.attempts, 3);
    const messageId = `<delivery-${deliveries[0].id}@performance-dashboard>`;
    const attempts = smtp.captures.filter((c) => c.body.includes(messageId));
    assert.deepEqual(
      attempts.map((c) => c.delivered),
      [false, false, true],
      "Every attempt is the same message; one is accepted",
    );
    assert.deepEqual(attempts[2].recipients, ["shift-lead@example.com"]);
    assert.match(attempts[2].body, /Subject: \[Performance Dashboard\] Alarm: Pressure high/);
    assert.match(attempts[2].body, /check the machine before acting/);

    // The test button sends a separate test message.
    const test = await (await call("admin", "POST", `/api/v1/webhooks/${destination.id}/test`)).json();
    assert.equal(test.success, true, test.message);
    assert.ok(smtp.captures.at(-1).body.includes("Test notification"));

    // Browser: create an email destination with routing.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/settings`);
    await page.getByRole("tab", { name: "Webhooks" }).click();
    await page.getByRole("button", { name: "Add destination" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Maintenance mail");
    await dialog.getByRole("combobox", { name: "Destination type" }).click();
    await page.getByRole("option", { name: /^Email/ }).click();
    await dialog.getByLabel("Recipients").fill("maintenance@example.com");
    await dialog.getByRole("combobox", { name: "Events", exact: true }).click();
    await page.getByRole("option", { name: "Alarm Triggered" }).click();
    await page.keyboard.press("Escape");
    await dialog.getByRole("combobox", { name: "Lowest alarm severity delivered" }).click();
    await page.getByRole("option", { name: "critical" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/Email to maintenance@example.com · critical and above/)).toBeVisible();
    const [stored] = (
      await pool.query("SELECT kind, url, recipients, min_severity FROM webhooks WHERE name='Maintenance mail'")
    ).rows;
    assert.deepEqual(stored, {
      kind: "email",
      url: null,
      recipients: ["maintenance@example.com"],
      min_severity: "critical",
    });
    console.log(JSON.stringify({ alarmEmail: "passed", attempts: attempts.length }));
  });
} finally {
  await smtp.close();
}
