import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { expect } from "@playwright/test";

// An owned loopback SMTP receiver: no messages can leave the test machine.
export async function createSmtpFixture() {
  const fixture = { captures: [], failures: 0, rejected: new Set(), sockets: new Set() };
  const server = createServer((socket) => {
    fixture.sockets.add(socket);
    socket.on("close", () => fixture.sockets.delete(socket));
    socket.on("error", () => {});
    socket.write("220 owned-fixture ESMTP\r\n");
    let buffer = "", data = false, body = [], recipients = [];
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 32 * 1024 * 1024) return socket.destroy();
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line !== ".") { body.push(line); continue; }
          data = false;
          const delivered = fixture.failures === 0;
          if (fixture.failures) fixture.failures--;
          fixture.captures.push({ recipients: [...recipients], body: body.join("\r\n"), delivered });
          body = [];
          socket.write(delivered ? "250 queued by owned fixture\r\n" : "451 owned transient failure\r\n");
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250-owned-fixture\r\n250 SIZE 33554432\r\n");
        else if (/^MAIL FROM:/.test(line)) { recipients = []; socket.write("250 OK\r\n"); }
        else if (/^RCPT TO:/.test(line)) { const recipient = /<([^>]+)>/.exec(line)?.[1]; if (fixture.rejected.has(recipient)) socket.write("450 owned temporary recipient rejection\r\n"); else { recipients.push(recipient); socket.write("250 OK\r\n"); } }
        else if (line === "DATA") { data = true; body = []; socket.write("354 End with dot\r\n"); }
        else if (line === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return Object.assign(fixture, { port: server.address().port, close: async () => { for (const socket of fixture.sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); } });
}

export async function testReportJobs({ call, pool, page, frontend, smtp, waitFor, reportScheduler, machine }) {
  const { reportJobService } = await import("../server/dist/src/services/reportJobService.js");
  const templateResponse = await call("POST", "/api/v1/reports/templates", { name: "Durable fixture", type: "custom", templateConfig: { lookbackHours: 1, sections: [{ type: "trending", machineId: machine.id, nodeKeys: ["ProductionState"] }] } });
  assert.equal(templateResponse.status(), 201, await templateResponse.text());
  const template = await templateResponse.json();
  const scheduleResponse = await call("POST", "/api/v1/reports/schedules", { name: "Durable delivery", templateId: template.id, cronExpression: "0 * * * *", timezone: "Europe/Berlin", machineIds: [machine.id], recipients: ["first@example.com", "second@example.com"], deliveryChannels: ["email"], isActive: false });
  assert.equal(scheduleResponse.status(), 201, await scheduleResponse.text());
  const schedule = await scheduleResponse.json();
  reportScheduler.stop();
  const row = async (id) => (await pool.query("SELECT * FROM report_history WHERE id=$1", [id])).rows[0];

  // Kill an actual worker while its trend query waits on our table lock.
  const crash = await reportJobService.enqueueManual(schedule.id);
  const blocker = await pool.connect();
  let child;
  try {
    await blocker.query("BEGIN");
    await blocker.query("LOCK TABLE opcua_data IN ACCESS EXCLUSIVE MODE");
    const code = `if (!/^pd_shift_[a-f0-9]+$/.test(process.env.DB_NAME ?? "") || process.env.DB_PORT !== "55432") throw new Error("Owned DB required"); const {reportJobService}=await import("./server/dist/src/services/reportJobService.js"); await reportJobService.processPending();`;
    child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: process.env, cwd: process.cwd(), windowsHide: true, stdio: "ignore" });
    await waitFor(async () => (await row(crash.id)).status === "generating", "Owned child did not begin report generation");
    const stopped = once(child, "exit"); child.kill("SIGKILL"); await stopped;
    assert.equal((await row(crash.id)).status, "generating");
  } finally { if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await blocker.query("ROLLBACK"); blocker.release(); }
  smtp.failures = 1;
  await reportJobService.processPending();
  let recovered = await row(crash.id);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.attempts, 2);
  assert.equal(recovered.email_status, "retrying");
  const hash = createHash("sha256").update(await readFile(recovered.file_path)).digest("hex");
  await pool.query("UPDATE report_history SET email_retry_at=now()-interval '1 second' WHERE id=$1", [crash.id]);
  await reportJobService.processPending();
  recovered = await row(crash.id);
  assert.equal(recovered.email_status, "sent");
  assert.equal(recovered.email_attempts, 2);
  assert.equal(recovered.attempts, 2, "Email retries must not regenerate the PDF");
  assert.equal(createHash("sha256").update(await readFile(recovered.file_path)).digest("hex"), hash);
  assert.equal(smtp.captures[0].body.match(/^Message-ID:\s*(<[^>]+>)/mi)[1], smtp.captures[1].body.match(/^Message-ID:\s*(<[^>]+>)/mi)[1]);
  assert.ok(smtp.captures[1].body.includes("application/pdf"));

  // Partial SMTP acceptance only retries recipients that were not accepted.
  smtp.rejected.add("second@example.com");
  const partial = await reportJobService.enqueueManual(schedule.id);
  await reportJobService.processPending();
  assert.deepEqual((await row(partial.id)).email_remaining, ["second@example.com"]);
  smtp.rejected.clear();
  await pool.query("UPDATE report_history SET email_retry_at=now()-interval '1 second' WHERE id=$1", [partial.id]);
  await reportJobService.processPending();
  assert.deepEqual(smtp.captures.at(-1).recipients, ["second@example.com"]);
  assert.equal((await row(partial.id)).email_status, "sent");

  const config = (await import("../server/dist/src/config/config.js")).default;
  const smtpHost = config.SMTP_HOST;
  const blocked = await reportJobService.enqueueManual(schedule.id);
  try {
    config.SMTP_HOST = "";
    await reportJobService.processPending();
    assert.equal((await row(blocked.id)).email_status, "blocked");
    assert.equal((await row(blocked.id)).email_attempts, 0);
  } finally { config.SMTP_HOST = smtpHost; }
  await pool.query("UPDATE report_history SET email_retry_at=now()-interval '1 second' WHERE id=$1", [blocked.id]);
  await reportJobService.processPending();
  assert.equal((await row(blocked.id)).email_status, "sent");

  // Terminal delivery failure is visible and manually retryable from the browser.
  smtp.failures = 5;
  const terminal = await reportJobService.enqueueManual(schedule.id);
  for (let attempt = 0; attempt < 5; attempt++) { await pool.query("UPDATE report_history SET email_retry_at=now()-interval '1 second' WHERE id=$1", [terminal.id]); await reportJobService.processPending(); }
  assert.equal((await row(terminal.id)).email_status, "failed");
  assert.equal((await row(terminal.id)).email_retry_at, null);
  await page.goto(`${frontend}/reports/history`);
  await expect(page.getByRole("button", { name: `Retry #${terminal.id}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Retry #${terminal.id}`, exact: true }).click();
  await waitFor(async () => (await row(terminal.id)).email_status === "sent", "Manual delivery retry did not finish");
  await expect(page.getByRole("row").filter({ hasText: "Durable delivery" }).first().getByText("sent", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/production-evidence/report-delivery.png", fullPage: true });

  // A saved cursor catches up missed intervals once, even with competing schedulers.
  const at = new Date("2026-10-25T05:00:00Z"), now = new Date("2026-10-25T08:00:01Z");
  await pool.query("UPDATE report_schedules SET is_active=true,next_run_at=$2,recipients='[]' WHERE id=$1", [schedule.id, at]);
  await Promise.all([reportJobService.enqueueDue(now), reportJobService.enqueueDue(now)]);
  const queued = (await pool.query("SELECT * FROM report_history WHERE schedule_id=$1 AND run_key LIKE 'scheduled:%' ORDER BY scheduled_for", [schedule.id])).rows;
  assert.deepEqual(queued.map((job) => job.scheduled_for.toISOString()), ["2026-10-25T05:00:00.000Z", "2026-10-25T06:00:00.000Z", "2026-10-25T07:00:00.000Z", "2026-10-25T08:00:00.000Z"]);
  await pool.query("UPDATE report_schedules SET is_active=false WHERE id=$1", [schedule.id]);
  const requestId = randomUUID();
  const first = await reportJobService.enqueueManual(schedule.id, requestId), repeated = await reportJobService.enqueueManual(schedule.id, requestId);
  assert.equal(first.id, repeated.id);
  // Existing jobs retain their snapshotted config when the schedule/template are removed.
  await pool.query("DELETE FROM report_templates WHERE id=$1", [template.id]);
  await reportJobService.processPending();
  assert.equal((await row(queued[0].id)).status, "completed");
  assert.equal((await row(queued[0].id)).scheduled_for.toISOString(), at.toISOString());
  assert.equal((await row(queued[0].id)).schedule_id, null);
  assert.equal((await row(first.id)).email_status, "not-requested");
  await reportJobService.processPending();
  console.log("PASS: report process termination/recovery, stable periods, schedule catch-up/deduplication, SMTP retries/partial delivery and browser retry");
}
