import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
  const request = async (role, method, path, data, status = 200) => {
    const r = await call(role, method, "/api/v1/configuration" + path, data);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  const rows = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Synthetic source','opc.tcp://127.0.0.1:49981','127.0.0.1',false),('Synthetic target','opc.tcp://127.0.0.1:49982','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const source = rows[0].id,
    target = rows[1].id;
  await pool.query(
    "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,data_type,sampling_interval) VALUES($1,'ns=2;s=Count','Count','Count','Double',1000)",
    [source],
  );
  await pool.query(
    "INSERT INTO alert_rules(machine_id,name,node_key,condition,threshold,severity) VALUES($1,'Synthetic threshold','Count','gt',10,'medium')",
    [source],
  );
  await pool.query(
    "INSERT INTO dashboards(id,name,widgets,layout) VALUES($1,$2,$3,$4)",
    [
      "bundle-source",
      "Synthetic source dashboard",
      JSON.stringify([
        {
          id: "trend",
          type: "trendingExplorer",
          config: { machineId: source, defaultTags: ["Count"] },
        },
      ]),
      JSON.stringify([{ i: "trend", x: 0, y: 0, w: 12, h: 8 }]),
    ],
  );
  const bundle = await request("admin", "POST", `/machines/${source}/export`, {
    dashboardIds: ["bundle-source"],
  });
  assert.equal(bundle.version, 1);
  assert.equal(bundle.rules[0].name, "Synthetic threshold");
  assert.equal(bundle.mappings[0].nodeKey, "Count");
  assert(!JSON.stringify(bundle).includes("endpointUrl"));
  assert(!JSON.stringify(bundle).includes("createdBy"));
  bundle.dashboards[0].name = "Imported synthetic dashboard";
  for (const role of ["viewer", "operator", "supervisor", "wallboard"])
    await request(role, "POST", `/machines/${target}/preview`, { bundle }, 403);
  await request(
    "admin",
    "POST",
    `/machines/${target}/preview`,
    { bundle: { ...bundle, version: 2 } },
    400,
  );
  const corrupt = structuredClone(bundle);
  corrupt.dashboards[0].widgets[0].config.password = "must-not-transfer";
  await request(
    "admin",
    "POST",
    `/machines/${target}/preview`,
    { bundle: corrupt },
    400,
  );
  let preview = await request("admin", "POST", `/machines/${target}/preview`, {
    bundle,
  });
  assert.deepEqual(preview.conflicts, []);
  await pool.query("UPDATE machines SET name=$1 WHERE id=$2", [
    "Synthetic target changed",
    target,
  ]);
  await request(
    "admin",
    "POST",
    `/machines/${target}/apply`,
    { bundle, fingerprint: preview.fingerprint },
    409,
  );
  preview = await request("admin", "POST", `/machines/${target}/preview`, {
    bundle,
  });
  const results = await Promise.all([
    call("admin", "POST", `/api/v1/configuration/machines/${target}/apply`, {
      bundle,
      fingerprint: preview.fingerprint,
    }),
    call("admin", "POST", `/api/v1/configuration/machines/${target}/apply`, {
      bundle,
      fingerprint: preview.fingerprint,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status()).sort(), [201, 409]);
  const receipt = await results.find((r) => r.status() === 201).json();
  assert.equal(
    (
      await pool.query(
        "SELECT is_active FROM node_mappings WHERE machine_id=$1",
        [target],
      )
    ).rows[0].is_active,
    false,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT is_active FROM alert_rules WHERE machine_id=$1",
        [target],
      )
    ).rows[0].is_active,
    false,
  );
  const board = (
    await pool.query("SELECT * FROM dashboards WHERE name=$1", [
      "Imported synthetic dashboard",
    ])
  ).rows[0];
  assert.equal(board.widgets[0].config.machineId, target);
  assert(
    (await request("admin", "POST", `/machines/${target}/preview`, { bundle }))
      .conflicts.length >= 3,
  );
  await pool.query(
    "UPDATE node_mappings SET display_name=$1 WHERE machine_id=$2",
    ["Later user change", target],
  );
  await request(
    "admin",
    "POST",
    `/machines/${target}/rollback/${receipt.id}`,
    {},
    409,
  );
  await pool.query(
    "UPDATE node_mappings SET display_name=$1 WHERE machine_id=$2",
    ["Count", target],
  );
  for (const [table, insert] of [
    [
      "annotations",
      "INSERT INTO annotations(id,dashboard_id,widget_id,text) VALUES('bundle-note',$1,'trend','Later operator note') RETURNING id",
    ],
    [
      "share_tokens",
      "INSERT INTO share_tokens(dashboard_id,token) VALUES($1,'bundle-later-sharing') RETURNING id",
    ],
    [
      "dashboard_versions",
      "INSERT INTO dashboard_versions(dashboard_id,version,name) VALUES($1,1,'Later version') RETURNING id",
    ],
    [
      "dashboard_history",
      "INSERT INTO dashboard_history(dashboard_id,action) VALUES($1,'Later history') RETURNING id",
    ],
  ]) {
    const dependent = (await pool.query(insert, [board.id])).rows[0].id;
    await request(
      "admin",
      "POST",
      `/machines/${target}/rollback/${receipt.id}`,
      {},
      409,
    );
    assert.equal(
      (
        await pool.query(`SELECT count(*) FROM ${table} WHERE id=$1`, [
          dependent,
        ])
      ).rows[0].count,
      "1",
    );
    assert.equal(
      (
        await pool.query("SELECT count(*) FROM dashboards WHERE id=$1", [
          board.id,
        ])
      ).rows[0].count,
      "1",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT rolled_back_at FROM config_bundle_imports WHERE id=$1",
          [receipt.id],
        )
      ).rows[0].rolled_back_at,
      null,
    );
    await pool.query(`DELETE FROM ${table} WHERE id=$1`, [dependent]);
  }
  const importedRule = (
    await pool.query("SELECT id FROM alert_rules WHERE machine_id=$1", [target])
  ).rows[0].id;
  const recordedAlarm = (
    await pool.query(
      "INSERT INTO alert_history(rule_id,machine_id,message) VALUES($1,$2,'Later recorded alarm') RETURNING id",
      [importedRule, target],
    )
  ).rows[0].id;
  await request(
    "admin",
    "POST",
    `/machines/${target}/rollback/${receipt.id}`,
    {},
    409,
  );
  assert.equal(
    (
      await pool.query("SELECT rule_id FROM alert_history WHERE id=$1", [
        recordedAlarm,
      ])
    ).rows[0].rule_id,
    importedRule,
  );
  await pool.query("DELETE FROM alert_history WHERE id=$1", [recordedAlarm]);
  for (const scope of [target, null]) {
    const laterRule = (
      await pool.query(
        "INSERT INTO alert_rules(machine_id,name,node_key,condition,threshold) VALUES($1,'Later Count rule','Count','gt',15) RETURNING id",
        [scope],
      )
    ).rows[0].id;
    await request(
      "admin",
      "POST",
      `/machines/${target}/rollback/${receipt.id}`,
      {},
      409,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM node_mappings WHERE machine_id=$1",
          [target],
        )
      ).rows[0].count,
      "1",
    );
    assert.equal(
      (
        await pool.query("SELECT node_key FROM alert_rules WHERE id=$1", [
          laterRule,
        ])
      ).rows[0].node_key,
      "Count",
    );
    await pool.query("DELETE FROM alert_rules WHERE id=$1", [laterRule]);
  }
  const assetTemplate = (
    await pool.query(
      "INSERT INTO digital_twin_templates(name,svg_content) VALUES('Later fixture template','<svg xmlns=\"http://www.w3.org/2000/svg\"><g id=\"counter\"/></svg>') RETURNING id",
    )
  ).rows[0].id;
  for (const binding of [
    { elementId: "counter", nodeKey: "Count" },
    { svgElementId: "counter", nodeKey: "Count" },
  ]) {
    const asset = (
      await pool.query(
        "INSERT INTO digital_twin_instances(template_id,machine_id,name,node_bindings) VALUES($1,$2,'Later bound asset',$3) RETURNING id",
        [assetTemplate, target, JSON.stringify([binding])],
      )
    ).rows[0].id;
    await request(
      "admin",
      "POST",
      `/machines/${target}/rollback/${receipt.id}`,
      {},
      409,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM node_mappings WHERE machine_id=$1",
          [target],
        )
      ).rows[0].count,
      "1",
    );
    assert.deepEqual(
      (
        await pool.query(
          "SELECT node_bindings FROM digital_twin_instances WHERE id=$1",
          [asset],
        )
      ).rows[0].node_bindings,
      [binding],
    );
    await pool.query("DELETE FROM digital_twin_instances WHERE id=$1", [asset]);
  }

  await request(
    "admin",
    "POST",
    `/machines/${target}/rollback/${receipt.id}`,
    {},
  );
  await request(
    "admin",
    "POST",
    `/machines/${target}/rollback/${receipt.id}`,
    {},
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM node_mappings WHERE machine_id=$1",
          [target],
        )
      ).rows[0].count,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM node_mappings WHERE machine_id=$1",
          [source],
        )
      ).rows[0].count,
    ),
    1,
  );
  const page = await actors.admin.newPage();
  await page.goto(frontend + "/settings");
  await page
    .getByRole("tab", { name: "Backup & Restore", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source or target machine" })
    .click();
  await page
    .getByRole("option", { name: "Synthetic target changed", exact: true })
    .click();
  await page.getByLabel("Setup file", { exact: true }).setInputFiles({
    name: "setup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page
    .getByRole("button", { name: "Preview setup import", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Import paused setup", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Import paused setup", exact: true })
    .click();
  await expect(
    page.getByText(
      "Imported with mappings and rules disabled. Review before activation.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/daily-evidence/setup-bundle-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => Math.round((await page.locator("main").boundingBox()).x))
    .toBe(56);
  await page
    .getByRole("heading", { name: "Machine setup bundles", exact: true })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(
      async () =>
        (
          await page
            .getByRole("heading", {
              name: "Machine setup bundles",
              exact: true,
            })
            .boundingBox()
        ).width,
    )
    .toBeGreaterThan(160);
  await page.screenshot({
    path: ".local/daily-evidence/setup-bundle-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "No mobile horizontal overflow",
  );
  await page
    .getByRole("button", { name: "Roll back this import", exact: true })
    .click();
  await expect(
    page.getByText(
      "Unchanged imported items removed. Existing setup retained.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.evaluate(() => localStorage.setItem("language", "de"));
  await page.reload();
  await page
    .getByRole("tab", { name: "Sicherung und Wiederherstellung", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Maschinenkonfiguration übertragen",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("heading", {
      name: "Maschinenkonfiguration übertragen",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/daily-evidence/setup-bundle-de.png",
    fullPage: true,
  });
  await writeFile(
    ".local/daily-evidence/configuration-bundles.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "role scope",
          "unsupported version",
          "secret rejection",
          "stale preview",
          "concurrent import exactly once",
          "paused import",
          "conflict preview",
          "edited rollback refused",
          "later dashboard notes/shares/versions/history preserved",
          "recorded alarm rule identity preserved",
          "mapping retained for later machine/global rules and current/legacy asset bindings",
          "idempotent rollback",
          "source preserved",
          "browser preview apply rollback",
          "390px no overflow",
        ],
        physicalQualification: false,
      },
      null,
      2,
    ),
  );
  console.log("Configuration bundle acceptance passed");
});
