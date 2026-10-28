import { Router } from "express";
import Joi from "joi";
import { requireRole } from "../middleware/auth.js";
import { validateParams, validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { assertMachine } from "../services/accessScope.js";
import { alarmReview, replayAlarmReview } from "../services/alarmReview.js";
const router = Router(),
  id = Joi.number().integer().positive().required(),
  instant = Joi.string()
    .isoDate()
    .strict()
    .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
    .required();
router.use(requireRole("admin", "supervisor"));
router.get(
  "/machines/:id",
  validateParams(Joi.object({ id })),
  validateQuery(Joi.object({ start: instant, end: instant })),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    res.set("Cache-Control", "no-store");
    res.json(
      await alarmReview(
        machineId,
        String(req.query.start),
        String(req.query.end),
      ),
    );
  }),
);
router.get(
  "/machines/:id/replay/:ruleId",
  validateParams(Joi.object({ id, ruleId: id })),
  validateQuery(
    Joi.object({
      start: instant,
      end: instant,
      debounceSeconds: Joi.number().integer().min(0).max(86400).required(),
      clearDebounceSeconds: Joi.number().integer().min(0).max(86400).required(),
      hysteresis: Joi.number().min(0).max(1e12).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    res.set("Cache-Control", "no-store");
    res.json(
      await replayAlarmReview(
        machineId,
        Number(req.params.ruleId),
        String(req.query.start),
        String(req.query.end),
        {
          debounceSeconds: Number(req.query.debounceSeconds),
          clearDebounceSeconds: Number(req.query.clearDebounceSeconds),
          hysteresis: Number(req.query.hysteresis),
        },
      ),
    );
  }),
);
export default router;
