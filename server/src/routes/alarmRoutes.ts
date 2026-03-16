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
  limit: Joi.number().integer().min(1).max(5000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
});

router.get(
  "/",
  validateQuery(alarmsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const alarms = await alarmRepository.listAlarms(req.query as any);
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
    const userId = (req as any).session?.userId ?? null;
    const alarm = await alarmRepository.acknowledgeAlarm(id, userId);
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
    const id = Number(req.params.id);
    const alarm = await alarmRepository.clearAlarm(id);
    if (!alarm) {
      res.status(404).json({ error: "Alarm not found" });
      return;
    }
    res.json({ alarm });
  }),
);

// ===== Alarm Rules CRUD =====

const ruleBodySchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  machineId: Joi.number().integer().required(),
  nodeKey: Joi.string().required(),
  condition: Joi.string()
    .valid("gt", "gte", "lt", "lte", "eq", "between", "outside")
    .required(),
  threshold: Joi.number().required(),
  thresholdHigh: Joi.number().optional(),
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .default("medium"),
  cooldownSeconds: Joi.number().integer().min(0).default(300),
  channels: Joi.array().items(Joi.object()).default([]),
  isActive: Joi.boolean().default(true),
  description: Joi.string().optional().allow(""),
});

const ruleUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  condition: Joi.string()
    .valid("gt", "gte", "lt", "lte", "eq", "between", "outside")
    .optional(),
  threshold: Joi.number().optional(),
  thresholdHigh: Joi.number().optional(),
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .optional(),
  cooldownSeconds: Joi.number().integer().min(0).optional(),
  channels: Joi.array().items(Joi.object()).optional(),
  isActive: Joi.boolean().optional(),
  description: Joi.string().optional().allow(""),
}).min(1);

router.get(
  "/rules",
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await alarmRepository.listRules();
    res.json(rules);
  }),
);

router.post(
  "/rules",
  validateBody(ruleBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await alarmRepository.createRule({
      ...req.body,
      createdBy: (req as any).session?.userId ?? null,
    });
    await alarmEvaluator.reloadRules();
    res.status(201).json(rule);
  }),
);

router.put(
  "/rules/:id",
  validateParams(idParamSchema),
  validateBody(ruleUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const rule = await alarmRepository.updateRule(id, req.body);
    if (!rule) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    await alarmEvaluator.reloadRules();
    res.json(rule);
  }),
);

router.delete(
  "/rules/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await alarmRepository.deleteRule(id);
    if (!deleted) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    await alarmEvaluator.reloadRules();
    res.json({ message: "Rule deleted successfully" });
  }),
);

export default router;
