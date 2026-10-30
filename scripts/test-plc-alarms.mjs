import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import * as opcua from "node-opcua";
import { dailyFixture } from "./daily-fixture.mjs";

// A07: read-only observation of OPC UA alarms and conditions on an owned server: refresh on
// connect, server request and reconnect, duplicate EventIds stored once, information-only
// events kept, severity mapped, and nothing acknowledged.
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const certificates = new opcua.OPCUACertificateManager({ rootFolder: join(directory, "alarm-server-pki"), automaticallyAcceptUnknownCertificate: false });
  await certificates.initialize();
  const certificateFile = join(directory, "alarm-server.pem");
  await certificates.createSelfSignedCertificate({
    outputFile: certificateFile,
    applicationUri: "urn:localhost:alarm-fixture",
    subject: "/CN=Owned alarm fixture",
    dns: ["localhost"],
    ip: ["127.0.0.1"],
    startDate: new Date(Date.now() - 60000),
    validity: 1,
  });
  // An owned server with one retained, active alarm raised before anyone connects.
  const startServer = async () => {
    const server = new opcua.OPCUAServer({
      port,
      hostname: "localhost",
      resourcePath: "/UA/Alarms",
      securityModes: [opcua.MessageSecurityMode.None],
      securityPolicies: [opcua.SecurityPolicy.None],
      allowAnonymous: true,
      certificateFile,
      privateKeyFile: certificates.privateKey,
      serverCertificateManager: certificates,
      serverInfo: { applicationUri: "urn:localhost:alarm-fixture" },
    });
    await server.initialize();
    const space = server.engine.addressSpace;
    space.installAlarmsAndConditionsService();
    const ns = space.getOwnNamespace();
    const press = ns.addObject({ browseName: "Press", organizedBy: space.rootFolder.objects, eventSourceOf: space.rootFolder.objects.server, eventNotifier: 1 });
    const pressure = ns.addVariable({ componentOf: press, browseName: "Pressure", dataType: "Double", value: new opcua.Variant({ dataType: opcua.DataType.Double, value: 9 }) });
    const alarm = ns.instantiateAlarmCondition("AlarmConditionType", { browseName: "OverPressure", componentOf: press, conditionSource: press, conditionName: "OverPressure", inputNode: pressure });
    alarm.activeState.setValue(true);
    alarm.raiseNewCondition({ message: "Pressure above 8 bar", severity: 700, retain: true, quality: opcua.StatusCodes.Good });
    await server.start();
    return { server, space, alarm };
  };
  let fixture = await startServer();
  const { plcAlarms } = await import("../server/dist/src/services/plcAlarms.js");
  await plcAlarms.startAll();
  try {
    const [{ id: machine }] = (
      await pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('Alarm press',$1,'127.0.0.1',false) RETURNING id", [`opc.tcp://localhost:${port}/UA/Alarms`])
    ).rows;
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users.viewer.id, machine]);
    const ok = async (role, method, path, body, status = 200) => {
      const r = await call(role, method, "/api/v1" + path, body);
      assert.equal(r.status(), status, await r.text());
      return r.json();
    };
    await ok("operator", "PUT", `/plc-alarms/machines/${machine}/subscription`, { enabled: true }, 403);
    await ok("admin", "PUT", `/plc-alarms/machines/${machine}/subscription`, { enabled: true });
    const view = () => ok("viewer", "GET", `/plc-alarms/machines/${machine}`);
    const find = async (message) => (await view()).events.filter((e) => e.message === message);
    await expect.poll(async () => (await find("Pressure above 8 bar")).length, { timeout: 20000 }).toBe(1);
    const [replayed] = await find("Pressure above 8 bar");
    assert.deepEqual(
      { refresh: replayed.refresh, active: replayed.active, acked: replayed.acked, severity: replayed.appSeverity, name: replayed.conditionName },
      { refresh: true, active: true, acked: false, severity: "high", name: "OverPressure" },
    );

    fixture.alarm.raiseNewCondition({ message: "Pressure above 10 bar", severity: 900, retain: true, quality: opcua.StatusCodes.Good });
    fixture.space.rootFolder.objects.server.raiseEvent("BaseEventType", {
      message: { dataType: "LocalizedText", value: { text: "Shift handover" } },
      severity: { dataType: "UInt16", value: 100 },
      sourceName: { dataType: "String", value: "Line" },
    });
    await expect.poll(async () => (await find("Pressure above 10 bar")).length, { timeout: 15000 }).toBe(1);
    await expect.poll(async () => (await find("Shift handover")).length, { timeout: 15000 }).toBe(1);
    assert.deepEqual(
      [(await find("Pressure above 10 bar"))[0].appSeverity, (await find("Pressure above 10 bar"))[0].refresh],
      ["critical", false],
    );
    assert.equal((await find("Shift handover"))[0].conditionName, null, "Information-only events are kept");

    // The server asks for a refresh: current state is replayed and stored once per EventId.
    const before = (await view()).events.length;
    fixture.space.rootFolder.objects.server.raiseEvent("RefreshRequiredEventType", {});
    await expect.poll(async () => (await view()).status?.refreshCalls, { timeout: 15000 }).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const after = await view();
    const ids = after.events.map((e) => `${e.id}`);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(after.events.length >= before, "Refresh adds at most the replayed current state");
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM (SELECT event_id FROM plc_alarm_events GROUP BY machine_id,event_id HAVING count(*)>1) d")).rows[0].n,
      0,
      "No EventId is stored twice",
    );
    const acknowledged = () => fixture.alarm.ackedState.id.readValue().value.value === true;
    assert.equal(acknowledged(), false, "Nothing was acknowledged");

    // A restarted server: the observer reconnects and refreshes again.
    await fixture.server.shutdown();
    fixture = await startServer();
    await expect.poll(async () => (await view()).status?.refreshCalls ?? 0, { timeout: 60000 }).toBeGreaterThanOrEqual(3);
    // The restarted fixture runs in this process and re-sends the retained alarm with its
    // original EventId: the replay is received again but stored once.
    await expect.poll(async () => (await view()).status?.received ?? 0, { timeout: 20000 }).toBeGreaterThan(3);
    assert.equal((await find("Pressure above 8 bar")).length, 1, "A re-sent EventId is stored once");
    assert.equal(fixture.alarm.ackedState.id.readValue().value.value === true, false);

    assert.equal((await call("wallboard", "GET", `/api/v1/plc-alarms/machines/${machine}`)).status(), 403);
    const page = await actors.viewer.newPage();
    await page.goto(`${frontend}/operations`);
    await page.getByRole("combobox", { name: "Machine", exact: true }).fill("Alarm");
    await page.getByRole("option", { name: "Alarm press", exact: true }).click();
    await page.getByRole("tab", { name: "PLC alarms" }).click();
    const table = page.getByRole("table", { name: "PLC alarm events" });
    await expect(table.getByRole("row", { name: /critical \(900\) 1:Press OverPressure Pressure above 10 bar active · unacknowledged$/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /info \(100\) Line information only Shift handover/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /PLC alarms/ })).toHaveCount(0);
    await page.screenshot({ path: ".local/daily-evidence/plc-alarms.png", fullPage: true });
    await page.close();
    // PostgreSQL can reject a received transition; it survives observer restart locally.
    await pool.query(`CREATE FUNCTION reject_owned_alarm() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.message='Owned storage interruption' THEN RAISE EXCEPTION 'owned alarm storage outage'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER reject_owned_alarm BEFORE INSERT ON plc_alarm_events FOR EACH ROW EXECUTE FUNCTION reject_owned_alarm()`);
    fixture.alarm.raiseNewCondition({ message: "Owned storage interruption", severity: 700, retain: true, quality: opcua.StatusCodes.Good });
    await expect.poll(async () => (await view()).status?.pending ?? 0, { timeout: 15000 }).toBeGreaterThan(0);
    await plcAlarms.stopAll();
    await plcAlarms.startAll();
    await pool.query("DROP TRIGGER reject_owned_alarm ON plc_alarm_events; DROP FUNCTION reject_owned_alarm()");
    await expect.poll(async () => (await find("Owned storage interruption")).length, { timeout: 15000 }).toBe(1);
    await expect.poll(async () => (await view()).status?.pending ?? -1, { timeout: 15000 }).toBe(0);
    await ok("admin", "PUT", `/plc-alarms/machines/${machine}/subscription`, { enabled: false });
    assert.equal((await view()).status, null, "Observation stops when disabled");
    console.log(JSON.stringify({ plcAlarms: "passed", events: after.events.length, durableReplay: true }));
  } finally {
    await plcAlarms.stopAll();
    await fixture.server.shutdown();
  }
});
