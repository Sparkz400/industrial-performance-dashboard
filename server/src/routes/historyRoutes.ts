import { Router } from "express";
import Joi from "joi";
import { randomUUID } from "node:crypto";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
// Shift source evidence is retained regardless of age. Deletion never activates itself.
const eligible = `d.machine_id=$1 AND d.timestamp < $2 AND d.id <= $3 AND NOT EXISTS
  (SELECT 1 FROM production_shifts s WHERE s.machine_id=d.machine_id AND d.timestamp >= s.start - interval '5 minutes' AND d.timestamp <= s.end)
  AND NOT EXISTS (SELECT 1 FROM maintenance_plans p WHERE p.machine_id=d.machine_id AND p.config->>'active'='true'
    AND d.timestamp >= coalesce((SELECT max(e.created_at) FROM maintenance_events e WHERE e.plan_id=p.id AND e.serviced),p.created_at)-interval '5 minutes')`;
router.get(
  "/:id/summaries",
  validateParams(id),
  validateQuery(
    Joi.object({
      nodeKey: Joi.string().max(200).required(),
      start: Joi.date().iso().required(),
      end: Joi.date().iso().required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const start = new Date(String(req.query.start)),
      end = new Date(String(req.query.end));
    if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
      throw new ValidationError("Choose up to 366 days");
    res.json(
      (
        await manager.pool.query(
          `SELECT *, CASE WHEN good=samples AND good>0 AND identity NOT IN ('unknown','mixed') THEN sum/good ELSE NULL END AS average,
    'retained-summary' AS source, 'unverified' AS continuity FROM history_summaries
    WHERE machine_id=$1 AND node_key=$2 AND bucket >= $3 AND bucket < $4 ORDER BY bucket LIMIT 8785`,
          [Number(req.params.id), req.query.nodeKey, start, end],
        )
      ).rows,
    );
  }),
);
router.use(requireRole("admin"));
router.get(
  "/:id/storage",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const machine = Number(req.params.id);
    const [stats, policy, previews] = await Promise.all([
      manager.pool.query(
        `SELECT count(*)::float8 AS rows, min(timestamp) AS oldest, max(timestamp) AS newest,
      count(*) FILTER (WHERE received_at >= now()-interval '24 hours')::float8 AS daily_rows,
      coalesce(avg(pg_column_size(d)),0)::float8 AS bytes_per_row FROM opcua_data d WHERE machine_id=$1`,
        [machine],
      ),
      manager.pool.query(
        "SELECT * FROM retention_policies WHERE machine_id=$1",
        [machine],
      ),
      manager.pool.query(
        "SELECT * FROM retention_previews WHERE machine_id=$1 ORDER BY created_at DESC LIMIT 20",
        [machine],
      ),
    ]);
    const capacity = (
      await manager.pool.query(
        "SELECT pg_database_size(current_database())::float8 AS database_bytes, pg_total_relation_size('opcua_data')::float8 AS history_bytes",
      )
    ).rows[0];
    const stat = stats.rows[0];
    res.json({
      ...stat,
      ...capacity,
      estimatedAdditional30DayBytes: stat.daily_rows
        ? stat.daily_rows * stat.bytes_per_row * 30
        : null,
      forecastBasis:
        "Last 24 hours received, row bytes only; indexes, compression and workload changes are excluded. Free disk is not measured.",
      policy: policy.rows[0] ?? null,
      previews: previews.rows,
    });
  }),
);
router.put(
  "/:id/policy",
  validateParams(id),
  validateBody(
    Joi.object({ days: Joi.number().integer().min(1).max(3650).required() }),
  ),
  asyncHandler(async (req, res) => {
    const exists = await manager.pool.query(
      "SELECT 1 FROM machines WHERE id=$1",
      [Number(req.params.id)],
    );
    if (!exists.rowCount) throw new ValidationError("Unknown machine");
    res.json(
      (
        await manager.pool.query(
          `INSERT INTO retention_policies(machine_id,days) VALUES($1,$2)
    ON CONFLICT(machine_id) DO UPDATE SET days=excluded.days,version=retention_policies.version+1 RETURNING *`,
          [Number(req.params.id), req.body.days],
        )
      ).rows[0],
    );
  }),
);
router.post(
  "/:id/preview",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const machine = Number(req.params.id),
      connection = await manager.pool.connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await connection.query("SET LOCAL statement_timeout='30s'");
      const policy = (
        await connection.query(
          "SELECT * FROM retention_policies WHERE machine_id=$1",
          [machine],
        )
      ).rows[0];
      if (!policy) throw new ValidationError("Save a retention policy first");
      const cutoff = new Date(Date.now() - policy.days * 86400000),
        maxId = (
          await connection.query(
            "SELECT coalesce(max(id),0) AS id FROM opcua_data WHERE machine_id=$1",
            [machine],
          )
        ).rows[0].id;
      const { rows } = await connection.query(
        `SELECT count(*)::int AS count FROM opcua_data d WHERE ${eligible}`,
        [machine, cutoff, maxId],
      );
      const total = (
        await connection.query(
          "SELECT count(*)::int AS count FROM opcua_data WHERE machine_id=$1 AND timestamp<$2 AND id<=$3",
          [machine, cutoff, maxId],
        )
      ).rows[0].count;
      const preview = (
        await connection.query(
          `INSERT INTO retention_previews(id,machine_id,policy_version,cutoff,max_id,rows,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            randomUUID(),
            machine,
            policy.version,
            cutoff,
            maxId,
            rows[0].count,
            req.session.userId,
          ],
        )
      ).rows[0];
      await connection.query("COMMIT");
      res
        .status(201)
        .json({ ...preview, protectedRows: total - rows[0].count });
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }),
);
router.post(
  "/:id/apply",
  validateParams(id),
  validateBody(
    Joi.object({
      previewId: Joi.string().uuid().required(),
      confirmRows: Joi.number().integer().min(0).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const connection = await manager.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SET LOCAL statement_timeout='30s'");
      const preview = (
        await connection.query(
          "SELECT * FROM retention_previews WHERE id=$1 AND machine_id=$2 FOR UPDATE",
          [req.body.previewId, Number(req.params.id)],
        )
      ).rows[0];
      const policy = (
        await connection.query(
          "SELECT * FROM retention_policies WHERE machine_id=$1 FOR UPDATE",
          [Number(req.params.id)],
        )
      ).rows[0];
      if (
        !preview ||
        preview.created_by !== req.session.userId ||
        preview.rows !== req.body.confirmRows ||
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
          `WITH candidates AS (SELECT d.timestamp,d.id FROM opcua_data d WHERE ${eligible} ORDER BY d.timestamp,d.id LIMIT 5000 FOR UPDATE),
        removed AS (DELETE FROM opcua_data d USING candidates c WHERE d.timestamp=c.timestamp AND d.id=c.id RETURNING d.*),
        summarized AS (INSERT INTO history_summaries(machine_id,node_key,bucket,samples,good,sum,min,max,identity)
          SELECT machine_id,node_key,date_trunc('hour',timestamp,'UTC'),count(*),count(*) FILTER(WHERE status_code LIKE 'Good%' AND value IS NOT NULL),
          sum(value) FILTER(WHERE status_code LIKE 'Good%' AND value IS NOT NULL),min(value) FILTER(WHERE status_code LIKE 'Good%' AND value IS NOT NULL),max(value) FILTER(WHERE status_code LIKE 'Good%' AND value IS NOT NULL),
          CASE WHEN count(signal_metadata)=0 THEN 'unknown' WHEN count(signal_metadata)<count(*) OR min(md5(signal_metadata::text))<>max(md5(signal_metadata::text)) THEN 'mixed' ELSE min(md5(signal_metadata::text)) END
          FROM removed GROUP BY 1,2,3 ON CONFLICT(machine_id,node_key,bucket) DO UPDATE SET
          samples=history_summaries.samples+excluded.samples,good=history_summaries.good+excluded.good,
          sum=coalesce(history_summaries.sum,0)+coalesce(excluded.sum,0),min=least(history_summaries.min,excluded.min),max=greatest(history_summaries.max,excluded.max),
          identity=CASE WHEN history_summaries.identity=excluded.identity THEN excluded.identity ELSE 'mixed' END RETURNING 1)
        SELECT count(*)::int AS count FROM removed`,
          [preview.machine_id, preview.cutoff, preview.max_id],
        );
        const count = deleted.rows[0].count;
        preview.deleted += count;
        preview.completed = count < 5000;
        await connection.query(
          "UPDATE retention_previews SET deleted=$2,completed=$3 WHERE id=$1",
          [preview.id, preview.deleted, preview.completed],
        );
      }
      await connection.query("COMMIT");
      res.json(preview);
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }),
);
export default router;
