import { Router, type Request, type Response } from "express";
import Joi from "joi";
import { validateQuery, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { trendingDataService } from "../services/trendingDataService.js";

const router = Router();

// All trending routes require authentication
router.use(requireAuth);

// ===== Validation Schemas =====

const trendingQuerySchema = Joi.object({
  nodeKeys: Joi.string().required().description("Comma-separated node keys"),
  machineId: Joi.number().integer().optional(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  downsampleBucketSeconds: Joi.number().integer().min(1).optional(),
  aggregation: Joi.string().valid("avg", "min", "max", "last").default("avg"),
});

const machineIdParamSchema = Joi.object({
  machineId: Joi.number().integer().required(),
});

// ===== GET /data =====

router.get(
  "/data",
  validateQuery(trendingQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      nodeKeys,
      machineId,
      startDate,
      endDate,
      downsampleBucketSeconds,
      aggregation,
    } = req.query as any;

    const result = await trendingDataService.queryTrendingData({
      nodeKeys: (nodeKeys as string).split(",").map((k: string) => k.trim()),
      machineId: machineId != null ? Number(machineId) : undefined,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      downsampleBucketSeconds: downsampleBucketSeconds
        ? Number(downsampleBucketSeconds)
        : undefined,
      aggregation: aggregation as any,
    });

    res.json(result);
  }),
);

// ===== GET /export-csv =====

router.get(
  "/export-csv",
  validateQuery(trendingQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      nodeKeys,
      machineId,
      startDate,
      endDate,
      downsampleBucketSeconds,
      aggregation,
    } = req.query as any;

    const csv = await trendingDataService.exportCsv({
      nodeKeys: (nodeKeys as string).split(",").map((k: string) => k.trim()),
      machineId: machineId != null ? Number(machineId) : undefined,
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      downsampleBucketSeconds: downsampleBucketSeconds
        ? Number(downsampleBucketSeconds)
        : undefined,
      aggregation: aggregation as any,
    });

    const filename = `trending-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);

// ===== GET /available-tags/:machineId =====

router.get(
  "/available-tags/:machineId",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const machineId = Number(req.params.machineId);
    const tags = await trendingDataService.getAvailableTags(machineId);
    res.json(tags);
  }),
);

export default router;
