import { auditRequest } from "../services/auditLogService.js";
import { Router } from "express";
import Joi from "joi";
import type { PoolClient } from "pg";
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
// Declared lot links with their latest correction applied; a null quantity is a voided link.
const currentLots = `(SELECT l.id,l.batch_id,l.lot,l.direction,l.unit,l.supplier_reference,l.created_by,l.created_at,
  CASE WHEN c.id IS NULL THEN l.quantity ELSE c.quantity END AS quantity,l.quantity AS declared_quantity,c.id AS correction_id
  FROM batch_lots l LEFT JOIN LATERAL (SELECT id,quantity FROM batch_lot_corrections WHERE lot_link_id=l.id ORDER BY id DESC LIMIT 1) c ON true)`;

async function genealogyChange<T>(change: (c: PoolClient) => Promise<T>) {
  const c = await manager.pool.connect();
  try {
    await c.query("BEGIN");
    // Serialize genealogy changes so concurrent edges cannot introduce a cycle.
    await c.query("SELECT pg_advisory_xact_lock(743901)");
    const result = await change(c);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

/**
 * Refuses a link quantity that breaks the lot balance or closes a cycle among active links.
 * `link.id` is the link being corrected, judged as if it were new. Returns the active producer.
 */
async function checkGenealogy(
  c: PoolClient,
  link: {
    id: number | null;
    batchId: number;
    lot: string;
    direction: string;
    quantity: number;
  },
) {
  const others = (
    await c.query(
      `SELECT * FROM ${currentLots} cl WHERE cl.lot=$1 AND cl.quantity IS NOT NULL AND cl.id IS DISTINCT FROM $2`,
      [link.lot, link.id],
    )
  ).rows;
  const producer = others.find((r) => r.direction === "output");
  // Each edge runs from the producing batch to a consuming batch.
  const edges =
    link.direction === "output"
      ? others.map((r) => [link.batchId, r.batch_id])
      : producer
        ? [[producer.batch_id, link.batchId]]
        : [];
  for (const [from, to] of edges) {
    const cycle = await c.query(
      `WITH RECURSIVE active AS (SELECT * FROM ${currentLots} cl WHERE cl.quantity IS NOT NULL AND cl.id IS DISTINCT FROM $3),
      descendants(id) AS (
        SELECT $1::integer UNION SELECT i.batch_id FROM descendants d JOIN active o ON o.batch_id=d.id AND o.direction='output'
        JOIN active i ON i.lot=o.lot AND i.direction='input') SELECT 1 FROM descendants WHERE id=$2`,
      [to, from, link.id],
    );
    if (cycle.rowCount)
      throw new ConflictError("Lot link would create circular traceability");
  }
  const consumed = `SELECT coalesce(sum(quantity::numeric),0) AS n FROM ${currentLots} cl
    WHERE cl.lot=$1 AND cl.direction='input' AND cl.quantity IS NOT NULL AND cl.id IS DISTINCT FROM $2`;
  if (link.direction === "output") {
    const exceeded = (
      await c.query(`SELECT n > $3::numeric AS exceeded FROM (${consumed}) s`, [
        link.lot,
        link.id,
        link.quantity,
      ])
    ).rows[0].exceeded;
    if (exceeded)
      throw new ValidationError(
        "Produced quantity cannot fall below recorded consumption",
      );
  } else if (producer) {
    const exceeded = (
      await c.query(
        `SELECT n+$3::numeric > $4::numeric AS exceeded FROM (${consumed}) s`,
        [link.lot, link.id, link.quantity, producer.quantity],
      )
    ).rows[0].exceeded;
    if (exceeded)
      throw new ValidationError(
        "Consumption exceeds the produced lot quantity",
      );
  }
  return producer;
}
// This module is administrator-only under the central asset allowlist.
router.use(requireRole("admin"));
router.get(
  "/batches/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const batchId = Number(req.params.id);
    const [inspections, rework, lots, lotCorrections] = await Promise.all([
      manager.pool.query(
        "SELECT * FROM quality_inspections WHERE batch_id=$1 ORDER BY id",
        [batchId],
      ),
      manager.pool.query(
        "SELECT * FROM batch_rework WHERE batch_id=$1 ORDER BY id",
        [batchId],
      ),
      manager.pool.query(
        `SELECT * FROM ${currentLots} cl WHERE cl.batch_id=$1 ORDER BY id`,
        [batchId],
      ),
      manager.pool.query(
        "SELECT k.* FROM batch_lot_corrections k JOIN batch_lots l ON l.id=k.lot_link_id WHERE l.batch_id=$1 ORDER BY k.id",
        [batchId],
      ),
    ]);
    res.json({
      inspections: inspections.rows,
      rework: rework.rows,
      lots: lots.rows,
      lotCorrections: lotCorrections.rows,
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
    const saved = await genealogyChange(async (c) => {
      const batchId = Number(req.params.id),
        { lot, direction, quantity, unit, supplierReference } = req.body;
      const batch = await c.query(
        "SELECT id FROM batches WHERE id=$1 FOR UPDATE",
        [batchId],
      );
      if (!batch.rowCount) throw new NotFoundError("Batch");
      // Voided links still hold their lot identity and unit.
      const related = await c.query("SELECT * FROM batch_lots WHERE lot=$1", [
        lot,
      ]);
      if (related.rows.some((r) => r.batch_id === batchId || r.unit !== unit))
        throw new ConflictError(
          "Lot already linked to this batch or uses a different unit",
        );
      if (direction === "output" && related.rowCount)
        throw new ConflictError(
          "Register a lot's output before its consumption",
        );
      const producer = await checkGenealogy(c, {
        id: null,
        batchId,
        lot,
        direction,
        quantity,
      });
      if (direction === "input" && !producer && !supplierReference)
        throw new ValidationError(
          "External input lots require a supplier reference",
        );
      return (
        await c.query(
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
        )
      ).rows[0];
    });
    res.status(201).json(saved);
  }),
);
// Corrections are appended; the declared link and every earlier correction stay readable.
router.post(
  "/lots/:id/corrections",
  validateParams(id),
  validateBody(
    Joi.object({
      quantity: Joi.number().positive().max(1e12).allow(null).required(),
      reason: Joi.string().trim().min(1).max(500).required(),
      previousCorrectionId: Joi.number()
        .integer()
        .positive()
        .allow(null)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { quantity, reason, previousCorrectionId } = req.body;
    const saved = await genealogyChange(async (c) => {
      const link = (
        await c.query(`SELECT * FROM ${currentLots} cl WHERE cl.id=$1`, [
          Number(req.params.id),
        ])
      ).rows[0];
      if (!link) throw new NotFoundError("Lot link");
      if (link.correction_id !== previousCorrectionId)
        throw new ConflictError("Lot link changed; reload before correcting");
      if (quantity === link.quantity)
        throw new ValidationError("A correction must change the quantity");
      if (quantity === null) {
        const consumed = await c.query(
          `SELECT 1 FROM ${currentLots} cl WHERE cl.lot=$1 AND cl.direction='input' AND cl.quantity IS NOT NULL`,
          [link.lot],
        );
        if (link.direction === "output" && consumed.rowCount)
          throw new ConflictError("Void the consumption of this lot first");
      } else {
        const producer = await checkGenealogy(c, {
          id: link.id,
          batchId: link.batch_id,
          lot: link.lot,
          direction: link.direction,
          quantity,
        });
        if (link.direction === "input" && !producer && !link.supplier_reference)
          throw new ValidationError(
            "External input lots require a supplier reference",
          );
      }
      return (
        await c.query(
          "INSERT INTO batch_lot_corrections(lot_link_id,quantity,reason,created_by) VALUES($1,$2,$3,$4) RETURNING *",
          [link.id, quantity, reason, req.session.userId],
        )
      ).rows[0];
    });
    res.status(201).json(saved);
  }),
);
router.get(
  "/batches/:id/trace",
  validateParams(id),
  auditRequest("export.lot_trace", "batch", "Exported a lot and batch trace"),
  asyncHandler(async (req, res) => {
    // Batches connect through active links only; voided links of those batches stay listed.
    const result = await manager.pool.query(
      `WITH RECURSIVE active AS (SELECT * FROM ${currentLots} cl WHERE cl.quantity IS NOT NULL),
    related(id) AS (
    SELECT $1::integer UNION SELECT other.batch_id FROM related r JOIN active own ON own.batch_id=r.id
    JOIN active other ON other.lot=own.lot)
    SELECT l.*,b.batch_number FROM related r JOIN ${currentLots} l ON l.batch_id=r.id JOIN batches b ON b.id=r.id ORDER BY l.id LIMIT 5001`,
      [Number(req.params.id)],
    );
    const links = result.rows.slice(0, 5000);
    const corrections = await manager.pool.query(
      "SELECT * FROM batch_lot_corrections WHERE lot_link_id=ANY($1::int[]) ORDER BY id",
      [links.map((l) => l.id)],
    );
    res.json({
      links,
      corrections: corrections.rows,
      truncated: result.rows.length > 5000,
    });
  }),
);
export default router;
