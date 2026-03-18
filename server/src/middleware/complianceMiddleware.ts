import type { Request, Response, NextFunction } from "express";
import { complianceService } from "../services/complianceService.js";
import { ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";

/**
 * Middleware: requires a non-empty reasonForChange in the request body.
 * Used for 21 CFR Part 11 compliance — every significant change must
 * have a documented reason.
 */
export const requireReasonForChange = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const reason = req.body?.reasonForChange;
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    next(
      new ValidationError(
        "A reason for change is required for compliance (21 CFR Part 11).",
      ),
    );
    return;
  }
  next();
};

/**
 * Middleware: validates the electronic signature attached to the request.
 * Expects `req.body.electronicSignature.password` to be set.
 * Verifies it against the authenticated user's stored password hash.
 * On success, replaces the raw signature with safe metadata before continuing.
 */
export const requireElectronicSignature = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const signature = req.body?.electronicSignature;
    if (!signature || typeof signature !== "object") {
      next(
        new ValidationError(
          "An electronic signature is required for this action (21 CFR Part 11).",
        ),
      );
      return;
    }

    const { password } = signature as { password?: string };
    if (!password || typeof password !== "string") {
      next(
        new ValidationError(
          "Electronic signature must include a password for verification.",
        ),
      );
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      next(
        new ValidationError(
          "Authentication required for electronic signature verification.",
        ),
      );
      return;
    }

    const result = await complianceService.verifyElectronicSignature(
      userId,
      password,
    );

    if (!result.verified) {
      next(
        new ValidationError(
          "Electronic signature verification failed — incorrect password.",
        ),
      );
      return;
    }

    // Replace raw signature (which includes password) with safe metadata
    req.body.electronicSignature = {
      userId,
      username: req.session?.username ?? null,
      signedAt: new Date().toISOString(),
      passwordVerified: true,
    };

    next();
  } catch (error) {
    logger.warn(
      `[ComplianceMiddleware] Signature verification error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    next(error);
  }
};

/**
 * Middleware: optionally captures reasonForChange and electronicSignature
 * from the request body when compliance mode is enabled, but does not
 * reject requests missing them. Useful for routes where compliance
 * fields are encouraged but not strictly required.
 */
export const optionalComplianceFields = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  // Normalize - ensure fields exist even if empty
  if (!req.body.reasonForChange) {
    req.body.reasonForChange = null;
  }
  if (!req.body.electronicSignature) {
    req.body.electronicSignature = null;
  }
  next();
};
