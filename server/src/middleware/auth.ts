import type { Request, Response, NextFunction } from "express";
import logger from "../utils/logger.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

export type UserRole = "admin" | "viewer";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userRole?: UserRole;
    username?: string;
  }
}

/**
 * Middleware that requires a valid authenticated session.
 * Throws UnauthorizedError if the user is not logged in.
 */
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.session?.userId) {
    logger.warn(
      `[Auth] Unauthenticated request to ${req.method} ${req.originalUrl}`,
    );
    next(new UnauthorizedError());
    return;
  }
  next();
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
