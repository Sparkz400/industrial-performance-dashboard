import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { dailyFixture } from "./daily-fixture.mjs";

// E05: exports, deletions, retention and access changes leave audit records with their
// scope; refused requests leave none and a destination secret is shown only at creation.
await dailyFixture(async ({ pool, call, users }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Audit press','opc.tcp://127.0.0.1:49994','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [users.viewer.id, machine]);
  await pool.query(
    `INSERT INTO opcua_data(machine_id,node_key,timestamp,value,status_code)
     SELECT $1,'Pressure','2025-06-01T00:00:00Z'::timestamptz + i*interval '1 minute',i,'Good' FROM generate_series(0,9) i`,
    [machine],
  );
  // Records are written when a response closes, so wait briefly for each one.
  const audited = async (action, since) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { rows } = await pool.query(
        "SELECT * FROM audit_logs WHERE action=$1 AND id>$2 ORDER BY id",
        [action, since],
      );
      if (rows.length) return rows;
      await delay(50);
    }
    assert.fail(`No audit record for ${action}`);
  };
  const mark = async () =>
    (await pool.query("SELECT coalesce(max(id),0)::int AS id FROM audit_logs")).rows[0].id;
  const ok = async (role, method, path, body, status = 200) => {
    const r = await call(role, method, path, body);
    assert.equal(r.status(), status, await r.text());
    return r.headers()["content-type"]?.includes("json") ? r.json() : r.text();
  };

  // Failed sign-ins name a known account but never store an unknown name.
  let since = await mark();
  await ok("viewer", "POST", "/api/v1/auth/login", { username: "viewer", password: "not-the-password" }, 401);
  await ok("viewer", "POST", "/api/v1/auth/login", { username: "Secret-typed-here", password: "x" }, 401);
  // Sign-in failures are recorded before the response, so both rows exist now.
  const failures = (
    await pool.query("SELECT * FROM audit_logs WHERE action='auth.login.failed' AND id>$1 ORDER BY id", [since])
  ).rows;
  assert.deepEqual(
    failures.map((r) => [r.entity_name, r.message]),
    [
      ["viewer", "Failed sign-in: wrong password"],
      [null, "Failed sign-in: unknown account"],
    ],
  );
  assert.ok(!JSON.stringify(failures).includes("Secret-typed-here"), "An unknown name is not kept");

  // Export: who, which machine, and whether the download completed.
  since = await mark();
  const csv = await ok(
    "viewer",
    "GET",
    `/api/v1/trending/export-csv?machineId=${machine}&nodeKeys=Pressure&startDate=2025-06-01T00:00:00Z&endDate=2025-06-02T00:00:00Z`,
  );
  assert.match(csv, /Pressure/);
  const [exported] = await audited("export.trending_csv", since);
  assert.equal(exported.user_id, users.viewer.id);
  assert.equal(exported.entity_id, String(machine));
  assert.equal(exported.metadata.completed, true);

  // Retention: policy, reviewed preview and the removal with its count.
  since = await mark();
  await ok("admin", "PUT", `/api/v1/history/${machine}/policy`, { days: 30 });
  const preview = await ok("admin", "POST", `/api/v1/history/${machine}/preview`, undefined, 201);
  assert.equal(preview.rows, 10);
  await ok("admin", "POST", `/api/v1/history/${machine}/apply`, { previewId: preview.id, confirmRows: 10 });
  await audited("retention.policy.saved", since);
  await audited("retention.preview.created", since);
  const [applied] = await audited("retention.applied", since);
  assert.equal(applied.metadata.deleted, 10);
  assert.equal(applied.metadata.previewId, preview.id);

  // Deletion: a refused request leaves no record, an accepted one does.
  const profile = await ok(
    "admin",
    "POST",
    "/api/v1/spc/profiles",
    { name: "Audit profile", machineId: machine, nodeKey: "Pressure", method: "std_bands" },
    201,
  );
  since = await mark();
  await ok("viewer", "DELETE", `/api/v1/spc/profiles/${profile.id}`, undefined, 403);
  await ok("admin", "DELETE", `/api/v1/spc/profiles/${profile.id}`);
  const deleted = await audited("spc_profile.deleted", since);
  assert.deepEqual(deleted.map((r) => [r.entity_id, r.user_id]), [[String(profile.id), users.admin.id]]);

  // Outbound destinations: changes are audited and only creation reveals the secret.
  since = await mark();
  const destination = await ok(
    "admin",
    "POST",
    "/api/v1/webhooks",
    { name: "Audit mail", kind: "email", recipients: ["ops@example.com"], events: ["alarm.triggered"] },
    201,
  );
  assert.ok(destination.secret.length > 13);
  const renamed = await ok("admin", "PUT", `/api/v1/webhooks/${destination.id}`, { recipients: ["shift@example.com"] });
  assert.equal(renamed.secret, destination.secret.substring(0, 10) + "...");
  await ok("admin", "DELETE", `/api/v1/webhooks/${destination.id}`);
  for (const action of ["webhook.created", "webhook.updated", "webhook.deleted"]) await audited(action, since);

  // Access review: grant and account changes keep the previous values.
  since = await mark();
  await ok("admin", "PUT", `/api/v1/access/users/${users.viewer.id}`, { machineIds: [], plantIds: [] });
  const [access] = await audited("access.updated", since);
  assert.deepEqual(access.metadata.previous, { machineIds: [machine], plantIds: [] });
  await ok("admin", "PUT", `/api/v1/auth/users/${users.viewer.id}`, { email: "viewer.new@example.com" });
  const [account] = await audited("user.updated", since);
  assert.deepEqual(account.metadata.changes, {
    email: { from: "viewer@example.invalid", to: "viewer.new@example.com" },
  });
  console.log(JSON.stringify({ dataOwnership: "passed" }));
});
