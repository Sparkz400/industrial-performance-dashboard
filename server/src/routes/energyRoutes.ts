import { Router } from "express";
import Joi from "joi";
import { eq, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  energyMeters,
  energyReconciliations,
  productionShifts,
} from "../database/schema.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { ConflictError, ValidationError } from "../utils/errors.js";
import { energyAnalysis } from "../services/energyAnalysis.js";
import { report } from "./productionRoutes.js";
const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
router.get(
  "/machines/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const [meter] = await db
      .select()
      .from(energyMeters)
      .where(eq(energyMeters.machineId, Number(req.params.id)));
    res.json(meter ?? null);
  }),
);
router.put(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      version: Joi.number().integer().min(0).required(),
      config: Joi.object({
        signal: Joi.object({
          nodeKey: Joi.string().max(100).required(),
          namespaceUri: Joi.string().max(500).required(),
          identifier: Joi.string()
            .pattern(/^[isgb]=.+/)
            .max(500)
            .required(),
          dataType: Joi.string()
            .valid("Byte", "UInt16", "UInt32", "Float", "Double", "Int32")
            .required(),
          unit: Joi.string().valid("Wh", "kWh").required(),
          scale: Joi.number().positive().required(),
        }).required(),
        maxGapSeconds: Joi.number().integer().min(1).max(3600).required(),
        modulus: Joi.number()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .allow(null)
          .required(),
      }).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await db.transaction(async (tx) => {
        const machineId = Number(req.params.id);
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${machineId}::integer)`,
        );
        const [current] = await tx
          .select()
          .from(energyMeters)
          .where(eq(energyMeters.machineId, machineId));
        if ((current?.version ?? 0) !== req.body.version)
          throw new ConflictError("Meter configuration changed; reload first");
        const values = {
          machineId,
          config: req.body.config,
          version: (current?.version ?? 0) + 1,
        };
        const [saved] = await tx
          .insert(energyMeters)
          .values(values)
          .onConflictDoUpdate({ target: energyMeters.machineId, set: values })
          .returning();
        return saved;
      }),
    );
  }),
);
router.get(
  "/shifts/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    res.json(await energyAnalysis(await report(Number(req.params.id))));
  }),
);
router.post(
  "/shifts/:id/reconcile",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      kWh: Joi.number().min(0).required(),
      toleranceKWh: Joi.number().min(0).required(),
      reference: Joi.string().trim().min(1).max(500).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const shiftId = Number(req.params.id);
    const [shift] = await db
      .select()
      .from(productionShifts)
      .where(eq(productionShifts.id, shiftId));
    if (!shift || shift.end > new Date())
      throw new ValidationError("Choose an ended shift");
    const [saved] = await db
      .insert(energyReconciliations)
      .values({ ...req.body, shiftId, createdBy: req.session.userId! })
      .onConflictDoNothing()
      .returning();
    if (!saved)
      throw new ConflictError(
        "Independent meter evidence is already preserved",
      );
    res.status(201).json(saved);
  }),
);
export default router;
