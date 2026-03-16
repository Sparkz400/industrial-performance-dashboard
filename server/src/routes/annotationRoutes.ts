import { Router, type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { annotationRepository } from "../repositories/annotationRepository.js";

const router = Router();

const dashboardQuerySchema = Joi.object({
  dashboardId: Joi.string().required(),
});

const createSchema = Joi.object({
  id: Joi.string().required(),
  widgetId: Joi.string().required(),
  dashboardId: Joi.string().required(),
  text: Joi.string().required().min(1),
  color: Joi.string().max(20).default("#ff9800"),
  timestamp: Joi.date().iso().required(),
});

const updateSchema = Joi.object({
  text: Joi.string().min(1).optional(),
  color: Joi.string().max(20).optional(),
}).min(1);

const idParamSchema = Joi.object({ id: Joi.string().required() });

router.get(
  "/",
  validateQuery(dashboardQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId } = req.query as { dashboardId: string };
    const annotations = await annotationRepository.listByDashboard(dashboardId);
    res.json(annotations);
  }),
);

router.post(
  "/",
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const annotation = await annotationRepository.create({
      ...req.body,
      userId: (req as any).session?.userId ?? null,
    });
    res.status(201).json(annotation);
  }),
);

router.put(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await annotationRepository.update(
      String(req.params.id),
      req.body,
    );
    if (!updated) {
      res.status(404).json({ error: "Annotation not found" });
      return;
    }
    res.json(updated);
  }),
);

router.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await annotationRepository.delete(String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: "Annotation not found" });
      return;
    }
    res.json({ message: "Annotation deleted successfully" });
  }),
);

export default router;
