import express, { type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { oeeRepository } from "../repositories/oeeRepository.js";
import { oeeCalculationService } from "../services/oeeCalculationService.js";

const router = express.Router();

// --- Param types ---

type MachineIdParams = { machineId: string };

// --- Validation schemas ---

const machineIdParamSchema = Joi.object({
  machineId: Joi.string().pattern(/^\d+$/).required(),
});

const oeeConfigSchema = Joi.object({
  runningModeValues: Joi.array().items(Joi.number()).required(),
  idleModeValues: Joi.array().items(Joi.number()).default([]),
  plannedStopModeValues: Joi.array().items(Joi.number()).default([]),
  unplannedStopModeValues: Joi.array().items(Joi.number()).default([]),
  idealCycleTimeMs: Joi.number().positive().allow(null).default(null),
  productionCountNodeKey: Joi.string().allow(null, "").default(null),
  goodCountNodeKey: Joi.string().allow(null, "").default(null),
  rejectCountNodeKey: Joi.string().allow(null, "").default(null),
  manualEntryEnabled: Joi.boolean().default(false),
  plannedProductionHoursPerDay: Joi.number().min(0).max(24).default(24),
});

const oeeQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
});

const oeeHistoryQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
  granularity: Joi.string().valid("hour", "day", "week").default("day"),
});

const manualEntrySchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  productionCount: Joi.number().integer().min(0).allow(null).default(null),
  goodCount: Joi.number().integer().min(0).allow(null).default(null),
  rejectCount: Joi.number().integer().min(0).allow(null).default(null),
  plannedDowntimeMinutes: Joi.number().integer().min(0).allow(null).default(0),
  notes: Joi.string().allow(null, "").default(null),
});

const manualEntriesQuerySchema = Joi.object({
  startDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// --- Routes ---

// GET /config/:machineId - Get OEE configuration for a machine
router.get(
  "/config/:machineId",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const config = await oeeRepository.getConfig(machineId);
    res.json(config);
  }),
);

// PUT /config/:machineId - Save/update OEE configuration (admin only)
router.put(
  "/config/:machineId",
  requireRole("admin"),
  validateParams(machineIdParamSchema),
  validateBody(oeeConfigSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const config = await oeeRepository.saveConfig(machineId, req.body);
    res.json(config);
  }),
);

// GET /:machineId - Calculate current OEE
router.get(
  "/:machineId",
  validateParams(machineIdParamSchema),
  validateQuery(oeeQuerySchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);

    const result = await oeeCalculationService.calculateOee(
      machineId,
      startDate,
      endDate,
    );
    res.json(result);
  }),
);

// GET /:machineId/history - Historical OEE with granularity
router.get(
  "/:machineId/history",
  validateParams(machineIdParamSchema),
  validateQuery(oeeHistoryQuerySchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const granularity =
      (req.query.granularity as "hour" | "day" | "week") ?? "day";

    const results = await oeeCalculationService.calculateOeeHistory(
      machineId,
      startDate,
      endDate,
      granularity,
    );
    res.json(results);
  }),
);

// POST /:machineId/manual-entry - Save a manual entry (admin only)
router.post(
  "/:machineId/manual-entry",
  requireRole("admin"),
  validateParams(machineIdParamSchema),
  validateBody(manualEntrySchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const entry = await oeeRepository.saveManualEntry(machineId, {
      ...req.body,
      createdBy: req.session?.userId,
    });
    res.status(201).json(entry);
  }),
);

// GET /:machineId/manual-entries - List manual entries
router.get(
  "/:machineId/manual-entries",
  validateParams(machineIdParamSchema),
  validateQuery(manualEntriesQuerySchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machineId = Number(req.params.machineId);
    const entries = await oeeRepository.getManualEntries(
      machineId,
      req.query.startDate as string | undefined,
      req.query.endDate as string | undefined,
    );
    res.json(entries);
  }),
);

export default router;
