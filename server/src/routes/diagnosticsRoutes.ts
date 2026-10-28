import { Router } from "express";
import Joi from "joi";
import { requireRole } from "../middleware/auth.js";
import { validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { assertMachine } from "../services/accessScope.js";
import { connectionDiagnostics } from "../services/connectionDiagnostics.js";
const router = Router();
router.get(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    res.set("Cache-Control", "no-store");
    res.json(await connectionDiagnostics(machineId));
  }),
);
export default router;
