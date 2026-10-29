import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";
import { canonicalJson } from "../server/dist/src/utils/canonicalJson.js";

await dailyFixture(
  async ({ pool, call, users, actors, frontend, expect, browser }) => {
    const signal = (nodeKey) => ({
      nodeKey,
      namespaceUri: "urn:daily-fixture",
      identifier: `s=${nodeKey}`,
      dataType: "Double",
      unit: nodeKey === "Energy" ? "kWh" : null,
      scale: 1,
    });
    const profile = {
      version: 1,
      name: "Daily fixture",
      endpointModel: "Owned simulator",
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
    const machine = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES('Daily Line','opc.tcp://127.0.0.1:49621','127.0.0.1') RETURNING id",
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
      [machine, profile, users.admin.id],
    );
    for (const role of ["supervisor", "operator", "viewer", "wallboard"])
      await pool.query(
        "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
        [users[role].id, machine],
      );
    const ok = async (role, method, path, body, status = 200) => {
      const response = await call(role, method, "/api/v1" + path, body);
      assert.equal(response.status(), status, await response.text());
      return response.json();
    };
    const config = {
      name: "Day shift",
      timezone: "Europe/Berlin",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "01:00",
      durationMinutes: 2,
      holidays: ["2026-01-02"],
      fold: "reject",
      breaks: [],
      job: { reference: "A", product: "Parts", target: 10 },
    };
    const calendar = await ok(
      "supervisor",
      "POST",
      `/planning/machines/${machine}/calendars`,
      { config },
      201,
    );
    const plan = {
      calendarId: calendar.id,
      from: "2026-01-01",
      to: "2026-01-02",
    };
    const preview = await ok(
      "supervisor",
      "POST",
      `/planning/machines/${machine}/plan`,
      plan,
    );
    assert.equal(preview.items.length, 1);
    await ok("supervisor", "POST", `/planning/machines/${machine}/plan`, {
      ...plan,
      confirmDigest: preview.digest,
    });
    const repeated = await ok(
      "supervisor",
      "POST",
      `/planning/machines/${machine}/plan`,
      { ...plan, confirmDigest: preview.digest },
    );
    assert.equal(repeated.items[0].status, "already-planned");
    const shift = (
      await pool.query("SELECT * FROM production_shifts WHERE machine_id=$1", [
        machine,
      ])
    ).rows[0];
    const start = "2026-01-01T00:00:00Z",
      middle = "2026-01-01T00:01:00Z",
      end = "2026-01-01T00:02:00Z";
    for (const [key, values] of Object.entries({
      State: [1, 0, 0],
      Count: [0, 5, 5],
      Good: [0, 4, 4],
      Reject: [0, 1, 1],
      Energy: [10, 12, 13],
    }))
      for (const [i, timestamp] of [start, middle, end].entries())
        await pool.query(
          "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code,signal_metadata) VALUES($1,$2,$3,$4,$5,$6)",
          [machine, key, timestamp, values[i], "Good", signal(key)],
        );
    const runs = [
      {
        start,
        end: middle,
        reference: "A",
        product: "Part A",
        target: 5,
        idealCycleMs: 1000,
      },
      {
        start: middle,
        end,
        reference: "B",
        product: "Part B",
        target: 5,
        idealCycleMs: 2000,
      },
    ];
    await ok("supervisor", "PUT", `/planning/shifts/${shift.id}/runs`, {
      version: 1,
      runs,
    });
    assert.equal(
      (
        await call(
          "supervisor",
          "PUT",
          `/api/v1/planning/shifts/${shift.id}/runs`,
          { version: 1, runs },
        )
      ).status(),
      409,
    );
    assert.equal(
      (
        await call(
          "supervisor",
          "PUT",
          `/api/v1/planning/shifts/${shift.id}/runs`,
          { version: 2, runs: [runs[0], { ...runs[1], start }] },
        )
      ).status(),
      400,
    );
    const revision = await ok(
      "supervisor",
      "POST",
      `/planning/shifts/${shift.id}/revisions`,
      {},
      201,
    );
    assert.equal(revision.snapshot.runs.length, 2);
    assert.equal(revision.snapshot.oee.performance, 5 / 60);
    const verify = (id) =>
      ok("viewer", "GET", `/planning/shifts/${shift.id}/revisions/${id}/verify`);
    assert.deepEqual((await verify(revision.id)).changedSections, []);
    await pool.query("UPDATE production_shifts SET breaks=$1 WHERE id=$2", [
      JSON.stringify([{ start: middle, end }]),
      shift.id,
    ]);
    const withBreak = await ok(
      "viewer",
      "GET",
      `/production/shifts/${shift.id}/report`,
    );
    assert.equal(
      withBreak.oee.performance,
      5 / 60,
      "A non-running scheduled break must not invalidate product performance",
    );
    await pool.query("UPDATE production_shifts SET breaks='[]' WHERE id=$1", [
      shift.id,
    ]);
    assert.equal(
      createHash("sha256")
        .update(canonicalJson(revision.snapshot))
        .digest("hex"),
      revision.digest,
    );
    await ok("supervisor", "PUT", `/planning/shifts/${shift.id}/runs`, {
      version: 2,
      runs: [],
    });
    const replanned = await verify(revision.id);
    assert.equal(replanned.reproducible, false);
    assert.equal(replanned.causes.planChanged, true);
    assert(replanned.changedSections.includes("runs"), replanned.changedSections);
    assert.deepEqual(
      (
        await ok(
          "viewer",
          "GET",
          `/planning/shifts/${shift.id}/revisions/${revision.id}`,
        )
      ).snapshot,
      revision.snapshot,
    );
    await ok("supervisor", "PUT", `/energy/machines/${machine}`, {
      version: 0,
      config: { signal: signal("Energy"), maxGapSeconds: 60, modulus: null },
    });
    await ok(
      "operator",
      "POST",
      `/production/shifts/${shift.id}/reasons`,
      {
        start: middle,
        end,
        category: "changeover",
        reason: "Tool change",
        supersedesId: null,
      },
      201,
    );
    const energy = await ok("viewer", "GET", `/energy/shifts/${shift.id}`);
    assert.equal(energy.observedKWh, 3);
    assert.equal(energy.idleKWh, 1);
    assert.equal(energy.kWhPerGoodPart, 0.75);
    assert.equal(energy.changeoverSeconds, 60);
    await ok(
      "supervisor",
      "POST",
      `/energy/shifts/${shift.id}/reconcile`,
      { kWh: 3, toleranceKWh: 0, reference: "Owned reference meter" },
      201,
    );
    assert.equal(
      (await ok("viewer", "GET", `/energy/shifts/${shift.id}`)).reconciled,
      true,
    );
    assert.equal(
      (
        await call(
          "supervisor",
          "POST",
          `/api/v1/energy/shifts/${shift.id}/reconcile`,
          { kWh: 9, toleranceKWh: 0, reference: "Changed" },
        )
      ).status(),
      409,
    );
    for (const reason of [undefined, "   "])
      assert.equal(
        (
          await call(
            "supervisor",
            "POST",
            `/api/v1/planning/shifts/${shift.id}/revisions`,
            reason === undefined ? {} : { reason },
          )
        ).status(),
        400,
        "Later revisions need a reason",
      );
    const energyRevision = await ok(
      "supervisor",
      "POST",
      `/planning/shifts/${shift.id}/revisions`,
      { reason: "Independent meter reconciliation recorded" },
      201,
    );
    assert.equal(energyRevision.snapshot.energy.reconciled, true);
    assert.equal(
      energyRevision.reason,
      "Independent meter reconciliation recorded",
    );
    assert.equal((await verify(energyRevision.id)).reproducible, true);
    await pool.query(
      "UPDATE opcua_data SET status_code='Bad' WHERE machine_id=$1 AND node_key='Energy' AND timestamp=$2",
      [machine, end],
    );
    // An unrecorded change is detected but not attributed to any recorded cause.
    const tampered = await verify(energyRevision.id);
    assert.equal(tampered.reproducible, false);
    assert(tampered.changedSections.includes("energy"), tampered.changedSections);
    assert.deepEqual(tampered.causes, {
      laterCorrections: 0,
      lateArrivals: 0,
      laterDeclarations: 0,
      laterHandoverChanges: 0,
      planChanged: false,
      removedSamplesInOverlappingHours: 0,
    });
    // A declaration enters the report only after review, with its provenance, and never verifies it.
    const handCount = {
      text: "Hand count at shift end",
      priority: "normal",
      ownerId: null,
      dueAt: null,
    };
    const declaration = await ok(
      "operator",
      "POST",
      "/production/operator/entries",
      {
        ...handCount,
        requestId: randomUUID(),
        machineId: machine,
        shiftId: shift.id,
        intervalStart: null,
        intervalEnd: null,
        kind: "quantity",
        quantity: { total: 99, good: 98, reject: 1 },
      },
      201,
    );
    assert.equal(
      (await ok("viewer", "GET", `/production/shifts/${shift.id}/report`))
        .declaration,
      null,
      "Unreviewed declarations stay out of the report",
    );
    await ok("supervisor", "POST", `/production/operator/entries/${declaration.id}`, {
      ...handCount,
      version: 1,
      status: "resolved",
    });
    const declared = await ok(
      "viewer",
      "GET",
      `/production/shifts/${shift.id}/report`,
    );
    assert.equal(declared.declaration.entryId, declaration.id);
    assert.equal(declared.verified, false);
    if (declared.quantitySource === "declaration")
      assert.deepEqual(declared.quantities, { total: 99, good: 98, reject: 1 });
    else
      assert(
        declared.issues.includes(
          `Reviewed manual declaration #${declaration.id} differs from measured counts.`,
        ),
        declared.issues,
      );
    assert.equal((await verify(energyRevision.id)).causes.laterDeclarations, 1);
    // R02: open handover actions appear in the report with their owner and reference.
    const followUp = await ok(
      "operator",
      "POST",
      "/production/operator/entries",
      {
        ...handCount,
        text: "Replace worn guide rail",
        priority: "high",
        ownerId: users.operator.id,
        requestId: randomUUID(),
        machineId: machine,
        shiftId: shift.id,
        intervalStart: null,
        intervalEnd: null,
        kind: "action",
        quantity: null,
      },
      201,
    );
    const withHandover = await ok("viewer", "GET", `/production/shifts/${shift.id}/report`);
    assert.deepEqual(
      withHandover.handover.map(({ id, kind, priority, ownerName }) => ({ id, kind, priority, ownerName })),
      [{ id: followUp.id, kind: "action", priority: "high", ownerName: "operator" }],
    );
    assert.equal((await verify(energyRevision.id)).causes.laterHandoverChanges, 1);
    assert.equal(
      (await ok("viewer", "GET", `/energy/shifts/${shift.id}`)).kWhPerGoodPart,
      null,
    );
    const service = await ok(
      "supervisor",
      "POST",
      `/maintenance/machines/${machine}`,
      {
        config: {
          name: "Weekly inspection",
          days: 7,
          runtimeHours: 1,
          cycles: 4,
          checks: ["Guard inspected", "Lubrication checked"],
          active: true,
        },
      },
      201,
    );
    await pool.query("UPDATE maintenance_plans SET created_at=$1 WHERE id=$2", [
      start,
      service.id,
    ]);
    const due = (
      await ok("operator", "GET", `/maintenance/machines/${machine}`)
    )[0];
    assert.equal(due.status, "due");
    assert.equal(due.usage.cycles.observed, 5);
    assert.equal(due.usage.runtimeSeconds.observed, 60);
    const incident = await ok(
      "operator",
      "POST",
      "/production/operator/entries",
      {
        requestId: randomUUID(),
        machineId: machine,
        shiftId: null,
        intervalStart: null,
        intervalEnd: null,
        quantity: null,
        kind: "action",
        text: "Inspect guard after stop",
        priority: "high",
        ownerId: users.operator.id,
        dueAt: null,
      },
      201,
    );
    const evidence = {
      requestId: randomUUID(),
      version: service.version,
      serviced: true,
      checks: { "Guard inspected": true, "Lubrication checked": false },
      note: "Safety guard inspected",
      incidentId: incident.id,
    };
    assert.equal(
      (
        await call(
          "operator",
          "POST",
          `/api/v1/maintenance/plans/${service.id}/events`,
          evidence,
        )
      ).status(),
      400,
    );
    evidence.checks["Lubrication checked"] = true;
    const event = await ok(
      "operator",
      "POST",
      `/maintenance/plans/${service.id}/events`,
      evidence,
      201,
    );
    assert.equal(
      (
        await ok(
          "operator",
          "POST",
          `/maintenance/plans/${service.id}/events`,
          evidence,
          201,
        )
      ).id,
      event.id,
    );
    assert.equal(
      (
        await call(
          "viewer",
          "POST",
          `/api/v1/maintenance/plans/${service.id}/events`,
          evidence,
        )
      ).status(),
      403,
    );
    assert.equal(
      (await ok("viewer", "GET", `/maintenance/machines/${machine}`))[0].status,
      "unknown",
    );
    await ok("admin", "PUT", `/history/${machine}/policy`, { days: 1 });
    const retention = await ok(
      "admin",
      "POST",
      `/history/${machine}/preview`,
      {},
      201,
    );
    assert.equal(retention.rows, 0);
    assert.equal(retention.protectedRows, 15);
    if (process.env.DAILY_BROWSER === "1") {
      const page = await actors.supervisor.newPage();
      await page.goto(frontend + "/operations");
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await expect(
        page.getByRole("heading", { name: "Daily operations" }),
      ).toBeVisible();
      // Machine search filters by name; the choice is remembered for this account.
      const picker = page.getByRole("combobox", { name: "Machine", exact: true });
      await picker.fill("no such machine");
      await expect(page.getByText("No matching machine", { exact: true })).toBeVisible();
      await picker.fill("daily");
      await page
        .getByRole("option", { name: "Daily Line", exact: true })
        .click();
      await page.getByRole("tab", { name: "Maintenance", exact: true }).click();
      await page.reload();
      await expect(
        page.getByRole("combobox", { name: "Machine", exact: true }),
      ).toHaveValue("Daily Line");
      await expect(
        page.getByRole("tab", { name: "Maintenance", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText("Weekly inspection", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: ".local/daily-evidence/maintenance.png",
        fullPage: true,
      });
      await page
        .getByLabel("Service note", { exact: true })
        .fill("Browser inspection evidence");
      await page.getByLabel("Language / Sprache").click();
      await page.getByRole("option", { name: "Deutsch", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Täglicher Betrieb" }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Wartungsnotiz", { exact: true }),
      ).toHaveValue("Browser inspection evidence");
      assert.equal(await page.locator("html").getAttribute("lang"), "de");
      await page.getByLabel("Guard inspected", { exact: true }).check();
      await page.getByLabel("Lubrication checked", { exact: true }).check();
      await page
        .getByRole("button", { name: "Prüfung speichern", exact: true })
        .click();
      await expect(
        page.getByLabel("Wartungsnotiz", { exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByText("Browser inspection evidence", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: ".local/daily-evidence/german-inspection.png",
        fullPage: true,
      });
      await page.getByLabel("Language / Sprache").click();
      await page.getByRole("option", { name: "English", exact: true }).click();
      await page.getByRole("tab", { name: "Planning", exact: true }).click();
      await page
        .getByLabel("Calendar name", { exact: true })
        .fill("Browser schedule");
      await page.getByLabel("Default job reference").fill("UI-1");
      await page
        .getByLabel("Default product", { exact: true })
        .fill("Browser part");
      await page
        .getByRole("button", { name: "Save calendar", exact: true })
        .click();
      await expect(
        page.getByText("Calendar saved. Preview dates before publishing.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByLabel("First date").fill("2026-11-02");
      await page.getByLabel("Last date").fill("2026-11-03");
      await page
        .getByRole("button", { name: "Preview shifts", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Publish reviewed shifts", exact: true })
        .click();
      await expect(
        page.getByText("Shifts published.", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Shift", { exact: true }).click();
      await page
        .getByRole("option", { name: "Day shift 2026-01-01", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add product run", exact: true })
        .click();
      await page.getByLabel("Job reference", { exact: true }).fill("UI-RUN");
      await page.getByLabel("Product", { exact: true }).fill("UI product");
      await page
        .getByRole("button", { name: "Save product runs", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save report revision", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Revision reason", { exact: true })
        .fill("UI product run added");
      await expect(
        page.getByRole("button", { name: "Save report revision", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Save report revision", exact: true })
        .click();
      await expect(page.getByText("UI product run added", { exact: false })).toBeVisible();
      await page
        .getByRole("button", { name: "Check reproducibility", exact: true })
        .first()
        .click();
      await expect(
        page.getByText("Regenerating from retained data gives the same report.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM shift_report_revisions WHERE shift_id=$1",
                [shift.id],
              )
            ).rows[0].n,
        )
        .toBe(3);
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download revision", exact: true })
        .first()
        .click();
      assert.match(
        (await download).suggestedFilename(),
        /^shift-\d+-revision-\d+\.json$/,
      );
      await page.screenshot({
        path: ".local/daily-evidence/planning.png",
        fullPage: true,
      });
      await page
        .getByRole("tab", { name: "Energy and losses", exact: true })
        .click();
      await page.getByLabel("Meter scale", { exact: true }).fill("2");
      await page
        .getByRole("button", { name: "Save meter", exact: true })
        .click();
      await expect(
        page.getByText("Meter saved.", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Shift", { exact: true }).click();
      await page
        .getByRole("option", { name: "Day shift 2026-01-01", exact: true })
        .click();
      await expect(
        page.getByText("Partial measurements:", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText("Not reconciled:", { exact: false }),
      ).toBeVisible();
      await page.screenshot({
        path: ".local/daily-evidence/energy.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("tab", { name: "Maintenance", exact: true }).click();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        "Mobile page overflows horizontally",
      );
      await page.screenshot({
        path: ".local/daily-evidence/mobile.png",
        fullPage: true,
      });
      await page.keyboard.press("Control+Home");
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
      );
      assert.deepEqual(errors, []);
      const touch = await browser.newContext({
        storageState: await actors.supervisor.storageState(),
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
      const touchPage = await touch.newPage();
      await touchPage.goto(frontend + "/operations");
      await expect(
        touchPage.getByRole("heading", { name: "Daily operations" }),
      ).toBeVisible();
      assert(
        await touchPage.evaluate(() => matchMedia("(pointer: coarse)").matches),
      );
      for (const tab of await touchPage.getByRole("tab").all()) {
        const box = await tab.boundingBox();
        assert(
          box && box.height >= 44 && box.width >= 44,
          "Touch targets must be at least 44 pixels",
        );
      }
      await touch.close();
      const adminPage = await actors.admin.newPage();
      await adminPage.goto(frontend + "/operations");
      await adminPage.getByLabel("Machine", { exact: true }).click();
      await adminPage
        .getByRole("option", { name: "Daily Line", exact: true })
        .click();
      await adminPage
        .getByRole("tab", { name: "History", exact: true })
        .click();
      await adminPage.getByLabel("Keep raw data for days").fill("7");
      await adminPage
        .getByRole("button", { name: "Save retention policy", exact: true })
        .click();
      await expect(
        adminPage.getByRole("button", { name: "Preview removal", exact: true }),
      ).toBeEnabled();
      await adminPage
        .getByRole("button", { name: "Preview removal", exact: true })
        .click();
      await expect(
        adminPage.getByText("raw rows eligible; protected evidence rows", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        adminPage.getByRole("button", {
          name: "Apply reviewed retention",
          exact: true,
        }),
      ).toBeDisabled();
      await adminPage.screenshot({
        path: ".local/daily-evidence/retention-preview.png",
        fullPage: true,
      });
    }
    console.log(
      "PASS: recurring plans, holidays, replay-safe publication, product runs, stale edits, immutable revisions, energy quality, changeover losses, inspection requirements and idempotent service history",
    );
  },
);
