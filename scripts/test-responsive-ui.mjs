import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dailyFixture } from "./daily-fixture.mjs";
import { selectOperation, selectSettings } from "./browser-navigation.mjs";
const out = resolve(process.env.UI_EVIDENCE_DIR || ".local/ui-rework-evidence");
await mkdir(out, { recursive: true });
const evidence = {
  scope: "Isolated synthetic data; no live machine connections",
  overflows: [],
  screenshots: [],
  checks: [],
  errors: [],
};
process.env.COMPLIANCE_MODE_ENABLED = "true";
await dailyFixture(async ({ pool, users, actors, frontend, call, expect }) => {
  const machine = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Press 01 · audit fixture','opc.tcp://127.0.0.1:49981','127.0.0.1'),('Assembly 02 · audit fixture','opc.tcp://127.0.0.1:49982','127.0.0.1') RETURNING id",
    )
  ).rows[0].id;
  for (let number = 3; number <= 7; number++)
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES($1,$2,'127.0.0.1',false)",
      [
        `Station ${number} · audit fixture`,
        `opc.tcp://127.0.0.1:${49980 + number}`,
      ],
    );
  const signal = (nodeKey) => ({
    nodeKey,
    namespaceUri: "urn:ui-audit",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: nodeKey === "Pressure" ? "bar" : null,
    scale: 1,
  });
  const profile = {
    version: 1,
    name: "Audit profile",
    endpointModel: "Synthetic fixture",
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
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [machine, profile, users.admin.id],
  );
  await pool.query(
    'INSERT INTO production_shifts(machine_id,name,timezone,"start","end",profile,job,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      machine,
      "UI review shift",
      "Europe/Berlin",
      new Date(Date.now() - 3600000),
      new Date(Date.now() + 3600000),
      profile,
      { reference: "Fixture", product: "Housing", target: 120 },
      users.admin.id,
    ],
  );
  const plant = (
    await pool.query(
      "INSERT INTO plants(name,location,timezone) VALUES('North workshop · fixture','Synthetic location','Europe/Berlin') RETURNING id",
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO machine_sites(machine_id,plant_id) VALUES($1,$2)",
    [machine, plant],
  );
  for (let i = 0; i < 60; i++)
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,$5,$6)",
      [
        machine,
        "Pressure",
        new Date(Date.now() - (59 - i) * 10000),
        48 + Math.sin(i / 5) * 3,
        "Good",
        signal("Pressure"),
      ],
    );
  const alarm = (
    await pool.query(
      "INSERT INTO alert_history(machine_id,rule_name,severity,message,metadata) VALUES($1,'Bearing temperature','high','Inspect drive bearing before the next shift','{\"healthKey\":\"fixture-bearing\"}'),($1,'Data continuity','medium','No live connection in this visual fixture','{}') RETURNING id",
      [machine],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO maintenance_actions(machine_id,alarm_id,owner_id,escalation_owner_id,due_at,action,created_by) VALUES($1,$2,$3,$3,now()+interval '1 day','Inspect drive bearing',$3)",
    [machine, alarm, users.admin.id],
  );
  const spc = (
    await pool.query(
      "INSERT INTO spc_profiles(name,machine_id,node_key,method,chart_type,mean,ucl,lcl,created_by) VALUES('Pressure stability · fixture',$1,'Pressure','zscore','individuals',48,55,41,$2) RETURNING id",
      [machine, users.admin.id],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO recipes(name,description,machine_id,created_by) VALUES('Housing A · fixture','Synthetic recipe for visual review',$1,$2)",
    [machine, users.admin.id],
  );
  const dash = await call("admin", "POST", "/api/v1/dashboards/ui-audit", {
    name: "Press overview · synthetic data",
    widgets: [
      {
        id: "trend",
        type: "trendingExplorer",
        config: { machineId: machine, defaultTags: ["Pressure"] },
      },
      { id: "system", type: "systemStatus", config: {} },
    ],
    layout: [
      { i: "trend", x: 0, y: 0, w: 8, h: 10 },
      { i: "system", x: 8, y: 0, w: 4, h: 10 },
    ],
  });
  if (!dash.ok()) throw new Error(await dash.text());
  const routes = [
    ["overview", "/"],
    ["dashboard", "/dashboard/ui-audit"],
    ["machines", "/machines"],
    ["production", "/production"],
    ["operations", "/operations"],
    ["wallboard", "/wallboard"],
    ["settings", "/settings"],
    ["plants", "/plants"],
    ["oee", "/oee/config"],
    ["alert-rules", "/alerts/rules"],
    ["alert-history", "/alerts/history"],
    ["notification-channels", "/alerts/channels"],
    ["report-templates", "/reports/templates"],
    ["report-schedules", "/reports/schedules"],
    ["report-history", "/reports/history"],
    ["compliance", "/compliance"],
    ["spc-profiles", "/spc"],
    ["spc-chart", `/spc/chart/${spc}`],
    ["digital-twins", "/digital-twins"],
    ["recipes", "/recipes"],
    ["batches", "/batches"],
    ["help", "/help"],
  ];

  const settle = async (page) => {
    await page
      .waitForLoadState("networkidle", { timeout: 3500 })
      .catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
  };
  const capture = async (page, name) => {
    await settle(page);
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      body: document.documentElement.scrollWidth,
      main: document.querySelector("main")?.scrollWidth,
      mainWidth: document.querySelector("main")?.clientWidth,
    }));
    await page.screenshot({ path: resolve(out, name + ".png") });
    evidence.screenshots.push({ name, ...overflow });
    if (
      overflow.body > overflow.viewport + 1 ||
      overflow.main > overflow.mainWidth + 1
    )
      evidence.overflows.push({ name, ...overflow });
    await writeFile(
      resolve(out, "progress.json"),
      JSON.stringify(evidence, null, 2),
    );
  };
  for (const mode of ["dark", "light"]) {
    const page = await actors.admin.newPage();
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    await page.addInitScript((mode) => {
      localStorage.setItem("themeMode", mode);
      localStorage.setItem("useSystemTheme", "false");
      localStorage.setItem("language", "en");
    }, mode);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const [name, path] of routes) {
        await page.goto(frontend + path);
        await capture(page, `${mode}-${width}-${name}`);
      }
    }
    await page.close();
  }
  const page = await actors.admin.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("`children` must be passed"))
      evidence.errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(frontend + "/");
  await page
    .getByLabel("Search machines", { exact: true })
    .fill("no matching machine");
  await expect(
    page.getByText("No machines match this view.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Search machines", { exact: true }).fill("");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  evidence.checks.push("Overview search, empty state and machine pagination");
  await page.goto(frontend + "/machines");
  await page.getByRole("button", { name: "Add Machine", exact: true }).click();
  const form = page.getByRole("form", { name: "Add Machine" });
  await form.getByLabel("Machine Name").fill("Phone configured fixture");
  await form.getByLabel("IP Address").fill("127.0.0.1");
  await form.getByRole("switch", { name: "Active", exact: true }).uncheck();
  await capture(page, "phone-machine-editor");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(
    page.getByText("Phone configured fixture", { exact: true }),
  ).toBeVisible();
  assert.equal(
    (
      await pool.query(
        "SELECT is_active FROM machines WHERE name='Phone configured fixture'",
      )
    ).rows[0].is_active,
    false,
  );
  evidence.checks.push("Phone creates an inactive machine through real API");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  for (const name of [
    "Appearance",
    "Backup & Restore",
    "People & Access",
    "Certificates",
    "Audit Trail",
    "Webhooks",
    "Edges",
    "Custom Widgets",
    "System Info",
    "Connections",
  ]) {
    await selectSettings(page, name);
    await capture(page, "phone-settings-" + name.replace(/[^a-z]+/gi, "-"));
  }
  await page
    .getByRole("button", { name: "Test Connection", exact: true })
    .click();
  await expect(
    page.getByText("Last test passed", { exact: true }),
  ).toBeVisible();
  evidence.checks.push(
    "All ten Settings destinations and real database test work on phone",
  );
  await page.goto(frontend + "/operations");
  await page.getByRole("combobox", { name: "Machine", exact: true }).click();
  await page
    .getByRole("option", { name: "Press 01 · audit fixture", exact: true })
    .click();
  for (const name of [
    "Planning",
    "Maintenance",
    "Energy and losses",
    "History",
    "Production line",
    "Alarm actions",
    "Comparisons",
    "Connection diagnostics",
    "Alarm usefulness",
    "Work orders",
    "Changeovers",
    "Improvement actions",
    "Recommendations",
    "Completion forecast",
    "Asset overview",
    "Calculated signals",
    "PLC alarms",
    "Sites",
  ]) {
    await selectOperation(page, name);
    await capture(page, "phone-operations-" + name.replace(/[^a-z]+/gi, "-"));
  }
  evidence.checks.push(
    "All eighteen Operations destinations reachable on phone",
  );
  const before = await (
    await call("admin", "GET", "/api/v1/dashboards/ui-audit")
  ).json();
  await page.goto(frontend + "/dashboard/ui-audit");
  await settle(page);
  const after = await (
    await call("admin", "GET", "/api/v1/dashboards/ui-audit")
  ).json();
  assert.deepEqual(after.layout, before.layout);
  evidence.checks.push("Phone view preserves stored desktop widget layout");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(frontend + "/machines");
  await page.getByRole("button", { name: "Add Machine", exact: true }).click();
  await capture(page, "tablet-machine-editor");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => localStorage.setItem("language", "de"));
  for (const [name, path] of routes.filter(([name]) =>
    ["overview", "machines", "operations", "settings"].includes(name),
  )) {
    await page.goto(frontend + path);
    await capture(page, "german-tablet-" + name);
  }
  await page.close();
  for (const role of ["supervisor", "operator", "viewer"]) {
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users[role].id, machine],
    );
    const restricted = await actors[role].newPage();
    await restricted.setViewportSize({ width: 390, height: 844 });
    await restricted.goto(frontend + "/");
    await restricted.getByRole("button", { name: "More", exact: true }).click();
    await expect(
      restricted.getByRole("link", { name: "Settings", exact: true }),
    ).toHaveCount(0);
    await restricted.goto(frontend + "/machines");
    await expect(
      restricted.getByRole("button", { name: "Add Machine", exact: true }),
    ).toHaveCount(0);
    await restricted.close();
  }
  evidence.checks.push(
    "Supervisor, operator and viewer retain restricted administration access",
  );
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.overflows, []);
});
await writeFile(resolve(out, "checks.json"), JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify({
    screenshots: evidence.screenshots.length,
    checks: evidence.checks,
    errors: evidence.errors,
  }),
);
