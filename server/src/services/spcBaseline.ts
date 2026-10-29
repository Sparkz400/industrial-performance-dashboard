import { createHash } from "node:crypto";
import manager from "../database/dbConnection.js";
import { westernElectricRules } from "./spcEvaluator.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";

export function baselineStatistics(values: number[]) {
  if (values.length < 2 || values.some((v) => !Number.isFinite(v)))
    throw new ValidationError("At least two finite readings are required");
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stddev = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1),
  );
  const violations = values.flatMap((_, i) =>
    westernElectricRules(
      values.slice(Math.max(0, i - 7), i + 1),
      mean,
      stddev,
    ).triggeredRules.map((rule) => ({ index: i, rule })),
  );
  return { mean, stddev, sampleCount: values.length, violations };
}
export function capability(
  mean: number,
  stddev: number,
  lsl: number,
  usl: number,
) {
  if (
    ![mean, stddev, lsl, usl].every(Number.isFinite) ||
    stddev <= 0 ||
    usl <= lsl
  )
    throw new ValidationError(
      "Finite limits and positive variation are required",
    );
  return {
    cp: (usl - lsl) / (6 * stddev),
    cpk: Math.min(usl - mean, mean - lsl) / (3 * stddev),
  };
}
export async function proposeBaseline(
  profileId: number,
  range?: { start: string; end: string },
) {
  const c = await manager.pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const profile = (
      await c.query("SELECT * FROM spc_profiles WHERE id=$1", [profileId])
    ).rows[0];
    if (!profile) throw new NotFoundError("SPC profile");
    const end = range ? new Date(range.end) : new Date(),
      start = range
        ? new Date(range.start)
        : new Date(end.getTime() - 7 * 86400000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() > Date.now() ||
      end.getTime() - start.getTime() > 7 * 86400000
    )
      throw new ValidationError(
        "Choose a past reference window of at most seven days",
      );
    const rows = (
      await c.query(
        `SELECT timestamp,value,status_code,event_id FROM opcua_data WHERE machine_id IS NOT DISTINCT FROM $1
      AND node_key=$2 AND timestamp >= $3 AND timestamp < $4 ORDER BY timestamp,id LIMIT 10001`,
        [profile.machine_id, profile.node_key, start, end],
      )
    ).rows;
    if (rows.length > 10000)
      throw new ValidationError(
        "Baseline exceeds 10,000 readings; use a dedicated sampled reference tag",
      );
    const good = rows.filter(
      (r) =>
        r.status_code?.startsWith("Good") &&
        r.value != null &&
        Number.isFinite(Number(r.value)),
    );
    const stats = baselineStatistics(good.map((r) => Number(r.value)));
    // Process context of the window: a baseline must not silently learn from a fault.
    const overlap = [profile.machine_id, start, end];
    const [{ alarms }] = (
      await c.query(
        "SELECT count(*)::int AS alarms FROM alert_history WHERE machine_id IS NOT DISTINCT FROM $1 AND created_at < $3 AND (resolved_at IS NULL OR resolved_at > $2)",
        overlap,
      )
    ).rows;
    const [{ stops }] = (
      await c.query(
        'SELECT count(*)::int AS stops FROM downtime_reasons d JOIN production_shifts s ON s.id=d.shift_id WHERE s.machine_id=$1 AND d.start < $3 AND d."end" > $2',
        overlap,
      )
    ).rows;
    const products = new Set<string>();
    for (const shift of (
      await c.query(
        'SELECT job, runs FROM production_shifts WHERE machine_id=$1 AND start < $3 AND "end" > $2',
        overlap,
      )
    ).rows) {
      if (shift.job?.product) products.add(shift.job.product);
      for (const run of shift.runs ?? [])
        if (run.start < end.toISOString() && run.end > start.toISOString())
          products.add(run.product);
    }
    const evidence = {
      ...stats,
      context: { alarms, stops, products: [...products].sort() },
      excludedCount: rows.length - good.length,
      start: start.toISOString(),
      end: end.toISOString(),
      samples: rows,
      digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      profile: {
        machineId: profile.machine_id,
        nodeKey: profile.node_key,
        sensitivity: profile.sensitivity,
        method: profile.method,
        windowSize: profile.window_size,
      },
    };
    const saved = (
      await c.query(
        "INSERT INTO spc_baselines(profile_id,evidence) VALUES($1,$2) RETURNING *",
        [profileId, evidence],
      )
    ).rows[0];
    await c.query("COMMIT");
    return {
      ...saved,
      ...stats,
      status: "pending-review",
      ucl: stats.mean + 3 * stats.stddev,
      lcl: stats.mean - 3 * stats.stddev,
    };
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
export async function approveBaseline(
  id: number,
  userId: number,
  review: string,
) {
  const c = await manager.pool.connect();
  try {
    await c.query("BEGIN");
    const reference = (
      await c.query("SELECT profile_id FROM spc_baselines WHERE id=$1", [id])
    ).rows[0];
    if (!reference) throw new NotFoundError("Baseline");
    // Lock the shared profile before any baseline so concurrent approvals cannot deadlock.
    const p = (
      await c.query("SELECT * FROM spc_profiles WHERE id=$1 FOR UPDATE", [
        reference.profile_id,
      ])
    ).rows[0];
    const b = (
      await c.query("SELECT * FROM spc_baselines WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!b) throw new NotFoundError("Baseline");
    const e = b.evidence;
    if (b.approved_at) throw new ConflictError("Baseline is already approved");
    if (
      !p ||
      p.machine_id !== e.profile.machineId ||
      p.node_key !== e.profile.nodeKey ||
      p.method !== e.profile.method ||
      p.window_size !== e.profile.windowSize ||
      p.sensitivity !== e.profile.sensitivity
    )
      throw new ConflictError("Profile changed; compute a new baseline");
    if (!e.context)
      throw new ConflictError(
        "This candidate predates fault-period checks; compute a new baseline",
      );
    if (e.context.alarms || e.context.stops)
      throw new ValidationError(
        `The reference window overlaps ${e.context.alarms} alarms and ${e.context.stops} classified stops; choose a fault-free window`,
      );
    if (
      e.sampleCount < 100 ||
      e.excludedCount ||
      e.stddev <= 0 ||
      e.violations.length
    )
      throw new ValidationError(
        "Approval requires 100 or more valid readings, positive variation and no Western Electric signals",
      );
    await c.query(
      "UPDATE spc_baselines SET superseded=true WHERE profile_id=$1 AND approved_at IS NOT NULL",
      [b.profile_id],
    );
    await c.query(
      "UPDATE spc_profiles SET mean=$2,stddev=$3,lcl=$4,ucl=$5,sensitivity=3,last_computed_at=now(),updated_at=now() WHERE id=$1",
      [
        b.profile_id,
        e.mean,
        e.stddev,
        e.mean - 3 * e.stddev,
        e.mean + 3 * e.stddev,
      ],
    );
    const saved = (
      await c.query(
        "UPDATE spc_baselines SET approved_by=$2,approved_at=now(),review=$3 WHERE id=$1 RETURNING *",
        [id, userId, review],
      )
    ).rows[0];
    await c.query("COMMIT");
    return saved;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}
export async function baselineCapability(
  profileId: number,
  lsl: number,
  usl: number,
) {
  const b = (
    await manager.pool.query(
      `SELECT b.* FROM spc_baselines b JOIN spc_profiles p ON p.id=b.profile_id
    WHERE b.profile_id=$1 AND b.approved_at IS NOT NULL AND NOT b.superseded
    AND p.updated_at=b.approved_at ORDER BY b.id DESC LIMIT 1`,
      [profileId],
    )
  ).rows[0];
  if (!b)
    throw new ValidationError(
      "Capability requires a reviewed stable baseline for the unchanged profile",
    );
  return {
    ...capability(b.evidence.mean, b.evidence.stddev, lsl, usl),
    baselineId: b.id,
    digest: b.evidence.digest,
    sampleCount: b.evidence.sampleCount,
    review: b.review,
    scope:
      "Approved reference period only; current process stability is not implied",
    assumptions:
      "Independent, approximately normal observations reviewed by approver",
  };
}
