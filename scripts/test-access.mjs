import assert from "node:assert/strict";
import { once } from "node:events";
import { io } from "socket.io-client";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(
  async ({
    pool,
    users,
    actors,
    api,
    frontend,
    sockets,
    call,
    login,
    expect,
    password,
  }) => {
    const machines = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Line A','opc.tcp://owned-a:4840','127.0.0.1',false),('Line B','opc.tcp://owned-b:4840','127.0.0.1',false) RETURNING id",
      )
    ).rows;
    const [a, b] = machines.map((row) => row.id);
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES ($1,'Count',now(),11,'Good'),($2,'Count',now(),999,'Good')",
      [a, b],
    );
    const sites = (
      await pool.query(
        "INSERT INTO plants(name) VALUES ('Site A'),('Site B') RETURNING id",
      )
    ).rows;
    for (const [index, id] of [a, b].entries())
      assert.equal(
        (
          await call("admin", "PUT", `/api/v1/access/machines/${id}/site`, {
            plantId: sites[index].id,
          })
        ).status(),
        200,
      );
    for (const role of ["supervisor", "operator", "viewer", "wallboard"]) {
      assert.equal(
        (
          await call("admin", "PUT", `/api/v1/access/users/${users[role].id}`, {
            machineIds: role === "operator" ? [a] : [],
            plantIds: role === "operator" ? [] : [sites[0].id],
          })
        ).status(),
        200,
      );
    }
    await pool.query(
      "INSERT INTO dashboards(id,name) VALUES ('owned-a','Visible A'),('owned-b','Secret B')",
    );
    for (const [dashboard, machineId] of [
      ["owned-a", a],
      ["owned-b", b],
    ])
      assert.equal(
        (
          await call("admin", "PUT", `/api/v1/access/dashboards/${dashboard}`, {
            machineIds: [machineId],
          })
        ).status(),
        200,
      );
    const alarms = (
      await pool.query(
        "INSERT INTO alert_history(machine_id,rule_name,message) VALUES ($1,'A','Visible alarm'),($2,'B','Secret alarm') RETURNING id",
        [a, b],
      )
    ).rows;
    const since = new Date(Date.now() - 60000).toISOString(),
      until = new Date(Date.now() + 1000).toISOString();
    const query = new URLSearchParams({
      nodeKey: "Count",
      machineId: String(a),
      startDate: since,
      endDate: until,
    });
    for (const role of ["supervisor", "operator", "viewer", "wallboard"]) {
      await login(role);
      assert.deepEqual(
        (
          await (await call(role, "GET", "/api/v1/production/assets")).json()
        ).map((item) => item.id),
        [a],
      );
      assert.deepEqual(
        (await (await call(role, "GET", "/api/v1/dashboards")).json()).map(
          (item) => item.id,
        ),
        ["owned-a"],
      );
      assert.equal(
        (await call(role, "GET", "/api/v1/dashboards/owned-b")).status(),
        403,
      );
      assert.equal(
        (
          await call(
            role,
            "GET",
            `/api/v1/production/operator/live?ids=${a},${b}`,
          )
        ).status(),
        403,
      );
      const history = await call(role, "GET", "/api/v1/node-data?" + query);
      assert.equal(history.status(), 200, await history.text());
      assert.deepEqual(
        (await history.json()).map((row) => row.value),
        [11],
      );
      assert.equal(
        (
          await call(
            role,
            "GET",
            `/api/v1/node-data?nodeKey=Count&machineId=${b}`,
          )
        ).status(),
        403,
      );
      assert.equal(
        (await call(role, "GET", "/api/v1/node-data?nodeKey=Count")).status(),
        403,
      );
      assert.equal(
        (
          await call(
            role,
            "GET",
            `/api/v1/trending/export-csv?nodeKeys=Count&machineId=${b}&startDate=${since}&endDate=${until}`,
          )
        ).status(),
        403,
      );
      assert.equal(
        (
          await call(
            role,
            "GET",
            `/api/v1/production/replay/${b}?start=${since}&end=${until}&keys=Count`,
          )
        ).status(),
        403,
      );
      const list = await (
        await call(role, "GET", "/api/v1/alerts/history")
      ).json();
      assert.equal(list.total, 1);
      assert.equal(list.data[0].machineId, a);
      assert.equal(
        (
          await call(
            role,
            "PUT",
            `/api/v1/alerts/history/${alarms[1].id}/acknowledge`,
            {},
          )
        ).status(),
        403,
      );
      const rpc = new URLSearchParams({
        input: JSON.stringify({ nodeKey: "Count", machineId: b }),
      });
      assert.equal(
        (await call(role, "GET", "/api/trpc/nodeData.history?" + rpc)).status(),
        403,
      );
      assert.equal(
        (
          await call(
            role,
            "GET",
            "/api/trpc/nodeData.history?" +
              new URLSearchParams({
                input: JSON.stringify({ nodeKey: "Count", machineId: a }),
              }),
          )
        ).status(),
        200,
      );
      for (const path of [
        "/system",
        "/db",
        "/opcua",
        "/certificates",
        "/status/debug",
        "/reports/history",
        "/machines",
        "/plants",
        "/compliance",
        "/recipes",
        "/batches",
        "/digital-twins/instances",
        "/edge/config",
        "/webhooks",
        "/custom-widgets",
        "/access/configuration",
      ])
        assert.equal(
          (await call(role, "GET", "/api/v1" + path)).status(),
          403,
          `${role} ${path}`,
        );
      assert.equal(
        (
          await call(role, "POST", "/api/v1/production/operator/entries", {
            requestId: crypto.randomUUID(),
            machineId: a,
            kind: "note",
            text: "Owned note",
            priority: "normal",
            ownerId: null,
            dueAt: null,
            shiftId: null,
            intervalStart: null,
            intervalEnd: null,
            quantity: null,
          })
        ).status(),
        ["operator", "supervisor"].includes(role) ? 201 : 403,
      );
    }
    const cookie = (await actors.operator.cookies(api))
      .map((item) => `${item.name}=${item.value}`)
      .join("; ");
    const live = io(api, {
      transports: ["websocket"],
      extraHeaders: { cookie, origin: frontend },
      reconnection: false,
    });
    try {
      await once(live, "connect");
      const received = [];
      live.on("opcuaUpdate", (data) => received.push(data));
      live.emit("joinRoom", `opcua-${a}-Count`);
      live.emit("joinRoom", `opcua-${b}-Count`);
      live.emit("joinRoom", "opcua-Count");
      const serverSocket = [...sockets.io.sockets.sockets.values()].find(
        (socket) => socket.data.user.id === users.operator.id,
      );
      await expect
        .poll(() => serverSocket.rooms.has(`opcua-${a}-Count`))
        .toBe(true);
      assert(!serverSocket.rooms.has(`opcua-${b}-Count`));
      assert(!serverSocket.rooms.has("opcua-Count"));
      sockets.opcuaService.broadcastNodeChange({
        machineId: a,
        key: "Count",
        value: 22,
        timestamp: new Date().toISOString(),
        statusCode: "Good",
      });
      sockets.opcuaService.broadcastNodeChange({
        machineId: b,
        key: "Count",
        value: 999,
        timestamp: new Date().toISOString(),
        statusCode: "Good",
      });
      await expect.poll(() => received.length).toBe(1);
      assert.equal(received[0].machineId, a);
      const disconnected = once(live, "disconnect");
      assert.equal(
        (
          await call(
            "admin",
            "PUT",
            `/api/v1/access/users/${users.operator.id}`,
            { machineIds: [], plantIds: [] },
          )
        ).status(),
        200,
      );
      await disconnected;
      assert.equal(
        (await call("operator", "GET", "/api/v1/production/assets")).status(),
        401,
      );
      await login("operator");
      assert.deepEqual(
        await (
          await call("operator", "GET", "/api/v1/production/assets")
        ).json(),
        [],
      );
    } finally {
      live.disconnect();
    }
    const page = await actors.admin.newPage();
    await page.goto(frontend + "/settings");
    await page
      .getByRole("tab", { name: "People & Access", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "People and machine access" }),
    ).toBeVisible();
    await page.getByLabel("Account to manage", { exact: true }).click();
    await page.getByRole("option", { name: "operator", exact: true }).click();
    await page.getByLabel("Line A", { exact: true }).check();
    await page
      .getByRole("button", {
        name: "Save machine and site access",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Saved. Affected accounts must sign in again.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/daily-evidence/access.png",
      fullPage: true,
      animations: "disabled",
    });
    await login("operator");
    assert.equal(
      (
        await (
          await call("operator", "GET", "/api/v1/production/assets")
        ).json()
      ).length,
      1,
    );
    const operatorPage = await actors.operator.newPage();
    await operatorPage.goto(frontend + "/operations");
    await expect(
      operatorPage.getByRole("heading", { name: "Daily operations" }),
    ).toBeVisible();
    await call("admin", "PUT", `/api/v1/access/users/${users.operator.id}`, {
      machineIds: [],
      plantIds: [],
    });
    await operatorPage.waitForURL("**/login");
    // A shared browser must not hydrate another account's old dashboard cache.
    await page.evaluate(() =>
      localStorage.setItem(
        "dashboardData",
        JSON.stringify({
          dashboards: [
            {
              id: "secret",
              name: "Other account secret",
              widgets: [],
              layout: [],
            },
          ],
        }),
      ),
    );
    await page.getByRole("button", { name: "Sign Out", exact: true }).click();
    await page.waitForURL("**/login");
    await page.getByLabel("Username").fill("viewer");
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Visible A", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Other account secret", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "Visible A", exact: true }),
    ).toBeVisible();
    console.log(
      "PASS: roles, two-site REST/tRPC/export/live isolation, default-deny modules, scoped totals, immediate revocation and browser permission editing",
    );
  },
);
