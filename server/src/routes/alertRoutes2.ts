import { Router, type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { alertRepository, type AlertHistoryFilters } from "../repositories/alertRepository.js";
import alertEvaluationService from "../services/alertEvaluationService.js";

const router = Router();

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });

// ===== Rules =====

const rulesQuerySchema = Joi.object({
  machineId: Joi.number().integer().optional(),
  isActive: Joi.boolean().optional(),
});

const ruleBodySchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  description: Joi.string().optional().allow("", null),
  machineId: Joi.number().integer().optional().allow(null),
  plantId: Joi.number().integer().optional().allow(null),
  nodeKey: Joi.string().required(),
  condition: Joi.string()
    .valid("gt", "lt", "eq", "neq", "range", "rate_of_change", "state_change")
    .required(),
  threshold: Joi.number().optional().allow(null),
  thresholdHigh: Joi.number().optional().allow(null),
  rateWindowSeconds: Joi.number().integer().optional().allow(null),
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .default("medium"),
  channels: Joi.array().items(Joi.number().integer()).default([]),
  cooldownSeconds: Joi.number().integer().min(0).default(300),
  isActive: Joi.boolean().default(true),
});

const ruleUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().optional().allow("", null),
  machineId: Joi.number().integer().optional().allow(null),
  plantId: Joi.number().integer().optional().allow(null),
  nodeKey: Joi.string().optional(),
  condition: Joi.string()
    .valid("gt", "lt", "eq", "neq", "range", "rate_of_change", "state_change")
    .optional(),
  threshold: Joi.number().optional().allow(null),
  thresholdHigh: Joi.number().optional().allow(null),
  rateWindowSeconds: Joi.number().integer().optional().allow(null),
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .optional(),
  channels: Joi.array().items(Joi.number().integer()).optional(),
  cooldownSeconds: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

router.get(
  "/rules",
  validateQuery(rulesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await alertRepository.listRules(req.query as {
      machineId?: number;
      isActive?: boolean;
    });
    res.json(rules);
  }),
);

router.post(
  "/rules",
  requireAuth,
  requireRole("admin"),
  validateBody(ruleBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await alertRepository.createRule({
      ...req.body,
      createdBy: req.session?.userId ?? null,
    });
    await alertEvaluationService.refreshRules();
    res.status(201).json(rule);
  }),
);

router.get(
  "/rules/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const rule = await alertRepository.findRuleById(id);
    if (!rule) {
      res.status(404).json({ error: "Alert rule not found" });
      return;
    }
    res.json(rule);
  }),
);

router.put(
  "/rules/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(ruleUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const rule = await alertRepository.updateRule(id, req.body);
    if (!rule) {
      res.status(404).json({ error: "Alert rule not found" });
      return;
    }
    await alertEvaluationService.refreshRules();
    res.json(rule);
  }),
);

router.delete(
  "/rules/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await alertRepository.deleteRule(id);
    if (!deleted) {
      res.status(404).json({ error: "Alert rule not found" });
      return;
    }
    await alertEvaluationService.refreshRules();
    res.json({ message: "Alert rule deleted successfully" });
  }),
);

// ===== History =====

const historyQuerySchema = Joi.object({
  ruleId: Joi.number().integer().optional(),
  severity: Joi.string()
    .valid("critical", "high", "medium", "low", "info")
    .optional(),
  status: Joi.string()
    .valid("active", "acknowledged", "resolved", "silenced")
    .optional(),
  machineId: Joi.number().integer().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(5000).default(100),
  offset: Joi.number().integer().min(0).default(0),
});

router.get(
  "/history",
  validateQuery(historyQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as AlertHistoryFilters;
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const [history, total] = await Promise.all([
      alertRepository.listAlertHistory(filters),
      alertRepository.countAlertHistory(filters),
    ]);
    res.json({
      data: history,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  }),
);

router.put(
  "/history/:id/acknowledge",
  requireAuth,
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const userId = req.session?.userId ?? null;
    const updated = await alertRepository.updateAlertStatus(
      id,
      "acknowledged",
      userId,
    );
    if (!updated) {
      res.status(404).json({ error: "Alert history entry not found" });
      return;
    }
    res.json(updated);
  }),
);

router.put(
  "/history/:id/resolve",
  requireAuth,
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const updated = await alertRepository.updateAlertStatus(id, "resolved");
    if (!updated) {
      res.status(404).json({ error: "Alert history entry not found" });
      return;
    }
    res.json(updated);
  }),
);

// ===== Channels =====

const channelBodySchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  type: Joi.string()
    .valid("email", "slack", "teams", "sms", "in_app")
    .required(),
  config: Joi.object().required(),
  isActive: Joi.boolean().default(true),
});

const channelUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  type: Joi.string()
    .valid("email", "slack", "teams", "sms", "in_app")
    .optional(),
  config: Joi.object().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

router.get(
  "/channels",
  asyncHandler(async (_req: Request, res: Response) => {
    const channels = await alertRepository.listChannels();
    res.json(channels);
  }),
);

router.post(
  "/channels",
  requireAuth,
  requireRole("admin"),
  validateBody(channelBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const channel = await alertRepository.createChannel({
      ...req.body,
      createdBy: req.session?.userId ?? null,
    });
    res.status(201).json(channel);
  }),
);

router.put(
  "/channels/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(channelUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const channel = await alertRepository.updateChannel(id, req.body);
    if (!channel) {
      res.status(404).json({ error: "Notification channel not found" });
      return;
    }
    res.json(channel);
  }),
);

router.delete(
  "/channels/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await alertRepository.deleteChannel(id);
    if (!deleted) {
      res.status(404).json({ error: "Notification channel not found" });
      return;
    }
    res.json({ message: "Notification channel deleted successfully" });
  }),
);

export default router;
