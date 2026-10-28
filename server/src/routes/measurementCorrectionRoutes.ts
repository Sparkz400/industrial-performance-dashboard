import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { assertMachine } from "../services/accessScope.js";
import {
  previewCorrection,
  applyCorrection,
} from "../services/measurementCorrections.js";
import { ValidationError } from "../utils/errors.js";

const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
const instant = Joi.string()
  .isoDate()
  .strict()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();
const body = Joi.object({
  requestId: Joi.string().guid().required(),
  measurementId: Joi.number().integer().positive().required(),
  timestamp: instant,
  expectedRevision: Joi.number().integer().min(0).required(),
  value: Joi.number().strict().allow(null).required(),
  quality: Joi.string().valid("good", "bad").required(),
  reason: Joi.string().trim().min(1).max(1000).required(),
});
router.get(
  "/:id/measurements",
  validateParams(id),
  validateQuery(
    Joi.object({
      nodeKey: Joi.string().min(1).max(200).required(),
      start: instant,
      end: instant,
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const start = new Date(String(req.query.start)),
      end = new Date(String(req.query.end));
    if (end <= start || end.getTime() - start.getTime() > 48 * 3600000)
      throw new ValidationError("Choose a positive window of up to 48 hours");
    const rows = (
      await manager.pool.query(
        `SELECT id,timestamp,node_key,value,raw_value,status_code,reported_status_code,source_clock_state,source_timestamp,received_at,event_id,correction_revision
     FROM opcua_data WHERE machine_id=$1 AND node_key=$2 AND timestamp >= $3 AND timestamp < $4 ORDER BY timestamp DESC,id DESC LIMIT 201`,
        [machineId, req.query.nodeKey, start, end],
      )
    ).rows;
    res.json({ rows: rows.slice(0, 200), truncated: rows.length > 200 });
  }),
);
router.get(
  "/:id/corrections",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const rows = (
      await manager.pool.query(
        "SELECT * FROM measurement_corrections WHERE machine_id=$1 ORDER BY created_at DESC,id LIMIT 201",
        [machineId],
      )
    ).rows;
    res.json({ rows: rows.slice(0, 200), truncated: rows.length > 200 });
  }),
);
router.post(
  "/:id/corrections/preview",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(body),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.json(
      await previewCorrection(
        Number(req.params.id),
        req.session.userId!,
        req.body,
      ),
    );
  }),
);
router.post(
  "/:id/corrections",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    body.keys({
      expires: Joi.number().integer().required(),
      token: Joi.string().hex().length(64).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    const { expires, token, ...input } = req.body;
    res.json(
      await applyCorrection(
        Number(req.params.id),
        req.session.userId!,
        input,
        expires,
        token,
        req.session.userVersion!,
      ),
    );
  }),
);
export default router;
