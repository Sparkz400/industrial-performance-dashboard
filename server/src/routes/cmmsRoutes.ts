import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { assertMachine } from "../services/accessScope.js";
import manager from "../database/dbConnection.js";
import { listCmms, previewCmms, submitCmms } from "../services/cmmsHandoff.js";
const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
router.use(requireRole("admin", "supervisor"));
router.get(
  "/machines/:id/destinations",
  validateParams(id),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.json(
      (
        await manager.pool.query(
          "SELECT id,name FROM webhooks WHERE is_active AND events ? 'cmms.handoff' ORDER BY name LIMIT 100",
        )
      ).rows,
    );
  }),
);
router.get(
  "/machines/:id/handoffs",
  validateParams(id),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    const rows = await listCmms(Number(req.params.id));
    res.json({ rows: rows.slice(0, 100), truncated: rows.length > 100 });
  }),
);
router.post(
  "/machines/:id/preview",
  validateParams(id),
  validateBody(
    Joi.object({
      source: Joi.string().trim().min(1).max(100).required(),
      actionId: Joi.number().integer().positive().required(),
      webhookId: Joi.number().integer().min(0).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.json(
      await previewCmms(
        Number(req.params.id),
        req.session.userId!,
        req.body.actionId,
        req.body.webhookId,
        req.body.source,
      ),
    );
  }),
);
router.post(
  "/machines/:id/handoffs",
  validateParams(id),
  validateBody(
    Joi.object({
      signature: Joi.string()
        .pattern(/^[a-f0-9]{64}$/)
        .required(),
      review: Joi.object({
        source: Joi.string().trim().min(1).max(100).required(),
        machineId: Joi.number().integer().positive().required(),
        actorId: Joi.number().integer().positive().required(),
        actionId: Joi.number().integer().positive().required(),
        webhookId: Joi.number().integer().positive().required(),
        actionVersion: Joi.number().integer().positive().required(),
        contentDigest: Joi.string().length(64).required(),
        destinationDigest: Joi.string().length(64).required(),
        expiresAt: Joi.string().isoDate().required(),
      }).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    const result = await submitCmms(
      Number(req.params.id),
      req.session.userId!,
      req.session.userVersion!,
      req.body.review,
      req.body.signature,
    );
    res.status(result.created ? 201 : 200).json(result.handoff);
  }),
);
export default router;
