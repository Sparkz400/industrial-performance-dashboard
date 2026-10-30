import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";
process.env.ALLOW_PRIVATE_OUTBOUND_URLS = "true";
const received = [],
  remoteOrders = new Set();
let rejectFirst = true,
  receiverSecret = "",
  receiverError;
const receiver = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(
      req.headers["x-webhook-signature"],
      createHmac("sha256", receiverSecret).update(body).digest("hex"),
    );
    const event = JSON.parse(body);
    received.push(event);
    remoteOrders.add(event.payload.source + ":" + event.payload.externalId);
    res.writeHead(rejectFirst ? 503 : 200);
    rejectFirst = false;
    res.end("owned receiver");
  } catch (error) {
    receiverError = error;
    res.writeHead(500);
    res.end("Owned fixture rejected payload");
  }
}).listen(0, "127.0.0.1");
await once(receiver, "listening");
try {
  await dailyFixture(
    async ({ pool, call, users, actors, frontend, expect, login }) => {
      const ok = async (role, method, path, body, status = 200) => {
        const response = await call(role, method, "/api/v1" + path, body);
        assert.equal(response.status(), status, await response.text());
        return response.json();
      };
      const machines = (
        await pool.query(
          "INSERT INTO machines(name,endpoint_url,ip) VALUES('Cost and service line','opc.tcp://127.0.0.1:49761','127.0.0.1'),('Unassigned cost line','opc.tcp://127.0.0.1:49762','127.0.0.1') RETURNING id",
        )
      ).rows.map((r) => r.id);
      const machine = machines[0];
      for (const role of ["supervisor", "operator", "viewer"])
        await pool.query(
          "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
          [users[role].id, machine],
        );
      const makeAction = async (description) => {
        const alarm = (
          await pool.query(
            "INSERT INTO alert_history(machine_id,node_key,rule_name,message,severity,status) VALUES($1,'Temperature','Owned warning','Inspect bearing','high','active') RETURNING id",
            [machine],
          )
        ).rows[0].id;
        return ok(
          "supervisor",
          "POST",
          `/maintenance-actions/machines/${machine}`,
          {
            alarmId: alarm,
            ownerId: users.operator.id,
            escalationOwnerId: users.supervisor.id,
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            action: description,
            suppressionUntil: null,
            quietStart: null,
            quietEnd: null,
          },
          201,
        );
      };
      const action = await makeAction("Inspect owned bearing"),
        action2 = await makeAction("Inspect owned motor"),
        action3 = await makeAction("Inspect owned filter");
      const url = `http://127.0.0.1:${receiver.address().port}/owned-cmms`;
      const configured = await ok(
        "admin",
        "POST",
        "/webhooks",
        { name: "Owned CMMS", url, events: ["cmms.handoff"] },
        201,
      );
      const webhook = configured.id;
      receiverSecret = configured.secret;
      const input = {
        source: "owned-installation",
        actionId: action.id,
        webhookId: webhook,
      };
      await ok(
        "operator",
        "GET",
        `/cmms/machines/${machine}/destinations`,
        undefined,
        403,
      );
      await ok(
        "supervisor",
        "GET",
        `/cmms/machines/${machines[1]}/handoffs`,
        undefined,
        403,
      );
      const exported = await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/preview`,
        { ...input, webhookId: 0 },
      );
      assert.equal(
        exported.payload.externalId,
        `maintenance-action:${action.id}`,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM webhook_deliveries",
          )
        ).rows[0].count,
        0,
      );
      const preview = await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/preview`,
        input,
      );
      const body = { review: preview.review, signature: preview.signature };
      await ok(
        "admin",
        "POST",
        `/cmms/machines/${machine}/handoffs`,
        body,
        409,
      );
      const responses = await Promise.all([
        call(
          "supervisor",
          "POST",
          `/api/v1/cmms/machines/${machine}/handoffs`,
          body,
        ),
        call(
          "supervisor",
          "POST",
          `/api/v1/cmms/machines/${machine}/handoffs`,
          body,
        ),
      ]);
      assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 201]);
      const handoff = await responses[0].json();
      assert.equal(handoff.id, (await responses[1].json()).id);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS count FROM cmms_handoffs"))
          .rows[0].count,
        1,
      );
      const { webhookService } =
        await import("../server/dist/src/services/webhookService.js");
      await webhookService.processDeliveries();
      assert.equal(received.length, 1);
      assert.equal(
        (await ok("supervisor", "GET", `/cmms/machines/${machine}/handoffs`))
          .rows[0].delivered_at,
        null,
      );
      await pool.query(
        "UPDATE webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
        [handoff.delivery_id],
      );
      await webhookService.processDeliveries();
      assert.equal(received.length, 2);
      assert.equal(remoteOrders.size, 1);
      assert.equal(
        received[0].payload.handoffId,
        received[1].payload.handoffId,
      );
      assert(
        (await ok("supervisor", "GET", `/cmms/machines/${machine}/handoffs`))
          .rows[0].delivered_at,
      );
      const stale = await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/preview`,
        { ...input, actionId: action2.id },
      );
      await pool.query(
        "UPDATE maintenance_actions SET action='Changed after review',version=version+1 WHERE id=$1",
        [action2.id],
      );
      await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/handoffs`,
        { review: stale.review, signature: stale.signature },
        409,
      );
      const second = await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/preview`,
        { ...input, actionId: action2.id },
      );
      const blocked = await ok(
        "supervisor",
        "POST",
        `/cmms/machines/${machine}/handoffs`,
        { review: second.review, signature: second.signature },
        201,
      );
      await pool.query(
        "UPDATE webhooks SET url=url||'?changed=true' WHERE id=$1",
        [webhook],
      );
      await webhookService.processDeliveries();
      assert.equal(received.length, 2);
      assert.equal(
        (
          await ok("supervisor", "GET", `/cmms/machines/${machine}/handoffs`)
        ).rows.find((row) => row.id === blocked.id).blocked,
        true,
      );
      await pool.query("UPDATE webhooks SET url=$1 WHERE id=$2", [
        url,
        webhook,
      ]);
      await pool.query(
        "UPDATE webhook_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1",
        [blocked.delivery_id],
      );
      await webhookService.processDeliveries();
      assert.equal(received.length, 3);
      assert.equal(remoteOrders.size, 2);
      assert.equal(receiverError, undefined);
      await ok("admin", "DELETE", `/webhooks/${webhook}`, undefined, 409);

      const signal = (nodeKey) => ({
        nodeKey,
        namespaceUri: "urn:cost-fixture",
        identifier: `s=${nodeKey}`,
        dataType: "Double",
        unit: nodeKey === "Energy" ? "kWh" : null,
        scale: 1,
      });
      const profile = {
        version: 1,
        name: "Owned cost profile",
        endpointModel: "Owned fixture",
        signals: {
          state: signal("State"),
          total: signal("Count"),
          good: signal("Good"),
          reject: signal("Reject"),
        },
        states: { running: [1], idle: [0], fault: [2], planned: [3] },
        idealCycleMs: 1000,
        maxGapSeconds: 60,
        counterPolicy: "reject-decrease",
      };
      const start = "2026-01-01T00:00:00Z",
        middle = "2026-01-01T00:01:00Z",
        end = "2026-01-01T00:02:00Z";
      await pool.query(
        "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
        [machine, profile, users.admin.id],
      );
      const shift = (
        await pool.query(
          "INSERT INTO production_shifts(machine_id,name,timezone,start,\"end\",profile,job,created_by) VALUES($1,'Owned cost shift','UTC',$2,$3,$4,$5,$6) RETURNING id",
          [
            machine,
            start,
            end,
            profile,
            { reference: "OWNED", product: "Parts", target: 20 },
            users.admin.id,
          ],
        )
      ).rows[0].id;
      for (const [key, values] of Object.entries({
        State: [1, 1, 1],
        Count: [0, 10, 20],
        Good: [0, 10, 20],
        Reject: [0, 0, 0],
        Energy: [10, 12, 13],
      }))
        for (const [i, timestamp] of [start, middle, end].entries())
          await pool.query(
            "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,signal_metadata) VALUES($1,$2,$3,$4,$5,'Good',$6)",
            [
              machine,
              key,
              timestamp,
              values[i],
              JSON.stringify(values[i]),
              signal(key),
            ],
          );
      await ok("supervisor", "PUT", `/energy/machines/${machine}`, {
        version: 0,
        config: { signal: signal("Energy"), maxGapSeconds: 60, modulus: null },
      });
      assert.equal(
        (await ok("viewer", "GET", `/energy-costs/shifts/${shift}`))
          .estimatedCost,
        null,
      );
      const rate = {
        version: 0,
        validFrom: start,
        validTo: middle,
        currency: "EUR",
        pricePerKWh: 0.2,
        kgCo2ePerKWh: 0.4,
        reference: "Owned tariff reference",
      };
      await ok(
        "operator",
        "POST",
        `/energy-costs/machines/${machine}/tariffs`,
        rate,
        403,
      );
      for (const invalid of [
        { pricePerKWh: "Infinity" },
        { pricePerKWh: -1 },
        { kgCo2ePerKWh: -1 },
        { validTo: start },
      ])
        await ok(
          "supervisor",
          "POST",
          `/energy-costs/machines/${machine}/tariffs`,
          { ...rate, ...invalid },
          400,
        );
      await ok(
        "supervisor",
        "GET",
        `/energy-costs/machines/${machines[1]}/tariffs`,
        undefined,
        403,
      );
      await ok(
        "supervisor",
        "POST",
        `/energy-costs/machines/${machine}/tariffs`,
        rate,
        201,
      );
      await ok(
        "supervisor",
        "POST",
        `/energy-costs/machines/${machine}/tariffs`,
        { ...rate, version: 1 },
        409,
      );
      await ok(
        "supervisor",
        "POST",
        `/energy-costs/machines/${machine}/tariffs`,
        {
          ...rate,
          version: 1,
          validFrom: middle,
          validTo: end,
          pricePerKWh: 0.5,
          kgCo2ePerKWh: null,
        },
        201,
      );
      const estimate = await ok(
        "viewer",
        "GET",
        `/energy-costs/shifts/${shift}`,
      );
      assert(Math.abs(estimate.estimatedCost - 0.9) < 1e-10);
      assert.equal(estimate.estimatedKgCo2e, null);
      assert.equal(estimate.tariffs.length, 2);
      await pool.query(
        "UPDATE opcua_data SET value=12.5,correction_revision=1 WHERE machine_id=$1 AND node_key='Energy' AND timestamp=$2",
        [machine, middle],
      );
      const corrected = await ok(
        "viewer",
        "GET",
        `/energy-costs/shifts/${shift}`,
      );
      assert(Math.abs(corrected.estimatedCost - 0.75) < 1e-10);
      assert.equal(corrected.correctedSampleCount, 1);
      assert.notEqual(corrected.inputDigest, estimate.inputDigest);
      // Aggregate and retained-summary readers must keep nonfinite/mixed identity unknown.
      for (const [key, value, metadata, revision] of [
        ["FiniteGuard", 1, signal("FiniteGuard"), 0],
        ["FiniteGuard", "NaN", signal("FiniteGuard"), 0],
        ["MixedGuard", 1, signal("MixedGuard"), 0],
        [
          "MixedGuard",
          2,
          { ...signal("MixedGuard"), namespaceUri: "urn:different" },
          0,
        ],
        ["PreservedGuard", 12.5, signal("PreservedGuard"), 1],
      ])
        await pool.query(
          "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata,correction_revision) VALUES($1,$2,$3,$4,'Good',$5,$6)",
          [machine, key, start, value, metadata, revision],
        );
      await pool.query(
        "INSERT INTO history_summaries(machine_id,node_key,bucket,samples,good,sum,min,max,identity) VALUES($1,'PreservedGuard',$2,2,2,4,1,3,md5($3::jsonb::text))",
        [machine, start, JSON.stringify(signal("PreservedGuard"))],
      );
      for (const nodeKey of ["FiniteGuard", "MixedGuard"]) {
        const query = new URLSearchParams({
          machineId: String(machine),
          nodeKey,
          start,
          end,
        });
        const aggregate = await ok("viewer", "GET", `/aggregates?${query}`);
        assert.equal(aggregate[0].avgValue, null);
        query.delete("machineId");
        const summary = await ok(
          "viewer",
          "GET",
          `/history/${machine}/summaries?${query}`,
        );
        assert.equal(summary[0].average, null);
      }
      const summaryQuery = new URLSearchParams({
        nodeKey: "PreservedGuard",
        start,
        end,
      });
      const combined = (
        await ok(
          "viewer",
          "GET",
          `/history/${machine}/summaries?${summaryQuery}`,
        )
      )[0];
      assert.equal(combined.samples, 3);
      assert.equal(combined.corrected_samples, 1);
      assert.equal(combined.retained_samples, 2);
      assert.equal(combined.average, 5.5);
      const page = await actors.supervisor.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(frontend + "/operations");
      await page.getByLabel("Machine", { exact: true }).click();
      await page
        .getByRole("option", { name: "Cost and service line", exact: true })
        .click();
      await selectOperation(page, "Alarm actions");
      await page
        .getByLabel("Installation reference", { exact: true })
        .fill("owned-installation");
      await page
        .getByRole("combobox", { name: "Maintenance action", exact: true })
        .click();
      await page
        .getByRole("option", {
          name: `#${action3.id} · Inspect owned filter`,
          exact: true,
        })
        .click();
      await page.getByLabel("Handoff destination", { exact: true }).click();
      await page
        .getByRole("option", { name: "Owned CMMS", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Preview maintenance handoff",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Send reviewed handoff",
          exact: true,
        }),
      ).toBeVisible();
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export reviewed request", exact: true })
        .click();
      assert.equal(
        (await downloadPromise).suggestedFilename(),
        "maintenance-handoff.json",
      );
      await page
        .getByRole("button", { name: "Send reviewed handoff", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Reviewed handoff queued" }),
      ).toBeVisible();
      await page
        .getByRole("heading", { name: "Maintenance handoff", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/cmms-handoff-desktop.png",
        fullPage: true,
      });
      await selectOperation(page, "Energy and losses");
      await page.getByLabel("Shift", { exact: true }).click();
      await page
        .getByRole("option", { name: "Owned cost shift", exact: true })
        .click();
      await expect(
        page.getByText("Estimated shift cost: 0.75 EUR", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Tariff valid from", { exact: true })
        .fill("2026-01-02T00:00");
      await page
        .getByLabel("Tariff valid until", { exact: true })
        .fill("2026-01-03T00:00");
      await page.getByLabel("Price per kWh", { exact: true }).fill("0.25");
      await page
        .getByLabel("kg CO₂e per kWh (optional)", { exact: true })
        .fill("0.35");
      await page
        .getByLabel("Tariff and factor reference", { exact: true })
        .fill("Owned browser tariff");
      await page
        .getByRole("button", { name: "Preserve tariff period", exact: true })
        .click();
      await expect(page.getByText(/v3 ·.*Owned browser tariff/)).toBeVisible();
      assert.equal(
        (await ok("viewer", "GET", `/energy-costs/machines/${machine}/tariffs`))
          .length,
        3,
      );
      const estimateDownload = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: "Export estimate and factors",
          exact: true,
        })
        .click();
      assert.equal(
        (await estimateDownload).suggestedFilename(),
        "energy-cost-estimate.json",
      );
      await page
        .getByRole("heading", {
          name: "Energy cost and emissions estimates",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/energy-costs-desktop.png",
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: "Export estimate and factors",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/energy-costs-results-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("heading", {
          name: "Energy cost and emissions estimates",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/energy-costs-mobile-en.png",
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: "Export estimate and factors",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/energy-costs-results-mobile-en.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.getByLabel("Language / Sprache")).toBeVisible();
      await page.getByLabel("Language / Sprache").click();
      await page.getByRole("option", { name: "Deutsch", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        page.getByText("Geschätzte Schichtkosten: 0,75 EUR", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Schätzung und Faktoren exportieren",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/energy-costs-mobile-de.png",
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await selectOperation(page, "Alarmmaßnahmen");
      await page
        .getByRole("heading", { name: "Instandhaltungsübergabe", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: ".local/daily-evidence/cmms-handoff-mobile-de.png",
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(errors, []);
      await page.close();
      const rejectRevokedWaiter = async (lockKey, path, payload, revoke) => {
        const blocker = await pool.connect();
        let pending;
        try {
          await blocker.query("BEGIN");
          await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            lockKey,
          ]);
          pending = call("supervisor", "POST", `/api/v1${path}`, payload);
          await expect
            .poll(
              async () =>
                (
                  await pool.query(
                    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
                  )
                ).rows[0].count,
            )
            .toBeGreaterThan(0);
          await revoke();
          await blocker.query("COMMIT");
          const response = await pending;
          assert.equal(response.status(), 403, await response.text());
        } finally {
          await blocker.query("ROLLBACK");
          blocker.release();
          if (pending) await pending;
        }
      };
      // Even an idempotent receipt must not be returned after a waiting request loses its grant.
      await rejectRevokedWaiter(
        `cmms:${action.id}:${webhook}`,
        `/cmms/machines/${machine}/handoffs`,
        body,
        () =>
          ok("admin", "PUT", `/access/users/${users.supervisor.id}`, {
            machineIds: [],
            plantIds: [],
          }),
      );
      await ok("admin", "PUT", `/access/users/${users.supervisor.id}`, {
        machineIds: [machine],
        plantIds: [],
      });
      await login("supervisor");
      await rejectRevokedWaiter(
        `energy-tariffs:${machine}`,
        `/energy-costs/machines/${machine}/tariffs`,
        {
          ...rate,
          version: 3,
          validFrom: "2026-01-04T00:00:00Z",
          validTo: "2026-01-05T00:00:00Z",
        },
        () =>
          pool.query(
            "UPDATE users SET is_active=false,updated_at=greatest(now(),updated_at+interval '1 millisecond') WHERE id=$1",
            [users.supervisor.id],
          ),
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int AS count FROM energy_tariffs"))
          .rows[0].count,
        3,
      );
      await writeFile(
        ".local/daily-evidence/maintenance-costs.json",
        JSON.stringify(
          {
            passed: true,
            checks: [
              "reviewed export and explicit submit",
              "actor and machine scope",
              "concurrent idempotency",
              "signed owned receiver retry and duplicate acceptance",
              "stale action rejection",
              "changed destination blocks delivery",
              "immutable nonoverlapping tariffs",
              "unknown factors and corrected measurement provenance",
              "finite and identity guards in raw aggregates and retained summary union",
              "tariff editor and evidence export",
              "grant and account revocation while waiting for transaction lock",
              "EN/DE desktop and 390px",
            ],
            physicalQualification: false,
            cmmsVendorQualification: false,
            billingQualification: false,
          },
          null,
          2,
        ),
      );
      console.log(
        "Maintenance handoff and energy estimate API/browser acceptance passed",
      );
    },
  );
} finally {
  await new Promise((resolve) => receiver.close(resolve));
}
