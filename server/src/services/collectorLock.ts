import type { PoolClient } from "pg";
import manager from "../database/dbConnection.js";
import logger from "../utils/logger.js";

// One collector per database: a second one would store every sample again under new event IDs.
export const COLLECTOR_LOCK_KEY = 0x50440001;

let holder: PoolClient | undefined;
let retry: ReturnType<typeof setInterval> | undefined;
let onTaken: () => void = () => {};
let retryMs = 5000;

async function tryLock(): Promise<boolean> {
  const client = await manager.pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [COLLECTOR_LOCK_KEY],
    );
    if (!rows[0].ok) {
      client.release();
      return false;
    }
  } catch (error) {
    client.release(true);
    throw error;
  }
  holder = client;
  watch(client);
  return true;
}

/** A dropped lock session (for example a database outage) must not stop collection into the spool. */
function watch(client: PoolClient) {
  client.on("error", (error) => {
    if (holder !== client) return;
    logger.warn(
      "[Collector] Lock session lost; retaking when the database returns",
      error,
    );
    holder = undefined;
    client.release(true);
    clearInterval(retry);
    retry = setInterval(() => {
      tryLock()
        .then((taken) => {
          clearInterval(retry);
          retry = undefined;
          if (taken) logger.info("[Collector] Lock retaken");
          else {
            logger.error(
              "[Collector] Another collector holds the lock; stopping collection",
            );
            onTaken();
          }
        })
        .catch(() => {
          // Database still unreachable: keep collecting into the spool and retry.
        });
    }, retryMs);
    retry.unref();
  });
}

/**
 * Takes the collector lock on a dedicated session. `taken` runs only when the lock was lost
 * and another collector holds it once the database is reachable again.
 */
/** Whether this process collects: only the lock holder connects to machines or ships history. */
export const holdsCollectorLock = () => holder !== undefined;

export async function acquireCollectorLock(
  taken: () => void,
  retryEveryMs = 5000,
): Promise<boolean> {
  onTaken = taken;
  retryMs = retryEveryMs;
  return holder ? true : tryLock();
}

export async function releaseCollectorLock(): Promise<void> {
  clearInterval(retry);
  retry = undefined;
  const client = holder;
  holder = undefined;
  if (!client) return;
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [COLLECTOR_LOCK_KEY]);
  } finally {
    client.release();
  }
}
