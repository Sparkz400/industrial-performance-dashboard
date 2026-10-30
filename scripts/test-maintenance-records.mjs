import { selectOperation } from "./browser-navigation.mjs";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dailyFixture } from "./daily-fixture.mjs";

// M01: service records link the classified stop and trend window they concern and keep
// attachments whose content matches their type; downloads never render in the app.
await dailyFixture(async ({ pool, call, users, actors, api, frontend, expect }) => {
  const machines = (
    await pool.query(
      `INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES
       ('Service press','opc.tcp://127.0.0.1:49996','127.0.0.1',false),
       ('Other press','opc.tcp://127.0.0.1:49997','127.0.0.1',false) RETURNING id`,
    )
  ).rows.map((r) => r.id);
  const [machine, other] = machines;
  for (const role of ["supervisor", "operator", "viewer"])
    await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users[role].id, machine]);
  const profile = {
    version: 1,
    name: "Service profile",
    endpointModel: "fixture",
    signals: { state: { nodeKey: "State", namespaceUri: "urn:fixture", identifier: "s=State", dataType: "Double", unit: null, scale: 1 } },
    states: { running: [1], idle: [0], fault: [2], planned: [3] },
    idealCycleMs: 1000,
    maxGapSeconds: 60,
    counterPolicy: "reset-to-zero",
  };
  for (const id of machines)
    await pool.query("INSERT INTO machine_profiles(machine_id,profile,created_by) VALUES($1,$2,$3)", [id, profile, users.admin.id]);
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, "/api/v1" + path, body);
    assert.equal(r.status(), status, await r.text());
    return r.json();
  };
  // Fixture stops: a reason, its correction, and a stop on another machine.
  const shift = async (machineId, name) =>
    (
      await pool.query(
        `INSERT INTO production_shifts(machine_id,name,timezone,start,"end",profile,job,created_by)
         VALUES($1,$2,'UTC',now()-interval '6 hours',now()-interval '2 hours',$3,'{"reference":"J","product":"P","target":null}',$4) RETURNING id`,
        [machineId, name, profile, users.admin.id],
      )
    ).rows[0].id;
  const serviceShift = await shift(machine, "Service shift");
  const otherShift = await shift(other, "Other shift");
  const stop = async (shiftId, reason, supersedesId = null) =>
    (
      await pool.query(
        `INSERT INTO downtime_reasons(shift_id,start,"end",category,reason,actor_id,supersedes_id)
         VALUES($1,now()-interval '5 hours',now()-interval '4 hours','unplanned',$2,$3,$4) RETURNING id`,
        [shiftId, reason, users.operator.id, supersedesId],
      )
    ).rows[0].id;
  const original = await stop(serviceShift, "Belt slipped");
  const corrected = await stop(serviceShift, "Belt worn", original);
  const foreign = await stop(otherShift, "Other jam");

  const plan = await ok("supervisor", "POST", `/maintenance/machines/${machine}`, {
    config: { name: "Belt service", days: 7, runtimeHours: null, cycles: null, checks: ["Belt tension"], active: true },
  }, 201);
  const stops = await ok("viewer", "GET", `/maintenance/machines/${machine}/stops`);
  assert.deepEqual(stops.map((s) => s.id), [corrected], "Only current stops are offered");

  const trend = { start: new Date(Date.now() - 6 * 3600000).toISOString(), end: new Date(Date.now() - 2 * 3600000).toISOString(), keys: ["State"] };
  const event = (body, status = 201, version = plan.version) =>
    ok("operator", "POST", `/maintenance/plans/${plan.id}/events`, {
      requestId: randomUUID(),
      version,
      serviced: false,
      checks: { "Belt tension": false },
      note: "Belt glazed",
      ...body,
    }, status);
  await event({ stopId: original }, 400);
  await event({ stopId: foreign }, 400);
  await event({ trend: { ...trend, start: new Date(Date.now() - 9 * 86400000).toISOString() } }, 400);
  const requestId = randomUUID();
  const record = await event({ requestId, stopId: corrected, trend });
  assert.equal((await event({ requestId, stopId: corrected, trend }, 201, plan.version)).id, record.id, "A retry records nothing new");
  await event({ requestId, stopId: corrected, trend: { ...trend, keys: ["Count"] } }, 409);

  // Attachments: raw uploads whose content must match the declared type.
  const upload = async (role, content, type, name, status = 201, path = `/maintenance/plans/${plan.id}/events/${record.id}/attachments`) => {
    const request = actors[role].request;
    const { csrfToken } = await (await request.get(api + "/api/v1/csrf-token")).json();
    const response = await request.fetch(api + "/api/v1" + path, {
      method: "POST",
      data: content,
      headers: { "content-type": type, "x-filename": encodeURIComponent(name), "x-csrf-token": csrfToken },
    });
    assert.equal(response.status(), status, await response.text());
    return response.json();
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const photo = await upload("operator", png, "image/png", "belt/../photo.png");
  assert.equal(photo.filename, "belt_.._photo.png", "Path separators cannot reach a download name");
  assert.equal(photo.sha256, createHash("sha256").update(png).digest("hex"));
  await upload("operator", Buffer.from("not an image"), "image/png", "fake.png", 400);
  await upload("operator", Buffer.from("<script>alert(1)</script>"), "text/html", "page.html", 400);
  await upload("operator", Buffer.from("anything"), "constructor", "proto.txt", 400); // not an Object.prototype method
  await upload("operator", Buffer.alloc(5 * 1024 * 1024 + 1, 65), "text/plain", "big.txt", 413);
  await upload("viewer", Buffer.from("view"), "text/plain", "view.txt", 403);
  await upload("operator", Buffer.from("x"), "text/plain", "x.txt", 404, `/maintenance/plans/${plan.id}/events/${record.id + 999}/attachments`);
  for (let i = 0; i < 9; i++) await upload("operator", Buffer.from(`Reading ${i}`), "text/plain", `note-${i}.txt`);
  await upload("operator", Buffer.from("eleventh"), "text/plain", "eleventh.txt", 400);

  const download = await actors.viewer.request.get(api + `/api/v1/maintenance/plans/${plan.id}/events/${record.id}/attachments/${photo.id}`);
  assert.equal(download.status(), 200);
  assert.deepEqual(Buffer.from(await download.body()), png);
  assert.match(download.headers()["content-disposition"], /^attachment; filename\*=UTF-8''belt_.._photo.png$/);
  assert.equal(download.headers()["x-content-type-options"], "nosniff");
  assert.equal(download.headers()["content-security-policy"], "sandbox");
  const outsider = await call("wallboard", "GET", `/api/v1/maintenance/plans/${plan.id}/events/${record.id}/attachments/${photo.id}`);
  assert.equal(outsider.status(), 403, "An ungranted account cannot read attachments");

  const [listed] = (await ok("viewer", "GET", `/maintenance/machines/${machine}`))[0].events;
  assert.equal(listed.stop.reason, "Belt worn");
  assert.deepEqual(listed.trendKeys, ["State"]);
  assert.equal(listed.attachments.length, 10);
  assert.equal(listed.attachments[0].data, undefined, "Listings carry metadata, not file contents");

  // In the browser: the links open the stop's shift and a prefilled replay; a file is attached.
  await pool.query("DELETE FROM maintenance_attachments WHERE event_id=$1 AND filename LIKE 'note-%'", [record.id]);
  const page = await actors.operator.newPage();
  const openMaintenance = async (remembered = false) => {
    await page.goto(`${frontend}/operations`);
    const picker = page.getByRole("combobox", { name: "Machine", exact: true });
    // A revisit restores the machine once the list loads; typing before that would be reset.
    if (remembered) await expect(picker).toHaveValue("Service press");
    else {
      await picker.fill("Service");
      await page.getByRole("option", { name: "Service press", exact: true }).click();
    }
    await selectOperation(page, "Maintenance");
  };
  await openMaintenance();
  await expect(page.getByRole("button", { name: "belt_.._photo.png" })).toBeVisible();
  const fileName = ".local/daily-evidence/service-reading.txt";
  await writeFile(fileName, "Tension 38 N after adjustment\n");
  await page.getByText("Attach photo, PDF or text").locator("input").setInputFiles(fileName);
  await expect(page.getByRole("button", { name: "service-reading.txt" })).toBeVisible();
  await page.screenshot({ path: ".local/daily-evidence/maintenance-record.png", fullPage: true });
  await page.getByRole("link", { name: "Belt worn · Service shift" }).click();
  await expect(page).toHaveURL(new RegExp(`/production\\?shift=${serviceShift}$`));
  await expect(page.getByText("Belt worn").first()).toBeVisible();
  await openMaintenance(true);
  await page.getByRole("link", { name: "State", exact: true }).click();
  await expect(page.getByLabel("Signal keys (comma separated, up to 8)")).toHaveValue("State");
  await expect(page.getByLabel("Replay start (ISO with offset)")).toHaveValue(trend.start);
  await page.close();
  console.log(JSON.stringify({ maintenanceRecords: "passed", attachments: listed.attachments.length }));
});
