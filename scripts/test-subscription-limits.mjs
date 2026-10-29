import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import * as opcua from "node-opcua";
import { dailyFixture } from "./daily-fixture.mjs";

// C09: per-endpoint subscription limits, visible queue overflow and jittered reconnects.
await dailyFixture(async ({ pool, call, expect, actors, frontend }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const certificates = new opcua.OPCUACertificateManager({
    rootFolder: join(directory, "limits-server-pki"),
    automaticallyAcceptUnknownCertificate: false,
  });
  await certificates.initialize();
  const certificateFile = join(directory, "limits-server.pem");
  await certificates.createSelfSignedCertificate({
    outputFile: certificateFile,
    applicationUri: "urn:localhost:limits-fixture",
    subject: "/CN=Owned limits fixture",
    dns: ["localhost"],
    ip: ["127.0.0.1"],
    startDate: new Date(Date.now() - 60000),
    validity: 1,
  });
  const simulator = new opcua.OPCUAServer({
    port,
    hostname: "localhost",
    alternateHostname: ["127.0.0.1"],
    resourcePath: "/UA/Limits",
    securityModes: [opcua.MessageSecurityMode.None],
    securityPolicies: [opcua.SecurityPolicy.None],
    allowAnonymous: true,
    certificateFile,
    privateKeyFile: certificates.privateKey,
    serverCertificateManager: certificates,
    userCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "limits-user-pki"),
      automaticallyAcceptUnknownCertificate: false,
    }),
    serverInfo: { applicationUri: "urn:localhost:limits-fixture" },
  });
  const manager = (
    await import("../server/dist/src/opc-ua/services/multiMachineManager.js")
  ).default;
  let ticker;
  try {
    await simulator.initialize();
    const node = simulator.engine.addressSpace.getOwnNamespace().addVariable({
      organizedBy: simulator.engine.addressSpace.rootFolder.objects,
      browseName: "Count",
      nodeId: "ns=1;s=Count",
      dataType: "Double",
      minimumSamplingInterval: 50,
      value: new opcua.Variant({ dataType: opcua.DataType.Double, value: 0 }),
    });
    let value = 0;
    ticker = setInterval(
      () => node.setValueFromSource({ dataType: opcua.DataType.Double, value: ++value }),
      20,
    );
    await simulator.start();

    const body = (name, subscription) => ({
      name,
      ip: "localhost",
      port,
      resourcePath: `/UA/Limits`,
      securityMode: "None",
      securityPolicy: "None",
      isActive: false,
      subscription,
    });
    for (const invalid of [
      { publishingIntervalMs: 10, queueSize: 2, maxNotificationsPerPublish: 10 },
      { publishingIntervalMs: 2000, queueSize: 0, maxNotificationsPerPublish: 10 },
    ])
      assert.equal(
        (await call("admin", "POST", "/api/v1/machines", body("Invalid limits", invalid))).status(),
        400,
      );
    // The machine form sets and reloads per-endpoint limits.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/machines`);
    await page.getByRole("button", { name: "Add Machine", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Machine Name").fill("Browser limited");
    await form.getByLabel("IP Address").fill("localhost");
    await form.getByLabel(/^Port/).fill(String(port));
    await form.getByLabel("Resource Path").fill("/UA/Browser");
    await form.getByRole("checkbox", { name: "Active" }).uncheck();
    await form
      .getByRole("checkbox", { name: "Custom subscription limits for this endpoint" })
      .check();
    await form.getByLabel("Publishing interval (ms)").fill("1500");
    await form.getByLabel("Queue size per signal").fill("4");
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(form).toBeHidden();
    assert.deepEqual(
      (
        await pool.query("SELECT subscription FROM machines WHERE name='Browser limited'")
      ).rows[0].subscription,
      { publishingIntervalMs: 1500, queueSize: 4, maxNotificationsPerPublish: 100 },
    );
    await page.reload();
    await page
      .locator(".MuiCard-root", { hasText: "Browser limited" })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(form.getByLabel("Publishing interval (ms)")).toHaveValue("1500");
    await form.getByRole("button", { name: "Cancel" }).click();

    const limits = { publishingIntervalMs: 2000, queueSize: 2, maxNotificationsPerPublish: 10 };
    const created = await call("admin", "POST", "/api/v1/machines", body("Limited", limits));
    assert.equal(created.status(), 201, await created.text());
    const limited = await created.json();
    assert.deepEqual(limited.subscription, limits);
    // A second machine on the same endpoint is a conflict, not a server error.
    const duplicate = await call("admin", "POST", "/api/v1/machines", body("Duplicate", limits));
    assert.equal(duplicate.status(), 409, await duplicate.text());
    assert.equal((await duplicate.json()).code, "CONFLICT");
    await pool.query(
      "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,sampling_interval) VALUES($1,'ns=1;s=Count','Count','Count',100)",
      [limited.id],
    );
    // The same endpoint under other names, with collector defaults.
    const plain = [];
    for (let i = 0; i < 6; i++) {
      const [row] = (
        await pool.query(
          "INSERT INTO machines(name,endpoint_url,ip,port,resource_path,is_active) VALUES($1,$2,'localhost',$3,'/UA/Limits',false) RETURNING *",
          [`Default ${i}`, `opc.tcp://127.0.0.1:${port}/UA/Limits?copy=${i}`, port],
        )
      ).rows;
      await pool.query(
        "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,sampling_interval) VALUES($1,'ns=1;s=Count','Count','Count',500)",
        [row.id],
      );
      plain.push(row);
    }
    const machineRows = (
      await pool.query("SELECT * FROM machines WHERE id = ANY($1) ORDER BY id", [
        [limited.id, ...plain.map((m) => m.id)],
      ])
    ).rows.map((m) => ({
      ...m,
      endpointUrl: m.endpoint_url.replace(/\?copy=\d+$/, ""),
      securityMode: m.security_mode,
      securityPolicy: m.security_policy,
      isActive: true,
    }));
    for (const machine of machineRows) await manager.connectMachine(machine);
    const diagnostics = async (id) =>
      (await (await call("admin", "GET", `/api/v1/diagnostics/machines/${id}`)).json()).runtime;

    await expect
      .poll(async () => (await diagnostics(limited.id)).signals[0].overflowIndications, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    const runtime = await diagnostics(limited.id);
    assert.equal(runtime.requestedPublishingMs, 2000);
    assert(runtime.revisedPublishingMs >= 2000, `revised ${runtime.revisedPublishingMs}`);
    assert.equal(runtime.signals[0].requestedQueueSize, 2);
    assert.equal(runtime.signals[0].revisedQueueSize, 2);
    assert.equal((await diagnostics(plain[0].id)).signals[0].requestedQueueSize, 10);

    // Reconnect storm: refuse connections for a while, then let every client back in.
    const delays = new Map();
    for (const machine of machineRows)
      manager
        .getMachineConnection(machine.id)
        .connection.client.on("backoff", (_attempt, delay) =>
          delays.set(machine.id, [...(delays.get(machine.id) ?? []), delay]),
        );
    const endpoint = simulator.endpoints[0];
    await new Promise((resolve) => endpoint.suspendConnection(resolve));
    endpoint.abruptlyInterruptChannels();
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await new Promise((resolve) => endpoint.restoreConnection(resolve));
    await expect
      .poll(
        async () => {
          const states = await Promise.all(machineRows.map((m) => diagnostics(m.id)));
          return states.every((s) => s.state === "connected" && s.reconnects > 0);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    const firstDelays = [...delays.values()].map((d) => Math.round(d[0]));
    assert.equal(firstDelays.length, machineRows.length, "Every client backed off");
    assert(
      new Set(firstDelays).size > 1,
      `Reconnect delays must be jittered, got ${firstDelays}`,
    );
    console.log(
      JSON.stringify({
        subscriptionLimits: "passed",
        revisedPublishingMs: runtime.revisedPublishingMs,
        overflowIndications: runtime.signals[0].overflowIndications,
        firstBackoffDelaysMs: firstDelays,
      }),
    );
  } finally {
    clearInterval(ticker);
    await manager.disconnectAll().catch(() => {});
    await simulator.shutdown().catch(() => {});
  }
});
