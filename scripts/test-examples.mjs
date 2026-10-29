import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

// P03: the published examples carry no secrets and produce their documented output.
const examples = {};
for (const name of (await readdir("examples")).filter((n) => n.endsWith(".json"))) {
  const text = await readFile(`examples/${name}`, "utf8");
  assert.doesNotMatch(
    text,
    /"(password|secret|token|privateKey|apiKey)"\s*:|BEGIN [A-Z ]*PRIVATE KEY/i,
    `${name} must not contain credentials`,
  );
  examples[name] = JSON.parse(text);
}

await dailyFixture(async ({ pool, call, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Example press','opc.tcp://127.0.0.1:49985','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  // Replace the documented placeholder machine ID, as the README tells users to.
  const forMachine = (value) =>
    JSON.parse(JSON.stringify(value).replaceAll('"machineId":1', `"machineId":${machine}`));

  const imported = await call(
    "admin",
    "POST",
    "/api/v1/dashboards/import",
    forMachine(examples["dashboard-press-overview.json"]),
  );
  assert.equal(imported.status(), 201, await imported.text());
  const dashboard = await imported.json();
  assert.deepEqual(
    dashboard.widgets.map((w) => w.type),
    ["trendingExplorer", "systemStatus"],
  );
  assert.equal(dashboard.widgets[0].config.machineId, machine);

  const template = await call(
    "admin",
    "POST",
    "/api/v1/reports/templates",
    forMachine(examples["report-template-shift-summary.json"]),
  );
  assert.equal(template.status(), 201, await template.text());
  const schedule = await call("admin", "POST", "/api/v1/reports/schedules", {
    templateId: (await template.json()).id,
    name: "Example shift summary",
    cronExpression: "0 6 * * *",
    machineIds: [machine],
    deliveryChannels: [],
  });
  assert.equal(schedule.status(), 201, await schedule.text());
  const run = await call(
    "admin",
    "POST",
    `/api/v1/reports/schedules/${(await schedule.json()).id}/run-now`,
    {},
  );
  assert.equal(run.status(), 200, await run.text());
  const { historyId } = await run.json();
  await expect
    .poll(
      async () =>
        (await pool.query("SELECT status FROM report_history WHERE id=$1", [historyId]))
          .rows[0].status,
      { timeout: 60_000 },
    )
    .toBe("completed");
  const pdf = await call("admin", "GET", `/api/v1/reports/history/${historyId}/download`);
  assert.equal(pdf.status(), 200);
  assert.equal((await pdf.body()).subarray(0, 5).toString(), "%PDF-");
  const { reportSchedulerService } = await import(
    "../server/dist/src/services/reportSchedulerService.js"
  );
  // Run-now started the scheduler; stop it before the owned database is dropped.
  reportSchedulerService.stop();
  console.log(JSON.stringify({ examples: "passed", files: Object.keys(examples).length }));
});
