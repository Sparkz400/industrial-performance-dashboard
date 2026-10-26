import { Router, type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { reportRepository } from "../repositories/reportRepository.js";
import { reportSchedulerService } from "../services/reportSchedulerService.js";
import { reportGeneratorService } from "../services/reportGeneratorService.js";
import { NotFoundError } from "../utils/errors.js";

const router = Router();

// All report routes require authentication
router.use(requireAuth);

// ===== Validation Schemas =====

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });
const templateConfigSchema = Joi.object({
  title: Joi.string().max(500),
  lookbackHours: Joi.number().greater(0).max(744),
  sections: Joi.array()
    .max(50)
    .items(
      Joi.object({
        type: Joi.string().max(100).required(),
        title: Joi.string().max(500),
        machineId: Joi.number().integer().positive(),
        nodeKeys: Joi.array().max(32).items(Joi.string().max(255)),
      }).unknown(true),
    ),
}).unknown(true);
const timezoneSchema = Joi.string()
  .max(50)
  .custom((value, helpers) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return value;
    } catch {
      return helpers.error("any.invalid");
    }
  });
const cronSchema = Joi.string()
  .min(1)
  .max(100)
  .custom((value, helpers) =>
    reportSchedulerService.calculateNextRun(value)
      ? value
      : helpers.error("any.invalid"),
  );

// --- Templates ---

const templateBodySchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  type: Joi.string().required().min(1).max(50),
  description: Joi.string().optional().allow("", null),
  templateConfig: templateConfigSchema.required(),
  plantId: Joi.number().integer().optional().allow(null),
  isActive: Joi.boolean().default(true),
});

const templateUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  type: Joi.string().min(1).max(50).optional(),
  description: Joi.string().optional().allow("", null),
  templateConfig: templateConfigSchema.optional(),
  plantId: Joi.number().integer().optional().allow(null),
  isActive: Joi.boolean().optional(),
}).min(1);

// --- Schedules ---

const scheduleBodySchema = Joi.object({
  templateId: Joi.number().integer().required(),
  name: Joi.string().required().min(1).max(255),
  cronExpression: cronSchema.required(),
  timezone: timezoneSchema.default("UTC"),
  machineIds: Joi.array()
    .max(100)
    .items(Joi.number().integer().positive())
    .unique()
    .default([]),
  recipients: Joi.array().items(Joi.string().email()).default([]),
  deliveryChannels: Joi.array()
    .items(Joi.string().valid("email"))
    .default(["email"]),
  isActive: Joi.boolean().default(true),
});

const scheduleUpdateSchema = Joi.object({
  templateId: Joi.number().integer().optional(),
  name: Joi.string().min(1).max(255).optional(),
  cronExpression: cronSchema.optional(),
  timezone: timezoneSchema.optional(),
  machineIds: Joi.array()
    .max(100)
    .items(Joi.number().integer().positive())
    .unique()
    .optional(),
  recipients: Joi.array().items(Joi.string().email()).optional(),
  deliveryChannels: Joi.array().items(Joi.string().valid("email")).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

// --- History ---

const historyQuerySchema = Joi.object({
  scheduleId: Joi.number().integer().optional(),
  status: Joi.string().valid("generating", "completed", "failed").optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(500).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// =========================================================================
// Templates
// =========================================================================

router.get(
  "/templates",
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = await reportRepository.listTemplates();
    res.json(templates);
  }),
);

router.post(
  "/templates",
  requireRole("admin"),
  validateBody(templateBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const template = await reportRepository.createTemplate({
      ...req.body,
      createdBy: req.session?.userId ?? null,
    });
    res.status(201).json(template);
  }),
);

router.put(
  "/templates/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(templateUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const template = await reportRepository.updateTemplate(id, req.body);
    if (!template) {
      throw new NotFoundError("Report template");
    }
    res.json(template);
  }),
);

router.delete(
  "/templates/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await reportRepository.deleteTemplate(id);
    if (!deleted) {
      throw new NotFoundError("Report template");
    }
    res.json({ message: "Template deleted successfully" });
  }),
);

// =========================================================================
// Schedules
// =========================================================================

router.get(
  "/schedules",
  asyncHandler(async (_req: Request, res: Response) => {
    const schedules = await reportRepository.listSchedules();
    res.json(
      schedules.map((schedule) => ({
        ...schedule,
        nextRunAt: schedule.isActive
          ? reportSchedulerService.calculateNextRun(
              schedule.cronExpression,
              schedule.timezone ?? "UTC",
            )
          : null,
      })),
    );
  }),
);

router.post(
  "/schedules",
  requireRole("admin"),
  validateBody(scheduleBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const schedule = await reportRepository.createSchedule({
      ...req.body,
      createdBy: req.session?.userId ?? null,
    });
    await reportSchedulerService.refreshAll();
    res.status(201).json(schedule);
  }),
);

router.put(
  "/schedules/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(scheduleUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const schedule = await reportRepository.updateSchedule(id, req.body);
    if (!schedule) {
      throw new NotFoundError("Report schedule");
    }
    await reportSchedulerService.refreshAll();
    res.json(schedule);
  }),
);

router.delete(
  "/schedules/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const deleted = await reportRepository.deleteSchedule(id);
    if (!deleted) {
      throw new NotFoundError("Report schedule");
    }
    await reportSchedulerService.refreshAll();
    res.json({ message: "Schedule deleted successfully" });
  }),
);

router.post(
  "/schedules/:id/run-now",
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const schedule = await reportRepository.findScheduleById(id);
    if (!schedule) {
      throw new NotFoundError("Report schedule");
    }

    // Trigger generation asynchronously — return immediately
    reportGeneratorService.generate(id).catch((err) => {
      // Error is already logged inside the generator
    });

    res.json({ message: "Report generation started", scheduleId: id });
  }),
);

// =========================================================================
// History
// =========================================================================

router.get(
  "/history",
  validateQuery(historyQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as {
      scheduleId?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    };
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const [history, total] = await Promise.all([
      reportRepository.listHistory(filters),
      reportRepository.countHistory(filters),
    ]);
    res.json({
      data: history,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
    });
  }),
);

router.get(
  "/history/:id/download",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const entry = await reportRepository.findHistoryById(id);
    if (!entry || !entry.filePath) {
      throw new NotFoundError("Report file");
    }

    res.download(entry.filePath);
  }),
);

export default router;
