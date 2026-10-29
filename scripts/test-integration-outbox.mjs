import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { dailyFixture } from "./daily-fixture.mjs";

// I01: actual alarm events leave through a durable outbox with stable IDs, schema
// versions, dead-letter inspection and requeue; a crash between send and ack resends
// the identical event.
process.env.ALLOW_PRIVATE_OUTBOUND_URLS = "true";
const received = [];
let mode = "ok",
  secret = "",
  sent;
const receiver = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received.push({
    body,
    deliveryId: req.headers["x-webhook-delivery-id"],
    schemaVersion: req.headers["x-webhook-schema-version"],
    signed:
      req.headers["x-webhook-signature"] ===
      createHmac("sha256", secret).update(body).digest("hex"),
  });
  sent?.();
  if (mode === "hang") return; // the response is lost with the sender
  res.writeHead(mode === "fail" ? 503 : 200);
  res.end("owned receiver");
}).listen(0, "127.0.0.1");
await once(receiver, "listening");

try {
  await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
    const [{ id: machine }] = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Outbox press','opc.tcp://127.0.0.1:49994','127.0.0.1',false) RETURNING id",
      )
    ).rows;
    const created = await call("admin", "POST", "/api/v1/webhooks", {
      name: "Owned outbox receiver",
      url: `http://127.0.0.1:${receiver.address().port}/hook`,
      events: ["alarm.triggered"],
    });
    assert.equal(created.status(), 201, await created.text());
    secret = (await created.json()).secret;
    await pool.query(
      "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold,severity,cooldown_seconds) VALUES ('Outbox pressure',$1,'Pressure','gt',10,'high',0)",
      [machine],
    );
    const { AlarmEvaluator } = await import(
      "../server/dist/src/services/alarmService.js"
    );
    const evaluator = new AlarmEvaluator();
    await evaluator.loadRules();
    const at = new Date();
    await evaluator.evaluate({
      id: randomUUID(),
      data: {
        machineId: machine,
        key: "Pressure",
        label: "Pressure",
        timestamp: at,
        receivedAt: at,
        sourceTimestamp: at,
        value: 50,
        statusCode: "Good",
      },
    });
    const [queued] = (await pool.query("SELECT * FROM webhook_deliveries"))
      .rows;
    assert.equal(queued.event.type, "alarm.triggered");
    assert.equal(queued.schema_version, 1);

    // Crash after the receiver got the event, before the delivery was acknowledged.
    mode = "hang";
    const gotRequest = new Promise((resolve) => (sent = resolve));
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const { webhookService } = await import(${JSON.stringify(new URL("../server/dist/src/services/webhookService.js", import.meta.url).href)}); await webhookService.processDeliveries();`,
      ],
      { env: process.env, stdio: "inherit" },
    );
    await gotRequest;
    child.kill("SIGKILL");
    await once(child, "exit");
    const afterCrash = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [
        queued.id,
      ])
    ).rows[0];
    assert.equal(afterCrash.delivered_at, null, "A crash must not acknowledge");
    assert.equal(afterCrash.attempts, 0);

    const { webhookService, MAX_DELIVERY_ATTEMPTS } = await import(
      "../server/dist/src/services/webhookService.js"
    );
    // A delivery is retried after the failure; force the next attempt now.
    mode = "fail";
    await webhookService.processDeliveries();
    assert.equal(received.length, 2);
    await pool.query(
      "UPDATE webhook_deliveries SET attempts=$2, next_attempt_at=now()-interval '1 second' WHERE id=$1",
      [queued.id, MAX_DELIVERY_ATTEMPTS - 1],
    );
    await webhookService.processDeliveries();
    const dead = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [
        queued.id,
      ])
    ).rows[0];
    assert.ok(dead.dead_lettered_at, "Exhausted deliveries stop retrying");
    assert.equal(dead.last_status, 503);
    assert.equal(dead.last_error, "HTTP 503");
    await pool.query(
      "UPDATE webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
      [queued.id],
    );
    await webhookService.processDeliveries();
    assert.equal(received.length, 3, "Dead letters are not sent");

    // Inspection, permissions and the unattended incident.
    const list = await (
      await call("admin", "GET", "/api/v1/webhooks/deliveries")
    ).json();
    assert.equal(list[0].id, queued.id);
    assert.equal(list[0].eventType, "alarm.triggered");
    assert.ok(list[0].deadLetteredAt);
    const inspected = await (
      await call("admin", "GET", `/api/v1/webhooks/deliveries/${queued.id}`)
    ).json();
    assert.deepEqual(inspected.event, queued.event);
    assert.equal(
      (
        await call(
          "viewer",
          "POST",
          `/api/v1/webhooks/deliveries/${queued.id}/requeue`,
        )
      ).status(),
      403,
    );
    const { healthIncidentService } = await import(
      "../server/dist/src/services/healthIncidentService.js"
    );
    const incident = async () =>
      (
        await pool.query(
          "SELECT * FROM alert_history WHERE metadata->>'healthKey'='integration-dead-letter' ORDER BY id DESC LIMIT 1",
        )
      ).rows[0];
    await healthIncidentService.check();
    assert.equal((await incident()).resolved_at, null);

    // An administrator requeues it in the browser; the original ID is kept.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/settings`);
    await page.getByRole("tab", { name: "Webhooks" }).click();
    await expect(page.getByText(/stopped retrying/)).toBeVisible();
    await page
      .getByRole("button", { name: `Requeue delivery ${queued.id}` })
      .click();
    await expect(page.getByText(`Delivery ${queued.id} requeued`)).toBeVisible();
    const requeued = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [
        queued.id,
      ])
    ).rows[0];
    assert.equal(requeued.dead_lettered_at, null);
    assert.equal(requeued.attempts, 0);
    const [audit] = (
      await pool.query(
        "SELECT * FROM audit_logs WHERE action='webhook.delivery.requeued'",
      )
    ).rows;
    assert.equal(audit.entity_id, String(queued.id));
    assert.equal(audit.username, "admin");
    assert.equal(
      (
        await call(
          "admin",
          "POST",
          `/api/v1/webhooks/deliveries/${queued.id}/requeue`,
        )
      ).status(),
      409,
    );

    mode = "ok";
    // The dead-letter incident itself queued an alarm.triggered delivery to this receiver.
    for (let i = 0; i < 3; i++) await webhookService.processDeliveries();
    const delivered = (
      await pool.query("SELECT * FROM webhook_deliveries WHERE id=$1", [
        queued.id,
      ])
    ).rows[0];
    assert.ok(delivered.delivered_at);
    assert.equal(delivered.last_error, null);
    await healthIncidentService.check();
    assert.ok((await incident()).resolved_at);
    await healthIncidentService.stop();

    // Every attempt carried one identity, one schema version and the same signed body.
    const attempts = received.filter((r) => r.deliveryId === String(queued.id));
    assert.equal(attempts.length, 4);
    assert.ok(
      received.some((r) => JSON.parse(r.body).payload.nodeKey === "health:integration-dead-letter"),
      "The dead-letter incident reached the subscribed receiver",
    );
    for (const request of attempts) {
      assert.ok(request.signed);
      assert.equal(request.schemaVersion, "1");
      assert.equal(request.body, attempts[0].body);
    }
    const body = JSON.parse(attempts[0].body);
    assert.equal(body.id, queued.id);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.payload.machineId, machine);
    console.log(
      JSON.stringify({
        integrationOutbox: "passed",
        attempts: attempts.length,
        deliveryId: queued.id,
      }),
    );
  });
} finally {
  receiver.closeAllConnections();
  receiver.close();
}
