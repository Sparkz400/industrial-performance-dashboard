import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { expect } from "@playwright/test";
import * as opcua from "node-opcua";

export async function testGateway({
  call,
  page,
  frontend,
  pool,
  directory,
  multiMachine,
  worker,
  waitFor,
}) {
  const { createModbusSimulator } =
    await import("../server/dist/simulation/modbusSimulationServer.js");
  const { startLegacyGateway } =
    await import("../server/dist/src/gateway/legacyGateway.js");
  const { startConfiguredGateway, stopConfiguredGateway } =
    await import("../server/dist/src/gateway/configuredGateway.js");
  const settings = (await import("../server/dist/src/config/config.js"))
    .default;
  const originalEnabled = settings.ENABLE_LEGACY_GATEWAY;
  const certificates = (
    await import("../server/dist/src/opc-ua/services/certificateManager.js")
  ).default;
  await certificates.ensureInitialized();
  const config = JSON.parse(
    await readFile("examples/legacy-gateway.json", "utf8"),
  );
  const profile = JSON.parse(
    await readFile("examples/legacy-production-profile.json", "utf8"),
  );
  const simulator = await createModbusSimulator(0);
  const gateways = [],
    machines = [];
  let client, session;
  worker.start();
  try {
    for (const unitId of [1, 2]) {
      const reservation = createServer().listen(0, "127.0.0.1");
      await once(reservation, "listening");
      const port = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      const input = {
        ...config,
        name: `OwnedGateway${unitId}`,
        opcuaPort: port,
        pkiDirectory: join(directory, `gateway-${unitId}-pki`),
        trustedClientCertificate: certificates.certificateFile,
        modbus: {
          ...config.modbus,
          port: simulator.port,
          unitId,
          functionCode: unitId === 1 ? 3 : 4,
          pollMs: 100,
          timeoutMs: 500,
        },
      };
      let gateway;
      if (unitId === 1) {
        const managedDirectory = resolve(
          dirname(settings.OPCUA_SPOOL_PATH),
          "gateway",
        );
        await mkdir(managedDirectory, { recursive: true });
        await writeFile(
          join(managedDirectory, "config.json"),
          JSON.stringify(input),
        );
        settings.ENABLE_LEGACY_GATEWAY = true;
        settings.RECOVERY_MODE = true;
        try {
          assert.equal(
            await startConfiguredGateway(),
            undefined,
            "Recovery must never poll a machine",
          );
        } finally {
          settings.RECOVERY_MODE = false;
        }
        gateway = await startConfiguredGateway();
        const firstCertificate = gateway.server
          .getCertificate()
          .toString("hex");
        await stopConfiguredGateway();
        gateway = await startConfiguredGateway();
        assert.equal(
          gateway.server.getCertificate().toString("hex"),
          firstCertificate,
          "Restart must preserve gateway identity",
        );
        assert.equal(
          gateway.config.pkiDirectory,
          join(managedDirectory, "pki"),
        );
      } else gateway = await startLegacyGateway(input);
      gateways.push(gateway);
      assert.equal(gateway.server.endpoints[0].host, "127.0.0.1");
      await certificates.trustCertificate(
        gateway.server.getCertificate(),
        `owned-gateway-${unitId}`,
      );
      const created = await call("POST", "/api/v1/machines", {
        name: `Owned legacy ${unitId}`,
        ip: "localhost",
        port,
        resourcePath: "/UA/LegacyGateway",
        securityMode: "SignAndEncrypt",
        securityPolicy: "Basic256Sha256",
        isActive: false,
      });
      assert.equal(created.status(), 201, await created.text());
      machines.push(await created.json());
    }
    const { commissioningService } =
      await import("../server/dist/src/services/commissioningService.js");
    const previews = await Promise.all(
      machines.map((machine) =>
        commissioningService.inspect(machine.id, profile),
      ),
    );
    assert.ok(
      previews.every(
        (preview) =>
          preview.ready &&
          preview.signals.every(
            (signal) =>
              signal.namespaceUri === profile.signals.state.namespaceUri,
          ),
      ),
    );
    assert.notEqual(
      previews[0].signals.find((signal) => signal.role === "total").value,
      previews[1].signals.find((signal) => signal.role === "total").value,
    );
    for (const machine of machines) {
      await page.goto(`${frontend}/production`);
      await page
        .getByRole("tab", { name: "Commission machine", exact: true })
        .click();
      await page.getByLabel("Machine to commission").click();
      await page
        .getByRole("option", { name: machine.name, exact: true })
        .click();
      await page
        .locator('input[type="file"]')
        .setInputFiles(resolve("examples/legacy-production-profile.json"));
      await page
        .getByRole("button", { name: "Preview mapped signals", exact: true })
        .click();
      await expect(
        page.getByText(/state: ns=2;s=ProductionState/),
      ).toBeVisible();
      await page.getByLabel(/I reviewed the mappings/).check();
      await page
        .getByRole("button", {
          name: "Save profile and create dashboard",
          exact: true,
        })
        .click();
      await expect(page.getByText(/Profile saved. Connection:/)).toBeVisible();
      const saved = (
        await pool.query(
          "SELECT profile FROM machine_profiles WHERE machine_id=$1 ORDER BY id DESC LIMIT 1",
          [machine.id],
        )
      ).rows[0].profile;
      assert.deepEqual(
        saved,
        profile,
        "Reuse preserves units, state interpretation and counter policy",
      );
    }
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export profile", exact: true })
      .click();
    assert.deepEqual(
      JSON.parse(await readFile(await (await download).path(), "utf8")),
      profile,
    );
    await page.screenshot({
      path: ".local/production-evidence/gateway-profile.png",
      fullPage: true,
    });
    await waitFor(
      async () =>
        (
          await pool.query(
            "SELECT DISTINCT machine_id FROM opcua_data WHERE machine_id=ANY($1::integer[]) AND node_key='ProductionCount'",
            [machines.map((machine) => machine.id)],
          )
        ).rowCount === 2,
      "Both gateways must persist isolated measurements",
    );

    client = opcua.OPCUAClient.create({
      ...(await certificates.getClientOptions(
        "SignAndEncrypt",
        "Basic256Sha256",
      )),
      connectionStrategy: { maxRetry: 0 },
    });
    await client.connect(
      `opc.tcp://localhost:${gateways[0].config.opcuaPort}/UA/LegacyGateway`,
    );
    session = await client.createSession();
    const namespace = (await session.readNamespaceArray()).indexOf(
      config.namespaceUri,
    );
    const nodeId = `ns=${namespace};s=ProductionCount`;
    const result = await session.write({
      nodeId,
      attributeId: opcua.AttributeIds.Value,
      value: { value: { dataType: opcua.DataType.Double, value: 0 } },
    });
    assert.equal(
      result.name,
      "BadNotWritable",
      "A trusted dashboard client still cannot write through the gateway",
    );

    simulator.state.available = false;
    await waitFor(
      async () =>
        !(
          await session.read({ nodeId, attributeId: opcua.AttributeIds.Value })
        ).statusCode.isGood(),
      "Gateway did not expose failed reads as bad quality",
    );
    await waitFor(
      async () =>
        (
          await pool.query(
            "SELECT 1 FROM opcua_data WHERE machine_id=$1 AND node_key='ProductionCount' AND status_code LIKE 'Bad%' AND value IS NULL",
            [machines[0].id],
          )
        ).rowCount > 0,
      "Bad gateway data must persist as unknown numeric values",
    );
    const offline = await commissioningService.inspect(machines[0].id, profile);
    assert.equal(offline.ready, false);
    simulator.state.available = true;
    await waitFor(
      async () =>
        (
          await session.read({ nodeId, attributeId: opcua.AttributeIds.Value })
        ).statusCode.isGood(),
      "Gateway did not reconnect after owned communication loss",
    );
    assert.ok(
      simulator.state.requests.every((request) =>
        [3, 4].includes(request.functionCode),
      ),
    );
    assert.ok(
      simulator.state.requests.some((request) => request.functionCode === 3),
    );
    assert.ok(
      simulator.state.requests.some((request) => request.functionCode === 4),
    );
    const received = (
      await pool.query(
        "SELECT signal_metadata,source_timestamp,received_at,raw_value,value FROM opcua_data WHERE machine_id=$1 AND node_key='ProductionCount' AND status_code LIKE 'Good%' ORDER BY timestamp DESC LIMIT 1",
        [machines[0].id],
      )
    ).rows[0];
    assert.equal(received.signal_metadata.namespaceUri, config.namespaceUri);
    assert.equal(received.raw_value, received.value);
    assert.ok(received.source_timestamp && received.received_at);
    console.log(
      "PASS: owned Modbus 03/04 -> encrypted loopback OPC UA -> two browser-commissioned machines, reusable profile, write rejection, durable quality/gaps and reconnect",
    );
  } finally {
    await session?.close();
    await client?.disconnect();
    for (const machine of machines)
      await multiMachine.disconnectMachine(machine.id);
    await worker.stop();
    await stopConfiguredGateway();
    settings.ENABLE_LEGACY_GATEWAY = originalEnabled;
    for (const gateway of gateways) await gateway.stop();
    await simulator.stop();
  }
}
