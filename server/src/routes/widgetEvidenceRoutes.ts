import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateParams } from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import { widgetEvidence } from "../services/widgetEvidence.js";
const router = Router();
router.get(
  "/machines/:id",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.set("Cache-Control", "no-store");
    res.json(await widgetEvidence(Number(req.params.id)));
  }),
);
export default router;
