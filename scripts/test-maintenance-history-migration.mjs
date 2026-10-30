import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config({ path: "server/.env", quiet: true });
assert.equal(process.env.DB_PORT, "55432");
assert(["localhost", "127.0.0.1"].includes(process.env.DB_HOST));
const database = "pd_history_" + randomUUID().replaceAll("-", "");
const directory = await mkdtemp(join(tmpdir(), "pd-history-"));
const base = {
  host: process.env.DB_HOST,
  port: 55432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const admin = new pg.Client({ ...base, database: "postgres" });
let pool,
  created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  pool = new pg.Pool({ ...base, database });
  await cp("server/drizzle", directory, { recursive: true });
  const journalPath = join(directory, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((e) => e.idx < 40);
  await writeFile(journalPath, JSON.stringify(journal));
  await migrate(drizzle(pool), { migrationsFolder: directory });
  const user = (
    await pool.query(
      "INSERT INTO users(username,email,password_hash,role) VALUES('history','history@example.invalid','unused','admin') RETURNING id",
    )
  ).rows[0].id;
  const machine = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip) VALUES('Owned migration fixture','opc.tcp://127.0.0.1:49991','127.0.0.1') RETURNING id",
    )
  ).rows[0].id;
  const alarm = (
    await pool.query(
      "INSERT INTO alert_history(machine_id,message,severity) VALUES($1,'Owned fixture','medium') RETURNING id",
      [machine],
    )
  ).rows[0].id;
  const revisions = Array.from({ length: 100 }, (_, i) => ({
    previous: {
      version: i + 1,
      action: `Original ${i + 1}`,
      owner_id: user,
      due_at: "2030-01-01T00:00:00Z",
      customEvidence: { retained: true },
    },
    changedBy: user,
    changedAt: "2026-01-01T00:00:00Z",
    reason: `Original correction ${i + 1}`,
  }));
  const action = (
    await pool.query(
      "INSERT INTO maintenance_actions(machine_id,alarm_id,owner_id,escalation_owner_id,due_at,action,created_by,version,revisions) VALUES($1,$2,$3,$3,'2030-01-01','Preserve me',$3,101,$4) RETURNING *",
      [machine, alarm, user, JSON.stringify(revisions)],
    )
  ).rows[0];
  await migrate(drizzle(pool), { migrationsFolder: "server/drizzle" });
  await migrate(drizzle(pool), { migrationsFolder: "server/drizzle" });
  const retained = (
    await pool.query(
      "SELECT revision FROM maintenance_action_revisions WHERE action_id=$1 ORDER BY version",
      [action.id],
    )
  ).rows.map((r) => r.revision);
  assert.deepEqual(retained, revisions);
  delete action.revisions;
  assert.deepEqual(
    (
      await pool.query("SELECT * FROM maintenance_actions WHERE id=$1", [
        action.id,
      ])
    ).rows[0],
    action,
  );
  console.log(
    JSON.stringify({
      maintenanceHistoryMigration: "passed",
      preservedCorrections: retained.length,
      repeatedMigrationSafe: true,
    }),
  );
} finally {
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
