import { auditRequest } from "../services/auditLogService.js";
import { Router } from "express";
import Joi from "joi";
import { requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { configBundleService } from "../services/configBundleService.js";
const router = Router();
router.use(requireRole("admin"));
const params = Joi.object({
  id: Joi.number().integer().positive().required(),
  receipt: Joi.string().guid(),
});
router.get(
  "/machines/:id",
  validateParams(params),
  asyncHandler(async (req, res) => {
    res.json(await configBundleService.list(Number(req.params.id)));
  }),
);
router.post(
  "/machines/:id/export",
  validateParams(params),
  auditRequest(
    "export.configuration",
    "machine",
    "Exported a configuration bundle",
  ),
  validateBody(
    Joi.object({
      dashboardIds: Joi.array()
        .items(Joi.string().max(100))
        .max(20)
        .default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await configBundleService.export(
        Number(req.params.id),
        req.body.dashboardIds,
      ),
    );
  }),
);
router.post(
  "/machines/:id/preview",
  validateParams(params),
  validateBody(Joi.object({ bundle: Joi.object().required() })),
  asyncHandler(async (req, res) => {
    res.json(
      await configBundleService.preview(Number(req.params.id), req.body.bundle),
    );
  }),
);
router.post(
  "/machines/:id/apply",
  validateParams(params),
  validateBody(
    Joi.object({
      bundle: Joi.object().required(),
      fingerprint: Joi.string().hex().length(64).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await configBundleService.apply(
          Number(req.params.id),
          req.body.bundle,
          req.body.fingerprint,
          req.session.userId!,
        ),
      );
  }),
);
router.post(
  "/machines/:id/rollback/:receipt",
  validateParams(params),
  validateBody(Joi.object({})),
  asyncHandler(async (req, res) => {
    res.json(
      await configBundleService.rollback(
        Number(req.params.id),
        String(req.params.receipt),
        req.session.userId!,
      ),
    );
  }),
);
export default router;
