import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(
  async ({ pool, call, users, actors, frontend, expect, login }) => {
    const ok = async (
      method,
      path,
      body,
      status = 200,
      role = "supervisor",
    ) => {
      const response = await call(role, method, "/api/v1" + path, body);
      assert.equal(response.status(), status, await response.text());
      return response.json();
    };
    const signal = (nodeKey) => ({
      nodeKey,
      namespaceUri: "urn:correction-fixture",
      identifier: `s=${nodeKey}`,
      dataType: "Double",
      unit: null,
      scale: 1,
    });
    const profile = {
      version: 1,
      name: "Correction fixture",
      endpointModel: "Owned fixture",
      signals: {
        state: signal("State"),
        total: signal("Total"),
        good: signal("Good"),
        reject: signal("Reject"),
      },
      states: { running: [1], idle: [0], fault: [2], planned: [3] },
      idealCycleMs: 1000,
      maxGapSeconds: 3600,
      counterPolicy: "reject-decrease",
    };
    const machines = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES('Correction line','opc.tcp://127.0.0.1:49981','127.0.0.1'),('Private correction line','opc.tcp://127.0.0.1:49982','127.0.0.1') RETURNING id",
      )
    ).rows.map((row) => row.id);
    const machine = machines[0];
    await pool.query(
      "INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)",
      [machine, profile, users.admin.id],
    );
    for (const role of ["supervisor", "operator", "viewer", "wallboard"])
      await pool.query(
        "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
        [users[role].id, machine],
      );
    const shift = await ok(
      "POST",
      "/production/shifts",
      {
        machineId: machine,
        name: "Correction shift",
        timezone: "UTC",
        start: "2026-01-01T00:00:00Z",
        end: "2026-01-01T00:02:00Z",
        breaks: [],
        job: { reference: "Correction-order", product: "Part A", target: 120 },
      },
      201,
    );
    const insert = async (key, timestamp, value, extra = {}) =>
      (
        await pool.query(
          "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,signal_metadata,received_at,event_id,data_type,source_timestamp,source_clock_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
          [
            machine,
            key,
            timestamp,
            value,
            JSON.stringify(extra.raw ?? value),
            extra.status ?? "Good",
            extra.metadata === undefined ? signal(key) : extra.metadata,
            extra.received ?? "2026-01-03T00:00:00Z",
            randomUUID(),
            extra.type ?? "Double",
            extra.source ?? timestamp,
            extra.clock ?? "not-future",
          ],
        )
      ).rows[0];
    let target;
    for (const [key, values] of Object.entries({
      State: [1, 1, 1],
      Total: [0, 10, 20],
      Good: [0, 9, 18],
      Reject: [0, 1, 2],
    }))
      for (const [index, value] of values.entries()) {
        const row = await insert(
          key,
          new Date(Date.parse(shift.start) + index * 60000).toISOString(),
          value,
        );
        if (key === "Total" && index === 1) target = row;
      }
    const beforeBoundary = await insert("State", "2025-12-31T23:30:00Z", 1);
    const frozen = await ok(
      "POST",
      `/planning/shifts/${shift.id}/revisions`,
      {},
      201,
    );
    const input = (
      row,
      value = 11,
      expectedRevision = row.correction_revision,
    ) => ({
      requestId: randomUUID(),
      measurementId: row.id,
      timestamp: new Date(row.timestamp).toISOString(),
      expectedRevision,
      value,
      quality: value == null ? "bad" : "good",
      reason: "Reviewed against owned fixture evidence",
    });
    const preview = (body, role = "supervisor", status = 200) =>
      ok("POST", `/history/${machine}/corrections/preview`, body, status, role);
    const apply = (body, reviewed, status = 200, role = "supervisor") =>
      ok(
        "POST",
        `/history/${machine}/corrections`,
        { ...body, token: reviewed.token, expires: reviewed.expires },
        status,
        role,
      );
    const boundaryReview = await preview(input(beforeBoundary, 0));
    assert(
      boundaryReview.affectedShifts.some((item) => item.id === shift.id),
      "One-hour state lookback is included in preview",
    );
    const intent = input(target),
      reviewed = await preview(intent);
    await preview(
      { ...intent, timestamp: "2026-01-01T00:01:00" },
      "supervisor",
      400,
    );
    const alarm = (
      await pool.query(
        "INSERT INTO alert_history(machine_id,node_key,rule_name,message,severity,status) VALUES($1,'Total','Historical alert','Original observation','high','active') RETURNING *",
        [machine],
      )
    ).rows[0];
    await apply({ ...intent, value: 12 }, reviewed, 409);
    await apply(intent, reviewed, 409, "admin");
    await apply(intent, { ...reviewed, expires: Date.now() - 1 }, 409);
    for (const role of ["operator", "viewer", "wallboard"])
      await preview(intent, role, 403);
    await ok("GET", `/history/${machines[1]}/corrections`, undefined, 403);
    await ok(
      "POST",
      `/history/${machines[1]}/corrections/preview`,
      intent,
      403,
    );
    await preview({ ...intent, quality: "bad" }, "supervisor", 400);
    await preview({ ...intent, value: null }, "supervisor", 400);
    const receipts = await Promise.all([
      apply(Object.fromEntries(Object.entries(intent).reverse()), reviewed),
      apply(intent, reviewed),
    ]);
    assert.deepEqual(
      (await pool.query("SELECT * FROM alert_history WHERE id=$1", [alarm.id]))
        .rows[0],
      alarm,
    );
    assert.equal(receipts[0].id, receipts[1].id);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM measurement_corrections",
        )
      ).rows[0].n,
      1,
    );
    await apply({ ...intent, reason: "Different intent" }, reviewed, 409);
    await preview(input(target, 12), "supervisor", 409);
    const corrected = (
      await pool.query(
        "SELECT * FROM opcua_data WHERE id=$1 AND timestamp=$2",
        [target.id, target.timestamp],
      )
    ).rows[0];
    for (const key of [
      "raw_value",
      "timestamp",
      "source_timestamp",
      "received_at",
      "event_id",
      "signal_metadata",
    ])
      assert.deepEqual(
        corrected[key],
        target[key],
        `${key} source evidence stays unchanged`,
      );
    assert.equal(corrected.value, 11);
    assert.equal(corrected.reported_status_code, "Good");
    assert.equal(corrected.correction_revision, 1);
    assert.equal(receipts[0].before.value, 10);
    assert.equal(receipts[0].after.value, 11);
    const fractionIntent = input(corrected, 0.1),
      fractionPreview = await preview(fractionIntent);
    assert.equal(fractionPreview.after.value, 0.1);
    const current = await ok("GET", `/production/shifts/${shift.id}/report`);
    assert.equal(current.measurementEvidence.correctedSamples, 1);
    assert.notEqual(
      current.measurementEvidence.digest,
      frozen.snapshot.measurementEvidence.digest,
    );
    const stillFrozen = await ok(
      "GET",
      `/planning/shifts/${shift.id}/revisions/${frozen.id}`,
    );
    assert.deepEqual(stillFrozen.snapshot, frozen.snapshot);
    assert.equal(stillFrozen.digest, frozen.digest);
    // Regeneration attributes the difference to the correction recorded after the revision.
    const check = await ok(
      "GET",
      `/planning/shifts/${shift.id}/revisions/${frozen.id}/verify`,
    );
    assert.equal(check.reproducible, false);
    assert.equal(check.causes.laterCorrections, 1);
    assert(check.changedSections.includes("measurementEvidence"), check.changedSections);
    const revised = await ok(
      "POST",
      `/planning/shifts/${shift.id}/revisions`,
      { reason: "Reviewed measurement correction" },
      201,
    );
    assert.notEqual(revised.digest, frozen.digest);
    const freshDigest = current.measurementEvidence.digest;
    await insert("Total", "2026-01-01T00:01:30Z", 16);
    assert.notEqual(
      (await ok("GET", `/production/shifts/${shift.id}/report`))
        .measurementEvidence.digest,
      freshDigest,
    );
    assert.deepEqual(
      (await ok("GET", `/planning/shifts/${shift.id}/revisions/${frozen.id}`))
        .snapshot,
      frozen.snapshot,
    );
    const trend = await ok(
      "GET",
      `/trending/data?machineId=${machine}&nodeKeys=Total&startDate=2026-01-01T00:00:00Z&endDate=2026-01-01T00:02:01Z`,
    );
    assert(JSON.stringify(trend).includes('"correctionRevision":1'));
    const aggregate = await ok(
      "GET",
      `/aggregates?machineId=${machine}&nodeKey=Total&start=2026-01-01T00:00:00Z&end=2026-01-01T01:00:00Z`,
    );
    assert.equal(aggregate[0].correctedSampleCount, 1);
    assert.equal(Number(aggregate[0].avgValue), (0 + 11 + 16 + 20) / 4);
    for (const aggregation of ["avg", "last"]) {
      const csv = await call(
        "supervisor",
        "GET",
        `/api/v1/trending/export-csv?machineId=${machine}&nodeKeys=Total&startDate=2026-01-01T00:00:00Z&endDate=2026-01-01T00:02:01Z&downsampleBucketSeconds=3600&aggregation=${aggregation}`,
      );
      assert.equal(csv.status(), 200);
      const [header, row] = (await csv.text()).trim().split("\r\n");
      assert.equal(
        header,
        "timestamp,nodeKey,value,sampleCount,goodSampleCount,statusCode,correctedSampleCount,identity",
      );
      const columns = row
        .split(",")
        .map((value) => value.replace(/^"|"$/g, ""));
      assert.equal(columns[6], "1");
      assert.match(columns[7], /^[a-f0-9]{32}$/);
    }
    for (const extra of [
      { raw: "text", type: "String" },
      { raw: true, type: "Boolean" },
      { clock: "future" },
      { clock: "unknown", received: "2025-12-31T23:00:00Z" },
    ]) {
      const invalid = await insert("Invalid", "2026-01-01T00:00:00Z", 1, extra);
      await preview(input(invalid, 3), "supervisor", 400);
    }
    // Retention combines only deleted rows with current late arrivals, without double counting.
    const retained = await insert("Summary", "2025-06-01T00:00:00Z", 10);
    const protectedRow = await insert("Protected", "2025-06-01T00:00:00Z", 9);
    const protectedIntent = input(protectedRow, 8);
    await apply(protectedIntent, await preview(protectedIntent));
    await ok("PUT", `/history/${machine}/policy`, { days: 30 }, 200, "admin");
    const retention = await ok(
      "POST",
      `/history/${machine}/preview`,
      {},
      201,
      "admin",
    );
    const kept = await ok(
      "POST",
      `/history/${machine}/apply`,
      { previewId: retention.id, confirmRows: retention.rows },
      200,
      "admin",
    );
    assert.equal(kept.completed, true);
    assert.equal(
      (
        await pool.query(
          "SELECT 1 FROM opcua_data WHERE id=$1 AND timestamp=$2",
          [protectedRow.id, protectedRow.timestamp],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT 1 FROM opcua_data WHERE id=$1 AND timestamp=$2",
          [beforeBoundary.id, beforeBoundary.timestamp],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT 1 FROM opcua_data WHERE id=$1 AND timestamp=$2",
          [retained.id, retained.timestamp],
        )
      ).rowCount,
      0,
    );
    await insert("Summary", "2025-06-01T00:30:00Z", 20);
    const summary = async () =>
      (
        await ok(
          "GET",
          `/history/${machine}/summaries?nodeKey=Summary&start=2025-06-01T00:00:00Z&end=2025-06-01T01:00:00Z`,
        )
      )[0];
    assert.equal((await summary()).samples, 2);
    assert.equal((await summary()).average, 15);
    await insert("Summary", "2025-06-01T00:40:00Z", null, {
      status: "BadNoCommunication",
    });
    assert.equal((await summary()).average, null);
    await insert("Nonfinite", "2026-01-01T00:00:00Z", "NaN");
    const badAggregate = await ok(
      "GET",
      `/aggregates?machineId=${machine}&nodeKey=Nonfinite&start=2026-01-01T00:00:00Z&end=2026-01-01T01:00:00Z`,
    );
    assert.equal(badAggregate[0].avgValue, null);
    const badTrend = await ok(
      "GET",
      `/trending/data?machineId=${machine}&nodeKeys=Nonfinite&startDate=2026-01-01T00:00:00Z&endDate=2026-01-01T01:00:00Z`,
    );
    assert.equal(badTrend.series[0].goodSampleCount, 0);
    assert.equal(badTrend.series[0].data[0].value, null);
    const unknownIdentity = await insert(
      "Identity",
      "2026-01-01T00:00:00Z",
      1,
      {
        metadata: null,
      },
    );
    assert(unknownIdentity);
    const identityAggregate = await ok(
      "GET",
      `/aggregates?machineId=${machine}&nodeKey=Identity&start=2026-01-01T00:00:00Z&end=2026-01-01T01:00:00Z`,
    );
    assert.equal(identityAggregate[0].avgValue, null);

    // Perform the actual reviewed correction workflow in a signed-in browser.
    const uiRow = await insert(
      "ReviewMe",
      new Date(Date.now() - 3600000).toISOString(),
      40,
      { received: new Date().toISOString() },
    );
    const page = await actors.supervisor.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(frontend + "/operations");
    await page.getByLabel("Machine", { exact: true }).click();
    await page
      .getByRole("option", { name: "Correction line", exact: true })
      .click();
    await page.getByRole("tab", { name: "History", exact: true }).click();
    try {
      await page
        .getByLabel("Correction signal key", { exact: true })
        .fill("ReviewMe");
    } catch (error) {
      await writeFile(
        ".local/daily-evidence/corrections-ui-failure.json",
        JSON.stringify(
          {
            errors,
            url: page.url(),
            body: (await page.locator("body").innerText()).slice(0, 12000),
          },
          null,
          2,
        ),
      );
      await page.screenshot({
        path: ".local/daily-evidence/corrections-ui-failure.png",
        fullPage: true,
      });
      throw error;
    }
    await page
      .getByRole("button", { name: "Find measurements", exact: true })
      .click();
    await page.getByLabel("Measurement to review", { exact: true }).click();
    await page.getByRole("option", { name: /40 · r0/ }).click();
    await page
      .getByLabel("Corrected numeric value", { exact: true })
      .fill("42");
    await page
      .getByLabel("Correction reason", { exact: true })
      .fill("Browser review of owned fixture");
    await page
      .getByRole("button", { name: "Preview correction", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Apply reviewed correction",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByLabel("I reviewed the value, quality and affected calculations", {
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Apply reviewed correction", exact: true })
      .click();
    await expect(
      page.getByText(
        "Correction recorded. Saved report revisions remain unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query(
          "SELECT value FROM opcua_data WHERE id=$1 AND timestamp=$2",
          [uiRow.id, uiRow.timestamp],
        )
      ).rows[0].value,
      42,
    );
    await page.screenshot({
      path: ".local/daily-evidence/corrections-en.png",
      fullPage: true,
    });
    await page.getByLabel("Language / Sprache").click();
    await page.getByRole("option", { name: "Deutsch", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Messwertkorrekturen", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page
      .getByRole("heading", { name: "Messwertkorrekturen", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/corrections-de-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
    const waitThenRevoke = async (body, review, revoke) => {
      const blocker = await pool.connect();
      let pending;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          body.requestId,
        ]);
        pending = apply(body, review, 403);
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'",
                )
              ).rows[0].n,
          )
          .toBeGreaterThan(0);
        await revoke();
        await blocker.query("COMMIT");
        await pending;
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        await pending?.catch(() => {});
      }
    };
    const raceRow = await insert("Race", "2026-01-01T00:01:00Z", 7);
    const raceIntent = input(raceRow, 8);
    await waitThenRevoke(raceIntent, await preview(raceIntent), () =>
      ok(
        "PUT",
        `/access/users/${users.supervisor.id}`,
        { machineIds: [], plantIds: [] },
        200,
        "admin",
      ),
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM measurement_corrections WHERE id=$1",
          [raceIntent.requestId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT correction_revision FROM opcua_data WHERE id=$1 AND timestamp=$2",
          [raceRow.id, raceRow.timestamp],
        )
      ).rows[0].correction_revision,
      0,
    );
    await ok(
      "PUT",
      `/access/users/${users.supervisor.id}`,
      { machineIds: [machine], plantIds: [] },
      200,
      "admin",
    );
    await login("supervisor");
    const receiptCount = (
      await pool.query("SELECT count(*)::int AS n FROM measurement_corrections")
    ).rows[0].n;
    await waitThenRevoke(intent, reviewed, () =>
      ok(
        "PUT",
        `/auth/users/${users.supervisor.id}`,
        { isActive: false },
        200,
        "admin",
      ),
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM measurement_corrections",
        )
      ).rows[0].n,
      receiptCount,
    );
    await ok(
      "PUT",
      `/auth/users/${users.supervisor.id}`,
      { isActive: true },
      200,
      "admin",
    );
    await login("supervisor");
    await pool.query("DELETE FROM machine_grants WHERE user_id=$1", [
      users.supervisor.id,
    ]);
    await ok("GET", `/history/${machine}/corrections`, undefined, 403);
    await apply(intent, reviewed, 403);
    await writeFile(
      ".local/daily-evidence/measurement-corrections.json",
      JSON.stringify(
        {
          passed: true,
          source: "owned-fixture",
          physicalQualification: false,
          checks: [
            "signed review and tampering",
            "concurrent idempotency",
            "raw evidence unchanged",
            "version conflicts",
            "scope and revocation",
            "grant revocation during queued write",
            "account deactivation during queued receipt replay",
            "aggregate CSV correction count and identity",
            "frozen reports preserved",
            "late arrival digest",
            "retention and summary merge",
            "nonfinite and identity gates",
            "future clock and scalar types",
            "EN/DE browser correction",
            "390px layout",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: measurement correction, late history, frozen report and EN/DE browser acceptance",
    );
  },
);
