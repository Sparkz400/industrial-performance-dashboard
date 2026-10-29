import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import * as opcua from "node-opcua";
import { nodesets } from "node-opcua-nodesets";
import { dailyFixture } from "./daily-fixture.mjs";

// C08: mapping suggestions from a declared OPC UA information model (an owned Machinery
// server) with provenance and confidence, and a clean fallback for proprietary tags.
await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const owned = async (name, models, build) => {
    const reservation = createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const certificates = new opcua.OPCUACertificateManager({
      rootFolder: join(directory, `${name}-server-pki`),
      automaticallyAcceptUnknownCertificate: false,
    });
    await certificates.initialize();
    const certificateFile = join(directory, `${name}-server.pem`);
    await certificates.createSelfSignedCertificate({
      outputFile: certificateFile,
      applicationUri: `urn:localhost:${name}`,
      subject: `/CN=Owned ${name} fixture`,
      dns: ["localhost"],
      ip: ["127.0.0.1"],
      startDate: new Date(Date.now() - 60000),
      validity: 1,
    });
    const server = new opcua.OPCUAServer({
      port,
      hostname: "localhost",
      resourcePath: `/UA/${name}`,
      nodeset_filename: models,
      securityModes: [opcua.MessageSecurityMode.None],
      securityPolicies: [opcua.SecurityPolicy.None],
      allowAnonymous: true,
      certificateFile,
      privateKeyFile: certificates.privateKey,
      serverCertificateManager: certificates,
      serverInfo: { applicationUri: `urn:localhost:${name}` },
    });
    await server.initialize();
    build(server.engine.addressSpace);
    await server.start();
    return { server, endpoint: `opc.tcp://localhost:${port}/UA/${name}` };
  };
  const counter = (namespace, parent, browseName, value) =>
    namespace.addVariable({
      componentOf: parent,
      browseName,
      dataType: "UInt32",
      value: new opcua.Variant({ dataType: opcua.DataType.UInt32, value }),
    });
  // A Machinery machine with its declared item state and proprietary counters beside it.
  const standard = await owned("machinery", [nodesets.standard, nodesets.di, nodesets.ia, nodesets.machinery], (space) => {
    const machinery = space.getNamespaceIndex("http://opcfoundation.org/UA/Machinery/");
    const own = space.getOwnNamespace();
    const machine = own.addObject({ browseName: "Press7", organizedBy: space.findNode(`ns=${machinery};i=1001`) });
    const stateMachine = space
      .findObjectType("MachineryItemState_StateMachineType", machinery)
      .instantiate({ browseName: "MachineryItemState", componentOf: machine, optionals: ["CurrentState.Number"] });
    opcua.promoteToStateMachine(stateMachine).setState("Executing");
    counter(own, machine, "PartsTotal", 120);
    counter(own, machine, "GoodParts", 117);
    counter(own, machine, "ScrapParts", 3);
  });
  // Proprietary tags only.
  const legacy = await owned("legacy", [nodesets.standard], (space) => {
    const own = space.getOwnNamespace();
    const line = own.addObject({ browseName: "Line4", organizedBy: space.rootFolder.objects });
    own.addVariable({ componentOf: line, browseName: "MachineStatus", dataType: "Int32", value: new opcua.Variant({ dataType: opcua.DataType.Int32, value: 1 }) });
    counter(own, line, "OKCount", 50);
    counter(own, line, "NOKCount", 2);
  });
  try {
    const [machine, legacyMachine] = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('Machinery press',$1,'127.0.0.1',false),('Legacy line',$2,'127.0.0.1',false) RETURNING id",
        [standard.endpoint, legacy.endpoint],
      )
    ).rows.map((r) => r.id);
    const ok = async (role, path, body, status = 200) => {
      const r = await call(role, "POST", "/api/v1" + path, body);
      assert.equal(r.status(), status, await r.text());
      return r.json();
    };
    await ok("operator", `/production/machines/${machine}/suggest`, {}, 403);

    const declared = await ok("admin", `/production/machines/${machine}/suggest`, {});
    assert.ok(declared.models.some((m) => m.name === "OPC 40001-1 Machinery"));
    assert.equal(declared.standardModel, true);
    const state = declared.suggestions.find((s) => s.role === "state");
    assert.deepEqual(
      { confidence: state.confidence, dataType: state.dataType, path: state.browsePath, states: state.states, model: state.model },
      {
        confidence: "high",
        dataType: "UInt32",
        path: "Objects/Machines/Press7/MachineryItemState/CurrentState/Number",
        states: { running: [3], idle: [2], fault: [], planned: [1] },
        model: "OPC 40001-1 Machinery",
      },
    );
    const role = (r) => declared.suggestions.filter((s) => s.role === r).map((s) => [s.browsePath, s.confidence]);
    assert.deepEqual(role("total"), [["Objects/Machines/Press7/PartsTotal", "low"]]);
    assert.deepEqual(role("good"), [["Objects/Machines/Press7/GoodParts", "low"]]);
    assert.deepEqual(role("reject"), [["Objects/Machines/Press7/ScrapParts", "low"]]);

    const fallback = await ok("admin", `/production/machines/${legacyMachine}/suggest`, {});
    assert.deepEqual(fallback.models, []);
    assert.equal(fallback.standardModel, false);
    assert.ok(fallback.suggestions.every((s) => s.confidence === "low" && !s.states));
    assert.deepEqual(
      fallback.suggestions.map((s) => [s.role, s.browsePath.split("/").at(-1)]),
      [["state", "MachineStatus"], ["good", "OKCount"], ["reject", "NOKCount"]],
    );

    // The suggestions are usable: a profile built from them passes inspection and commissioning.
    const pick = (r) => {
      const s = declared.suggestions.find((x) => x.role === r);
      return { nodeKey: s.nodeKey, namespaceUri: s.namespaceUri, identifier: s.identifier, dataType: s.dataType, unit: null, scale: 1 };
    };
    const profile = {
      version: 1,
      name: "Suggested profile",
      endpointModel: "Owned Machinery fixture",
      signals: { state: pick("state"), total: pick("total"), good: pick("good"), reject: pick("reject") },
      states: state.states,
      idealCycleMs: 1000,
      maxGapSeconds: 60,
      counterPolicy: "reject-decrease",
    };
    const inspected = await ok("admin", `/production/machines/${machine}/inspect`, { profile });
    assert.equal(inspected.ready, true, JSON.stringify(inspected.signals));
    assert.equal(inspected.signals.find((s) => s.role === "state").value, 3);

    // In the browser the administrator reviews the proposals and fills the form from one.
    const page = await actors.admin.newPage();
    await page.goto(frontend + "/production");
    await page.getByRole("tab", { name: "Commission machine" }).click();
    await page.getByLabel("Machine to commission").click();
    await page.getByRole("option", { name: "Machinery press" }).click();
    await page.getByRole("button", { name: "Suggest mappings from the information model" }).click();
    await expect(page.getByText("Declared information models: OPC 10000-100 Devices, OPC 40001-1 Machinery", { exact: false })).toBeVisible();
    await expect(page.getByText(/state ← Objects\/Machines\/Press7\/MachineryItemState\/CurrentState\/Number · UInt32 · high confidence/)).toBeVisible();
    await page.getByRole("button", { name: "Use Objects/Machines/Press7/MachineryItemState/CurrentState/Number for state" }).click();
    await expect(page.getByLabel("state key")).toHaveValue("MachineState");
    await expect(page.getByLabel("state identifier")).toHaveValue(state.identifier);
    await expect(page.getByLabel("running values (comma separated)")).toHaveValue("3");
    await page.screenshot({ path: ".local/daily-evidence/mapping-suggestions.png", fullPage: true });
    await page.getByLabel("Machine to commission").click();
    await page.getByRole("option", { name: "Legacy line" }).click();
    await page.getByRole("button", { name: "Suggest mappings from the information model" }).click();
    await expect(page.getByText("No standard information model is declared; the suggestions below match browse names only.")).toBeVisible();
    await page.close();
    console.log(JSON.stringify({ mappingSuggestions: "passed", suggestions: declared.suggestions.length }));
  } finally {
    await standard.server.shutdown();
    await legacy.server.shutdown();
  }
});
