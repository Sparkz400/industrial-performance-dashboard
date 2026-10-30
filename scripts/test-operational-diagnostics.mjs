import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { writeFile } from "node:fs/promises";
import * as opcua from "node-opcua";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const request = async (role, path, status = 200) => {
    const r = await call(role, "GET", "/api/v1" + path);
    assert.equal(r.status(), status, `${path}: ${await r.text()}`);
    return r.json();
  };
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const certificates = new opcua.OPCUACertificateManager({
    rootFolder: join(directory, "diagnostic-server-pki"),
    automaticallyAcceptUnknownCertificate: false,
  });
  await certificates.initialize();
  const certificateFile = join(directory, "diagnostic-server.pem");
  await certificates.createSelfSignedCertificate({
    outputFile: certificateFile,
    applicationUri: "urn:localhost:diagnostic-fixture",
    subject: "/CN=Owned diagnostic fixture",
    dns: ["localhost"],
    ip: ["127.0.0.1"],
    startDate: new Date(Date.now() - 60000),
    validity: 1,
  });
  const simulator = new opcua.OPCUAServer({
    port,
    hostname: "localhost",
    alternateHostname: ["127.0.0.1"],
    resourcePath: "/UA/Diagnostics",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    allowAnonymous: true,
    certificateFile,
    privateKeyFile: certificates.privateKey,
    serverCertificateManager: certificates,
    userCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "diagnostic-user-pki"),
      automaticallyAcceptUnknownCertificate: false,
    }),
    serverInfo: { applicationUri: "urn:localhost:diagnostic-fixture" },
  });
  let connection, emitter, listener;
  try {
    await simulator.initialize();
    const pressureNode = simulator.engine.addressSpace
      .getOwnNamespace()
      .addVariable({
        organizedBy: simulator.engine.addressSpace.rootFolder.objects,
        browseName: "Pressure",
        nodeId: "ns=1;s=Pressure",
        dataType: "Double",
        minimumSamplingInterval: 250,
        value: new opcua.Variant({
          dataType: opcua.DataType.Double,
          value: 12,
        }),
      });
    await simulator.start();
    const endpoint = `opc.tcp://localhost:${port}/UA/Diagnostics`;
    const machines = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES('Diagnostic fixture',$1,'127.0.0.1'),('Hidden diagnostic fixture','opc.tcp://127.0.0.1:49999','127.0.0.1') RETURNING id",
        [endpoint],
      )
    ).rows.map((r) => r.id);
    const machine = machines[0];
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users.supervisor.id, machine],
    );
    const mapping = {
      Pressure: {
        nodeId: "ns=1;s=Pressure",
        dataType: "Double",
        label: "Pressure",
        samplingInterval: 100,
      },
      Missing: {
        nodeId: "ns=1;s=Missing",
        dataType: "Double",
        label: "Missing",
        samplingInterval: 100,
      },
    };
    for (const [key, m] of Object.entries(mapping))
      await pool.query(
        "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,sampling_interval) VALUES($1,$2,$3,$3,$4)",
        [machine, m.nodeId, key, m.samplingInterval],
      );
    const unknown = await request(
      "admin",
      `/diagnostics/machines/${machines[1]}`,
    );
    assert.equal(unknown.runtime, null);
    assert.equal(unknown.ingestion, null);
    const collector = await import("../server/dist/src/opc-ua/opcuaClient.js");
    const worker = (
      await import("../server/dist/src/queue/opcuaQueueWorker.js")
    ).default;
    emitter = collector.opcuaEmitter;
    let recoveredValueReceived = false;
    listener = (data) => {
      worker.enqueue(data);
      if (
        data.machineId === machine &&
        data.key === "Pressure" &&
        data.value === 13
      )
        recoveredValueReceived = true;
    };
    emitter.on("nodeChanged", listener);
    connection = await collector.connectAndSubscribe(
      endpoint,
      { securityMode: "None", securityPolicy: "None" },
      mapping,
      machine,
    );
    assert(connection, "Owned simulator must connect");
    await expect
      .poll(
        async () => {
          const d = await request(
            "supervisor",
            `/diagnostics/machines/${machine}`,
          );
          return (
            d.runtime.signals.find((s) => s.key === "Pressure")?.observations ??
            0
          );
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    let diagnostics = await request(
      "supervisor",
      `/diagnostics/machines/${machine}`,
    );
    const signal = diagnostics.runtime.signals.find(
      (s) => s.key === "Pressure",
    );
    assert.equal(signal.requestedSamplingMs, 100);
    assert(signal.revisedSamplingMs >= 250);
    assert.equal(signal.requestedQueueSize, 10);
    assert(signal.revisedQueueSize > 0);
    assert.equal(
      diagnostics.runtime.signals.find((s) => s.key === "Missing").state,
      "rejected",
    );
    assert(diagnostics.queue.pending > 0);
    // Interrupt only the owned simulator's channels; keep its listener available
    // so the real client reconnects and restores the monitored subscription.
    for (const endpoint of simulator.endpoints)
      endpoint.abruptlyInterruptChannels();
    await expect
      .poll(
        async () => {
          const d = await request(
            "supervisor",
            `/diagnostics/machines/${machine}`,
          );
          return (
            d.runtime.connectionLosses > 0 &&
            d.runtime.reconnects > 0 &&
            d.runtime.state === "connected"
          );
        },
        { timeout: 20000 },
      )
      .toBe(true);
    pressureNode.setValueFromSource(
      { dataType: opcua.DataType.Double, value: 13 },
      opcua.StatusCodes.Good,
      new Date(),
    );
    await expect
      .poll(() => recoveredValueReceived, { timeout: 15000 })
      .toBe(true);
    await connection.subscription.terminate();
    await connection.session.close();
    await connection.client.disconnect();
    connection = null;
    emitter.off("nodeChanged", listener);
    listener = null;
    await worker.processBatch();
    diagnostics = await request(
      "supervisor",
      `/diagnostics/machines/${machine}`,
    );
    assert.equal(diagnostics.queue.pending, 0);
    assert(
      Number(
        (
          await pool.query(
            "SELECT count(*) FROM opcua_data WHERE machine_id=$1 AND node_key='Pressure' AND value=13",
            [machine],
          )
        ).rows[0].count,
      ) > 0,
    );
    assert(diagnostics.ingestion.lastCommittedAt);
    assert.equal(
      diagnostics.signals.find((s) => s.key === "Pressure").freshness,
      "fresh",
    );
    assert.equal(
      diagnostics.signals.find((s) => s.key === "Missing").freshness,
      "unknown",
    );
    assert(!JSON.stringify(diagnostics).includes(endpoint));
    for (const role of ["operator", "viewer", "wallboard"])
      await request(role, `/diagnostics/machines/${machine}`, 403);
    await request("supervisor", `/diagnostics/machines/${machines[1]}`, 403);
    const rule = (
      await pool.query(
        "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold,cooldown_seconds,rate_window_seconds) VALUES('Pressure chatter',$1,'Pressure','gt',10,0,5) RETURNING id",
        [machine],
      )
    ).rows[0].id;
    const foreignRule = (
      await pool.query(
        "INSERT INTO alert_rules(name,machine_id,node_key,condition,threshold) VALUES('Hidden rule',$1,'Pressure','gt',10) RETURNING id",
        [machines[1]],
      )
    ).rows[0].id;
    const start = "2026-01-01T00:00:00.000Z",
      end = "2026-01-01T00:01:00.000Z";
    const at = (s) => new Date(Date.parse(start) + s * 1000).toISOString();
    const alarms = [];
    for (const second of [1, 3, 5])
      alarms.push(
        (
          await pool.query(
            "INSERT INTO alert_history(rule_id,rule_name,machine_id,message,created_at,acknowledged_at,resolved_at) VALUES($1,'Pressure chatter',$2,'Synthetic retained incident',$3,$4,$5) RETURNING id",
            [
              rule,
              machine,
              at(second),
              at(second + 10),
              second === 5 ? null : at(second + 1),
            ],
          )
        ).rows[0].id,
      );
    const webhook = (
      await pool.query(
        "INSERT INTO webhooks(name,url,secret,is_active) VALUES('Fixture only','http://127.0.0.1:1/never-called','fixture-secret',false) RETURNING id",
      )
    ).rows[0].id;
    for (let i = 0; i < 2; i++)
      await pool.query(
        "INSERT INTO webhook_deliveries(webhook_id,event,created_at,delivered_at,attempts) VALUES($1,$2,$3,$4,$5)",
        [
          webhook,
          JSON.stringify({
            type: "alarm.triggered",
            payload: { id: alarms[i] },
          }),
          at(i + 1),
          i === 0 ? at(i + 6) : null,
          i === 0 ? 1 : 2,
        ],
      );
    await pool.query(
      "INSERT INTO maintenance_actions(machine_id,alarm_id,owner_id,escalation_owner_id,due_at,action,suppression_until,created_by) VALUES($1,$2,$3,$3,$4,'Synthetic action',$5,$3)",
      [
        machine,
        alarms[1],
        users.supervisor.id,
        new Date(Date.now() + 3600000),
        new Date(Date.now() + 1800000),
      ],
    );
    for (const [i, value] of [0, 20, 0, 20, 20, 20, 20, 0].entries())
      await pool.query(
        "INSERT INTO opcua_data(machine_id,node_key,value,raw_value,timestamp,source_timestamp,received_at,status_code,signal_metadata) VALUES($1,'Pressure',$2,$3,$4,$4,$4,'Good',$5)",
        [
          machine,
          value,
          JSON.stringify(value),
          at(i),
          JSON.stringify({ signalId: "fixture", mappingRevision: "one" }),
        ],
      );
    const query = new URLSearchParams({ start, end }).toString(),
      reviewPath = `/alarm-review/machines/${machine}`;
    const review = await request("supervisor", `${reviewPath}?${query}`);
    assert.equal(review.alarmCount, 3);
    assert.equal(review.peakTenMinuteStarts, 3);
    assert.equal(review.rules[0].repeatsWithinMinute, 2);
    assert.equal(review.rules[0].acknowledgementP50Seconds, 10);
    assert.equal(review.rules[0].deliveryP50Seconds, 5);
    assert.equal(review.rules[0].failedPending, 1);
    assert.equal(review.rules[0].deferredNow, 1);
    const proposal = "&debounceSeconds=2&clearDebounceSeconds=0&hysteresis=0";
    const before = await pool.query(
      "SELECT (SELECT count(*) FROM alert_history) AS alarms,(SELECT count(*) FROM webhook_deliveries) AS deliveries,(SELECT count(*) FROM alarm_evaluation_state) AS cursors",
    );
    const replay = await request(
      "supervisor",
      `${reviewPath}/replay/${rule}?${query}${proposal}`,
    );
    assert.equal(replay.proposedStarts, 1);
    assert.equal(replay.proposedClears, 1);
    assert.equal(replay.actualStarts, 3);
    assert.deepEqual(
      (
        await pool.query(
          "SELECT (SELECT count(*) FROM alert_history) AS alarms,(SELECT count(*) FROM webhook_deliveries) AS deliveries,(SELECT count(*) FROM alarm_evaluation_state) AS cursors",
        )
      ).rows,
      before.rows,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT debounce_seconds FROM alert_rules WHERE id=$1",
          [rule],
        )
      ).rows[0].debounce_seconds,
      0,
    );
    await request(
      "supervisor",
      `${reviewPath}/replay/${foreignRule}?${query}${proposal}`,
      404,
    );
    await request(
      "supervisor",
      `/alarm-review/machines/${machines[1]}?${query}`,
      403,
    );
    for (const role of ["operator", "viewer", "wallboard"])
      await request(role, `${reviewPath}?${query}`, 403);
    await request(
      "supervisor",
      `${reviewPath}?start=2026-01-01T00:00:00&end=2026-01-01T01:00:00`,
      400,
    );
    await request(
      "supervisor",
      `${reviewPath}?start=2026-01-01T00:00:00Z&end=2026-01-10T00:00:00Z`,
      400,
    );
    const page = await actors.supervisor.newPage();
    await page.goto(frontend + "/operations");
    await page.getByLabel("Machine", { exact: true }).click();
    await page
      .getByRole("option", { name: "Diagnostic fixture", exact: true })
      .click();
    await selectOperation(page, "Connection diagnostics");
    await expect(
      page.getByRole("heading", {
        name: "Connection diagnostics",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Connection state: Disconnected"),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/daily-evidence/connection-diagnostics-desktop.png",
      fullPage: true,
    });
    await selectOperation(page, "Alarm usefulness");
    const local = async (iso) =>
      page.evaluate((v) => {
        const d = new Date(v);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      }, iso);
    await page
      .getByLabel("Review start", { exact: true })
      .fill(await local(start));
    await page.getByLabel("Review end", { exact: true }).fill(await local(end));
    await page
      .getByRole("button", { name: "Review alarm history", exact: true })
      .click();
    await expect(
      page.getByText("Recorded starts: 3", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Rule to preview", { exact: true }).click();
    await page
      .getByRole("option", { name: "Pressure chatter", exact: true })
      .click();
    await page.getByLabel("Trigger hold (seconds)", { exact: true }).fill("2");
    await page.getByLabel("Clear hold (seconds)", { exact: true }).fill("0");
    await page
      .getByRole("button", {
        name: "Preview recorded measurements",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Scenario starts / clears: 1 / 1", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/daily-evidence/alarm-review-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page
      .getByRole("heading", { name: "Alarm usefulness", exact: true })
      .scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const b = await page
          .getByRole("heading", { name: "Alarm usefulness", exact: true })
          .boundingBox();
        return !!b && b.x < 300 && b.width > 400;
      })
      .toBe(true);
    await page.screenshot({
      path: ".local/daily-evidence/alarm-review-tablet.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const heading = page.getByRole("heading", {
      name: "Alarm usefulness",
      exact: true,
    });
    await heading.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const b = await heading.boundingBox();
        return !!b && b.x < 100 && b.width > 250;
      })
      .toBe(true);
    await page.screenshot({
      path: ".local/daily-evidence/alarm-review-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: "Preview recorded measurements",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/alarm-review-mobile-bottom.png",
      fullPage: true,
    });
    await page.evaluate(() => localStorage.setItem("language", "de"));
    await page.reload();
    await page.getByLabel("Maschine", { exact: true }).click();
    await page
      .getByRole("option", { name: "Diagnostic fixture", exact: true })
      .click();
    await selectOperation(page, "Verbindungsdiagnose");
    await expect(
      page.getByRole("heading", { name: "Verbindungsdiagnose", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Diagnose aktualisieren", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Verbindungsstatus: Getrennt")).toBeVisible();
    await page.screenshot({
      path: ".local/daily-evidence/connection-diagnostics-german-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("heading", { name: "Pressure", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/connection-diagnostics-german-mobile-signals.png",
      fullPage: true,
    });
    await selectOperation(page, "Alarmbewertung");
    await expect(page.getByLabel("Beginn der Auswertung")).toBeVisible();
    await page
      .getByLabel("Beginn der Auswertung", { exact: true })
      .fill(await local(start));
    await page
      .getByLabel("Ende der Auswertung", { exact: true })
      .fill(await local(end));
    await page
      .getByRole("button", { name: "Alarmhistorie auswerten", exact: true })
      .click();
    await expect(
      page.getByText("Aufgezeichnete Starts: 3", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Zu prüfende Regel", { exact: true }).click();
    await page
      .getByRole("option", { name: "Pressure chatter", exact: true })
      .click();
    await page.getByRole("listbox").waitFor({ state: "hidden" });
    await expect(page.locator(".MuiPopover-root")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Gespeicherte Messwerte prüfen",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/alarm-review-german-mobile.png",
      fullPage: true,
    });
    await writeFile(
      ".local/daily-evidence/operational-diagnostics.json",
      JSON.stringify(
        {
          passed: true,
          checks: [
            "owned OPC UA requested/revised intervals and rejected monitored item",
            "owned channel interruption and successful reconnect",
            "durable spool pending and committed counts",
            "missing observations unknown",
            "supervisor machine scope and role denial",
            "repeat frequency and acknowledgement/delivery separation",
            "current suppression",
            "read-only preview and no notification/rule changes",
            "strict window bounds",
            "keyboard preview",
            "English and German at 1440/768/390px",
          ],
          ownedSimulator: true,
          physicalQualification: false,
          diagnostics,
          review,
          replay,
          readOnlyPreview: true,
          scopeChecks: true,
          browserEnglishGerman: true,
        },
        null,
        2,
      ),
    );
    console.log(
      "Operational diagnostics API/browser/owned simulator checks passed.",
    );
  } finally {
    if (listener) emitter.off("nodeChanged", listener);
    if (connection) {
      await connection.subscription.terminate();
      await connection.session.close();
      await connection.client.disconnect();
    }
    await simulator.shutdown(0);
  }
});
