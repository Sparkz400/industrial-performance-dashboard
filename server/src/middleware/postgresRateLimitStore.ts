import { createHash } from "node:crypto";
import type { Options, Store } from "express-rate-limit";
import dbManager from "../database/dbConnection.js";

/** Database time and atomic upserts keep limits shared across processes and restarts. */
export class PostgresRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 900_000;
  private nextCleanup = 0;
  constructor(public prefix: string) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  private key(key: string) {
    return createHash("sha256").update(`${this.prefix}:${key}`).digest("hex");
  }
  async increment(key: string) {
    if (Date.now() >= this.nextCleanup) {
      this.nextCleanup = Date.now() + 60_000;
      await dbManager.pool.query(`DELETE FROM auth_rate_limits WHERE key IN
        (SELECT key FROM auth_rate_limits WHERE reset_at <= now() LIMIT 1000)`);
    }
    const { rows } = await dbManager.pool.query(
      `INSERT INTO auth_rate_limits (key, hits, reset_at)
       VALUES ($1, 1, now() + $2 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN auth_rate_limits.reset_at <= now() THEN 1 ELSE auth_rate_limits.hits + 1 END,
         reset_at = CASE WHEN auth_rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE auth_rate_limits.reset_at END
       RETURNING hits, reset_at`,
      [this.key(key), this.windowMs],
    );
    return { totalHits: rows[0].hits, resetTime: rows[0].reset_at };
  }
  async decrement(key: string) {
    await dbManager.pool.query(
      "UPDATE auth_rate_limits SET hits = greatest(0, hits - 1) WHERE key = $1 AND reset_at > now()",
      [this.key(key)],
    );
  }
  async resetKey(key: string) {
    await dbManager.pool.query("DELETE FROM auth_rate_limits WHERE key = $1", [
      this.key(key),
    ]);
  }
}
