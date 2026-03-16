import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { customWidgetService } from "../services/customWidgetService.js";

const router = express.Router();

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });

const registerSchema = Joi.object({
  manifestUrl: Joi.string().required().uri().max(2048),
});

const toggleSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

// List all custom widgets
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const widgets = await customWidgetService.listWidgets();
    res.json(widgets);
  }),
);

// Register a new custom widget
router.post(
  "/",
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const widget = await customWidgetService.registerWidget(
      req.body.manifestUrl,
      req.session.userId!,
    );
    res.status(201).json(widget);
  }),
);

// Toggle widget active state
router.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(toggleSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const widget = await customWidgetService.toggleWidget(
      Number(req.params.id),
      req.body.isActive,
    );
    res.json(widget);
  }),
);

// Unregister a custom widget
router.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await customWidgetService.unregisterWidget(Number(req.params.id));
    res.json({ message: "Custom widget unregistered" });
  }),
);

export default router;
