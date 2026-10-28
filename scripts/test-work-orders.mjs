import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const ok = async (method, path, body, status = 200, role = "supervisor") => {
    const response = await call(role, method, "/api/v1" + path, body);
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const signal = (nodeKey) => ({
    nodeKey,
    namespaceUri: "urn:exchange-fixture",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: null,
    scale: 1,
  });
  const profile = {
    version: 1,
    name: "Exchange fixture",
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
  };
  const machines = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Order line','opc.tcp://127.0.0.1:49991','127.0.0.1'),('Private order line','opc.tcp://127.0.0.1:49992','127.0.0.1') RETURNING id",
    )
  ).rows.map((r) => r.id);
  for (const machine of machines)
    await pool.query(
      "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
      [machine, profile, users.admin.id],
    );
  for (const role of ["supervisor", "operator", "viewer", "wallboard"])
    await pool.query(
      "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
      [users[role].id, machines[0]],
    );
  const path = (action, machine = machines[0]) =>
    `/work-orders/machines/${machine}/${action}`;
  const order = (externalId, day = 1) => ({
    externalId,
    product: "Part A",
    target: 120,
    start: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
    end: `2026-01-${String(day).padStart(2, "0")}T00:02:00Z`,
    timezone: "UTC",
  });
  const document = {
    version: "work-orders-v1",
    source: "owned-fixture",
    orders: [
      order("WO-001"),
      { ...order("WO-bad"), target: -1 },
      order("WO-overlap"),
    ],
  };
  const preview = await ok("POST", path("preview"), { document });
  assert.deepEqual(
    preview.review.rows.map((r) => r.status),
    ["ready", "rejected", "rejected"],
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM production_shifts")).rows[0].count,
    "0",
  );
  const request = { document, review: preview.review, token: preview.token };
  await ok("POST", path("apply"), { ...request, token: "0".repeat(64) }, 409);
  await ok(
    "POST",
    path("apply"),
    {
      ...request,
      review: { ...preview.review, expiresAt: "2020-01-01T00:00:00Z" },
    },
    409,
  );
  await ok(
    "POST",
    path("apply"),
    { ...request, document: { ...document, source: "changed" } },
    409,
  );
  await ok("POST", path("apply"), request, 409, "admin");
  await ok("POST", path("apply", machines[1]), request, 403);
  for (const role of ["operator", "viewer", "wallboard"]) {
    await ok("POST", path("preview"), { document }, 403, role);
    await ok("GET", path("completions"), undefined, 403, role);
  }
  const imported = await ok("POST", path("apply"), request);
  const shiftId = imported.review.rows[0].shiftId;
  assert.equal(
    (await ok("POST", path("apply"), request)).review.rows[0].status,
    "unchanged",
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM work_order_imports")).rows[0].count,
    "1",
  );
  const conflicting = await ok("POST", path("preview"), {
    document: { ...document, orders: [{ ...order("WO-001"), target: 50 }] },
  });
  assert.equal(conflicting.review.rows[0].status, "rejected");
  const privateCollision = await ok(
    "POST",
    path("preview", machines[1]),
    { document: { ...document, orders: [order("WO-001")] } },
    200,
    "admin",
  );
  assert.equal(privateCollision.review.rows[0].status, "rejected");
  assert.equal(privateCollision.review.rows[0].shiftId, undefined);
  const changedProfileDoc = { ...document, orders: [order("WO-002", 2)] };
  const profilePreview = await ok("POST", path("preview"), {
    document: changedProfileDoc,
  });
  await pool.query(
    "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
    [machines[0], { ...profile, idealCycleMs: 1100 }, users.admin.id],
  );
  await ok(
    "POST",
    path("apply"),
    {
      document: changedProfileDoc,
      review: profilePreview.review,
      token: profilePreview.token,
    },
    409,
  );
  const concurrent = await ok("POST", path("preview"), {
    document: changedProfileDoc,
  });
  const concurrentBody = {
    document: changedProfileDoc,
    review: concurrent.review,
    token: concurrent.token,
  };
  await Promise.all([
    ok("POST", path("apply"), concurrentBody),
    ok("POST", path("apply"), concurrentBody),
  ]);
  assert.equal(
    (await pool.query("SELECT count(*) FROM work_order_imports")).rows[0].count,
    "2",
  );
  await pool.query(
    "UPDATE production_shifts SET name='Local reviewed correction' WHERE id=$1",
    [shiftId],
  );
  await ok("POST", path("apply"), request);
  assert.equal(
    (
      await pool.query("SELECT name FROM production_shifts WHERE id=$1", [
        shiftId,
      ])
    ).rows[0].name,
    "Local reviewed correction",
  );
  let exported = await ok("GET", path("completions"));
  assert(
    exported.rows.every(
      (r) => r.status === "no-saved-report" && r.facts === null,
    ),
  );
  await ok("POST", `/planning/shifts/${shiftId}/revisions`, {}, 201);
  exported = await ok("GET", path("completions"));
  assert.equal(
    exported.rows.find((r) => r.shiftId === shiftId).status,
    "unverified",
  );
  for (const [nodeKey, values] of Object.entries({
    State: [1, 1, 1],
    Total: [0, 15, 30],
    Good: [0, 14, 28],
    Reject: [0, 1, 2],
  })) {
    for (const [i, value] of values.entries())
      await pool.query(
        "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,'Good',$5)",
        [
          machines[0],
          nodeKey,
          new Date(Date.parse(document.orders[0].start) + i * 60000),
          value,
          signal(nodeKey),
        ],
      );
  }
  await ok("POST", `/production/shifts/${shiftId}/reconcile`, {
    total: 30,
    good: 28,
    reject: 2,
    reference: "Owned independent fixture",
  });
  const saved = await ok(
    "POST",
    `/planning/shifts/${shiftId}/revisions`,
    {},
    201,
  );
  const completed = (await ok("GET", path("completions"))).rows.find(
    (r) => r.shiftId === shiftId,
  );
  assert.equal(completed.status, "reconciled");
  assert.equal(completed.revision.digest, saved.digest);
  assert.deepEqual(completed.facts.quantities, saved.snapshot.quantities);
  await pool.query(
    "UPDATE shift_report_revisions SET digest='broken' WHERE id=$1",
    [saved.id],
  );
  assert.equal(
    (await ok("GET", path("completions"))).rows.find(
      (r) => r.shiftId === shiftId,
    ).facts,
    null,
  );
  await pool.query("UPDATE shift_report_revisions SET digest=$1 WHERE id=$2", [
    saved.digest,
    saved.id,
  ]);

  const page = await actors.supervisor.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(frontend + "/operations");
  await page.getByLabel("Machine", { exact: true }).click();
  await page.getByRole("option", { name: "Order line", exact: true }).click();
  await page.getByRole("tab", { name: "Work orders", exact: true }).click();
  const browserDoc = {
    ...document,
    orders: [order("WO-browser", 3), { externalId: "Rejected row" }],
  };
  await page
    .getByLabel("Order document", { exact: true })
    .fill(JSON.stringify(browserDoc, null, 2));
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(
    page.getByText("Ready to import", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm reviewed import", exact: true })
    .click();
  await expect(
    page.getByText("Import completed. Rejected rows were not imported.", {
      exact: true,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export completion facts", exact: true })
    .click();
  assert.match(
    (await download).suggestedFilename(),
    /^work-order-completions-\d+\.json$/,
  );
  await page.screenshot({
    path: ".local/daily-evidence/work-orders-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page
        .getByRole("heading", { name: "Work-order exchange", exact: true })
        .boundingBox();
      return !!b && b.x < 100 && b.width > 250;
    })
    .toBe(true);
  await page
    .getByRole("heading", { name: "Work-order exchange", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/work-orders-mobile-en.png",
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
        .getByRole("heading", { name: "Auftragsaustausch", exact: true })
        .boundingBox();
      return !!b && b.x < 100 && b.width > 250;
    })
    .toBe(true);
  await page
    .getByRole("heading", { name: "Auftragsaustausch", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/work-orders-mobile-de.png",
    fullPage: true,
  });
  await page
    .getByText(
      "Import abgeschlossen. Abgelehnte Zeilen wurden nicht importiert.",
      { exact: true },
    )
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/work-orders-results-mobile-de.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    ".local/daily-evidence/work-orders.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "preview no writes",
          "mixed row rejections",
          "actor/machine/input-bound review",
          "idempotent concurrent apply",
          "preserved local corrections",
          "profile change conflict",
          "scoped access",
          "frozen reconciled facts and corrupt digest rejection",
          "browser reviewed import and export",
          "EN/DE 390px",
        ],
        physicalQualification: false,
        remoteErpWrites: false,
      },
      null,
      2,
    ),
  );
  console.log("Work-order exchange API and browser acceptance passed");
});
