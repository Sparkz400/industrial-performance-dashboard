import { eligible, applyRetention } from "../services/historyRetention.js";
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
import { storageRunway } from "../services/storageRunway.js";

const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
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
    const disks = await storageRunway();
    const schedules = (
      await manager.pool.query(
        "SELECT id,preview_id,run_at,status,error FROM retention_schedules WHERE machine_id=$1 ORDER BY id DESC LIMIT 20",
        [machine],
      )
    ).rows;
    res.json({
      ...stat,
      ...capacity,
      disks,
      schedules,
      estimatedAdditional30DayBytes: stat.daily_rows
        ? stat.daily_rows * stat.bytes_per_row * 30
        : null,
      forecastBasis:
        "Last 24 hours received, row bytes only; indexes, compression and workload changes are excluded. Separate disk observations measure configured filesystems.",
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
      await connection.query(
        `INSERT INTO retention_preview_rows(preview_id,measurement_id,timestamp)
        SELECT $4,d.id,d.timestamp FROM opcua_data d WHERE ${eligible}`,
        [machine, cutoff, maxId, preview.id],
      );
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
    res.json(
      await applyRetention(
        Number(req.params.id),
        req.body.previewId,
        req.body.confirmRows,
        req.session.userId!,
      ),
    );
  }),
);
router.post(
  "/:id/schedule",
  validateParams(id),
  validateBody(
    Joi.object({
      previewId: Joi.string().uuid().required(),
      confirmRows: Joi.number().integer().min(0).required(),
      runAt: Joi.date().iso().required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const runAt = new Date(req.body.runAt);
    if (runAt.getTime() <= Date.now())
      throw new ValidationError("Schedule must be in the future");
    const saved = await manager.pool.query(
      `INSERT INTO retention_schedules(machine_id,preview_id,confirm_rows,created_by,run_at)
    SELECT p.machine_id,p.id,p.rows,$4,$5 FROM retention_previews p JOIN retention_policies policy ON policy.machine_id=p.machine_id
    WHERE p.id=$1 AND p.machine_id=$2 AND p.rows=$3 AND p.created_by=$4 AND p.policy_version=policy.version
    AND NOT p.completed AND $5::timestamptz<p.created_at+interval '1 hour' ON CONFLICT(preview_id) DO NOTHING RETURNING *`,
      [
        req.body.previewId,
        Number(req.params.id),
        req.body.confirmRows,
        req.session.userId,
        runAt,
      ],
    );
    if (!saved.rowCount)
      throw new ValidationError(
        "Review a fresh preview; schedule it before its one-hour expiry",
      );
    res.status(201).json(saved.rows[0]);
  }),
);
export default router;
