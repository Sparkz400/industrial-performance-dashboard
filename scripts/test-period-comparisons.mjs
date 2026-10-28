import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
    namespaceUri: "urn:comparison-fixture",
    identifier: `s=${nodeKey}`,
    dataType: "Double",
    unit: nodeKey === "Energy" ? "kWh" : null,
    scale: 1,
  });
  const profile = {
    version: 1,
    name: "Comparison fixture",
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
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Comparison line','opc.tcp://127.0.0.1:49991','127.0.0.1'),('Private comparison line','opc.tcp://127.0.0.1:49992','127.0.0.1') RETURNING id",
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
  await ok("PUT", `/energy/machines/${machines[0]}`, {
    version: 0,
    config: { signal: signal("Energy"), maxGapSeconds: 60, modulus: null },
  });
  const saved = [];
  for (const [index, product, total, good] of [
    [1, "Part A", 30, 27],
    [2, "Part A", 40, 38],
    [3, "Part B", 40, 38],
    [4, "Part A", 30, 27],
  ]) {
    const start = `2026-01-0${index}T00:00:00.000Z`,
      end = `2026-01-0${index}T00:02:00.000Z`;
    const shift = await ok(
      "POST",
      "/production/shifts",
      {
        machineId: machines[0],
        name: `Comparison shift ${index}`,
        timezone: "UTC",
        start,
        end,
        breaks: [],
        job: { reference: `Order-${index}`, product, target: 120 },
      },
      201,
    );
    for (const [nodeKey, values] of Object.entries({
      State: [1, 1, 1],
      Total: [0, total / 2, total],
      Good: index === 4 ? [0, good / 2, 1] : [0, good / 2, good],
      Reject: [0, (total - good) / 2, total - good],
      Energy: [100, 101, 102],
    }))
      for (const [i, value] of values.entries())
        await pool.query(
          "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,'Good',$5)",
          [
            machines[0],
            nodeKey,
            new Date(Date.parse(start) + i * 60000),
            value,
            signal(nodeKey),
          ],
        );
    await ok("POST", `/production/shifts/${shift.id}/reconcile`, {
      total,
      good,
      reject: total - good,
      reference: "Independent comparison fixture",
    });
    const revision = await ok(
      "POST",
      `/planning/shifts/${shift.id}/revisions`,
      {},
      201,
    );
    saved.push({ shift, revision });
  }
  const path = (
    a = saved[0].revision.id,
    b = saved[1].revision.id,
    machine = machines[0],
  ) => `/comparisons/machines/${machine}?before=${a}&after=${b}`;
  const result = await ok("GET", path());
  assert.equal(result.comparable, true);
  assert.equal(result.metrics.find((m) => m.key === "goodPerHour").delta, 330);
  assert.equal(result.metrics.find((m) => m.key === "quality").delta, 5);
  assert(result.metrics.find((m) => m.key === "kWhPerGoodPart").delta < 0);
  const mixed = await ok(
    "GET",
    path(saved[0].revision.id, saved[2].revision.id),
  );
  assert(mixed.reasons.includes("product-mix"));
  assert(mixed.metrics.every((m) => m.delta === null));
  const reset = await ok(
    "GET",
    path(saved[0].revision.id, saved[3].revision.id),
  );
  assert(reset.reasons.includes("unverified"));
  assert(reset.metrics.every((m) => m.delta === null));
  assert(reset.after.report.issues.some((s) => s.includes("good counter")));
  const latest = await ok(
    "POST",
    `/planning/shifts/${saved[0].shift.id}/revisions`,
    {},
    201,
  );
  const preserved = await ok("GET", path());
  assert.equal(preserved.before.latestRevisionId, latest.id);
  assert.deepEqual(preserved.before.report, saved[0].revision.snapshot);
  const plan = (
    await pool.query(
      "INSERT INTO maintenance_plans(machine_id,config,profile,created_by) VALUES($1,$2,$3,$4) RETURNING id",
      [
        machines[0],
        { name: "Fixture service", checks: ["Tool"], active: true, days: 1 },
        profile,
        users.admin.id,
      ],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO maintenance_events(request_id,plan_id,serviced,checks,note,created_by,created_at) VALUES($1,$2,true,$3,'Tool serviced between shifts',$4,'2026-01-01 12:00Z')",
    [
      randomUUID(),
      plan,
      JSON.stringify([{ check: "Tool", passed: true }]),
      users.supervisor.id,
    ],
  );
  const withService = await ok("GET", path());
  assert.equal(withService.interventions.length, 1);
  assert.equal(withService.interventions[0].createdBy, users.supervisor.id);
  assert.deepEqual(withService.metrics, preserved.metrics);
  for (const role of ["operator", "viewer", "wallboard"])
    await ok("GET", path(), undefined, 403, role);
  await ok(
    "GET",
    path(saved[0].revision.id, saved[1].revision.id, machines[1]),
    undefined,
    403,
  );
  await ok(
    "GET",
    path(saved[0].revision.id, saved[1].revision.id, machines[1]),
    undefined,
    404,
    "admin",
  );
  await ok(
    "GET",
    path(saved[1].revision.id, saved[0].revision.id),
    undefined,
    400,
  );
  await ok(
    "GET",
    path(saved[0].revision.id, saved[0].revision.id),
    undefined,
    400,
  );
  await ok(
    "GET",
    `/comparisons/machines/${machines[0]}?before=bad&after=1`,
    undefined,
    400,
  );
  await pool.query(
    "UPDATE shift_report_revisions SET digest='tampered' WHERE id=$1",
    [saved[2].revision.id],
  );
  await ok(
    "GET",
    path(saved[0].revision.id, saved[2].revision.id),
    undefined,
    409,
  );
  await pool.query("UPDATE shift_report_revisions SET digest=$1 WHERE id=$2", [
    saved[2].revision.digest,
    saved[2].revision.id,
  ]);

  const page = await actors.supervisor.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(frontend + "/operations");
  await page.getByLabel("Machine", { exact: true }).click();
  await page
    .getByRole("option", { name: "Comparison line", exact: true })
    .click();
  await page.getByRole("tab", { name: "Comparisons", exact: true }).click();
  const choose = async (label, option) => {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: option }).click();
  };
  await choose("Before — Shift", /Comparison shift 1/);
  await choose(
    "Before — Report revision",
    new RegExp(`^#${saved[0].revision.id} ·`),
  );
  await choose("After — Shift", /Comparison shift 2/);
  await choose(
    "After — Report revision",
    new RegExp(`^#${saved[1].revision.id} ·`),
  );
  await expect(
    page.getByText("Comparable recorded conditions.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("A newer report revision exists.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Tool serviced between shifts", { exact: false }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download comparison", exact: true })
    .click();
  assert.match(
    (await downloaded).suggestedFilename(),
    /^comparison-\d+-\d+\.json$/,
  );
  await page.screenshot({
    path: ".local/daily-evidence/comparison-desktop.png",
    fullPage: true,
  });
  await choose("After — Shift", /Comparison shift 3/);
  await choose(
    "After — Report revision",
    new RegExp(`^#${saved[2].revision.id} ·`),
  );
  await expect(
    page.getByText("Conditions are not comparable.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Language / Sprache").click();
  await page.getByRole("option", { name: "Deutsch", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Zeitraumvergleich", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Die Bedingungen sind nicht vergleichbar.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await page
        .getByRole("heading", { name: "Zeitraumvergleich", exact: true })
        .boundingBox();
      return !!box && box.x < 100 && box.width > 250;
    })
    .toBe(true);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Comparison overflows a narrow screen",
  );
  await page.screenshot({
    path: ".local/daily-evidence/comparison-mobile-de.png",
    fullPage: true,
  });
  await page
    .getByRole("heading", { name: "Gutteile je geplanter Stunde", exact: true })
    .scrollIntoViewIfNeeded();
  const metricBox = await page
    .getByRole("heading", { name: "Gutteile je geplanter Stunde", exact: true })
    .boundingBox();
  assert(
    metricBox.x >= 56 && metricBox.x + metricBox.width <= 390,
    "Comparison metrics must fit the usable screen",
  );
  await page.screenshot({
    path: ".local/daily-evidence/comparison-mobile-metrics-de.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement?.tagName !== "BODY"));
  assert.deepEqual(errors, []);
  await pool.query("DELETE FROM machine_grants WHERE user_id=$1", [
    users.supervisor.id,
  ]);
  await ok("GET", path(), undefined, 403);
  await writeFile(
    ".local/daily-evidence/comparison.json",
    JSON.stringify(
      {
        source: "owned-fixture",
        physicalQualification: false,
        checks: [
          "frozen evidence",
          "product mix",
          "counter reset",
          "unchanged revision",
          "service attribution",
          "scope denial and revocation",
          "tamper refusal",
          "browser comparison and download",
          "German narrow layout",
        ],
        comparison: withService,
      },
      null,
      2,
    ),
  );
  console.log(
    "Period comparison API, evidence, access and browser acceptance passed",
  );
});
