import express, { type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { batchService } from "../services/batchService.js";
import { getAuditActor } from "../services/auditLogService.js";

const router = express.Router();

// --- Param schemas ---

const idParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

// --- Query schemas ---

const listQuerySchema = Joi.object({
  machineId: Joi.number().integer().positive().optional(),
  recipeId: Joi.number().integer().positive().optional(),
  status: Joi.string()
    .valid("planned", "running", "completed", "aborted")
    .optional(),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

const activeQuerySchema = Joi.object({
  machineId: Joi.number().integer().positive().required(),
});

// --- Body schemas ---

const createBatchSchema = Joi.object({
  batchNumber: Joi.string().min(1).max(100).required(),
  recipeId: Joi.number().integer().positive().allow(null).optional(),
  machineId: Joi.number().integer().positive().allow(null).optional(),
  notes: Joi.string().allow("", null).optional(),
  metadata: Joi.object().default({}),
});

const updateBatchSchema = Joi.object({
  notes: Joi.string().allow("", null).optional(),
  metadata: Joi.object().optional(),
}).min(1);

const abortBatchSchema = Joi.object({
  reason: Joi.string().allow("", null).optional(),
});

const compareBatchesSchema = Joi.object({
  batchIds: Joi.array()
    .items(Joi.number().integer().positive())
    .min(2)
    .max(10)
    .required(),
});

// --- Routes ---

// All routes require auth
router.use(requireAuth);

// GET /active - Get active batch for a machine (must be before /:id)
router.get(
  "/active",
  validateQuery(activeQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const machineId = Number(req.query.machineId);
    const batch = await batchService.findActiveBatch(machineId);
    res.json(batch);
  }),
);

// POST /compare - Compare batches (must be before /:id)
router.post(
  "/compare",
  validateBody(compareBatchesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await batchService.compareBatches(req.body.batchIds);
    res.json(result);
  }),
);

// GET / - List batches
router.get(
  "/",
  validateQuery(listQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      machineId: req.query.machineId ? Number(req.query.machineId) : undefined,
      recipeId: req.query.recipeId ? Number(req.query.recipeId) : undefined,
      status: req.query.status as
        | "planned"
        | "running"
        | "completed"
        | "aborted"
        | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    res.json(await batchService.listBatches(filters));
  }),
);

// POST / - Create batch
router.post(
  "/",
  validateBody(createBatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const batch = await batchService.createBatch(
      {
        ...req.body,
        startedBy: req.session.userId,
      },
      getAuditActor(req),
    );
    res.status(201).json(batch);
  }),
);

// GET /:id - Get batch
router.get(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.json(await batchService.getBatch(Number(req.params.id)));
  }),
);

// PUT /:id - Update batch
router.put(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateBatchSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const batch = await batchService.updateBatch(
      Number(req.params.id),
      req.body,
      getAuditActor(req),
    );
    res.json(batch);
  }),
);

// POST /:id/start - Start batch
router.post(
  "/:id/start",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const batch = await batchService.startBatch(
      Number(req.params.id),
      req.session.userId!,
      getAuditActor(req),
    );
    res.json(batch);
  }),
);

// POST /:id/complete - Complete batch
router.post(
  "/:id/complete",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const batch = await batchService.completeBatch(
      Number(req.params.id),
      req.session.userId!,
      getAuditActor(req),
    );
    res.json(batch);
  }),
);

// POST /:id/abort - Abort batch
router.post(
  "/:id/abort",
  validateParams(idParamSchema),
  validateBody(abortBatchSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const batch = await batchService.abortBatch(
      Number(req.params.id),
      req.session.userId!,
      req.body.reason,
      getAuditActor(req),
    );
    res.json(batch);
  }),
);

// GET /:id/data - Get batch time-series data
router.get(
  "/:id/data",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const data = await batchService.getBatchData(Number(req.params.id));
    res.json(data);
  }),
);

export default router;
