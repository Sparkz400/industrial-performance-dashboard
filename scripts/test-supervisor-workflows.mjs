import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const request = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, `${method} ${path}: ${await r.text()}`);
    return r.json();
  };
  const machines = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Supervisor A','opc.tcp://127.0.0.1:49891','127.0.0.1'),('Supervisor B','opc.tcp://127.0.0.1:49892','127.0.0.1'),('Other site','opc.tcp://127.0.0.1:49893','127.0.0.1') RETURNING id",
    )
  ).rows.map((r) => r.id);
  for (const machine of machines.slice(0, 2))
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$3),($2,$3)",
      [users.supervisor.id, users.operator.id, machine],
    );
  const states = {
    running: [1],
    idle: [0],
    fault: [2],
    blocked: [3],
    starved: [4],
  };
  const lineConfig = (ids) => ({
    name: "Assigned production line",
    maxGapSeconds: 60,
    microstopSeconds: 10,
    machines: ids.map((machineId) => ({
      machineId,
      stateKey: "State",
      cycleKey: null,
      outputKey: null,
      states,
    })),
    buffers: [],
  });
  const line = await request(
    "supervisor",
    "POST",
    "/lines",
    lineConfig(machines.slice(0, 2)),
    201,
  );
  const hidden = await request(
    "admin",
    "POST",
    "/lines",
    { ...lineConfig(machines.slice(1)), name: "Other site line" },
    201,
  );
  assert.deepEqual(
    (await request("supervisor", "GET", "/lines")).map((l) => l.id),
    [line.id],
  );
  await request(
    "supervisor",
    "POST",
    "/lines",
    lineConfig(machines.slice(1)),
    403,
  );
  const reportQuery =
    "?start=2026-01-01T00:00:00Z&end=2026-01-01T00:02:00Z&target=100";
  const report = await request(
    "supervisor",
    "GET",
    `/lines/${line.id}/report${reportQuery}`,
  );
  assert.equal(report.targetShortfall, null);
  await request(
    "supervisor",
    "GET",
    `/lines/${hidden.id}/report${reportQuery}`,
    undefined,
    403,
  );
  for (const role of ["operator", "viewer", "wallboard"]) {
    await request(role, "GET", "/lines", undefined, 403);
    await request(
      role,
      "GET",
      `/maintenance-actions/machines/${machines[0]}`,
      undefined,
      403,
    );
  }
  await request(
    "supervisor",
    "GET",
    `/maintenance-actions/machines/${machines[2]}`,
    undefined,
    403,
  );
  await request(
    "supervisor",
    "GET",
    `/maintenance-actions/machines/${machines[2]}/owners`,
    undefined,
    403,
  );
  const site = (
    await pool.query(
      "INSERT INTO plants(name) VALUES('Owner scope site') RETURNING id",
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO machine_sites(machine_id,plant_id) VALUES($1,$2)",
    [machines[0], site],
  );
  await pool.query(
    "INSERT INTO plant_memberships(user_id,plant_id,role) VALUES($1,$2,'operator')",
    [users.operator.id, site],
  );
  await pool.query(
    "DELETE FROM machine_grants WHERE user_id=$1 AND machine_id=$2",
    [users.operator.id, machines[0]],
  );
  assert(
    (
      await request(
        "supervisor",
        "GET",
        `/maintenance-actions/machines/${machines[0]}/owners`,
      )
    ).some((o) => o.id === users.operator.id),
  );
  await pool.query("UPDATE plants SET is_active=false WHERE id=$1", [site]);
  assert(
    !(
      await request(
        "supervisor",
        "GET",
        `/maintenance-actions/machines/${machines[0]}/owners`,
      )
    ).some((o) => o.id === users.operator.id),
  );
  await pool.query(
    "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
    [users.operator.id, machines[0]],
  );
  const alarm = (
    await pool.query(
      "INSERT INTO alert_history(machine_id,message,metadata) VALUES($1,'Inspect bearing','{\"healthKey\":\"bearing\"}') RETURNING id",
      [machines[0]],
    )
  ).rows[0].id;
  const body = {
    alarmId: alarm,
    ownerId: users.operator.id,
    escalationOwnerId: users.supervisor.id,
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    action: "Inspect bearing",
    suppressionUntil: null,
    quietStart: null,
    quietEnd: null,
  };
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/machines/${machines[0]}`,
    { ...body, ownerId: users.viewer.id },
    400,
  );
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/machines/${machines[0]}`,
    { ...body, dueAt: "2030-01-01T12:00:00" },
    400,
  );
  let action = await request(
    "supervisor",
    "POST",
    `/maintenance-actions/machines/${machines[0]}`,
    body,
    201,
  );
  const revise = { ...body };
  delete revise.alarmId;
  const revised = await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/revise`,
    {
      ...revise,
      version: action.version,
      ownerId: users.supervisor.id,
      reason: "Shift handover",
    },
  );
  assert.equal(revised.version, 2);
  const firstHistory = await request(
    "supervisor",
    "GET",
    `/maintenance-actions/${action.id}/revisions`,
  );
  assert.equal(firstHistory.revisions[0].previous.owner_id, users.operator.id);
  assert.equal(firstHistory.revisions[0].changedBy, users.supervisor.id);
  assert.equal(firstHistory.next, null);
  await request(
    "operator",
    "GET",
    `/maintenance-actions/${action.id}/revisions`,
    undefined,
    403,
  );
  await request(
    "supervisor",
    "GET",
    `/maintenance-actions/${action.id}/revisions?after=-1`,
    undefined,
    400,
  );
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/revise`,
    { ...revise, version: 1, reason: "Stale edit" },
    409,
  );
  await request(
    "operator",
    "POST",
    `/maintenance-actions/${action.id}/revise`,
    { ...revise, version: 2, reason: "Wrong role" },
    403,
  );
  await pool.query(
    "DELETE FROM machine_grants WHERE user_id=$1 AND machine_id=$2",
    [users.supervisor.id, machines[0]],
  );
  await request(
    "supervisor",
    "GET",
    `/maintenance-actions/${action.id}/revisions`,
    undefined,
    403,
  );
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/complete`,
    { version: 2, serviceEventId: 1, note: "Denied" },
    403,
  );
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/revise`,
    { ...revise, version: 2, reason: "Denied" },
    403,
  );
  assert.deepEqual(await request("supervisor", "GET", "/lines"), []);
  await pool.query(
    "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
    [users.supervisor.id, machines[0]],
  );
  const signal = (nodeKey) => ({
    nodeKey,
    namespaceUri: "urn:supervisor",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  const profile = {
    version: 1,
    name: "Supervisor fixture",
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
  const plan = (
    await pool.query(
      "INSERT INTO maintenance_plans(machine_id,config,profile,created_by) VALUES($1,$2,$3,$4) RETURNING id",
      [
        machines[0],
        {
          name: "Bearing inspection",
          days: 7,
          runtimeHours: null,
          cycles: null,
          checks: ["bearing"],
          active: true,
        },
        profile,
        users.admin.id,
      ],
    )
  ).rows[0].id;
  const service = (
    await pool.query(
      "INSERT INTO maintenance_events(request_id,plan_id,serviced,checks,note,created_by) VALUES($1,$2,true,'{\"bearing\":true}','Bearing checked',$3) RETURNING id",
      [randomUUID(), plan, users.operator.id],
    )
  ).rows[0].id;
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/complete`,
    { version: 1, serviceEventId: service, note: "Stale completion" },
    409,
  );
  const page = await actors.supervisor.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(frontend + "/operations");
  await page.getByRole("combobox", { name: "Machine", exact: true }).click();
  await page.getByRole("option", { name: "Supervisor A", exact: true }).click();
  await selectOperation(page, "Production line");
  await page
    .getByRole("combobox", { name: "Production line", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Assigned production line", exact: true })
    .click();
  await page.getByRole("button", { name: "Analyze line", exact: true }).click();
  await expect(
    page.getByText("No candidate has sufficient supporting data."),
  ).toBeVisible();
  await selectOperation(page, "Alarm actions");
  await expect(
    page.getByRole("heading", { name: "Alarm maintenance actions" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Action to revise", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Inspect bearing", exact: true })
    .click();
  await page
    .getByLabel("Reason for correction", { exact: true })
    .fill("Tablet reassignment");
  await page.getByRole("combobox", { name: /^Action owner/ }).click();
  await page.getByRole("option", { name: "admin", exact: true }).click();
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  action = (
    await request(
      "supervisor",
      "GET",
      `/maintenance-actions/machines/${machines[0]}`,
    )
  )[0];
  assert.equal(action.version, 3);
  assert.equal(action.owner_id, users.admin.id);
  assert.equal(
    (
      await request(
        "supervisor",
        "GET",
        `/maintenance-actions/${action.id}/revisions`,
      )
    ).revisions[1].reason,
    "Tablet reassignment",
  );
  // More than 100 accepted corrections remain available without unbounded list responses.
  for (let i = 3; i <= 102; i++) {
    action = await request(
      "supervisor",
      "POST",
      `/maintenance-actions/${action.id}/revise`,
      {
        ...revise,
        ownerId: users.admin.id,
        version: action.version,
        reason: `Correction ${i}`,
      },
    );
  }
  const concurrent = await Promise.all(
    ["A", "B"].map((reason) =>
      call(
        "supervisor",
        "POST",
        `/api/v1/maintenance-actions/${action.id}/revise`,
        {
          ...revise,
          ownerId: users.admin.id,
          version: action.version,
          reason: `Concurrent ${reason}`,
        },
      ),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  const history = [];
  let after = 0;
  do {
    const page = await request(
      "supervisor",
      "GET",
      `/maintenance-actions/${action.id}/revisions?after=${after}`,
    );
    assert(page.revisions.length <= 20);
    history.push(...page.revisions);
    after = page.next;
  } while (after !== null);
  assert.equal(history.length, 103);
  assert.deepEqual(
    history.map((r) => r.previous.version),
    Array.from({ length: 103 }, (_, i) => i + 1),
  );
  assert.deepEqual(history[0], firstHistory.revisions[0]);
  assert.match(history.at(-1).reason, /^Concurrent [AB]$/);
  await page
    .getByRole("button", { name: "Refresh recovery status", exact: true })
    .click();
  await page.getByText("Correction history", { exact: true }).click();
  await expect(page.getByText(/Shift handover/)).toBeVisible();
  const next = page.getByRole("button", {
    name: "Next corrections",
    exact: true,
  });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Correction 21 ·/)).toBeVisible();
  await expect(page.getByText(/Shift handover/)).not.toBeVisible();
  await page
    .getByRole("button", { name: "Previous corrections", exact: true })
    .click();
  await expect(page.getByText(/Shift handover/)).toBeVisible();
  await page.evaluate(() => localStorage.setItem("language", "de"));
  await page.reload();
  await page.getByRole("combobox", { name: "Maschine", exact: true }).click();
  await page.getByRole("option", { name: "Supervisor A", exact: true }).click();
  await selectOperation(page, "Alarmmaßnahmen");
  await expect(
    page.getByRole("heading", { name: "Alarmbezogene Instandhaltung" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  await page
    .getByRole("combobox", { name: "Abzuschließende Maßnahme", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Inspect bearing", exact: true })
    .click();
  await page
    .getByRole("combobox", {
      name: "Abgeschlossene Wartungsprüfung",
      exact: true,
    })
    .click();
  await page.getByRole("option", { name: /Bearing inspection/ }).click();
  await page
    .getByLabel("Ergebnis des Eingriffs", { exact: true })
    .fill("Lager geprüft");
  await page
    .getByRole("button", {
      name: "Abgeschlossenen Eingriff erfassen",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Wartet auf gemessene Erholung/)).toBeVisible();
  await pool.query("UPDATE alert_history SET resolved_at=now() WHERE id=$1", [
    alarm,
  ]);
  await page
    .getByRole("button", { name: "Erholungsstatus aktualisieren", exact: true })
    .click();
  await expect(page.getByText(/Erholung beobachtet/)).toBeVisible();
  await pool.query(
    "INSERT INTO alert_history(machine_id,message,metadata) VALUES($1,'Recurred bearing','{\"healthKey\":\"bearing\"}')",
    [machines[0]],
  );
  await page
    .getByRole("button", { name: "Erholungsstatus aktualisieren", exact: true })
    .click();
  await expect(page.getByText(/Alarm erneut aufgetreten/)).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/supervisor-maintenance-tablet-de.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Korrekturverlauf", { exact: true }).click();
  await expect(page.getByText(/Shift handover/)).toBeVisible();
  await page
    .getByRole("button", { name: "Weitere Korrekturen", exact: true })
    .click();
  await expect(page.getByText(/^Correction 21 ·/)).toBeVisible();
  await expect
    .poll(async () => {
      const box = await page
        .getByRole("heading", { name: "Alarmbezogene Instandhaltung" })
        .boundingBox();
      return box.x < 100 && box.width > 250;
    })
    .toBe(true);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No horizontal overflow on narrow screen",
  );
  const refresh = page.getByRole("button", {
    name: "Erholungsstatus aktualisieren",
    exact: true,
  });
  assert((await refresh.boundingBox()).height >= 44);
  await refresh.focus();
  await expect(refresh).toBeFocused();
  await page.screenshot({
    path: ".local/daily-evidence/supervisor-maintenance-mobile-de.png",
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: "Abgeschlossenen Eingriff erfassen",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/supervisor-maintenance-mobile-bottom-de.png",
  });
  await selectOperation(page, "Produktionslinie");
  await page
    .getByRole("combobox", { name: "Produktionslinie", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Assigned production line", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Linie analysieren", exact: true })
    .click();
  await expect(
    page.getByText("Für keinen Kandidaten liegen ausreichende Daten vor."),
  ).toBeVisible();
  assert(
    !(await page.locator("body").innerText()).includes("\uFFFD"),
    "No broken translation characters",
  );
  await page
    .getByRole("heading", { name: "Verluste der Produktionslinie" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/supervisor-line-mobile-de.png",
  });
  assert.deepEqual(errors, []);
  const completed = (
    await request(
      "supervisor",
      "GET",
      `/maintenance-actions/machines/${machines[0]}`,
    )
  )[0];
  await request(
    "supervisor",
    "POST",
    `/maintenance-actions/${action.id}/revise`,
    {
      ...revise,
      version: completed.version,
      reason: "Cannot alter completed evidence",
    },
    409,
  );
  console.log(
    JSON.stringify({
      supervisorWorkflows: "passed",
      scopedLines: true,
      scopedOwners: true,
      staleRevisionsRejected: true,
      immutableCorrectionHistory: true,
      preservedCorrections: history.length,
      pagedHistory: true,
      concurrentRevisionRejected: true,
      recoveryAndRecurrence: true,
      browserLanguages: ["en", "de"],
      viewports: [768, 390],
      physicalQualification: false,
    }),
  );
});
