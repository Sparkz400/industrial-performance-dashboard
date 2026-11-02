import assert from "node:assert/strict";
import pg from "pg";
import { dailyFixture } from "./daily-fixture.mjs";

await dailyFixture(async ({ pool }) => {
  const { accessScope } =
    await import("../server/dist/src/services/requestScope.js");
  const { PostgresRateLimitStore } =
    await import("../server/dist/src/middleware/postgresRateLimitStore.js");
  assert.deepEqual(
    (
      await pool.query(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0],
    { rolsuper: false, rolbypassrls: false },
  );
  const [a, b] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('A','opc.tcp://a:4840','127.0.0.1',false),('B','opc.tcp://b:4840','127.0.0.1',false) RETURNING id",
    )
  ).rows.map((row) => row.id);
  const scope = {
    userId: 1,
    role: "operator",
    machineIds: [a],
    dashboardIds: ["a"],
  };
  await pool.query(
    "INSERT INTO dashboards(id,name) VALUES ('a','A'),('b','B')",
  );
  const client = await pool.connect();
  try {
    await accessScope.run(scope, async () => {
      assert.deepEqual(
        (await client.query("SELECT id FROM machines ORDER BY id")).rows,
        [{ id: a }],
      );
      assert.deepEqual((await client.query("SELECT id FROM dashboards")).rows, [
        { id: "a" },
      ]);
      assert.equal(
        (
          await client.query("UPDATE machines SET name='stolen' WHERE id=$1", [
            b,
          ])
        ).rowCount,
        0,
      );
      await assert.rejects(
        client.query("UPDATE machines SET id=$1 WHERE id=$2", [b + 10, a]),
        /row-level security/,
      );
      await client.query("BEGIN");
      await assert.rejects(client.query("SELECT 1/0"), /division by zero/);
      await client.query("ROLLBACK");
      assert.equal((await client.query("SELECT id FROM machines")).rowCount, 1);
      await new Promise((resolve, reject) =>
        client.query("SELECT id FROM machines", (error, result) => {
          try {
            if (error) throw error;
            assert.equal(result.rowCount, 1);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        }),
      );
    });
    assert.equal((await client.query("SELECT id FROM machines")).rowCount, 2);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        accessScope.run({ ...scope, machineIds: [i % 2 ? a : b] }, async () => {
          assert.deepEqual(
            (await client.query("SELECT id FROM machines")).rows,
            [{ id: i % 2 ? a : b }],
          );
        }),
      ),
    );
  } finally {
    client.release();
  }
  // The same non-superuser database owner, without the server scope, sees nothing.
  const bare = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    await bare.connect();
    assert.equal((await bare.query("SELECT * FROM machines")).rowCount, 0);
    await assert.rejects(
      bare.query(
        "INSERT INTO machines(name,endpoint_url,ip) VALUES ('denied','opc.tcp://c:4840','127.0.0.1')",
      ),
      /row-level security/,
    );
  } finally {
    await bare.end();
  }
  const first = new PostgresRateLimitStore("test"),
    second = new PostgresRateLimitStore("test");
  for (const store of [first, second]) store.init({ windowMs: 60_000 });
  const hits = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? first : second).increment("shared"),
    ),
  );
  assert.deepEqual(
    hits.map((hit) => hit.totalHits).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  assert.equal(
    (await new PostgresRateLimitStore("test").increment("shared")).totalHits,
    21,
  );
  await first.decrement("shared");
  assert.equal((await second.increment("shared")).totalHits, 21);
  await pool.query(
    "UPDATE auth_rate_limits SET reset_at = now() - interval '1 second'",
  );
  assert.equal((await second.increment("shared")).totalHits, 1);
  await first.resetKey("shared");
  assert.equal((await second.increment("shared")).totalHits, 1);
  console.log(
    "PASS: owner-enforced RLS, denied cross-asset reads/writes, callback and concurrent connection scopes, rollback recovery, missing context denied, shared atomic rate limits and expiry",
  );
});
