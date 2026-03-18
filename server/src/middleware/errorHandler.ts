import type { Request, Response, NextFunction } from "express";
import logger from "../utils/logger.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { CSRF_HEADER_NAME } from "../utils/csrf.js";

interface ErrorResponse {
  status: "error";
  error: string;
  code?: string;
  details?: string[];
  requestId?: string;
}

/**
 * Centralized error handling middleware.
 *
 * - Maps AppError subclasses to structured JSON responses
 * - Attaches the request correlation ID (from Winston logger middleware)
 * - Hides internal details in production for non-operational errors
 * - Handles CSRF token errors as a special case
 */
export function errorHandler(invalidCsrfTokenError: unknown) {
  return (err: Error & { code?: string; statusCode?: number }, req: Request, res: Response, _next: NextFunction): void => {
    const requestId: string | undefined = req.requestId;

    // --- CSRF errors ---
    if (
      err === invalidCsrfTokenError ||
      err.code === "EBADCSRFTOKEN" ||
      err.message?.includes("csrf")
    ) {
      logger.error({
        message: "Invalid CSRF token",
        requestId,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        receivedTokenHeader:
          (req.headers[CSRF_HEADER_NAME] as string) || "MISSING",
        sessionID: req.sessionID || "N/A",
        sessionExists: !!req.session,
        sessionCsrfToken: req.session?.csrfToken
          ? "present"
          : "MISSING",
      });

      const body: ErrorResponse = {
        status: "error",
        error:
          "Invalid CSRF token. Your security session may be invalid. Please refresh the page and try again.",
        code: "INVALID_CSRF_TOKEN",
        requestId,
      };
      res.status(403).json(body);
      return;
    }

    // --- Operational (known) errors ---
    if (err instanceof AppError) {
      // Only log operational errors at warn level unless they are 5xx
      const logLevel = err.statusCode >= 500 ? "error" : "warn";
      logger[logLevel]({
        message: err.message,
        requestId,
        code: err.code,
        statusCode: err.statusCode,
        stack: err.stack,
      });

      const body: ErrorResponse = {
        status: "error",
        error: err.message,
        code: err.code,
        requestId,
      };

      if (err instanceof ValidationError && err.details) {
        body.details = err.details;
      }

      res.status(err.statusCode).json(body);
      return;
    }

    // --- Unexpected (non-operational) errors ---
    logger.error({
      message: "Unhandled error",
      requestId,
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || 500,
    });

    const statusCode = err.statusCode || 500;
    const message =
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : err.message || "Internal Server Error";

    const body: ErrorResponse = {
      status: "error",
      error: message,
      code: "INTERNAL_ERROR",
      requestId,
    };
    res.status(statusCode).json(body);
  };
}

/**
 * Wraps an async route handler so that rejected promises are forwarded to
 * the Express error-handling middleware via next(err).
 */
export function asyncHandler<P = import("express-serve-static-core").ParamsDictionary>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request<P>, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
