import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { dailyFixture } from "./daily-fixture.mjs";

// I07: registered widgets render in a sandbox with an opaque origin. A hostile widget cannot
// read the dashboard, its storage, cookies or API, cannot navigate it, and gets no data its
// manifest did not ask for; versions are pinned and removal is visible.
process.env.ALLOW_PRIVATE_OUTBOUND_URLS = "true";

await dailyFixture(async ({ pool, call, users, actors, api, frontend, expect }) => {
  // A third-party widget host on another origin.
  let base = "";
  const pages = {
    "/benign/manifest.json": () =>
      JSON.stringify({ id: "pd.test.benign", name: "Benign gauge", version: "1.0.0", entryUrl: `${base}/benign/widget.html`, permissions: ["readSeries"], minW: 2, minH: 2, defaultW: 4, defaultH: 6 }),
    "/evil/manifest.json": () =>
      JSON.stringify({ id: "pd.test.hostile", name: "Hostile widget", version: "1.0.0", entryUrl: `${base}/evil/widget.html`, minW: 2, minH: 2, defaultW: 4, defaultH: 6, trusted: true }),
    "/bad/manifest.json": () =>
      JSON.stringify({ id: "pd.test.bad", name: "Writer", version: "1.0.0", entryUrl: `${base}/benign/widget.html`, permissions: ["writeMachine"], minW: 2, minH: 2, defaultW: 4, defaultH: 6 }),
    "/benign/widget.html": () => `<!doctype html><body>Waiting<script>
      window.__received = [];
      addEventListener("message", (e) => {
        if (e.data?.type !== "pd:series") return;
        window.__received.push(e.data);
        document.body.textContent = "Received " + e.data.series.map((s) => s.nodeKey + ":" + s.data.length).join(",");
      });
      parent.postMessage({ type: "pd:ready" }, "*");
    </script></body>`,
    "/evil/widget.html": () => `<!doctype html><body>Hostile<script>
      const results = (window.__results = {});
      const attempt = (name, fn) => { try { results[name] = String(fn()); } catch { results[name] = "blocked"; } };
      attempt("parentDom", () => parent.document.title);
      attempt("parentStorage", () => parent.localStorage.length);
      attempt("cookie", () => document.cookie);
      attempt("storage", () => localStorage.length);
      attempt("topNavigation", () => { top.location.href = "about:blank#hijacked"; return "attempted"; });
      fetch(${JSON.stringify(api)} + "/api/v1/machines", { credentials: "include" })
        .then((r) => r.text()).then((t) => (results.api = t.slice(0, 40)), () => (results.api = "blocked"));
      window.__received = [];
      addEventListener("message", (e) => window.__received.push(e.data));
      parent.postMessage({ type: "pd:request", machineId: 999, nodeKeys: ["Secret"] }, "*");
      parent.postMessage({ type: "pd:ready" }, "*");
    </script></body>`,
  };
  const host = createServer((req, res) => {
    const page = pages[req.url];
    if (!page) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": req.url.endsWith(".json") ? "application/json" : "text/html" }).end(page());
  }).listen(0, "127.0.0.1");
  await once(host, "listening");
  base = `http://127.0.0.1:${host.address().port}`;
  try {
    const [{ id: machine }] = (
      await pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES('Widget press','opc.tcp://127.0.0.1:49986','127.0.0.1',false) RETURNING id")
    ).rows;
    await pool.query(
      `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code)
       SELECT $1,'Pressure',now()-i*interval '1 minute',50+i,'Good' FROM generate_series(1,5) i`,
      [machine],
    );
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users.viewer.id, machine]);
    const ok = async (role, method, path, body, status = 200) => {
      const r = await call(role, method, "/api/v1" + path, body);
      assert.equal(r.status(), status, await r.text());
      return r;
    };
    const register = async (path, status = 201) =>
      (await ok("admin", "POST", "/custom-widgets", { manifestUrl: `${base}${path}` }, status)).json();
    await register("/bad/manifest.json", 400);
    const benign = await register("/benign/manifest.json");
    const hostile = await register("/evil/manifest.json");
    assert.equal(hostile.manifest.trusted, undefined, "Unknown manifest keys are dropped");
    assert.deepEqual(hostile.manifest.permissions, [], "No permission unless declared");
    const csp = async () => (await ok("admin", "GET", "/csrf-token")).headers()["content-security-policy"];
    assert.match(await csp(), new RegExp(`frame-src 'self' ${base}(;|$)`));
    const runtime = await (await ok("viewer", "GET", "/widget-runtime/registrations")).json();
    assert.deepEqual(runtime.map((r) => r.manifest.name).sort(), ["Benign gauge", "Hostile widget"]);
    await ok("viewer", "GET", "/custom-widgets", undefined, 403);

    const widget = (id, registrationId) => ({
      id,
      type: "customWidget",
      config: { registrationId, version: "1.0.0", machineId: machine, nodeKeys: ["Pressure"] },
    });
    await ok("admin", "POST", "/dashboards/widget-runtime", {
      name: "Widget runtime",
      widgets: [widget("benign", benign.id), widget("hostile", hostile.id)],
      layout: [
        { i: "benign", x: 0, y: 0, w: 6, h: 6 },
        { i: "hostile", x: 6, y: 0, w: 6, h: 6 },
      ],
    });

    const page = await actors.admin.newPage();
    await page.addInitScript(() => localStorage.setItem("pd-secret", "parent-only"));
    await page.goto(`${frontend}/dashboard/widget-runtime`);
    const frame = async (path) => {
      await expect.poll(() => page.frames().some((f) => f.url() === `${base}${path}`)).toBe(true);
      return page.frames().find((f) => f.url() === `${base}${path}`);
    };
    const good = await frame("/benign/widget.html");
    await expect.poll(() => good.evaluate(() => window.__received.length)).toBeGreaterThan(0);
    const [first] = await good.evaluate(() => window.__received);
    assert.equal(first.machineId, machine);
    assert.deepEqual(first.series.map((s) => [s.nodeKey, s.data.length]), [["Pressure", 5]]);
    await expect(page.getByText("Sandboxed third-party widget Benign gauge v1.0.0; receives Pressure only.")).toBeVisible();

    const evil = await frame("/evil/widget.html");
    await expect.poll(() => evil.evaluate(() => window.__results.api ?? null)).not.toBeNull();
    const results = await evil.evaluate(() => window.__results);
    assert.equal(results.parentDom, "blocked");
    assert.equal(results.parentStorage, "blocked");
    assert.equal(results.cookie, "blocked");
    assert.equal(results.storage, "blocked");
    assert.equal(results.api, "blocked", "The API refuses the sandbox's opaque origin");
    assert.equal(new URL(page.url()).pathname, "/dashboard/widget-runtime", "No top-level navigation");
    await expect.poll(() => evil.evaluate(() => window.__received.length)).toBeGreaterThan(0);
    const received = await evil.evaluate(() => window.__received);
    assert.ok(received.every((m) => m.type === "pd:series" && m.machineId === null && m.series.length === 0), JSON.stringify(received));
    await expect(page.getByText("Sandboxed third-party widget Hostile widget v1.0.0; receives no data. Ignored 1 message(s) it sent.")).toBeVisible();
    await page.screenshot({ path: ".local/daily-evidence/custom-widgets.png", fullPage: true });

    // A changed manifest version, a disabled and a removed widget are explained, not rendered.
    await pool.query(`UPDATE custom_widgets SET manifest=jsonb_set(manifest,'{version}','"1.1.0"') WHERE id=$1`, [benign.id]);
    await ok("admin", "PATCH", `/custom-widgets/${hostile.id}`, { isActive: false });
    await page.reload();
    await expect(page.getByText("Widget changed from version 1.0.0 to 1.1.0. Edit this widget to review and accept the new version.")).toBeVisible();
    await expect(page.getByText("This custom widget is disabled by an administrator.")).toBeVisible();
    assert.equal(page.frames().some((f) => f.url().startsWith(base)), false);
    await ok("admin", "DELETE", `/custom-widgets/${benign.id}`);
    await page.reload();
    await expect(page.getByText("This custom widget was removed by an administrator. Remove it from the dashboard.")).toBeVisible();
    assert.doesNotMatch(await csp(), new RegExp(base), "No active widget, no frame source");
    await page.close();
    console.log(JSON.stringify({ customWidgets: "passed", hostile: results }));
  } finally {
    host.close();
  }
});
