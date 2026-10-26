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
  machineId: Joi.number().integer().positive().required(),
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
    } = req.query as {
      nodeKeys: string;
      machineId?: string;
      startDate: string;
      endDate: string;
      downsampleBucketSeconds?: string;
      aggregation?: "avg" | "min" | "max" | "last";
    };

    const result = await trendingDataService.queryTrendingData({
      nodeKeys: nodeKeys.split(",").map((k) => k.trim()),
      machineId: machineId != null ? Number(machineId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      downsampleBucketSeconds: downsampleBucketSeconds
        ? Number(downsampleBucketSeconds)
        : undefined,
      aggregation,
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
    } = req.query as {
      nodeKeys: string;
      machineId?: string;
      startDate: string;
      endDate: string;
      downsampleBucketSeconds?: string;
      aggregation?: "avg" | "min" | "max" | "last";
    };

    const csv = await trendingDataService.exportCsv({
      nodeKeys: nodeKeys.split(",").map((k) => k.trim()),
      machineId: machineId != null ? Number(machineId) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      downsampleBucketSeconds: downsampleBucketSeconds
        ? Number(downsampleBucketSeconds)
        : undefined,
      aggregation,
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
