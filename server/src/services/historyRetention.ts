import type { PoolClient } from "pg";
import type { ProductionProfile } from "@performance-dashboard/shared";
import manager from "../database/dbConnection.js";
import { ValidationError } from "../utils/errors.js";
import { rollupRemoved } from "./historyRollup.js";
import { auditLogService } from "./auditLogService.js";
// Shift source evidence is retained regardless of age. Deletion never activates itself.
// On an edge, readings the central installation has not yet confirmed are kept (H08).
export const eligible = `d.machine_id=$1 AND d.timestamp < $2 AND d.id <= $3
  AND d.correction_revision=0
  AND NOT EXISTS (SELECT 1 FROM edge_link l WHERE d.id > l.cursor)
  AND (d.received_at IS NULL OR d.received_at < now()-interval '24 hours')
  AND NOT EXISTS (SELECT 1 FROM batches b WHERE b.machine_id=d.machine_id AND d.timestamp>=b.started_at AND (b.completed_at IS NULL OR d.timestamp<b.completed_at))
  AND NOT EXISTS
  (SELECT 1 FROM production_shifts s WHERE s.machine_id=d.machine_id AND d.timestamp >= s.start - interval '1 hour' AND d.timestamp <= s.end)
  AND NOT EXISTS (SELECT 1 FROM maintenance_plans p WHERE p.machine_id=d.machine_id AND p.config->>'active'='true'
    AND d.timestamp >= coalesce((SELECT max(e.created_at) FROM maintenance_events e WHERE e.plan_id=p.id AND e.serviced),p.created_at)-interval '5 minutes')`;
export async function applyRetention(
  machineId: number,
  previewId: string,
  confirmRows: number,
  userId: number,
) {
  const connection = await manager.pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL statement_timeout='30s'");
    const actor = await connection.query(
      "SELECT id FROM users WHERE id=$1 AND role='admin' AND is_active=true FOR SHARE",
      [userId],
    );
    if (!actor.rowCount)
      throw new ValidationError(
        "Retention reviewer no longer has administrator access",
      );
    const preview = (
      await connection.query(
        "SELECT * FROM retention_previews WHERE id=$1 AND machine_id=$2 FOR UPDATE",
        [previewId, machineId],
      )
    ).rows[0];
    const policy = (
      await connection.query(
        "SELECT * FROM retention_policies WHERE machine_id=$1 FOR UPDATE",
        [machineId],
      )
    ).rows[0];
    if (
      !preview ||
      preview.created_by !== userId ||
      preview.rows !== confirmRows ||
      preview.policy_version !== policy?.version ||
      Date.now() - new Date(preview.created_at).getTime() > 3600000
    )
      throw new ValidationError(
        "Preview expired or changed; create and review a new preview",
      );
    if (!preview.completed) {
      // Same lock as planning prevents a shift being added while its evidence is removed.
      await connection.query("SELECT pg_advisory_xact_lock($1::integer)", [
        preview.machine_id,
      ]);
      const candidates = (
        await connection.query(
          // Text keeps microseconds that a JavaScript Date would drop.
          `SELECT d.timestamp::text AS timestamp,d.id FROM opcua_data d WHERE ${eligible}
            AND EXISTS(SELECT 1 FROM retention_preview_rows r WHERE r.preview_id=$4 AND r.measurement_id=d.id AND r.timestamp=d.timestamp)
            ORDER BY d.timestamp,d.id LIMIT 5000 FOR UPDATE`,
          [preview.machine_id, preview.cutoff, preview.max_id, preview.id],
        )
      ).rows;
      const batch: [string[], number[]] = [
        candidates.map((c) => c.timestamp),
        candidates.map((c) => c.id),
      ];
      await keepStateAndCounterRollups(connection, batch);
      const deleted = await connection.query(
        `WITH candidates AS (SELECT * FROM unnest($1::timestamptz[],$2::int[]) AS c(timestamp,id)),
        removed AS (DELETE FROM opcua_data d USING candidates c WHERE d.timestamp=c.timestamp AND d.id=c.id RETURNING d.*),
        summarized AS (INSERT INTO history_summaries(machine_id,node_key,bucket,samples,good,sum,min,max,identity)
          SELECT machine_id,node_key,date_trunc('hour',timestamp,'UTC'),count(*),count(*) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),
          sum(value::double precision) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),min(value) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),max(value) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),
          CASE WHEN count(signal_metadata)=0 THEN 'unknown' WHEN count(signal_metadata)<count(*) OR min(md5(signal_metadata::text))<>max(md5(signal_metadata::text)) THEN 'mixed' ELSE min(md5(signal_metadata::text)) END
          FROM removed GROUP BY 1,2,3 ON CONFLICT(machine_id,node_key,bucket) DO UPDATE SET
          samples=history_summaries.samples+excluded.samples,good=history_summaries.good+excluded.good,
          sum=CASE WHEN history_summaries.good+excluded.good>0 THEN coalesce(history_summaries.sum,0)+coalesce(excluded.sum,0) ELSE NULL END,min=least(history_summaries.min,excluded.min),max=greatest(history_summaries.max,excluded.max),
          identity=CASE WHEN history_summaries.identity=excluded.identity THEN excluded.identity ELSE 'mixed' END RETURNING 1)
        SELECT count(*)::int AS count FROM removed`,
        batch,
      );
      const count = deleted.rows[0].count;
      preview.deleted += count;
      preview.completed = count < 5000;
      await connection.query(
        "UPDATE retention_previews SET deleted=$2,completed=$3 WHERE id=$1",
        [preview.id, preview.deleted, preview.completed],
      );
      if (preview.completed)
        await connection.query(
          "DELETE FROM retention_preview_rows WHERE preview_id=$1",
          [preview.id],
        );
    }
    await connection.query("COMMIT");
    return preview;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}
