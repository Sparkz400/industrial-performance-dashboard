import type { Request, Response, NextFunction } from "express";
import logger from "../utils/logger.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { getSessionUser } from "../services/sessionAccess.js";

export type UserRole =
  "admin" | "viewer" | "wallboard" | "operator" | "supervisor";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userRole?: UserRole;
    username?: string;
    userVersion?: string;
    oidcIssuer?: string;
    oidcSubject?: string;
    oidcSid?: string;
    oidcAuthTime?: number;
    oidcPending?: import("../services/oidc.js").PendingSignIn;
    oidcError?: { message: string; at: number };
  }
}

/**
 * Middleware that requires a valid authenticated session.
 * Throws UnauthorizedError if the user is not logged in.
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await getSessionUser(req.session);
    if (!user) {
      logger.warn(
        `[Auth] Unauthenticated request to ${req.method} ${req.originalUrl}`,
      );
      next(new UnauthorizedError());
      return;
    }
    req.session.userRole = user.role;
    next();
  } catch (error) {
    next(error);
  }
};

/** Role gates are followed by explicit resource authorization in assetAccess. */
export const requireMutationAccess = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (
    ["wallboard", "viewer"].includes(req.session.userRole ?? "") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    next(new ForbiddenError("This account is read-only"));
    return;
  }
  if (
    /^\/(system|db|opcua|certificates|edge|reports)(?:\/|$)/i.test(req.path)
  ) {
    requireRole("admin")(req, res, next);
    return;
  }
  if (
    req.session.userRole === "supervisor" ||
    (req.session.userRole === "operator" &&
      req.method === "POST" &&
      /^\/maintenance\/plans\/\d+\/events(?:\/\d+\/attachments)?\/?$/.test(
        req.path,
      )) ||
    ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
    (req.method === "POST" &&
      /^\/alarms\/\d+\/acknowledge\/?$/.test(req.path)) ||
    (req.method === "PUT" &&
      /^\/alerts\/history\/\d+\/acknowledge\/?$/.test(req.path)) ||
    (req.method === "POST" &&
      /^\/production\/shifts\/\d+\/(reasons|inspections)\/?$/.test(req.path)) ||
    (req.method === "POST" &&
      /^\/production\/operator\/entries(?:\/\d+)?\/?$/.test(req.path))
  ) {
    next();
    return;
  }
  requireRole("admin")(req, res, next);
};

/**
 * Middleware factory that requires a specific role (or array of roles).
 * Must be used AFTER requireAuth.
 * Throws ForbiddenError if the user lacks the required role.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.session?.userRole;
    if (!userRole || !roles.includes(userRole)) {
      logger.warn(
        `[Auth] Forbidden: user "${req.session?.username}" (role: ${userRole}) attempted ${req.method} ${req.originalUrl}`,
      );
      next(new ForbiddenError());
      return;
    }
    next();
  };
};
