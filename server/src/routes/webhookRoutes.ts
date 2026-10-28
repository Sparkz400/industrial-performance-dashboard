import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { webhookService } from "../services/webhookService.js";

const router = express.Router();

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });

const createWebhookSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(255),
  url: Joi.string().required().uri().max(2048),
  events: Joi.array()
    .items(
      Joi.string().valid(
        "*",
        "alarm.triggered",
        "alarm.cleared",
        "cmms.handoff",
      ),
    )
    .min(1)
    .required(),
});

const updateWebhookSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  url: Joi.string().uri().max(2048),
  events: Joi.array()
    .items(
      Joi.string().valid(
        "*",
        "alarm.triggered",
        "alarm.cleared",
        "cmms.handoff",
      ),
    )
    .min(1),
  isActive: Joi.boolean(),
}).min(1);

// List all webhooks
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const webhooks = await webhookService.listWebhooks();
    // Strip secrets from response
    const safe = webhooks.map(({ secret, ...rest }) => ({
      ...rest,
      secret: secret.substring(0, 10) + "...",
    }));
    res.json(safe);
  }),
);

router.get(
  "/deliveries",
  asyncHandler(async (_req, res) => {
    res.json(await webhookService.listDeliveries());
  }),
);

// Create webhook
router.post(
  "/",
  validateBody(createWebhookSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await webhookService.createWebhook({
      ...req.body,
      createdBy: req.session.userId,
    });
    res.status(201).json(webhook);
  }),
);

// Update webhook
router.put(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateWebhookSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const webhook = await webhookService.updateWebhook(
      Number(req.params.id),
      req.body,
    );
    res.json(webhook);
  }),
);

// Delete webhook
router.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await webhookService.deleteWebhook(Number(req.params.id));
    res.json({ message: "Webhook deleted successfully" });
  }),
);

// Test webhook
router.post(
  "/:id/test",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const result = await webhookService.testWebhook(Number(req.params.id));
    res.json(result);
  }),
);

export default router;
