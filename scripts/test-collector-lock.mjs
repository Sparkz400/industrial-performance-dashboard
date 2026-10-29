import assert from "node:assert/strict";
import pg from "pg";
import { dailyFixture } from "./daily-fixture.mjs";

// D08 guard: one collector per database, surviving outages of its own lock session.
await dailyFixture(async ({ expect }) => {
  const { acquireCollectorLock, releaseCollectorLock, COLLECTOR_LOCK_KEY } =
    await import("../server/dist/src/services/collectorLock.js");
  const other = new pg.Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await other.connect();
  const take = async () =>
    (await other.query("SELECT pg_try_advisory_lock($1) AS ok", [COLLECTOR_LOCK_KEY])).rows[0].ok;
  const holderPid = async () =>
    (
      await other.query(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND granted AND pid<>pg_backend_pid()",
        [COLLECTOR_LOCK_KEY],
      )
    ).rows[0]?.pid;
  let stopped = 0;
  const onTaken = () => stopped++;
  try {
    // Another collector holds the lock: this one must not start.
    assert.equal(await take(), true);
    assert.equal(await acquireCollectorLock(onTaken, 200), false);
    await other.query("SELECT pg_advisory_unlock($1)", [COLLECTOR_LOCK_KEY]);
    assert.equal(await acquireCollectorLock(onTaken, 200), true);
    assert.equal(await take(), false, "A second collector is refused");

    // The lock session drops (as in a database outage) and nobody else takes over: retaken.
    const first = await holderPid();
    await other.query("SELECT pg_terminate_backend($1)", [first]);
    await expect.poll(holderPid, { timeout: 10_000 }).not.toBe(undefined);
    assert.notEqual(await holderPid(), first);
    assert.equal(stopped, 0, "A retaken lock keeps collecting");

    // The session drops and another collector takes the lock first: collection stops.
    await other.query("SELECT pg_terminate_backend($1)", [await holderPid()]);
    await expect.poll(take, { timeout: 5_000 }).toBe(true);
    await expect.poll(() => stopped, { timeout: 10_000 }).toBe(1);
    await other.query("SELECT pg_advisory_unlock($1)", [COLLECTOR_LOCK_KEY]);
  } finally {
    await releaseCollectorLock().catch(() => {});
    await other.end();
  }
  console.log(JSON.stringify({ collectorLock: "passed" }));
});
