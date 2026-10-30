import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";

export async function testOperator({
  call,
  page,
  frontend,
  pool,
  browser,
  viewer,
  machine,
  shift,
  adminId,
  viewerId,
}) {
  const base = "/api/v1/production/operator";
  const draft = {
    requestId: randomUUID(),
    machineId: machine.id,
    shiftId: shift.id,
    kind: "action",
    text: "Inspect material guide before restart",
    priority: "high",
    ownerId: viewerId,
    dueAt: "2026-12-01T18:00:00Z",
    intervalStart: null,
    intervalEnd: null,
    quantity: null,
  };
  const created = await call("POST", `${base}/entries`, draft, viewer.request);
  assert.equal(created.status(), 201, await created.text());
  const entry = await created.json();
  assert.equal(
    (
      await (
        await call("POST", `${base}/entries`, draft, viewer.request)
      ).json()
    ).id,
    entry.id,
  );
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries`,
        { ...draft, text: "Changed replay" },
        viewer.request,
      )
    ).status(),
    409,
  );
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries`,
        { ...draft, requestId: randomUUID(), ownerId: null },
        viewer.request,
      )
    ).status(),
    400,
  );
  const other = (
    await pool.query("SELECT id FROM machines WHERE id <> $1 LIMIT 1", [
      machine.id,
    ])
  ).rows[0];
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries`,
        { ...draft, requestId: randomUUID(), machineId: other.id },
        viewer.request,
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries`,
        {
          ...draft,
          requestId: randomUUID(),
          intervalStart: "2020-01-01T00:00:00Z",
          intervalEnd: "2020-01-01T01:00:00Z",
        },
        viewer.request,
      )
    ).status(),
    400,
  );
  const change = {
    version: 1,
    text: "Inspect material guide before restart",
    priority: "high",
    ownerId: adminId,
    dueAt: draft.dueAt,
    status: "open",
  };
  const concurrent = await Promise.all([
    call("POST", `${base}/entries/${entry.id}`, change, viewer.request),
    call(
      "POST",
      `${base}/entries/${entry.id}`,
      { ...change, text: "Conflicting revision" },
      viewer.request,
    ),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  const history = await (
    await call("GET", `${base}/entries/${entry.id}/history`)
  ).json();
  assert.deepEqual(
    history.events.map((event) => event.version),
    [2, 1],
  );
  assert.equal(history.events[1].snapshot.ownerId, viewerId);
  assert.equal(
    (
      await (
        await call("POST", `${base}/entries`, draft, viewer.request)
      ).json()
    ).version,
    2,
    "Retry returns the current entry without reverting its revision",
  );
  const quantities = {
    ...draft,
    requestId: randomUUID(),
    kind: "quantity",
    quantity: { total: 20, good: 18, reject: 2 },
  };
  const quantityResponse = await call(
    "POST",
    `${base}/entries`,
    quantities,
    viewer.request,
  );
  assert.equal(quantityResponse.status(), 201);
  const quantity = await quantityResponse.json();
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries/${quantity.id}`,
        { ...change, status: "resolved" },
        viewer.request,
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await call("POST", `${base}/entries/${quantity.id}`, {
        ...change,
        status: "resolved",
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await call(
        "POST",
        `${base}/entries`,
        {
          ...quantities,
          requestId: randomUUID(),
          quantity: { total: 19, good: 18, reject: 2 },
        },
        viewer.request,
      )
    ).status(),
    400,
  );

  await page.goto(`${frontend}/production`);
  await page
    .getByRole("tab", { name: "Operator handover", exact: true })
    .click();
  await page.getByLabel("Handover machine").click();
  await page.getByRole("option", { name: machine.name, exact: true }).click();
  await page
    .getByLabel("Observation / action")
    .fill("Next shift: material guide checked; retain rejected samples.");
  await page
    .getByRole("button", { name: "Save handover", exact: true })
    .click();
  await expect(
    page.getByText(
      "Next shift: material guide checked; retain rejected samples.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Review / edit #${entry.id}`, exact: true })
    .click();
  await page
    .getByLabel("Observation / action")
    .fill("Supervisor confirmed guide inspection remains open");
  await page
    .getByRole("button", { name: "Save handover", exact: true })
    .click();
  await page
    .getByRole("button", { name: `History #${entry.id}`, exact: true })
    .click();
  await expect(page.getByLabel(`History for entry ${entry.id}`)).toContainText(
    "Revision 3",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "More", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await page.locator("main").boundingBox()).x)
    .toBeLessThan(65);
  await expect(page.getByLabel("Handover machine")).toBeVisible();
  await page
    .getByRole("heading", { name: "Operator handover", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/production-evidence/operator-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile handover overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const now = new Date(),
    begin = new Date(now.getTime() - 10000),
    finish = new Date(now.getTime() + 3600000);
  const sourceShift = (
    await pool.query("SELECT * FROM production_shifts WHERE id=$1", [shift.id])
  ).rows[0];
  await pool.query("UPDATE machines SET status='connected' WHERE id=$1", [
    machine.id,
  ]);
  const current = (
    await pool.query(
      "INSERT INTO production_shifts(machine_id,name,timezone,start,\"end\",profile,job,breaks,created_by) VALUES ($1,'Owned current shift','UTC',$2,$3,$4,$5,'[]',$6) RETURNING id",
      [
        machine.id,
        begin,
        finish,
        sourceShift.profile,
        { reference: "OWNED-JOB", product: "Guide", target: 20 },
        adminId,
      ],
    )
  ).rows[0];
  for (const [role, at, value] of [
    ["state", now, 1],
    ["total", begin, 0],
    ["total", now, 5],
  ]) {
    const signal = sourceShift.profile.signals[role];
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,source_timestamp,received_at,value,status_code,signal_metadata) VALUES ($1,$2,$3,$3,$4,$5,'Good',$6)",
      [
        machine.id,
        signal.nodeKey,
        at,
        now,
        value,
        { namespaceUri: signal.namespaceUri, identifier: signal.identifier },
      ],
    );
  }
  const currentLive = (
    await (await call("GET", `${base}/live?ids=${machine.id}`)).json()
  ).machines[0];
  assert.equal(currentLive.shift.id, current.id);
  assert.equal(currentLive.state, "running");
  assert.equal(currentLive.production.observed, 5);
  assert.equal(currentLive.production.complete, false);
  await page.getByRole("link", { name: "Open supervisor wallboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Production wallboard" }),
  ).toBeVisible();
  await expect(
    page.getByText("Supervisor confirmed guide inspection remains open"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "5 / 20 target", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/production-evidence/wallboard.png",
    fullPage: true,
  });
  await page
    .getByText("Create a read-only display account", { exact: true })
    .click();
  const password = `Display-${randomUUID()}`;
  await page.getByLabel("Display username").fill("owneddisplay");
  await page.getByLabel("Display email").fill("display@example.com");
  await page.getByLabel("Display password").fill(password);
  await page
    .getByRole("button", { name: "Create display account", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Display account created" }),
  ).toBeVisible();
  const display = await browser.newContext();
  try {
    const screen = await display.newPage();
    await screen.goto(`${frontend}/login`);
    await screen.getByLabel("Username").fill("owneddisplay");
    await screen.getByLabel(/^password/i).fill(password);
    await screen.getByRole("button", { name: /sign in|log in/i }).click();
    await screen.waitForURL("**/wallboard");
    for (const [method, path, data] of [
      ["POST", `${base}/entries`, draft],
      ["POST", "/api/v1/alarms/1/acknowledge", {}],
      ["POST", "/api/trpc/alarm.acknowledge", { id: 1 }],
      ["POST", "/api/v1/production/shifts/1/reasons", {}],
    ])
      assert.equal(
        (await call(method, path, data, display.request)).status(),
        403,
        path,
      );
    await expect(
      screen.getByRole("button", {
        name: "Create display account",
        exact: true,
      }),
    ).toHaveCount(0);
    await screen.route("**/production/operator/live?*", (route) =>
      route.abort(),
    );
    await expect(
      screen.getByText("Live status unavailable or overdue.", { exact: false }),
    ).toBeVisible({ timeout: 20000 });
    for (const heading of await screen.getByRole("heading", { level: 3 }).all())
      await expect(heading).toHaveText("Unknown");
  } finally {
    await display.close();
  }
  const isolated = await (
    await call("GET", `${base}/live?ids=${other.id}`)
  ).json();
  assert.deepEqual(
    isolated.machines.map((asset) => asset.id),
    [other.id],
  );
  assert.ok(
    !isolated.machines[0].issues.some((issue) => issue.id === entry.id),
  );
  assert.equal(
    (await call("GET", `${base}/live?ids=1,2,3,4,5,6,7`)).status(),
    400,
  );
  console.log(
    "PASS: operator retries, conflicts, attribution, quantity review, mobile workflow and read-only wallboard",
  );
}
