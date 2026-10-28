import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const ok = async (method, path, body, status = 200, role = "supervisor") => {
    const response = await call(role, method, "/api/v1" + path, body);
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const machines = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,status) VALUES('Asset line','opc.tcp://127.0.0.1:49991','127.0.0.1','connected'),('Private asset line','opc.tcp://127.0.0.1:49992','127.0.0.1','connected') RETURNING id",
    )
  ).rows.map((r) => r.id);
  const signal = (nodeKey) => ({
    nodeKey,
    namespaceUri: "urn:asset-fixture",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [
      machines[0],
      {
        version: 1,
        name: "Asset fixture",
        endpointModel: "Owned fixture",
        signals: {
          state: signal("State"),
          total: signal("Total"),
          good: signal("Good"),
          reject: signal("Reject"),
        },
        states: { running: [1], idle: [0], fault: [2], planned: [3] },
        idealCycleMs: 1000,
        maxGapSeconds: 60,
        counterPolicy: "reject-decrease",
      },
      users.admin.id,
    ],
  );
  for (const role of ["supervisor", "operator", "viewer", "wallboard"])
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users[role].id, machines[0]],
    );
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="640" height="320" rx="20" fill="#edf4f7"/><text x="30" y="40" font-size="22" fill="#12354a">ASSEMBLY CELL · OWNED FIXTURE</text><path d="M170 170H470" stroke="#8babb9" stroke-width="14"/><rect id="motor" x="55" y="105" width="180" height="150" rx="20" fill="#467b95"/><circle id="pressure" cx="450" cy="180" r="65" fill="#d7a44b"/><text x="105" y="285" font-size="18" fill="#12354a">MOTOR</text><text x="405" y="285" font-size="18" fill="#12354a">PRESSURE</text></svg>';
  const template = await ok(
    "POST",
    "/digital-twins/templates",
    { name: "Assembly cell", svgContent: svg, elementMappings: [] },
    201,
    "admin",
  );
  const bindings = [
    {
      elementId: "motor",
      nodeKey: "Temperature",
      label: "Motor temperature",
      unit: "°C",
    },
    {
      elementId: "pressure",
      nodeKey: "Pressure",
      label: "Air pressure",
      unit: "bar",
    },
  ];
  const instances = [];
  for (const machineId of machines)
    instances.push(
      await ok(
        "POST",
        "/digital-twins/instances",
        {
          templateId: template.id,
          machineId,
          name: "Assembly cell layout",
          nodeBindings: bindings,
        },
        201,
        "admin",
      ),
    );
  await ok(
    "POST",
    "/digital-twins/instances",
    {
      templateId: template.id,
      machineId: machines[0],
      name: "Invalid mapping",
      nodeBindings: [{ elementId: "missing", nodeKey: "Temperature" }],
    },
    400,
    "admin",
  );
  const url = `/digital-twins/instances/${instances[0].id}`;
  // Keep legacy element aliases readable, including the detailed asset view.
  await pool.query(
    "UPDATE digital_twin_instances SET node_bindings=$1 WHERE id=$2",
    [
      JSON.stringify(
        bindings.map(({ elementId, ...r }) => ({
          ...r,
          svgElementId: elementId,
        })),
      ),
      instances[0].id,
    ],
  );
  const timestamp = Date.now();
  const insert = async (machine, node, value, age = 0, quality = "Good") =>
    pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at,signal_metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        machine,
        node,
        new Date(timestamp - age),
        value,
        JSON.stringify(value),
        quality,
        new Date(timestamp - age),
        {
          namespaceUri: "urn:asset-fixture",
          identifier: `s=${node}`,
          dataType: "Double",
        },
      ],
    );
  for (let i = 5; i > 0; i--)
    await insert(machines[0], "Temperature", 30 + i, i * 60000);
  await insert(machines[0], "Temperature", 0);
  await insert(machines[0], "Pressure", 7.5, 0, "BadSensorFailure");
  await insert(machines[1], "Temperature", 999);
  let detail = await ok("GET", url);
  assert.equal(detail.values.Temperature.value, 0);
  assert.equal(detail.values.Pressure.value, null);
  assert.equal(detail.values.Pressure.rawValue, 7.5);
  assert.equal(detail.instance.bindings[0].elementId, "motor");
  for (const role of ["supervisor", "operator", "viewer", "wallboard"]) {
    assert.equal(
      (await ok("GET", url, undefined, 200, role)).instance.machineId,
      machines[0],
    );
    await ok(
      "GET",
      `/digital-twins/instances/${instances[1].id}`,
      undefined,
      403,
      role,
    );
    await ok(
      "GET",
      `/digital-twins/instances?machineId=${machines[1]}`,
      undefined,
      403,
      role,
    );
    await ok("GET", "/digital-twins/instances", undefined, 403, role);
    await ok(
      "POST",
      "/digital-twins/instances",
      {
        templateId: template.id,
        machineId: machines[0],
        name: "Forbidden",
        nodeBindings: [],
      },
      403,
      role,
    );
  }
  const historyParams = new URLSearchParams({
    elementId: "motor",
    startDate: new Date(timestamp - 3600000).toISOString(),
    endDate: new Date(timestamp + 1000).toISOString(),
  });
  const history = await ok("GET", `${url}/element-history?${historyParams}`);
  assert.equal(history.series.nodeKey, "Temperature");
  assert(history.dataPoints.some((p) => p.value === 0));
  assert(!history.dataPoints.some((p) => p.value === 999));
  const pressureHistory = await ok(
    "GET",
    `${url}/element-history?${new URLSearchParams({ ...Object.fromEntries(historyParams), elementId: "pressure" })}`,
  );
  assert(pressureHistory.dataPoints.every((p) => p.value === null));
  await ok(
    "GET",
    `${url}/element-history?${new URLSearchParams({ ...Object.fromEntries(historyParams), startDate: "2026-01-01T00:00:00" })}`,
    undefined,
    400,
  );
  await ok(
    "GET",
    `${url}/element-history?${new URLSearchParams({ ...Object.fromEntries(historyParams), startDate: "2030-01-01T00:00:00Z" })}`,
    undefined,
    400,
  );
  await ok(
    "GET",
    `/digital-twins/instances/${instances[1].id}/element-history?${historyParams}`,
    undefined,
    403,
  );
  for (const [machine, node, message] of [
    [machines[0], "Temperature", "Motor inspection required"],
    [machines[0], "Pressure", "Other signal alarm"],
    [machines[1], "Temperature", "Private alarm"],
  ])
    await pool.query(
      "INSERT INTO alert_history(machine_id,node_key,message,severity,status) VALUES($1,$2,$3,'medium','active')",
      [machine, node, message],
    );
  const alarms = await ok(
    "GET",
    `/alarms?machineId=${machines[0]}&nodeKey=Temperature`,
  );
  assert.deepEqual(
    alarms.map((a) => a.message),
    ["Motor inspection required"],
  );
  await ok(
    "POST",
    `/maintenance/machines/${machines[0]}`,
    {
      config: {
        name: "Motor inspection",
        days: 7,
        runtimeHours: null,
        cycles: null,
        checks: ["Inspect bearing"],
        active: true,
      },
    },
    201,
  );

  const page = await actors.supervisor.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(frontend + "/operations");
  await page.getByLabel("Machine", { exact: true }).click();
  await page.getByRole("option", { name: "Asset line", exact: true }).click();
  await page.getByRole("tab", { name: "Asset overview", exact: true }).click();
  const motor = page.locator(
    'svg [role="button"][aria-label="Motor temperature"]',
  );
  await expect(motor).toBeVisible();
  await motor.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Current value: 0 °C · Fresh$/)).toBeVisible();
  await page
    .getByRole("button", { name: "Air pressure", exact: true })
    .last()
    .click();
  await expect(
    page.getByText(/^Current value: Unknown.*Bad quality$/),
  ).toBeVisible();
  await expect(page.getByText(/^Last raw reading: 7.5/)).toBeVisible();
  await motor.focus();
  await page.keyboard.press("Space");
  await page.screenshot({
    path: ".local/daily-evidence/asset-overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open signal history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Signal history · Motor temperature",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("History end", { exact: true })
    .fill(new Date(timestamp + 60000).toISOString().slice(0, 16));
  // History range is local input; use a broad explicit local window around the fixture.
  const local = (time) => {
    const d = new Date(time);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  await page
    .getByLabel("History start", { exact: true })
    .fill(local(timestamp - 3600000));
  await page
    .getByLabel("History end", { exact: true })
    .fill(local(timestamp + 60000));
  await expect(
    page
      .getByRole("region", { name: "Signal history chart", exact: true })
      .locator("svg"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open signal alarms", exact: true })
    .click();
  await expect(
    page.getByText("Motor inspection required", { exact: false }),
  ).toBeVisible();
  assert.equal(
    await page.getByText("Other signal alarm", { exact: false }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Open machine maintenance", exact: true })
    .click();
  await expect(
    page.getByText("Motor inspection", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Air pressure", exact: true })
    .last()
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page
        .getByRole("heading", { name: "Asset overview", exact: true })
        .boundingBox();
      return !!b && b.x < 100 && b.width > 250;
    })
    .toBe(true);
  await motor.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/asset-overview-mobile-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Expand navigation", exact: true })
    .click();
  await page.getByLabel("Language / Sprache").click();
  await page.getByRole("option", { name: "Deutsch", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page
        .getByRole("heading", { name: "Anlagenübersicht", exact: true })
        .boundingBox();
      return !!b && b.x < 100 && b.width > 250;
    })
    .toBe(true);
  await page
    .getByRole("heading", { name: "Anlagenübersicht", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/asset-overview-mobile-de.png",
    fullPage: true,
  });
  await page
    .getByText(/^Aktueller Wert:.*Ungültige Qualität$/)
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/asset-quality-mobile-de.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await pool.query(
    "UPDATE opcua_data SET timestamp=timestamp-interval '2 minutes',received_at=received_at-interval '2 minutes' WHERE machine_id=$1 AND node_key='Temperature'",
    [machines[0]],
  );
  await page
    .getByRole("button", { name: "Motor temperature", exact: true })
    .last()
    .click();
  await expect(page.getByText(/^Aktueller Wert:.*Veraltet$/)).toBeVisible({
    timeout: 15000,
  });
  await pool.query("UPDATE machines SET status='disconnected' WHERE id=$1", [
    machines[0],
  ]);
  await expect(page.getByText(/^Aktueller Wert:.*Getrennt$/)).toBeVisible({
    timeout: 15000,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/daily-evidence/asset-overview.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "legacy binding adapter",
          "machine-scoped data and history",
          "zero and bad raw quality",
          "signal-specific alarms",
          "keyboard SVG and touch controls",
          "history and maintenance navigation",
          "stale and disconnected polling",
          "EN/DE 390px",
        ],
        physicalQualification: false,
        processSimulation: false,
      },
      null,
      2,
    ),
  );
  console.log("Asset overview API and browser acceptance passed");
});
