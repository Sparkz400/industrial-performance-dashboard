import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dailyFixture } from "./daily-fixture.mjs";

// Selected-data links: real PostgreSQL, real API and an anonymous browser.
await dailyFixture(async ({ pool, call, api, frontend, actors, browser, expect, users }) => {
  const [shared, other] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Shared press','opc.tcp://127.0.0.1:49991','127.0.0.1',false),('Private oven','opc.tcp://127.0.0.1:49992','127.0.0.1',false) RETURNING id",
    )
  ).rows.map((row) => row.id);
  for (const [machine, key] of [
    [shared, "Count"],
    [shared, "Temp"],
    [shared, "Secret"],
    [other, "Count"],
  ])
    await pool.query(
      "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,data_type,sampling_interval) VALUES($1,$2,$3,$4,'Double',1000)",
      [machine, `ns=2;s=${key}`, key, `${key} display`],
    );
  const sample = (machine, key, value, ageMs) =>
    pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,source_timestamp,received_at,value,status_code) VALUES ($1,$2,$3,$3,$3,$4,'Good')",
      [machine, key, new Date(Date.now() - ageMs), value],
    );
  await sample(shared, "Count", 41, 60_000);
  await sample(shared, "Count", 9_999, 3 * 3_600_000); // outside the 1 h window
  await sample(shared, "Secret", 7_777, 60_000);
  await sample(other, "Count", 8_888, 60_000);
  const widgets = [
    { id: "trend", type: "trendingExplorer", config: { machineId: shared, defaultTags: ["Count"], title: "Press count" } },
    { id: "secret", type: "trendingExplorer", config: { machineId: shared, defaultTags: ["Secret"] } },
    { id: "status", type: "systemStatus", config: {} },
  ];
  await pool.query(
    "INSERT INTO dashboards(id,name,widgets,layout) VALUES('share-source','Share source',$1,$2)",
    [JSON.stringify(widgets), JSON.stringify(widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 8, w: 6, h: 8 })))],
  );
  // A link from the retired unscoped design stays unusable.
  const legacy = "L".repeat(43);
  await pool.query(
    "INSERT INTO share_tokens(dashboard_id,token,is_active,allow_embed) VALUES('share-source',$1,true,true)",
    [legacy],
  );

  const admin = async (method, path, data, status) => {
    const response = await call("admin", method, "/api/v1/share" + path, data);
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const anonymous = async (path) => {
    const response = await fetch(api + "/api/v1/share" + path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return { status: response.status, body: await response.json(), text: JSON.stringify(response) };
  };
  const expires = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
  const valid = { widgetIds: ["trend"], label: "Press line", expiresAt: expires(1), windowHours: 1, allowEmbed: false, allowedOrigins: [] };

  for (const role of ["supervisor", "operator", "viewer", "wallboard"]) {
    const create = await call(role, "POST", "/api/v1/share/dashboards/share-source", valid);
    assert.equal(create.status(), 403, role);
    assert.equal((await call(role, "GET", "/api/v1/share/dashboards/share-source")).status(), 403, role);
  }
  for (const invalid of [
    { ...valid, widgetIds: ["status"] },
    { ...valid, widgetIds: ["missing"] },
    { ...valid, expiresAt: expires(31) },
    { ...valid, expiresAt: new Date(Date.now() - 1000).toISOString() },
    { ...valid, windowHours: 169 },
    { ...valid, allowEmbed: true },
    { ...valid, allowedOrigins: ["https://intranet.example"] },
    { ...valid, allowEmbed: true, allowedOrigins: ["https://*.example"] },
    { ...valid, allowEmbed: true, allowedOrigins: ["https://intranet.example/path"] },
  ])
    await admin("POST", "/dashboards/share-source", invalid, 400);

  const created = await admin("POST", "/dashboards/share-source", valid, 201);
  const token = created.token;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = (await pool.query("SELECT token,token_hash,selection FROM share_tokens WHERE id=$1", [created.share.id])).rows[0];
  assert.equal(stored.token, null, "Plaintext token must not be stored");
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
  const listed = await admin("GET", "/dashboards/share-source", undefined, 200);
  assert(!JSON.stringify(listed).includes(token));
  assert(!JSON.stringify(listed).includes(stored.token_hash));
  assert.deepEqual(listed.map((link) => link.status).sort(), ["active", "legacy"]);

  // Later dashboard edits cannot widen an existing link.
  widgets[0].config.defaultTags = ["Count", "Secret"];
  await pool.query("UPDATE dashboards SET widgets=$1 WHERE id='share-source'", [JSON.stringify(widgets)]);

  const view = await anonymous(`/public/${token}`);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.widgets, [
    { id: "trend", title: "Press count", machineName: "Shared press", signals: [{ key: "Count", displayName: "Count display" }] },
  ]);
  for (const hidden of ["machineId", "dashboardId", "createdBy", "nodeId", "endpoint", "opc.tcp", "share-source", "tokenHash"])
    assert(!JSON.stringify(view.body).includes(hidden), hidden);
  const data = await anonymous(`/public/${token}/widgets/trend/data`);
  assert.equal(data.status, 200);
  assert.deepEqual(data.body.series.map((s) => s.nodeKey), ["Count"]);
  const values = data.body.series[0].data.map((point) => point.value);
  assert.deepEqual(values, [41]);
  for (const hidden of ["machineId", "7777", "8888", "9999"])
    assert(!JSON.stringify(data.body).includes(hidden), hidden);
  assert.equal((await anonymous(`/public/${token}/widgets/secret/data`)).status, 404);
  assert.equal((await anonymous(`/public/${token}/widgets/status/data`)).status, 404);
  for (const bad of [legacy, "x", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")])
    assert.equal((await anonymous(`/public/${bad}`)).status, 410, bad);
  assert.equal((await anonymous(`/embed/${token}`)).status, 410);

  // Anonymous browser: selected trend only, then revocation stops further data.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await visitor.newPage();
  await page.goto(`${frontend}/shared/${token}`);
  await expect(page.getByRole("heading", { name: "Press line" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Press count · Shared press" })).toBeVisible();
  await expect(page.getByText("Count display: 1/1 usable samples", { exact: false })).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/shared-view-390.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.body.innerText.includes("Secret")), false);
  const embed = await visitor.newPage();
  await embed.goto(`${frontend}/embed/${token}`);
  await expect(embed.getByRole("heading", { name: "Press count · Shared press" })).toBeVisible();
  assert.equal(await embed.getByRole("heading", { name: "Press line" }).count(), 0);

  const revoked = await admin("DELETE", `/${created.share.id}`, undefined, 200);
  assert.equal(revoked.status, "revoked");
  assert.equal((await anonymous(`/public/${token}`)).status, 410);
  assert.equal((await anonymous(`/public/${token}/widgets/trend/data`)).status, 410);
  await expect(page.getByRole("heading", { name: "This shared view is unavailable" })).toBeVisible({ timeout: 25_000 });
  assert.equal(await page.getByText("Press count").count(), 0, "Revoked view must clear shown data");
  await visitor.close();

  const audit = (await pool.query("SELECT action FROM audit_logs WHERE action LIKE 'share.%' ORDER BY id")).rows.map((r) => r.action);
  assert.deepEqual(audit, ["share.created", "share.revoked"]);

  // Expiry and loss of the creator's authority both end access without revocation.
  const expiring = await admin("POST", "/dashboards/share-source", valid, 201);
  assert.equal((await anonymous(`/public/${expiring.token}`)).status, 200);
  await pool.query("UPDATE share_tokens SET expires_at=now()-interval '1 second' WHERE id=$1", [expiring.share.id]);
  assert.equal((await anonymous(`/public/${expiring.token}/widgets/trend/data`)).status, 410);
  const embedded = await admin(
    "POST",
    "/dashboards/share-source",
    { ...valid, allowEmbed: true, allowedOrigins: ["https://intranet.example"] },
    201,
  );
  assert.deepEqual(embedded.share.allowedOrigins, ["https://intranet.example"]);

  // Administrator dialog in the real browser.
  const adminPage = await actors.admin.newPage();
  await adminPage.goto(frontend + "/dashboards");
  await adminPage.getByRole("tab", { name: "Share source" }).click();
  await adminPage.getByRole("button", { name: "Share Dashboard" }).click();
  const dialog = adminPage.getByRole("dialog");
  await expect(dialog.getByText("Retired link from the earlier design")).toBeVisible();
  await dialog.getByLabel("Press count · Count, Secret").check();
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = await dialog.getByLabel("Read-only link").inputValue();
  assert.match(link, /\/shared\/[A-Za-z0-9_-]{43}$/);
  await adminPage.screenshot({ path: ".local/daily-evidence/share-dialog.png" });
  const fresh = await anonymous(`/public/${link.split("/").at(-1)}`);
  assert.deepEqual(fresh.body.widgets[0].signals.map((s) => s.key), ["Count", "Secret"]);
  await adminPage.close();

  await pool.query("UPDATE users SET role='supervisor' WHERE id=$1", [users.admin.id]);
  assert.equal((await anonymous(`/public/${embedded.token}`)).status, 410);
  console.log(JSON.stringify({ selectedDataShares: "passed" }));
});
