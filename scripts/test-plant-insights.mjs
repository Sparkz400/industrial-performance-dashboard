import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { dailyFixture } from "./daily-fixture.mjs";

// Plant insights: managed downtime reasons, MTBF/MTTR, first-pass yield, losses in money,
// Teams/Slack alarm messages and the hour-by-hour board, through the API and the browser.
process.env.ALLOW_PRIVATE_OUTBOUND_URLS = "true";
const received = [];
const receiver = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  received.push(JSON.parse(body));
  res.end("owned receiver");
}).listen(0, "127.0.0.1");
await once(receiver, "listening");

try {
  await dailyFixture(async ({ pool, call, users, actors, frontend, expect }) => {
    const [{ id: machine }] = (
      await pool.query(
        "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Insight press','opc.tcp://127.0.0.1:49993','127.0.0.1',false) RETURNING id",
      )
    ).rows;
    for (const role of ["supervisor", "operator", "viewer"])
      await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
    const signal = { nodeKey: "State", namespaceUri: "urn:fixture", identifier: "s=State", dataType: "Double", unit: null, scale: 1 };
    await pool.query("INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)", [
      machine,
      {
        version: 1,
        name: "Insight profile",
        endpointModel: "fixture",
        signals: { state: signal },
        states: { running: [1], idle: [0], fault: [2], planned: [3] },
        idealCycleMs: 6000,
        maxGapSeconds: 600,
        counterPolicy: "reset-to-zero",
      },
      users.admin.id,
    ]);
    // Observed states: running 06:00, fault 07:00-07:10, running again until 09:00.
    for (const [at, value] of [
      ["2026-04-01T06:00:00Z", 1],
      ["2026-04-01T06:05:00Z", 1],
      ["2026-04-01T06:10:00Z", 1],
      ...Array.from({ length: 10 }, (_, i) => [new Date(Date.UTC(2026, 3, 1, 6, 15 + i * 5)).toISOString(), 1]),
      ["2026-04-01T07:00:00Z", 2],
      ["2026-04-01T07:05:00Z", 2],
      ...Array.from({ length: 23 }, (_, i) => [new Date(Date.UTC(2026, 3, 1, 7, 10 + i * 5)).toISOString(), 1]),
    ])
      await pool.query(
        "INSERT INTO opcua_data(machine_id,node_key,timestamp,source_timestamp,received_at,value,status_code,signal_metadata) VALUES ($1,'State',$2,$2,$2,$3,'Good',$4)",
        [machine, at, value, { namespaceUri: signal.namespaceUri, identifier: signal.identifier }],
      );
    const ok = async (role, method, path, body, status = 200) => {
      const r = await call(role, method, "/api/v1" + path, body);
      assert.equal(r.status(), status, `${method} ${path}: ${await r.text()}`);
      return r.json();
    };
    const shift = await ok("supervisor", "POST", "/production/shifts", {
      machineId: machine,
      name: "Insight shift",
      timezone: "UTC",
      start: "2026-04-01T06:00:00Z",
      end: "2026-04-01T09:00:00Z",
      job: { reference: "J-1", product: "Bracket", target: null },
    }, 201);

    // Reason catalog: administrators curate, everyone reads, a picked code fixes the spelling.
    await ok("supervisor", "POST", "/production/reason-codes", { category: "unplanned", label: "Jam at infeed" }, 403);
    const code = await ok("admin", "POST", "/production/reason-codes", { category: "unplanned", label: "Jam at infeed" }, 201);
    assert.deepEqual((await ok("viewer", "GET", "/production/reason-codes")).map((c) => c.label), ["Jam at infeed"]);
    const reason = await ok("operator", "POST", `/production/shifts/${shift.id}/reasons`, {
      start: "2026-04-01T07:00:00Z",
      end: "2026-04-01T07:10:00Z",
      category: "planned",
      reason: "jam infeed",
      codeId: code.id,
    }, 201);
    assert.equal(reason.reason, "Jam at infeed");
    assert.equal(reason.category, "unplanned");
    const report = await ok("viewer", "GET", `/production/shifts/${shift.id}/report`);
    assert.ok(report.losses.some((l) => l.reason === "Jam at infeed" && l.seconds === 600));
    assert.equal(report.reasons[0].codeId, undefined, "Evidence inputs keep their shape");
    await ok("admin", "PATCH", `/production/reason-codes/${code.id}`, { active: false });
    await ok("operator", "POST", `/production/shifts/${shift.id}/reasons`, {
      start: "2026-04-01T07:00:00Z",
      end: "2026-04-01T07:10:00Z",
      category: "unplanned",
      codeId: code.id,
      supersedesId: reason.id,
    }, 400);

    // MTBF/MTTR from observed states: one failure, ten minutes of repair.
    const reliability = await ok("viewer", "GET", `/production/machines/${machine}/reliability?from=2026-04-01T06:00:00Z&to=2026-04-01T09:00:00Z`);
    assert.equal(reliability.failures, 1);
    assert.equal(reliability.mttrSeconds, 600);
    assert.equal(reliability.mtbfSeconds, 170 * 60);
    assert.equal(reliability.complete, true);

    // Losses in money: 600 s at a 6 s ideal cycle = 100 parts at 2.50.
    await ok("supervisor", "POST", "/production/product-values", { product: "Bracket", currency: "EUR", unitValue: 2.5, scrapCost: 4, reference: "x" }, 403);
    await ok("admin", "POST", "/production/product-values", { product: "Bracket", currency: "EUR", unitValue: 2.5, scrapCost: 4, reference: "Controlling 2026" }, 201);
    const [value] = await ok("viewer", "GET", `/production/shifts/${shift.id}/loss-value`);
    assert.equal(value.currency, "EUR");
    assert.equal(value.lines.find((l) => l.reason === "Jam at infeed").value, 250);

    // Hour-by-hour board: 600 parts planned per hour; no counter signal, so actuals stay unknown.
    const board = await ok("viewer", "GET", `/production/shifts/${shift.id}/hourly`);
    assert.deepEqual(board.hours.map((h) => h.planned), [600, 600, 600]);
    assert.equal(board.hours[1].largestLoss.reason, "Jam at infeed");
    assert.ok(board.hours.every((h) => h.cumulativeGood === null), "Unknown counts are not zero");

    // First-pass yield on the shift's inspections.
    const inspections = `/production/shifts/${shift.id}/inspections`;
    const id = () => crypto.randomUUID();
    await ok("operator", "POST", inspections, { requestId: id(), product: "Bracket", check: "Burr", result: "pass", quantity: 9, note: "" }, 201);
    await ok("operator", "POST", inspections, { requestId: id(), product: "Bracket", check: "Burr", result: "fail", quantity: 1, defectReason: "Edge", note: "" }, 201);
    assert.equal((await ok("viewer", "GET", inspections)).summary.checks[0].firstPassYield, 0.9);

    // Teams destination: alarm events only, delivered as an Adaptive Card.
    const url = `http://127.0.0.1:${receiver.address().port}/teams`;
    await ok("admin", "POST", "/webhooks", { name: "Teams", format: "teams", url, events: ["cmms.handoff"] }, 400);
    const teams = await ok("admin", "POST", "/webhooks", { name: "Teams", format: "teams", url, events: ["alarm.triggered"] }, 201);
    await ok("admin", "POST", `/webhooks/${teams.id}/test`);
    assert.equal(received.at(-1).attachments[0].contentType, "application/vnd.microsoft.card.adaptive");

    // Browser: the admin sees the reason list, money, hourly board and reliability panel.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/production?shift=${shift.id}`);
    await expect(page.getByText("Downtime reason list")).toBeVisible();
    await expect(page.getByText("Losses in money")).toBeVisible();
    await expect(page.getByRole("table", { name: "Hour-by-hour plan and actual" })).toBeVisible();
    await expect(page.getByText(/Jam at infeed: .*250/)).toBeVisible();
    const operations = await actors.supervisor.newPage();
    await operations.goto(`${frontend}/operations`);
    await operations.getByLabel("Machine").click();
    await operations.getByRole("option", { name: "Insight press" }).click();
    await operations.getByLabel(/Work area/).click();
    await operations.getByRole("option", { name: "Maintenance" }).click();
    await operations.getByRole("tab", { name: "Reliability" }).click();
    await expect(operations.getByText("Reliability (MTBF / MTTR)")).toBeVisible();
    console.log(
      "PASS: reason catalog, MTBF/MTTR, first-pass yield, losses in money, Teams alarm card and hour-by-hour board (API and browser)",
    );
  });
} finally {
  receiver.close();
}
