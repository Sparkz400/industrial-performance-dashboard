import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
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

// Integrations (docs/INTEGRATIONS.md): Grafana provisioning and Node-RED flows.
const integration = {};
for (const directory of ["grafana", "node-red"])
  for (const name of await readdir(`examples/${directory}`, { recursive: true })) {
    if (!/\.(json|ya?ml)$/.test(name)) continue;
    const file = `examples/${directory}/${name.replaceAll("\\", "/")}`;
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(
      text,
      /BEGIN [A-Z ]*PRIVATE KEY|pdsa_[A-Za-z0-9_-]{43}/,
      `${file} must not contain credentials`,
    );
    integration[file] = file.endsWith(".json") ? JSON.parse(text) : parseYaml(text);
  }
const [datasource] = integration[
  "examples/grafana/provisioning/datasources/performance-dashboard.yaml"
].datasources;
assert.equal(datasource.jsonData.auth_method, "bearerToken");
assert.deepEqual(Object.values(datasource.secureJsonData), ["$PD_SERVICE_TOKEN"], "Token from the environment");
const dashboard = integration["examples/grafana/dashboards/machine-history.json"];
const variables = dashboard.templating.list;
assert(
  [...dashboard.panels, ...variables.filter((v) => v.datasource)].every(
    (p) => p.datasource.uid === datasource.uid,
  ),
);
const grafanaQueries = [
  ...variables.flatMap((v) => (v.query?.infinityQuery ? [v.query.infinityQuery] : [])),
  ...dashboard.panels.flatMap((p) => p.targets),
];
const flows = [
  ...integration["examples/node-red/publish-machine-json.json"],
  ...integration["examples/node-red/read-hourly-history.json"],
];
const coreNodes = ["tab", "comment", "inject", "function", "mqtt out", "mqtt-broker", "tls-config", "http request", "debug"];
assert.deepEqual(flows.filter((n) => !coreNodes.includes(n.type)), [], "Core Node-RED nodes only");
assert(flows.every((n) => !n.credentials), "Flows carry no credentials");
const broker = flows.find((n) => n.type === "mqtt-broker");
assert(broker.usetls && flows.find((n) => n.id === broker.tls).verifyservercert, "mqtts with a verified CA");
const runFunction = (name, msg, env = {}, node = {}) =>
  new Function("msg", "env", "node", flows.find((n) => n.name === name).func)(
    msg,
    { get: (key) => env[key] },
    node,
  );

await dailyFixture(async ({ pool, call, api, expect }) => {
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

  // Every integration request is a service-token contract read, and every field it uses exists.
  const { CONTRACT_READS } = await import("../server/dist/src/middleware/serviceToken.js");
  const { parseMessage } = await import("../server/dist/src/services/mqttIngestion.js");
  const contractRead = (url) =>
    assert(
      CONTRACT_READS.some((re) => re.test(new URL(url, api).pathname.replace(/^\/api\/v1/, ""))),
      `${url} is not an integration API read`,
    );
  const now = Date.now();
  const signal = variables.find((v) => v.name === "signal").query;
  for (const [minutes, quality] of [[50, "Good"], [40, "BadNoCommunication"], [30, "Good"]])
    await pool.query(
      "INSERT INTO opcua_data(machine_id,node_key,timestamp,value,raw_value,status_code,received_at,source_timestamp,data_type) VALUES ($1,$2,$3,$4,to_jsonb($4::double precision),$5,$3,$3,'UInt32')",
      [machine, signal, new Date(now - minutes * 60000), 100 - minutes, quality],
    );
  const badHour = new Date(Math.floor((now - 40 * 60000) / 3600000) * 3600000).toISOString();
  const account = await call("admin", "POST", "/api/v1/identity/service-accounts", {
    username: "integration-example",
    machineIds: [machine],
    expiresInDays: 1,
  });
  assert.equal(account.status(), 201, await account.text());
  const token = (await account.json()).token.token;
  const select = (body, selector) =>
    selector.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((value, key) => value?.[key], body);
  for (const query of grafanaQueries) {
    const url = query.url
      .replaceAll("${machine}", machine)
      .replaceAll("${signal:percentencode}", encodeURIComponent(signal))
      .replaceAll("${__from:date:iso}", new Date(now - 6 * 3600000).toISOString())
      .replaceAll("${__to:date:iso}", new Date(now).toISOString());
    assert.doesNotMatch(url, /\$\{/, `${query.url} uses an unknown variable`);
    contractRead(url);
    const response = await fetch(new URL(url, api), { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, `${url}: ${await response.clone().text()}`);
    const rows = select(await response.json(), query.root_selector);
    assert(Array.isArray(rows) && rows.length, `${query.url} returns rows`);
    for (const { selector } of query.columns)
      assert(rows.every((row) => Object.hasOwn(row, selector)), `${selector} exists in ${query.url}`);
    // Grafana draws a null as a gap: a non-Good sample or an incomplete hour is never zero.
    if (query.columns.some((c) => c.selector === "quality"))
      assert.deepEqual(rows.filter((r) => r.quality !== "Good").map((r) => r.value), [null]);
    if (query.columns.some((c) => c.selector === "average"))
      assert.equal(rows.find((r) => new Date(r.bucket).toISOString() === badHour).average, null);
  }
  const request = runFunction("Build summaries request", {}, {
    PD_URL: api,
    PD_SERVICE_TOKEN: token,
    PD_MACHINE_ID: String(machine),
    PD_NODE_KEY: signal,
  });
  contractRead(request.url);
  const reply = await fetch(request.url, { headers: request.headers });
  const hours = runFunction("Keep unknown hours unknown", {
    statusCode: reply.status,
    headers: Object.fromEntries(reply.headers),
    payload: await reply.json(),
  }).payload;
  const incomplete = hours.find((h) => new Date(h.hour).toISOString() === badHour);
  assert.equal(incomplete.average, null);
  assert(incomplete.goodSamples < incomplete.samples);
  const errors = [];
  assert.equal(
    runFunction("Keep unknown hours unknown", { statusCode: 401, headers: {}, payload: {} }, {}, { error: (e) => errors.push(e) }),
    null,
  );
  assert.equal(errors.length, 1, "A refused token is reported, not passed on as data");
  // The published JSON matches the MQTT source mapping named in the flow.
  const out = flows.find((n) => n.type === "mqtt out");
  assert.match(flows.find((n) => n.id === "pd-publish-note").name, /value \/value · timestamp \/timestamp · Double/);
  const { measurements } = parseMessage(
    { id: 1, machineId: machine, brokerUrl: "mqtts://broker.invalid" },
    [{ topic: out.topic, nodeKey: "Pressure", valuePointer: "/value", timestampPointer: "/timestamp", dataType: "Double" }],
    out.topic,
    Buffer.from(JSON.stringify(runFunction("Synthetic reading (replace with your machine read node)", {}).payload)),
    new Date(),
  );
  assert.deepEqual(measurements.map((m) => m.statusCode), ["Good"]);
  console.log(
    JSON.stringify({
      examples: "passed",
      files: Object.keys(examples).length + Object.keys(integration).length,
    }),
  );
});
