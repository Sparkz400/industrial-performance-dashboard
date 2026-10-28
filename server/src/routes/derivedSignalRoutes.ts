import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { assertMachine } from "../services/accessScope.js";
import {
  derivedInputs,
  evaluateDerivedSignal,
  listDerivedSignals,
  saveDerivedSignal,
} from "../services/derivedSignalService.js";
const router = Router();
const id = Joi.number().integer().positive().required();
router.get(
  "/machines/:id",
  validateQuery(Joi.object({ name: Joi.string().trim().min(1).max(100) })),
  validateParams(Joi.object({ id })),
  asyncHandler(async (req, res) => {
    const machine = Number(req.params.id);
    assertMachine(machine);
    res.set("Cache-Control", "no-store");
    res.json({
      definitions: await listDerivedSignals(
        machine,
        typeof req.query.name === "string" ? req.query.name : undefined,
      ),
      inputs: await derivedInputs(machine),
    });
  }),
);
router.post(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  validateParams(Joi.object({ id })),
  validateBody(
    Joi.object({
      name: Joi.string().trim().min(1).max(100).required(),
      expectedVersion: Joi.number().integer().min(0).required(),
      expression: Joi.object().unknown(true).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machine = Number(req.params.id);
    assertMachine(machine);
    res
      .status(201)
      .json(
        await saveDerivedSignal(
          machine,
          req.session.userId!,
          req.body.name,
          req.body.expectedVersion,
          req.body.expression,
          req.session.userVersion,
        ),
      );
  }),
);
router.get(
  "/machines/:id/:definitionId/evaluate",
  validateParams(Joi.object({ id, definitionId: id })),
  validateQuery(
    Joi.object({
      start: Joi.string()
        .isoDate()
        .strict()
        .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
        .required(),
      end: Joi.string()
        .isoDate()
        .strict()
        .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machine = Number(req.params.id);
    assertMachine(machine);
    res.set("Cache-Control", "no-store");
    res.json(
      await evaluateDerivedSignal(
        machine,
        Number(req.params.definitionId),
        new Date(String(req.query.start)),
        new Date(String(req.query.end)),
      ),
    );
  }),
);
export default router;
