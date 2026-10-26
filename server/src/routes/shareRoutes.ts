import { Router } from "express";
import Joi from "joi";
import { validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { shareService } from "../services/shareService.js";
const router = Router();
router.get(["/public/:token", "/embed/:token"], (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(410).json({
    error:
      "Public links and embeds are disabled pending scoped data access. Sign in to view dashboards.",
  });
});
router.use(requireAuth, requireRole("admin"));
router.post("/dashboards/:dashboardId", (_req, res) => {
  res
    .status(501)
    .json({ error: "Public sharing is disabled pending scoped data access." });
});
router.get(
  "/dashboards/:dashboardId",
  validateParams(Joi.object({ dashboardId: Joi.string().required() })),
  asyncHandler(async (req, res) => {
    res.json(
      await shareService.getSharesForDashboard(String(req.params.dashboardId)),
    );
  }),
);
router.delete(
  "/:id",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    await shareService.revokeShare(Number(req.params.id));
    res.json({ message: "Share link revoked" });
  }),
);
export default router;
