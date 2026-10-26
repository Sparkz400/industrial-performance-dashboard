import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";

const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
// This module is administrator-only under the central asset allowlist.
router.use(requireRole("admin"));
router.get(
  "/batches/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const batchId = Number(req.params.id);
    const [inspections, rework, lots] = await Promise.all([
      manager.pool.query(
        "SELECT * FROM quality_inspections WHERE batch_id=$1 ORDER BY id",
        [batchId],
      ),
      manager.pool.query(
        "SELECT * FROM batch_rework WHERE batch_id=$1 ORDER BY id",
        [batchId],
      ),
      manager.pool.query(
        "SELECT * FROM batch_lots WHERE batch_id=$1 ORDER BY id",
        [batchId],
      ),
    ]);
    res.json({
      inspections: inspections.rows,
      rework: rework.rows,
      lots: lots.rows,
    });
  }),
);
router.post(
  "/batches/:id/inspections",
  validateParams(id),
  validateBody(
    Joi.object({
      requestId: Joi.string().uuid().required(),
      check: Joi.string().trim().min(1).max(200).required(),
      result: Joi.string().valid("pass", "fail", "unknown").required(),
      quantity: Joi.number().integer().positive().max(1000000000).required(),
      defectReason: Joi.string()
        .trim()
        .max(500)
        .when("result", {
          is: "fail",
          then: Joi.required(),
          otherwise: Joi.valid(null).default(null),
        }),
      note: Joi.string().trim().max(2000).allow("").default(""),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { requestId, check, result, quantity, defectReason, note } = req.body;
    const values = [
      Number(req.params.id),
      requestId,
      check,
      result,
      quantity,
      defectReason,
      note,
      req.session.userId,
    ];
    const saved = await manager.pool.query(
      `INSERT INTO quality_inspections(batch_id,request_id,check_name,result,quantity,defect_reason,note,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(request_id) DO UPDATE SET request_id=excluded.request_id
    WHERE quality_inspections.batch_id=excluded.batch_id AND quality_inspections.check_name=excluded.check_name
    AND quality_inspections.result=excluded.result AND quality_inspections.quantity=excluded.quantity
    AND quality_inspections.defect_reason IS NOT DISTINCT FROM excluded.defect_reason
    AND quality_inspections.note=excluded.note AND quality_inspections.created_by=excluded.created_by RETURNING *`,
      values,
    );
    if (!saved.rowCount)
      throw new ConflictError(
        "Request ID already identifies different inspection evidence",
      );
    res.status(201).json(saved.rows[0]);
  }),
);
router.post(
  "/batches/:id/rework",
  validateParams(id),
  validateBody(
    Joi.object({
      inspectionId: Joi.number().integer().positive().required(),
      ownerId: Joi.number().integer().positive().required(),
      dueAt: Joi.date().iso().required(),
      action: Joi.string().trim().min(1).max(2000).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const saved = await manager.pool.query(
      `INSERT INTO batch_rework(batch_id,inspection_id,owner_id,due_at,action,created_by)
    SELECT batch_id,id,$3,$4,$5,$6 FROM quality_inspections WHERE id=$2 AND batch_id=$1 AND result='fail'
    ON CONFLICT(inspection_id) DO NOTHING RETURNING *`,
      [
        Number(req.params.id),
        req.body.inspectionId,
        req.body.ownerId,
        req.body.dueAt,
        req.body.action,
        req.session.userId,
      ],
    );
    if (!saved.rowCount)
      throw new ConflictError(
        "Choose a failed inspection without an existing rework action",
      );
    res.status(201).json(saved.rows[0]);
  }),
);
router.post(
  "/rework/:id/complete",
  validateParams(id),
  validateBody(
    Joi.object({
      inspectionId: Joi.number().integer().positive().required(),
      note: Joi.string().trim().min(1).max(2000).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const saved = await manager.pool.query(
      `UPDATE batch_rework r SET completed_at=now(),completed_by=$3,completion_note=$4,verification_id=i.id
    FROM quality_inspections i, quality_inspections original WHERE r.id=$1 AND r.completed_at IS NULL
    AND original.id=r.inspection_id AND i.id=$2 AND i.batch_id=r.batch_id AND i.result='pass'
    AND i.check_name=original.check_name AND i.quantity>=original.quantity AND i.created_at>=r.created_at RETURNING r.*`,
      [
        Number(req.params.id),
        req.body.inspectionId,
        req.session.userId,
        req.body.note,
      ],
    );
    if (!saved.rowCount)
      throw new ValidationError(
        "Completion requires a new passing inspection of the same check and quantity",
      );
    res.json(saved.rows[0]);
  }),
);
router.post(
  "/batches/:id/lots",
  validateParams(id),
  validateBody(
    Joi.object({
      lot: Joi.string().trim().min(1).max(160).required(),
      direction: Joi.string().valid("input", "output").required(),
      quantity: Joi.number().positive().max(1e12).required(),
      unit: Joi.string().trim().min(1).max(40).required(),
      supplierReference: Joi.string().trim().max(500).allow(null).default(null),
    }),
  ),
  asyncHandler(async (req, res) => {
    const c = await manager.pool.connect();
    try {
      await c.query("BEGIN");
      // Serialize genealogy changes so concurrent edges cannot introduce a cycle.
      await c.query("SELECT pg_advisory_xact_lock(743901)");
      const batchId = Number(req.params.id),
        { lot, direction, quantity, unit, supplierReference } = req.body;
      const batch = await c.query(
        "SELECT id FROM batches WHERE id=$1 FOR UPDATE",
        [batchId],
      );
      if (!batch.rowCount) throw new NotFoundError("Batch");
      const related = await c.query("SELECT * FROM batch_lots WHERE lot=$1", [
        lot,
      ]);
      if (related.rows.some((r) => r.batch_id === batchId || r.unit !== unit))
        throw new ConflictError(
          "Lot already linked to this batch or uses a different unit",
        );
      const producer = related.rows.find((r) => r.direction === "output");
      if (direction === "output" && related.rowCount)
        throw new ConflictError(
          "Register a lot's output before its consumption",
        );
      if (direction === "input" && !producer && !supplierReference)
        throw new ValidationError(
          "External input lots require a supplier reference",
        );
      if (producer) {
        const cycle = await c.query(
          `WITH RECURSIVE descendants(id) AS (
        SELECT $1::integer UNION SELECT i.batch_id FROM descendants d JOIN batch_lots o ON o.batch_id=d.id AND o.direction='output'
        JOIN batch_lots i ON i.lot=o.lot AND i.direction='input') SELECT 1 FROM descendants WHERE id=$2`,
          [batchId, producer.batch_id],
        );
        if (cycle.rowCount)
          throw new ConflictError(
            "Lot link would create circular traceability",
          );
        const overdrawn = (
          await c.query(
            "SELECT coalesce(sum(quantity::numeric),0)+$2::numeric > $3::numeric AS exceeded FROM batch_lots WHERE lot=$1 AND direction='input'",
            [lot, quantity, producer.quantity],
          )
        ).rows[0].exceeded;
        if (overdrawn)
          throw new ValidationError(
            "Consumption exceeds the produced lot quantity",
          );
      }
      const saved = await c.query(
        "INSERT INTO batch_lots(batch_id,lot,direction,quantity,unit,supplier_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          batchId,
          lot,
          direction,
          quantity,
          unit,
          supplierReference,
          req.session.userId,
        ],
      );
      await c.query("COMMIT");
      res.status(201).json(saved.rows[0]);
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }),
);
router.get(
  "/batches/:id/trace",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const result = await manager.pool.query(
      `WITH RECURSIVE related(id) AS (
    SELECT $1::integer UNION SELECT other.batch_id FROM related r JOIN batch_lots own ON own.batch_id=r.id
    JOIN batch_lots other ON other.lot=own.lot)
    SELECT l.*,b.batch_number FROM related r JOIN batch_lots l ON l.batch_id=r.id JOIN batches b ON b.id=r.id ORDER BY l.id LIMIT 5001`,
      [Number(req.params.id)],
    );
    res.json({
      links: result.rows.slice(0, 5000),
      truncated: result.rows.length > 5000,
    });
  }),
);
export default router;
