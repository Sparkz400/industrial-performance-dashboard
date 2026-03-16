import express, { type Request, type Response } from "express";
import Joi from "joi";

import { validateBody, validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { edgeSyncService } from "../services/edgeSyncService.js";

const router = express.Router();

// --- Schemas ---

const updateConfigSchema = Joi.object({
  cloudUrl: Joi.string().uri().allow(null),
  syncIntervalMs: Joi.number().integer().min(5000),
  syncBatchSize: Joi.number().integer().min(10),
  dataRetentionDays: Joi.number().integer().min(1),
  lightweightMode: Joi.boolean(),
}).min(1);

const ingestSchema = Joi.object({
  edgeId: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        tableName: Joi.string().required(),
        operation: Joi.string().valid("INSERT", "UPDATE", "DELETE").required(),
        recordId: Joi.string().required(),
        payload: Joi.any().required(),
        originalTimestamp: Joi.string().isoDate().required(),
      }),
    )
    .required()
    .min(1),
});

// --- Routes ---

router.get(
  "/status",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await edgeSyncService.getStatus());
  }),
);

router.get(
  "/config",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await edgeSyncService.getConfig());
  }),
);

router.put(
  "/config",
  requireRole("admin"),
  validateBody(updateConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await edgeSyncService.updateConfig(req.body);
    res.json(updated);
  }),
);

router.post(
  "/sync/trigger",
  requireRole("admin"),
  asyncHandler(async (_req: Request, res: Response) => {
    const synced = await edgeSyncService.processSync();
    res.json({ message: "Sync triggered", queued: synced });
  }),
);

router.post(
  "/ingest",
  validateBody(ingestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { edgeId, items } = req.body;
    const received = await edgeSyncService.ingestFromEdge(edgeId, items);
    res.json({ received, message: `Ingested ${received} items` });
  }),
);

export default router;