/**
 * Before readings go, keep what an hourly average cannot: state seconds and counter
 * increments of commissioned production signals, from each reading and the next one.
 */
async function keepStateAndCounterRollups(
  connection: PoolClient,
  [timestamps, ids]: [string[], number[]],
) {
  if (!ids.length) return;
  const rows = (
    await connection.query(
      `SELECT d.machine_id,d.node_key,d.timestamp,d.value,d.status_code,p.profile,
         n.timestamp AS next_timestamp,n.value AS next_value,n.status_code AS next_status
       FROM unnest($1::timestamptz[],$2::int[]) AS c(timestamp,id)
       JOIN opcua_data d ON d.timestamp=c.timestamp AND d.id=c.id
       JOIN LATERAL (SELECT profile FROM machine_profiles mp WHERE mp.machine_id=d.machine_id AND mp.created_at<=d.timestamp
         ORDER BY mp.created_at DESC,mp.id DESC LIMIT 1) p ON true
       LEFT JOIN LATERAL (SELECT timestamp,value,status_code FROM opcua_data n WHERE n.machine_id=d.machine_id AND n.node_key=d.node_key
         AND (n.timestamp,n.id)>(d.timestamp,d.id) ORDER BY n.timestamp,n.id LIMIT 1) n ON true
       WHERE d.node_key IN (p.profile->'signals'->'state'->>'nodeKey',p.profile->'signals'->'total'->>'nodeKey',
         p.profile->'signals'->'good'->>'nodeKey',p.profile->'signals'->'reject'->>'nodeKey')`,
      [timestamps, ids],
    )
  ).rows;
  const { states, counters } = rollupRemoved(
    rows.map((r) => ({
      machineId: r.machine_id,
      nodeKey: r.node_key,
      ts: r.timestamp,
      value: r.value,
      statusCode: r.status_code,
      next: r.next_timestamp
        ? {
            ts: r.next_timestamp,
            value: r.next_value,
            statusCode: r.next_status,
          }
        : null,
      profile: r.profile as ProductionProfile,
    })),
  );
  for (const s of states)
    await connection.query(
      `INSERT INTO history_state_seconds(machine_id,node_key,bucket,state,seconds) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(machine_id,node_key,bucket,state) DO UPDATE SET seconds=history_state_seconds.seconds+excluded.seconds`,
      [s.machineId, s.nodeKey, s.bucket, s.state, s.seconds],
    );
  for (const c of counters)
    await connection.query(
      `INSERT INTO history_counter_increments(machine_id,node_key,bucket,increment,pairs,unknown_pairs) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(machine_id,node_key,bucket) DO UPDATE SET increment=history_counter_increments.increment+excluded.increment,
       pairs=history_counter_increments.pairs+excluded.pairs,unknown_pairs=history_counter_increments.unknown_pairs+excluded.unknown_pairs`,
      [c.machineId, c.nodeKey, c.bucket, c.increment, c.pairs, c.unknownPairs],
    );
}

export async function runRetentionSchedules() {
  await manager.pool.query(
    "DELETE FROM retention_preview_rows r USING retention_previews p WHERE r.preview_id=p.id AND p.created_at<now()-interval '1 hour'",
  );
  const jobs = (
    await manager.pool.query(
      "SELECT * FROM retention_schedules WHERE status='scheduled' AND run_at<=now() ORDER BY id LIMIT 5",
    )
  ).rows;
  for (const job of jobs) {
    try {
      const result = await applyRetention(
        job.machine_id,
        job.preview_id,
        job.confirm_rows,
        job.created_by,
      );
      // The scheduler acts for the administrator who scheduled the reviewed preview.
      await auditLogService.recordEvent({
        action: "retention.applied",
        entityType: "machine",
        entityId: job.machine_id,
        message: `Scheduled removal ${job.id} removed ${result.deleted} of ${result.rows} reviewed measurements`,
        metadata: {
          scheduleId: job.id,
          previewId: job.preview_id,
          scheduledBy: job.created_by,
          deleted: result.deleted,
          completed: result.completed,
        },
      });
      if (result.completed)
        await manager.pool.query(
          "UPDATE retention_schedules SET status='completed' WHERE id=$1",
          [job.id],
        );
    } catch (error) {
      await manager.pool.query(
        "UPDATE retention_schedules SET status='failed',error=$2 WHERE id=$1",
        [job.id, error instanceof Error ? error.message : "Retention failed"],
      );
    }
  }
}
