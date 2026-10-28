import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(
  async ({ pool, call, users, actors, frontend, expect, password, login }) => {
    const machine = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES('Owned offline cell','opc.tcp://127.0.0.1:49671','127.0.0.1') RETURNING id",
      )
    ).rows[0].id;
    const other = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES('Other offline cell','opc.tcp://127.0.0.1:49672','127.0.0.1') RETURNING id",
      )
    ).rows[0].id;
    for (const role of ["operator", "supervisor", "viewer"])
      await pool.query(
        "INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)",
        [users[role].id, machine],
      );
    const base = "/api/v1/production/operator/entries";
    const post = (role, path, body) => call(role, "POST", path, body);
    const expectStatus = async (response, status) => {
      assert.equal(response.status(), status, await response.text());
      return response.json();
    };
    const note = {
      requestId: randomUUID(),
      machineId: machine,
      shiftId: null,
      kind: "note",
      text: "Offline API note",
      priority: "normal",
      ownerId: null,
      dueAt: null,
      intervalStart: null,
      intervalEnd: null,
      quantity: null,
      offlineDraftedAt: new Date().toISOString(),
    };
    for (const offlineDraftedAt of [
      new Date(Date.now() - 25 * 3600000).toISOString(),
      new Date(Date.now() + 120000).toISOString(),
    ])
      await expectStatus(
        await post("operator", base, { ...note, offlineDraftedAt }),
        400,
      );
    await expectStatus(
      await post("operator", base, { ...note, machineId: other }),
      403,
    );
    await expectStatus(await post("viewer", base, note), 403);
    const created = await expectStatus(await post("operator", base, note), 201);
    assert.equal(
      (await expectStatus(await post("operator", base, note), 201)).id,
      created.id,
    );
    await expectStatus(
      await post("operator", base, { ...note, text: "Changed replay" }),
      409,
    );
    const edit = {
      version: created.version,
      text: "Reviewed offline API note",
      priority: "high",
      ownerId: null,
      dueAt: null,
      status: "open",
      offlineIntentId: randomUUID(),
      offlineDraftedAt: new Date().toISOString(),
    };
    const changes = await Promise.all([
      post("operator", `${base}/${created.id}`, edit),
      post("operator", `${base}/${created.id}`, edit),
    ]);
    for (const response of changes)
      assert.equal((await expectStatus(response, 200)).version, 2);
    await expectStatus(
      await post("operator", `${base}/${created.id}`, {
        ...edit,
        text: "Changed intent",
      }),
      409,
    );
    await expectStatus(
      await post("supervisor", `${base}/${created.id}`, edit),
      409,
    );
    await expectStatus(
      await post("operator", `${base}/${created.id}`, {
        ...edit,
        offlineIntentId: randomUUID(),
      }),
      409,
    );
    await expectStatus(
      await post("operator", `${base}/${created.id}`, {
        ...edit,
        offlineDraftedAt: new Date(Date.now() - 25 * 3600000).toISOString(),
      }),
      400,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM operator_entry_events WHERE entry_id=$1",
          [created.id],
        )
      ).rows[0].count,
      2,
    );
    const shift = (
      await pool.query(
        `INSERT INTO production_shifts(machine_id,name,timezone,start,"end",profile,job,created_by) VALUES($1,'Owned historical offline shift','UTC','2026-01-01T08:00Z','2026-01-01T16:00Z','{}','{}',$2) RETURNING id`,
        [machine, users.admin.id],
      )
    ).rows[0];
    const countDraft = {
      ...note,
      requestId: randomUUID(),
      text: "Retained count declaration",
      kind: "quantity",
      shiftId: shift.id,
      quantity: { total: 12, good: 10, reject: 2 },
    };
    const count = await expectStatus(
      await post("operator", base, countDraft),
      201,
    );
    assert.equal(
      (await expectStatus(await post("operator", base, countDraft), 201)).id,
      count.id,
    );
    await expectStatus(
      await post("operator", base, {
        ...countDraft,
        requestId: randomUUID(),
        quantity: { total: 12, good: 11, reject: 2 },
      }),
      400,
    );
    await expectStatus(
      await post("operator", `${base}/${count.id}`, {
        ...edit,
        version: 1,
        offlineIntentId: randomUUID(),
        status: "resolved",
      }),
      403,
    );

    const context = actors.operator;
    const page = await context.newPage();
    await page.goto(frontend + "/production");
    await page
      .getByRole("tab", { name: "Operator handover", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Handover machine", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Owned offline cell", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Observation / action", exact: true })
      .fill("Offline browser observation");
    await context.setOffline(true);
    await expect(
      page.getByText(
        "Connection unavailable: displayed data is cached and may be stale. Drafts are not sent automatically.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep draft on this device", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Drafts on this device", exact: true }),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM operator_entries WHERE text=$1",
          ["Offline browser observation"],
        )
      ).rows[0].count,
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(
        async () =>
          (
            await page
              .getByRole("heading", {
                name: "Drafts on this device",
                exact: true,
              })
              .boundingBox()
          )?.x ?? 999,
      )
      .toBeLessThan(100);
    await page
      .getByRole("heading", { name: "Operator handover", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/offline-operator-mobile-en.png",
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await context.setOffline(false);
    await page
      .getByRole("button", { name: "Review retained draft", exact: true })
      .click();
    const reviewed = page.getByRole("checkbox", {
      name: "I reviewed the current context and this draft",
      exact: true,
    });
    await expect(reviewed).toBeEnabled();
    await reviewed.check();
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM operator_entries WHERE text=$1",
          ["Offline browser observation"],
        )
      ).rows[0].count,
      0,
      "Reconnection and review must not submit",
    );
    let dropped = false;
    await page.route(
      (url) => url.pathname.endsWith("/operator/entries") && !url.search,
      async (route) => {
        if (route.request().method() === "POST" && !dropped) {
          dropped = true;
          const response = await route.fetch();
          assert.equal(response.status(), 201);
          await route.abort("failed");
        } else await route.continue();
      },
    );
    await page
      .getByRole("button", { name: "Save handover", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Failed to fetch|NetworkError/ }),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM operator_entries WHERE text=$1",
          ["Offline browser observation"],
        )
      ).rows[0].count,
      1,
    );
    await page
      .getByRole("button", { name: "Save handover", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Drafts on this device", exact: true }),
    ).toHaveCount(0);
    const browserEntry = (
      await pool.query(
        "SELECT id,version FROM operator_entries WHERE text=$1",
        ["Offline browser observation"],
      )
    ).rows[0];
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM operator_entries WHERE text=$1",
          ["Offline browser observation"],
        )
      ).rows[0].count,
      1,
    );
    await page.unrouteAll();
    await page
      .getByRole("button", {
        name: `Review / edit #${browserEntry.id}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("textbox", { name: "Observation / action", exact: true })
      .fill("Retained stale edit");
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "Keep draft on this device", exact: true })
      .click();
    await expectStatus(
      await post("admin", `${base}/${browserEntry.id}`, {
        version: browserEntry.version,
        text: "Another operator changed the note",
        priority: "normal",
        ownerId: null,
        dueAt: null,
        status: "open",
      }),
      200,
    );
    await context.setOffline(false);
    await page
      .getByRole("button", { name: "Review retained draft", exact: true })
      .click();
    await expect(reviewed).toBeEnabled();
    await expect(page.getByText(/Current server entry/)).toContainText(
      "Another operator changed the note",
    );
    await reviewed.check();
    await page
      .getByRole("button", { name: "Save handover", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: /This entry changed/ }),
    ).toBeVisible();
    assert.equal(
      (
        await pool.query("SELECT text FROM operator_entries WHERE id=$1", [
          browserEntry.id,
        ])
      ).rows[0].text,
      "Another operator changed the note",
    );
    await page.evaluate(() => localStorage.setItem("language", "de"));
    await page.reload();
    await page
      .getByRole("tab", { name: "Schichtübergabe", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Gespeicherten Entwurf prüfen",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Ich habe den aktuellen Kontext und diesen Entwurf geprüft",
        exact: true,
      }),
    ).toBeEnabled();
    await page.screenshot({
      path: ".local/daily-evidence/offline-operator-mobile-de.png",
      fullPage: true,
    });
    await page
      .getByRole("checkbox", {
        name: "Ich habe den aktuellen Kontext und diesen Entwurf geprüft",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: ".local/daily-evidence/offline-operator-mobile-de-review.png",
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({
      path: ".local/daily-evidence/offline-operator-review.png",
      fullPage: true,
    });
    const previousAccountDrafts = await page.evaluate(() =>
      localStorage.getItem("pd-operator-drafts-v1"),
    );
    assert(previousAccountDrafts);
    const otherTab = await context.newPage();
    await otherTab.goto(frontend + "/production");
    await otherTab
      .getByRole("tab", { name: "Schichtübergabe", exact: true })
      .click();
    await otherTab
      .getByRole("button", {
        name: "Gespeicherten Entwurf prüfen",
        exact: true,
      })
      .click();
    const protectedText = otherTab.getByRole("textbox", {
      name: "Beobachtung / Maßnahme",
      exact: true,
    });
    await expect(protectedText).toHaveValue("Retained stale edit");
    await context.setOffline(true);
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pd-operator-drafts-v1")),
      null,
    );
    await expect(otherTab).toHaveURL(/\/login$/);
    await expect(protectedText).toHaveCount(0);
    await expect(otherTab.getByText(/Aktueller Servereintrag/)).toHaveCount(0);
    await otherTab.close();
    await page.route("**/auth/logout", (route) => route.abort("failed"));
    await context.setOffline(false);
    // A stale shared-device snapshot must also be rejected at a successful account switch.
    await page.evaluate(() => localStorage.setItem("language", "en"));
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("textbox", { name: /^Username/ }).fill("supervisor");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pd-pending-logout-v1")),
      "true",
    );
    await page.unroute("**/auth/logout");
    await page.evaluate(
      (snapshot) => localStorage.setItem("pd-operator-drafts-v1", snapshot),
      previousAccountDrafts,
    );
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pd-pending-logout-v1")),
      null,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pd-operator-drafts-v1")),
      null,
    );
    await page.goto(frontend + "/production");
    await page
      .getByRole("tab", { name: "Operator handover", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Handover machine", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Owned offline cell", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Observation / action", exact: true })
      .fill("Revocation must purge this protected draft");
    await page
      .getByRole("button", { name: "Keep draft on this device", exact: true })
      .click();
    assert(
      await page.evaluate(() => localStorage.getItem("pd-operator-drafts-v1")),
    );
    await expectStatus(
      await call(
        "admin",
        "PUT",
        `/api/v1/access/users/${users.supervisor.id}`,
        { machineIds: [], plantIds: [] },
      ),
      200,
    );
    await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("pd-operator-drafts-v1")),
      null,
    );
    await page.close();
    const unchanged = (
      await pool.query("SELECT * FROM operator_entries WHERE id=$1", [
        created.id,
      ])
    ).rows[0];
    for (const waitingEdit of [
      {
        ...edit,
        version: unchanged.version,
        text: "Revoked queued update",
        offlineIntentId: randomUUID(),
      },
      edit,
    ]) {
      await expectStatus(
        await call(
          "admin",
          "PUT",
          `/api/v1/access/users/${users.operator.id}`,
          { machineIds: [machine], plantIds: [] },
        ),
        200,
      );
      await login("operator");
      const blocker = await pool.connect();
      let pending;
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          "SELECT id FROM operator_entries WHERE id=$1 FOR UPDATE",
          [created.id],
        );
        pending = post("operator", `${base}/${created.id}`, waitingEdit);
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%operator_entries%'",
                )
              ).rows[0].n,
          )
          .toBeGreaterThan(0);
        await expectStatus(
          await call(
            "admin",
            "PUT",
            `/api/v1/access/users/${users.operator.id}`,
            { machineIds: [], plantIds: [] },
          ),
          200,
        );
        await blocker.query("COMMIT");
        await expectStatus(await pending, 403);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        await pending?.catch(() => {});
      }
      assert.deepEqual(
        (
          await pool.query("SELECT * FROM operator_entries WHERE id=$1", [
            created.id,
          ])
        ).rows[0],
        unchanged,
      );
    }
    await writeFile(
      ".local/daily-evidence/offline-operator.json",
      JSON.stringify(
        {
          passed: true,
          synthetic: true,
          expiryHours: 24,
          maximumDeviceDrafts: 20,
          checks: [
            "expiry and future clocks",
            "scope and roles",
            "idempotent creates",
            "concurrent idempotent edits",
            "stale revision conflict",
            "offline retention",
            "no automatic reconnect submission",
            "lost-response retry",
            "German mobile review",
            "logout purge",
            "cross-tab offline logout erases the open draft and review",
            "failed logout stays signed out across reconnect and reload until explicit sign-in",
            "manual counts preserve validation and review permissions",
            "account switch purge",
            "live permission revocation purge",
            "permission revocation during queued update and idempotent replay",
          ],
          physicalQualification: false,
        },
        null,
        2,
      ),
    );
    console.log("Offline operator API/browser checks passed");
  },
);
