import express, { type Request, type Response } from "express";
import Joi from "joi";

import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { digitalTwinService } from "../services/digitalTwinService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";

const router = express.Router();

// --- Schemas ---

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });
const instanceIdParamSchema = Joi.object({
  id: Joi.number().integer().required(),
});

const createTemplateSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(255),
  description: Joi.string().allow("", null).optional(),
  svgContent: Joi.string().required().min(10),
  elementMappings: Joi.array().items(Joi.object()).default([]),
  category: Joi.string().max(100).default("general"),
});

const updateTemplateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  description: Joi.string().allow("", null),
  svgContent: Joi.string().min(10),
  elementMappings: Joi.array().items(Joi.object()),
  category: Joi.string().max(100),
}).min(1);

const createInstanceSchema = Joi.object({
  templateId: Joi.number().integer().required(),
  machineId: Joi.number().integer().required(),
  name: Joi.string().required().trim().min(1).max(255),
  nodeBindings: Joi.array().items(Joi.object()).default([]),
  displayConfig: Joi.object().default({}),
});

const updateInstanceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  nodeBindings: Joi.array().items(Joi.object()),
  displayConfig: Joi.object(),
  isActive: Joi.boolean(),
}).min(1);

const elementHistorySchema = Joi.object({
  elementId: Joi.string().required(),
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
});

// --- Template Routes ---

router.get(
  "/templates",
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = await digitalTwinService.listTemplates();
    // Return without svgContent for list view
    res.json(
      templates.map(
        (template: { svgContent: string } & Record<string, unknown>) => {
          const { svgContent: _svgContent, ...rest } = template;
          return rest;
        },
      ),
    );
  }),
);

router.post(
  "/templates",
  requireRole("admin"),
  validateBody(createTemplateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const template = await digitalTwinService.createTemplate({
      ...req.body,
      createdBy: req.session.userId,
    });
    await auditLogService.recordEvent(
      {
        action: "digital_twin.template_created",
        entityType: "digital_twin_template",
        entityId: template.id,
        entityName: template.name,
        message: `Created digital twin template "${template.name}"`,
      },
      getAuditActor(req),
    );
    res.status(201).json(template);
  }),
);

router.get(
  "/templates/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.json(await digitalTwinService.getTemplateById(Number(req.params.id)));
  }),
);

router.put(
  "/templates/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(updateTemplateSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const template = await digitalTwinService.updateTemplate(
      Number(req.params.id),
      req.body,
    );
    res.json(template);
  }),
);

router.delete(
  "/templates/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await digitalTwinService.deleteTemplate(Number(req.params.id));
    res.json({ message: "Template deleted successfully" });
  }),
);

// --- Instance Routes ---

router.get(
  "/instances",
  asyncHandler(async (req: Request, res: Response) => {
    const machineId = req.query.machineId
      ? Number(req.query.machineId)
      : undefined;
    res.json(await digitalTwinService.listInstances(machineId));
  }),
);

router.post(
  "/instances",
  requireRole("admin"),
  validateBody(createInstanceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const instance = await digitalTwinService.createInstance({
      ...req.body,
      createdBy: req.session.userId,
    });
    await auditLogService.recordEvent(
      {
        action: "digital_twin.instance_created",
        entityType: "digital_twin_instance",
        entityId: instance.id,
        entityName: instance.name,
        message: `Created digital twin instance "${instance.name}"`,
      },
      getAuditActor(req),
    );
    res.status(201).json(instance);
  }),
);

router.get(
  "/instances/:id",
  validateParams(instanceIdParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.json(
      await digitalTwinService.getInstanceWithLiveData(Number(req.params.id)),
    );
  }),
);

router.put(
  "/instances/:id",
  requireRole("admin"),
  validateParams(instanceIdParamSchema),
  validateBody(updateInstanceSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const instance = await digitalTwinService.updateInstance(
      Number(req.params.id),
      req.body,
    );
    res.json(instance);
  }),
);

router.delete(
  "/instances/:id",
  requireRole("admin"),
  validateParams(instanceIdParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await digitalTwinService.deleteInstance(Number(req.params.id));
    res.json({ message: "Instance deleted successfully" });
  }),
);

router.get(
  "/instances/:id/element-history",
  validateParams(instanceIdParamSchema),
  validateQuery(elementHistorySchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { elementId, startDate, endDate } = req.query as Record<
      string,
      string
    >;
    const history = await digitalTwinService.getElementHistory(
      Number(req.params.id),
      elementId,
      new Date(startDate),
      new Date(endDate),
    );
    res.json(history);
  }),
);

export default router;
