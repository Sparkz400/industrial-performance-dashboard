import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SHARE_LIMITS, shareService } from "../services/shareService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
const router = Router();

const GONE =
  "This shared view is unavailable. It may have expired or been revoked.";

/** Public reads: no session, no caching, one generic answer for every unusable link. */
const resolvePublic = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    const share = await shareService.resolve(String(req.params.token));
    if (!share) {
      res.status(410).json({ error: GONE });
      return;
    }
    res.locals.share = share;
    next();
  },
);
router.get(
  "/public/:token",
  resolvePublic,
  asyncHandler(async (_req, res) => {
    res.json(await shareService.publicView(res.locals.share));
  }),
);
router.get(
  "/public/:token/widgets/:widgetId/data",
  resolvePublic,
  asyncHandler(async (req, res) => {
    res.json(
      await shareService.publicData(
        res.locals.share,
        String(req.params.widgetId),
      ),
    );
  }),
);
// Retired endpoint from the unscoped embed design.
router.get("/embed/:token", (_req, res) => {
  res.set("Cache-Control", "no-store").status(410).json({ error: GONE });
});

router.use(requireAuth, requireRole("admin"));
const dashboardParams = validateParams(
  Joi.object({ dashboardId: Joi.string().max(200).required() }),
);
router.get(
  "/dashboards/:dashboardId",
  dashboardParams,
  asyncHandler(async (req, res) => {
    res.json(
      await shareService.getSharesForDashboard(String(req.params.dashboardId)),
    );
  }),
);
router.post(
  "/dashboards/:dashboardId",
  dashboardParams,
  validateBody(
    Joi.object({
      widgetIds: Joi.array()
        .items(Joi.string().max(200))
        .min(1)
        .max(SHARE_LIMITS.maxWidgets)
        .required(),
      label: Joi.string().allow("").max(120),
      expiresAt: Joi.string().isoDate().required(),
      windowHours: Joi.number()
        .integer()
        .min(1)
        .max(SHARE_LIMITS.maxWindowHours)
        .required(),
      allowEmbed: Joi.boolean().required(),
      allowedOrigins: Joi.array()
        .items(Joi.string().max(200))
        .max(SHARE_LIMITS.maxOrigins)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const dashboardId = String(req.params.dashboardId);
    const result = await shareService.createShare(
      dashboardId,
      req.body,
      req.session.userId!,
    );
    await auditLogService.recordEvent(
      {
        action: "share.created",
        entityType: "dashboard",
        entityId: dashboardId,
        message: `Read-only link ${result.share.id} created`,
        metadata: {
          shareId: result.share.id,
          widgets: result.share.widgets,
          windowHours: result.share.windowHours,
          expiresAt: result.share.expiresAt,
          allowedOrigins: result.share.allowedOrigins,
        },
      },
      getAuditActor(req),
    );
    res.status(201).json(result);
  }),
);
router.delete(
  "/:id",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    const share = await shareService.revokeShare(
      Number(req.params.id),
      req.session.userId!,
    );
    await auditLogService.recordEvent(
      {
        action: "share.revoked",
        entityType: "dashboard",
        entityId: share.dashboardId,
        message: `Read-only link ${share.id} revoked`,
        metadata: { shareId: share.id },
      },
      getAuditActor(req),
    );
    res.json(share);
  }),
);
export default router;

/** The embed page may only be framed by the origins its link lists. */
export const embedFramePolicy = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const share = await shareService.resolve(String(req.params.token));
    const ancestors =
      share?.allowEmbed && share.allowedOrigins.length
        ? share.allowedOrigins.join(" ")
        : "'none'";
    const policy = String(res.getHeader("Content-Security-Policy") ?? "");
    res.setHeader(
      "Content-Security-Policy",
      /frame-ancestors [^;]*/.test(policy)
        ? policy.replace(
            /frame-ancestors [^;]*/,
            `frame-ancestors ${ancestors}`,
          )
        : `${policy}${policy ? ";" : ""}frame-ancestors ${ancestors}`,
    );
    res.removeHeader("X-Frame-Options");
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  },
);
