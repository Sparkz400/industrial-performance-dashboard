import manager from "../database/dbConnection.js";
import { ValidationError } from "../utils/errors.js";
// Shift source evidence is retained regardless of age. Deletion never activates itself.
export const eligible = `d.machine_id=$1 AND d.timestamp < $2 AND d.id <= $3
  AND (d.received_at IS NULL OR d.received_at < now()-interval '24 hours')
  AND NOT EXISTS (SELECT 1 FROM batches b WHERE b.machine_id=d.machine_id AND d.timestamp>=b.started_at AND (b.completed_at IS NULL OR d.timestamp<b.completed_at))
  AND NOT EXISTS
  (SELECT 1 FROM production_shifts s WHERE s.machine_id=d.machine_id AND d.timestamp >= s.start - interval '5 minutes' AND d.timestamp <= s.end)
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
      "SELECT id FROM users WHERE id=$1 AND role='admin' FOR SHARE",
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
      const deleted = await connection.query(
        `WITH candidates AS (SELECT d.timestamp,d.id FROM opcua_data d WHERE ${eligible}
            AND EXISTS(SELECT 1 FROM retention_preview_rows r WHERE r.preview_id=$4 AND r.measurement_id=d.id AND r.timestamp=d.timestamp)
            ORDER BY d.timestamp,d.id LIMIT 5000 FOR UPDATE),
        removed AS (DELETE FROM opcua_data d USING candidates c WHERE d.timestamp=c.timestamp AND d.id=c.id RETURNING d.*),
        summarized AS (INSERT INTO history_summaries(machine_id,node_key,bucket,samples,good,sum,min,max,identity)
          SELECT machine_id,node_key,date_trunc('hour',timestamp,'UTC'),count(*),count(*) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),
          sum(value) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),min(value) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),max(value) FILTER(WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real,'Infinity'::real,'-Infinity'::real)),
          CASE WHEN count(signal_metadata)=0 THEN 'unknown' WHEN count(signal_metadata)<count(*) OR min(md5(signal_metadata::text))<>max(md5(signal_metadata::text)) THEN 'mixed' ELSE min(md5(signal_metadata::text)) END
          FROM removed GROUP BY 1,2,3 ON CONFLICT(machine_id,node_key,bucket) DO UPDATE SET
          samples=history_summaries.samples+excluded.samples,good=history_summaries.good+excluded.good,
          sum=CASE WHEN history_summaries.good+excluded.good>0 THEN coalesce(history_summaries.sum,0)+coalesce(excluded.sum,0) ELSE NULL END,min=least(history_summaries.min,excluded.min),max=greatest(history_summaries.max,excluded.max),
          identity=CASE WHEN history_summaries.identity=excluded.identity THEN excluded.identity ELSE 'mixed' END RETURNING 1)
        SELECT count(*)::int AS count FROM removed`,
        [preview.machine_id, preview.cutoff, preview.max_id, preview.id],
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
