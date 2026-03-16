import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateParams, validateQuery } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  complianceService,
  getComplianceActor,
} from "../services/complianceService.js";
import { dashboardVersionService } from "../services/dashboardVersionService.js";

const router = express.Router();

// All compliance routes require authentication
router.use(requireAuth);

// --- Schemas ---

const listLogsQuerySchema = Joi.object({
  action: Joi.string().max(100).optional(),
  entityType: Joi.string().max(100).optional(),
  search: Joi.string().max(255).optional(),
  userId: Joi.number().integer().positive().optional(),
  dateFrom: Joi.string().isoDate().optional(),
  dateTo: Joi.string().isoDate().optional(),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

const exportQuerySchema = Joi.object({
  format: Joi.string().valid("csv", "json").default("json"),
  dateFrom: Joi.string().isoDate().optional(),
  dateTo: Joi.string().isoDate().optional(),
  entityType: Joi.string().max(100).optional(),
});

const integrityQuerySchema = Joi.object({
  dateFrom: Joi.string().isoDate().optional(),
  dateTo: Joi.string().isoDate().optional(),
});

const dashboardIdParamSchema = Joi.object({
  id: Joi.string().required().min(3).max(100),
});

const dashboardVersionParamSchema = Joi.object({
  id: Joi.string().required().min(3).max(100),
  version: Joi.number().integer().positive().required(),
});

const diffQuerySchema = Joi.object({
  versionA: Joi.number().integer().positive().required(),
  versionB: Joi.number().integer().positive().required(),
});

// --- Routes ---

// GET / - List compliance audit logs
router.get(
  "/",
  requireRole("admin"),
  validateQuery(listLogsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const logs = await complianceService.listComplianceLogs(req.query as any);
    res.json(logs);
  }),
);

// POST /verify-signature - Verify electronic signature
router.post(
  "/verify-signature",
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    if (!userId) {
      res
        .status(401)
        .json({ status: "error", error: "Authentication required" });
      return;
    }

    const { password } = req.body;
    if (!password || typeof password !== "string") {
      res.status(400).json({ status: "error", error: "Password is required" });
      return;
    }

    const result = await complianceService.verifyElectronicSignature(
      userId,
      password,
    );
    res.json({ verified: result.verified });
  }),
);

// GET /integrity-check - Verify checksum chain integrity
router.get(
  "/integrity-check",
  requireRole("admin"),
  validateQuery(integrityQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await complianceService.verifyAuditIntegrity({
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    });
    res.json(result);
  }),
);

// GET /export - Export audit report
router.get(
  "/export",
  requireRole("admin"),
  validateQuery(exportQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const format = (req.query.format as "csv" | "json") || "json";
    const filters = {
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      entityType: req.query.entityType as string | undefined,
    };

    const result = await complianceService.exportAuditReport(filters, format);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="compliance-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(result);
    } else {
      res.json(result);
    }
  }),
);

// GET /dashboards/:id/versions - List dashboard versions
router.get(
  "/dashboards/:id/versions",
  validateParams(dashboardIdParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const versions = await dashboardVersionService.listVersions(req.params.id);
    res.json(versions);
  }),
);

// GET /dashboards/:id/versions/:version - Get specific version
router.get(
  "/dashboards/:id/versions/:version",
  validateParams(dashboardVersionParamSchema),
  asyncHandler(
    async (req: Request<{ id: string; version: string }>, res: Response) => {
      const { id } = req.params;
      const version = Number(req.params.version);
      const versions = await dashboardVersionService.listVersions(id);
      const found = versions.find(
        (v: { version: number }) => v.version === version,
      );

      if (!found) {
        res
          .status(404)
          .json({ status: "error", error: `Version ${version} not found` });
        return;
      }

      res.json(found);
    },
  ),
);

// GET /dashboards/:id/diff - Diff two versions
router.get(
  "/dashboards/:id/diff",
  validateParams(dashboardIdParamSchema),
  validateQuery(diffQuerySchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const versionA = Number(req.query.versionA);
    const versionB = Number(req.query.versionB);
    const diff = await dashboardVersionService.getVersionDiff(
      req.params.id,
      versionA,
      versionB,
    );
    res.json(diff);
  }),
);

// POST /dashboards/:id/restore/:version - Restore a version
router.post(
  "/dashboards/:id/restore/:version",
  requireRole("admin"),
  validateParams(dashboardVersionParamSchema),
  asyncHandler(
    async (req: Request<{ id: string; version: string }>, res: Response) => {
      const { id } = req.params;
      const version = Number(req.params.version);
      const userId = req.session?.userId ?? null;

      const restored = await dashboardVersionService.restoreVersion(
        id,
        version,
        userId,
      );

      // Record compliance event for the restore action
      const actor = getComplianceActor(req);
      await complianceService.recordComplianceEvent(
        {
          action: "dashboard.version_restored",
          entityType: "dashboard",
          entityId: id,
          message: `Restored dashboard "${id}" to version ${version}`,
          metadata: { restoredVersion: version },
          reasonForChange:
            req.body.reasonForChange ?? `Restored to version ${version}`,
        },
        actor,
      );

      res.json(restored);
    },
  ),
);

export default router;
