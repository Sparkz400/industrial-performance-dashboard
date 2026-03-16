import express, { type Request, type Response } from "express";
import Joi from "joi";

import { validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  auditLogService,
  type AuditLogQuery,
} from "../services/auditLogService.js";

const router = express.Router();

const auditLogQuerySchema = Joi.object({
  action: Joi.string().trim().max(100).optional(),
  entityType: Joi.string().trim().max(100).optional(),
  search: Joi.string().trim().max(255).optional(),
  userId: Joi.number().integer().positive().optional(),
  dateFrom: Joi.string().isoDate().optional(),
  dateTo: Joi.string().isoDate().optional(),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

router.get(
  "/",
  validateQuery(auditLogQuerySchema),
  asyncHandler(
    async (
      req: Request<unknown, unknown, unknown, AuditLogQuery>,
      res: Response,
    ) => {
      res.json(await auditLogService.listLogs(req.query));
    },
  ),
);

export default router;
