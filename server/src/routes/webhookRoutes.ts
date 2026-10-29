import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { webhookService } from "../services/webhookService.js";
import {
  auditLogService,
  auditRequest,
  getAuditActor,
} from "../services/auditLogService.js";

const router = express.Router();

const idParamSchema = Joi.object({ id: Joi.number().integer().required() });

const routing = {
  minSeverity: Joi.string()
    .valid("info", "low", "medium", "high", "critical")
    .allow(null),
  machineIds: Joi.array().items(Joi.number().integer().positive()).max(100),
};
const recipients = Joi.array().items(Joi.string().email()).min(1).max(20);

const createWebhookSchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(255),
  kind: Joi.string().valid("webhook", "email").default("webhook"),
  // Email destinations carry alarm events only; handoffs need a signed receiver.
  url: Joi.when("kind", {
    is: "email",
    then: Joi.forbidden(),
    otherwise: Joi.string().required().uri().max(2048),
  }),
  recipients: Joi.when("kind", {
    is: "email",
    then: recipients.required(),
    otherwise: Joi.forbidden(),
  }),
  events: Joi.when("kind", {
    is: "email",
    then: Joi.array()
      .items(Joi.string().valid("alarm.triggered", "alarm.cleared"))
      .min(1)
      .required(),
    otherwise: Joi.array()
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
  }),
  ...routing,
});

const updateWebhookSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255),
  url: Joi.string().uri().max(2048),
  recipients,
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
  ...routing,
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

// Dead-letter inspection: the exact queued event, without destination secrets.
router.get(
  "/deliveries/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.json(await webhookService.getDelivery(Number(req.params.id)));
  }),
);

router.post(
  "/deliveries/:id/requeue",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const requeued = await webhookService.requeueDelivery(
      Number(req.params.id),
    );
    await auditLogService.recordEvent(
      {
        action: "webhook.delivery.requeued",
        entityType: "webhook_delivery",
        entityId: requeued.id,
        message: `Requeued dead-lettered delivery ${requeued.id}`,
      },
      getAuditActor(req),
    );
    res.json(requeued);
  }),
);

// Create webhook
router.post(
  "/",
  validateBody(createWebhookSchema),
  auditRequest("webhook.created", "webhook", "Created an outbound destination"),
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
  auditRequest("webhook.updated", "webhook", "Changed an outbound destination"),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const webhook = await webhookService.updateWebhook(
      Number(req.params.id),
      req.body,
    );
    // The secret is shown once at creation; later responses carry only its prefix.
    res.json({ ...webhook, secret: webhook.secret.substring(0, 10) + "..." });
  }),
);

// Delete webhook
router.delete(
  "/:id",
  validateParams(idParamSchema),
  auditRequest("webhook.deleted", "webhook", "Deleted an outbound destination"),
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
