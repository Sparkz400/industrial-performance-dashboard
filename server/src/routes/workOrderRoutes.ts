import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import {
  exchangeOrders,
  exportOrderCompletions,
  orderDocumentSchema,
} from "../services/workOrderExchange.js";

const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
router.use(requireRole("admin", "supervisor"));
for (const action of ["preview", "apply"] as const)
  router.post(
    `/machines/:id/${action}`,
    validateParams(id),
    validateBody(
      Joi.object({
        document: orderDocumentSchema,
        ...(action === "apply"
          ? {
              review: Joi.object().unknown(true).required(),
              token: Joi.string().hex().length(64).required(),
            }
          : {}),
      }),
    ),
    asyncHandler(async (req, res) => {
      assertMachine(req.params.id);
      res.json(
        await exchangeOrders(
          Number(req.params.id),
          req.session.userId!,
          req.body.document,
          action === "apply"
            ? { review: req.body.review, token: req.body.token }
            : undefined,
        ),
      );
    }),
  );
router.get(
  "/machines/:id/completions",
  validateParams(id),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.set("Cache-Control", "no-store");
    res.json(await exportOrderCompletions(Number(req.params.id)));
  }),
);
export default router;
