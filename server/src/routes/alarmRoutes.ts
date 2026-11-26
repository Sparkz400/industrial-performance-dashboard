import { auditRequest } from "../services/auditLogService.js";
import { Router, type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { alarmRepository } from "../repositories/alarmRepository.js";
import alarmEvaluator from "../services/alarmService.js";

const router = Router();

// ===== Alarm Query =====

const alarmsQuerySchema = Joi.object({
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .optional(),
  status: Joi.string()
    .valid("active", "acknowledged", "resolved", "silenced")
    .optional(),
  machineId: Joi.number().integer().optional(),
  nodeKey: Joi.string().min(1).max(200).optional(),
  limit: Joi.number().integer().min(1).max(5000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

router.get(
  "/",
  validateQuery(alarmsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const alarms = await alarmRepository.listAlarms(
      req.query as {
        severity?: string;
        status?: string;
        machineId?: number;
        nodeKey?: string;
        limit?: number;
        offset?: number;
        startDate?: string;
        endDate?: string;
      },
    );
    res.json(alarms);
  }),
);

// ===== Acknowledge Alarm =====

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });

router.post(
  "/:id/acknowledge",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const userId = req.session?.userId ?? null;
    const alarm = await alarmEvaluator.acknowledge(id, userId!);
    if (!alarm) {
      res.status(404).json({ error: "Alarm not found" });
      return;
    }
    res.json({ alarm });
  }),
);

// ===== Clear Alarm =====

router.post(
  "/:id/clear",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(409).json({
      error: "Alarms clear only when good measurements confirm recovery.",
    });
  }),
);

export default router;
