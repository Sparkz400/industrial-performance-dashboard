import express, { type Request, type Response } from "express";
import config from "../config/config.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import {
  authorizationRequest,
  completeSignIn,
  oidcEnabled,
  signInAccount,
  verifyLogoutToken,
} from "../services/oidc.js";
import {
  beginSession,
  endProviderSessions,
} from "../services/sessionAccess.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import logger from "../utils/logger.js";

// E02: single sign-on. Mounted before requireAuth; the back-channel endpoint has no session.
const router = express.Router();
const SIGN_IN_WINDOW_MS = 10 * 60_000;

const saveSession = (req: Request) =>
  new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );

router.get("/config", (req: Request, res: Response) => {
  // A failed sign-in's reason is shown once on the login page, never put in the URL.
  const error = req.session.oidcError;
  if (error) {
    delete req.session.oidcError;
    req.session.save(() => {});
  }
  res.json({
    enabled: oidcEnabled(),
    displayName: config.OIDC_DISPLAY_NAME,
    error: error ?? null,
  });
});

router.get(
  "/start",
  asyncHandler(async (req: Request, res: Response) => {
    if (!oidcEnabled()) throw new NotFoundError("Single sign-on");
    const { url, pending } = await authorizationRequest().catch((error) => {
      logger.warn(`[OIDC] Discovery failed: ${String(error)}`);
      throw new AppError(
        "The identity provider could not be reached, or its certificate or metadata does not match the configuration.",
        502,
        "IDP_UNAVAILABLE",
      );
    });
    req.session.oidcPending = pending;
    await saveSession(req);
    res.redirect(url.href);
  }),
);

router.get(
  "/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const pending = req.session.oidcPending;
    delete req.session.oidcPending;
    const fail = async (reason: string, message: string) => {
      await auditLogService.recordEvent(
        {
          action: "auth.login.failed",
          entityType: "auth",
          message: `Failed single sign-on: ${reason}`,
        },
        getAuditActor(req),
      );
      req.session.oidcError = message;
      await saveSession(req);
      res.redirect(`${config.CLIENT_URL}/login`);
    };
    if (
      !oidcEnabled() ||
      !pending ||
      Date.now() - pending.startedAt > SIGN_IN_WINDOW_MS
    )
      return fail(
        "no sign-in pending in this browser",
        "The sign-in expired or was not started here. Try again.",
      );
    let claims;
    try {
      claims = await completeSignIn(
        new URL(req.originalUrl, "http://callback").search,
        pending,
      );
    } catch (error) {
      logger.warn(`[OIDC] Sign-in rejected: ${String(error)}`);
      return fail(
        `identity provider response rejected (${error instanceof Error ? error.message : String(error)})`.slice(
          0,
          300,
        ),
        "The identity provider's response was rejected. Try again or ask an administrator.",
      );
    }
    let account;
    try {
      account = await signInAccount(claims);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return fail(error.message, error.message);
    }
    const { user, groups } = account;
    await beginSession(req, user, {
      issuer: claims.iss,
      subject: claims.sub,
      sid: typeof claims.sid === "string" ? claims.sid : undefined,
    });
    await auditLogService.recordEvent(
      {
        action: "auth.login",
        entityType: "auth",
        entityId: user.id,
        entityName: user.username,
        message: `User "${user.username}" signed in through ${config.OIDC_DISPLAY_NAME} (groups: ${groups.join(", ")}; role: ${user.role})`,
      },
      getAuditActor(req),
    );
    res.redirect(`${config.CLIENT_URL}/`);
  }),
);

router.post(
  "/backchannel-logout",
  express.urlencoded({ extended: false, limit: "16kb" }),
  asyncHandler(async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");
    if (!oidcEnabled()) throw new NotFoundError("Single sign-on");
    const token =
      typeof req.body?.logout_token === "string" ? req.body.logout_token : "";
    let target;
    try {
      target = await verifyLogoutToken(token);
    } catch (error) {
      logger.warn(`[OIDC] Logout token rejected: ${String(error)}`);
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const ended = await endProviderSessions(target);
    await auditLogService.recordEvent({
      action: "auth.backchannel_logout",
      entityType: "auth",
      message: `Identity provider ended ${ended} session(s)`,
    });
    res.status(200).end();
  }),
);

export default router;
