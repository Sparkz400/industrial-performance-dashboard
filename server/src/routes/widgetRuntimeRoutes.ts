import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { customWidgetService } from "../services/customWidgetService.js";

/** Read-only registrations for rendering widgets on any dashboard a user may open. */
const router = Router();
router.get(
  "/registrations",
  asyncHandler(async (_req, res) => {
    res.json(await customWidgetService.runtimeRegistrations());
  }),
);
export default router;
