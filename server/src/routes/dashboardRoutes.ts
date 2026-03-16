import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { dashboardService } from "../services/dashboardService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";

const router = express.Router();
type DashboardIdParams = { id: string };
type DashboardBody = {
  name: string;
  widgets?: unknown;
  layout?: unknown;
};

const idParamSchema = Joi.object({
  id: Joi.string().required().min(3).max(100),
});

const dashboardBodySchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(100),
  widgets: Joi.alternatives()
    .try(Joi.array().items(Joi.object()), Joi.string())
    .default([]),
  layout: Joi.alternatives()
    .try(Joi.array().items(Joi.object()), Joi.string())
    .default([]),
}).unknown(true);

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await dashboardService.listDashboards());
  }),
);

router.post(
  "/import",
  validateBody(dashboardBodySchema),
  asyncHandler(
    async (req: Request<unknown, unknown, DashboardBody>, res: Response) => {
      const dashboard = await dashboardService.importDashboard(req.body);
      await auditLogService.recordEvent(
        {
          action: "dashboard.imported",
          entityType: "dashboard",
          entityId: dashboard.id,
          entityName: dashboard.name,
          message: `Imported dashboard "${dashboard.name}"`,
          metadata: {
            widgetCount: Array.isArray(dashboard.widgets)
              ? dashboard.widgets.length
              : 0,
            layoutItems: Array.isArray(dashboard.layout)
              ? dashboard.layout.length
              : 0,
          },
        },
        getAuditActor(req),
      );
      res.status(201).json(dashboard);
    },
  ),
);

router.get(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<DashboardIdParams>, res: Response) => {
    res.json(await dashboardService.getDashboardById(req.params.id));
  }),
);

router.post(
  "/:id",
  validateParams(idParamSchema),
  validateBody(dashboardBodySchema),
  asyncHandler(
    async (
      req: Request<DashboardIdParams, unknown, DashboardBody>,
      res: Response,
    ) => {
      const dashboard = await dashboardService.saveDashboard({
        id: req.params.id,
        ...req.body,
      });
      await auditLogService.recordEvent(
        {
          action: "dashboard.saved",
          entityType: "dashboard",
          entityId: dashboard.id,
          entityName: dashboard.name,
          message: `Saved dashboard "${dashboard.name}"`,
          metadata: {
            widgetCount: Array.isArray(dashboard.widgets)
              ? dashboard.widgets.length
              : 0,
            layoutItems: Array.isArray(dashboard.layout)
              ? dashboard.layout.length
              : 0,
          },
        },
        getAuditActor(req),
      );
      res.json(dashboard);
    },
  ),
);

router.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<DashboardIdParams>, res: Response) => {
    const dashboard = await dashboardService.getDashboardById(req.params.id);
    await dashboardService.deleteDashboard(req.params.id);
    await auditLogService.recordEvent(
      {
        action: "dashboard.deleted",
        entityType: "dashboard",
        entityId: dashboard.id,
        entityName: dashboard.name,
        message: `Deleted dashboard "${dashboard.name}"`,
      },
      getAuditActor(req),
    );
    res.json({ message: "Dashboard deleted successfully" });
  }),
);

export default router;
