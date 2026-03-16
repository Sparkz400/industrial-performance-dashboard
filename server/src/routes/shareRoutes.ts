import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { shareService } from "../services/shareService.js";

const router = express.Router();

const dashboardIdSchema = Joi.object({ dashboardId: Joi.string().required() });
const tokenParamSchema = Joi.object({
  token: Joi.string().required().length(64),
});
const shareIdSchema = Joi.object({ id: Joi.number().integer().required() });

const createShareSchema = Joi.object({
  expiresInHours: Joi.number()
    .integer()
    .min(1)
    .max(8760)
    .allow(null)
    .optional(),
  allowEmbed: Joi.boolean().default(false),
});

// --- Public routes (no auth required) ---

// Get shared dashboard by token
router.get(
  "/public/:token",
  validateParams(tokenParamSchema),
  asyncHandler(async (req: Request<{ token: string }>, res: Response) => {
    const { dashboard } = await shareService.getDashboardByToken(
      req.params.token,
    );
    res.json({ dashboard });
  }),
);

// Get embed dashboard by token
router.get(
  "/embed/:token",
  validateParams(tokenParamSchema),
  asyncHandler(async (req: Request<{ token: string }>, res: Response) => {
    const { dashboard } = await shareService.getEmbedDashboard(
      req.params.token,
    );
    res.json({ dashboard });
  }),
);

// --- Authenticated routes ---

// Create share token for a dashboard
router.post(
  "/dashboards/:dashboardId",
  requireAuth,
  validateParams(dashboardIdSchema),
  validateBody(createShareSchema),
  asyncHandler(async (req: Request<{ dashboardId: string }>, res: Response) => {
    const result = await shareService.createShareToken({
      dashboardId: req.params.dashboardId,
      expiresInHours: req.body.expiresInHours,
      allowEmbed: req.body.allowEmbed,
      createdBy: req.session.userId!,
    });
    res.status(201).json(result);
  }),
);

// List share tokens for a dashboard
router.get(
  "/dashboards/:dashboardId",
  requireAuth,
  validateParams(dashboardIdSchema),
  asyncHandler(async (req: Request<{ dashboardId: string }>, res: Response) => {
    const shares = await shareService.getSharesForDashboard(
      req.params.dashboardId,
    );
    res.json(shares);
  }),
);

// Revoke a share token
router.delete(
  "/:id",
  requireAuth,
  validateParams(shareIdSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await shareService.revokeShare(Number(req.params.id));
    res.json({ message: "Share link revoked" });
  }),
);

export default router;
