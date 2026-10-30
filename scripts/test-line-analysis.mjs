import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { dailyFixture } from "./daily-fixture.mjs";

// O07: cycle histograms, a loss Pareto and microstops withheld when the state signal
// is sampled too slowly to see them, in the API and the browser.
await dailyFixture(async ({ pool, call, actors, frontend, expect }) => {
  const machines = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Fine press','opc.tcp://127.0.0.1:49986','127.0.0.1',false),('Coarse press','opc.tcp://127.0.0.1:49987','127.0.0.1',false) RETURNING id",
    )
  ).rows.map((r) => r.id);
  // Fine press samples its state every second, coarse press every 10 s.
  for (const [machine, interval] of [
    [machines[0], 1000],
    [machines[1], 10000],
  ])
    await pool.query(
      "INSERT INTO node_mappings(machine_id,node_id,node_key,display_name,sampling_interval) VALUES($1,'ns=1;s=State','State','State',$2)",
      [machine, interval],
    );
  const t0 = Date.UTC(2026, 0, 1);
  const insert = (machine, key, seconds, value) =>
    pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code) VALUES($1,$2,$3,$4,'Good')",
      [machine, key, new Date(t0 + seconds * 1000), value],
    );
  // Both run, stop for 4 s (fault) and run again; the coarse press also idles 30 s.
  for (const machine of machines)
    for (const [s, v] of [
      [0, 1],
      [20, 2],
      [24, 1],
    ])
      await insert(machine, "State", s, v);
  await insert(machines[1], "State", 60, 0);
  await insert(machines[1], "State", 90, 1);
  for (let i = 0; i < 20; i++)
    await insert(machines[0], "Cycle", 30 + i, i < 18 ? 1000 : 1500);

  const states = { running: [1], idle: [0], fault: [2], blocked: [3], starved: [4] };
  const created = await call("admin", "POST", "/api/v1/lines", {
    name: "Resolution line",
    maxGapSeconds: 120,
    microstopSeconds: 10,
    machines: machines.map((machineId, i) => ({
      machineId,
      stateKey: "State",
      cycleKey: i === 0 ? "Cycle" : null,
      outputKey: null,
      states,
    })),
    buffers: [],
  });
  assert.equal(created.status(), 201, await created.text());
  const line = await created.json();
  const report = await (
    await call(
      "admin",
      "GET",
      `/api/v1/lines/${line.id}/report?start=2026-01-01T00:00:00Z&end=2026-01-01T00:02:00Z&target=10`,
    )
  ).json();
  const [fine, coarse] = report.machines;
  assert.deepEqual(fine.microstops, {
    count: 1,
    seconds: 4,
    resolutionSeconds: 1,
    detectable: true,
  });
  assert.deepEqual(
    [coarse.microstops.count, coarse.microstops.detectable],
    [null, false],
    "10 s threshold cannot be resolved at 10 s sampling",
  );
  assert.equal(fine.cycles.histogram.length, 10);
  assert.deepEqual(
    [fine.cycles.histogram[0].count, fine.cycles.histogram[9].count],
    [18, 2],
  );
  assert.deepEqual(
    report.lossPareto.map((l) => [l.machineId, l.state, l.seconds]),
    [
      [machines[1], "idle", 30],
      [machines[0], "fault", 4],
      [machines[1], "fault", 4],
    ],
  );

  const page = await actors.admin.newPage();
  await page.goto(`${frontend}/operations`);
  await page.getByRole("combobox", { name: "Machine", exact: true }).fill("Fine");
  await page.getByRole("option", { name: "Fine press", exact: true }).click();
  await selectOperation(page, "Production line");
  await page.getByRole("combobox", { name: "Production line" }).click();
  await page.getByRole("option", { name: "Resolution line" }).click();
  const local = (iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  await page.getByLabel("Line report start").fill(local("2026-01-01T00:00:00Z"));
  await page.getByLabel("Line report end").fill(local("2026-01-01T00:02:00Z"));
  await page.getByLabel("Line output target").fill("10");
  await page.getByRole("button", { name: "Analyze line" }).click();
  await expect(page.getByText(/not reported; the state is sampled too slowly/)).toBeVisible();
  await expect(page.getByRole("table", { name: "Cycle time distribution" })).toBeVisible();
  await expect(page.getByText("Loss Pareto")).toBeVisible();
  await expect(page.getByText(/cumulative 100%/)).toBeVisible();
  console.log(JSON.stringify({ lineAnalysis: "passed" }));
});
