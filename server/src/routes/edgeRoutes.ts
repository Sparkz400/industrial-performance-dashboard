import express, { type Request, type Response } from "express";
import Joi from "joi";
import { X509Certificate } from "node:crypto";

import { validateBody } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import { edgeSync } from "../services/edgeSyncService.js";
import { ValidationError } from "../utils/errors.js";

// H08/E04 edge side: this installation's link to a central installation. Administrator-only.
const router = express.Router();
router.use(requireRole("admin"));

router.get(
  "/link",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await edgeSync.status());
  }),
);

router.post(
  "/link",
  validateBody(
    Joi.object({
      centralUrl: Joi.string()
        .uri({ scheme: ["https"] })
        .max(500)
        .required(),
      caCertificate: Joi.string()
        .max(16384)
        .pattern(/-----BEGIN CERTIFICATE-----/)
        .required(),
      enrollmentCode: Joi.string()
        .pattern(/^pdee_[A-Za-z0-9_-]{43}$/)
        .required(),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      new X509Certificate(req.body.caCertificate);
    } catch {
      throw new ValidationError(
        "The CA certificate is not a readable PEM certificate",
      );
    }
    const status = await edgeSync.enroll(req.body, req.session.userId!);
    await auditLogService.recordEvent(
      {
        action: "edge.link.enrolled",
        entityType: "edge",
        message: `Linked to ${req.body.centralUrl} as edge "${status.linked ? status.edgeName : ""}"`,
      },
      getAuditActor(req),
    );
    res.status(201).json(status);
  }),
);

router.delete(
  "/link",
  asyncHandler(async (req: Request, res: Response) => {
    await edgeSync.unlink();
    await auditLogService.recordEvent(
      {
        action: "edge.link.removed",
        entityType: "edge",
        message:
          "Link to the central installation removed; local history is kept",
      },
      getAuditActor(req),
    );
    res.status(204).end();
  }),
);

export default router;
