import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// Q02: a control chart is offered only for a declared data assumption and an approved
// reference period; limits use the textbook constants (Montgomery's piston-ring case).
await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Ring press','opc.tcp://127.0.0.1:49989','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  const profileBody = (extra) => ({
    name: "Ring diameter",
    machineId: machine,
    nodeKey: "Diameter",
    method: "std_bands",
    ...extra,
  });
  for (const invalid of [
    { chartType: "xbar-r" },
    { chartType: "individuals", subgroupSize: 5 },
    { chartType: "p" },
  ])
    assert.equal(
      (await call("admin", "POST", "/api/v1/spc/profiles", profileBody(invalid))).status(),
      400,
      JSON.stringify(invalid),
    );
  const created = await call(
    "admin",
    "POST",
    "/api/v1/spc/profiles",
    profileBody({ chartType: "xbar-r", subgroupSize: 5 }),
  );
  assert.equal(created.status(), 201, await created.text());
  const profile = await created.json();
  const window = "startDate=2026-01-01T00:00:00Z&endDate=2026-01-01T01:00:00Z";
  const chart = () =>
    call("admin", "GET", `/api/v1/spc/profiles/${profile.id}/control-chart?${window}`);
  const refused = await chart();
  assert.equal(refused.status(), 400);
  assert.match((await refused.json()).error, /Approve a reference period/);

  // Approved reference: 25 subgroups with mean 74.001 and range 0.023.
  const reference = Array.from({ length: 25 }, () => [73.9895, 74.001, 74.001, 74.001, 74.0125])
    .flat()
    .map((value) => ({ value, status_code: "Good" }));
  await pool.query(
    "INSERT INTO spc_baselines(profile_id,evidence,approved_by,approved_at,review) VALUES($1,$2,$3,now(),'Owned review')",
    [
      profile.id,
      JSON.stringify({ samples: reference, profile: { machineId: machine, nodeKey: "Diameter" } }),
      users.admin.id,
    ],
  );
  // Window: three in-control subgroups and one shifted subgroup (mean 74.05).
  const t0 = Date.UTC(2026, 0, 1);
  const window5 = [
    ...[73.995, 74.0, 74.002, 74.004, 74.006],
    ...[73.998, 74.001, 74.003, 74.0, 74.002],
    ...[74.04, 74.05, 74.05, 74.05, 74.06],
    ...[74.0, 74.001, 74.0, 74.002, 74.001],
  ];
  for (const [i, value] of window5.entries())
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,'Diameter',$2,$3,'Good')",
      [machine, new Date(t0 + i * 60000), value],
    );
  const xbar = await (await chart()).json();
  assert.equal(xbar.chartType, "xbar-r");
  assert.equal(xbar.baseline.referencePoints, 25);
  assert.equal(xbar.primary.ucl.toFixed(3), "74.014");
  assert.equal(xbar.primary.lcl.toFixed(3), "73.988");
  assert.deepEqual(
    xbar.points.map((p) => p.outOfControl),
    [false, false, true, false],
  );

  // Re-declaring as individual measurements clears the subgroup size.
  const switched = await call("admin", "PUT", `/api/v1/spc/profiles/${profile.id}`, {
    chartType: "individuals",
  });
  assert.equal(switched.status(), 200, await switched.text());
  assert.equal(
    (await pool.query("SELECT subgroup_size FROM spc_profiles WHERE id=$1", [profile.id])).rows[0]
      .subgroup_size,
    null,
  );
  const imr = await (await chart()).json();
  assert.equal(imr.chartType, "individuals");
  assert.equal(imr.points.length, 20);

  // Browser: declare in the profile form and read the chart summary.
  const page = await actors.admin.newPage();
  await page.goto(`${frontend}/spc`);
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByRole("combobox", { name: "Data assumption (control chart)" }).click();
  await page.getByRole("option", { name: /Rational subgroups/ }).click();
  await page.getByLabel("Subgroup size").fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () =>
      (await pool.query("SELECT chart_type, subgroup_size FROM spc_profiles WHERE id=$1", [profile.id]))
        .rows[0],
    )
    .toEqual({ chart_type: "xbar-r", subgroup_size: 5 });
  await page.goto(`${frontend}/spc/chart/${profile.id}`);
  const local = (iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  await page.getByLabel("Start").fill(local("2026-01-01T00:00:00Z"));
  await page.getByLabel("End").fill(local("2026-01-01T01:00:00Z"));
  await expect(page.getByText(/X̄-R chart, subgroups of 5/)).toBeVisible();
  await expect(page.getByRole("table", { name: "Control limits" })).toBeVisible();
  await expect(page.getByText(/4 points; 1 out of control/)).toBeVisible();
  console.log(JSON.stringify({ controlCharts: "passed", ucl: xbar.primary.ucl }));
});
