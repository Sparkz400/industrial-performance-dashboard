import type { Request, Response, NextFunction } from "express";
import { ValidationError, UnauthorizedError } from "../utils/errors.js";
import { complianceService } from "../services/complianceService.js";
import logger from "../utils/logger.js";

/**
 * Middleware that requires a non-empty reasonForChange in the request body.
 * Used for 21 CFR Part 11 compliance: every significant change must have a documented reason.
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
        ["reasonForChange must be a non-empty string"],
      ),
    );
    return;
  }

  next();
};

/**
 * Middleware that requires and verifies an electronic signature in the request body.
 * The body must contain electronicSignature.password, which is verified against the
 * authenticated user's stored password hash.
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
          "An electronic signature is required for compliance (21 CFR Part 11).",
          ["electronicSignature object is required"],
        ),
      );
      return;
    }

    const password = signature.password;
    if (!password || typeof password !== "string") {
      next(
        new ValidationError("Electronic signature must include a password.", [
          "electronicSignature.password is required",
        ]),
      );
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      next(
        new UnauthorizedError(
          "Authentication required for electronic signature.",
        ),
      );
      return;
    }

    const result = await complianceService.verifyElectronicSignature(
      userId,
      password,
    );

    if (!result.verified) {
      logger.warn(
        `[Compliance] Electronic signature verification failed for user ${userId}`,
      );
      next(
        new ValidationError(
          "Electronic signature verification failed. Invalid password.",
        ),
      );
      return;
    }

    // Strip the password from the signature before it continues down the pipeline
    // and attach the verified signature metadata
    req.body.electronicSignature = {
      userId,
      username: req.session?.username,
      signedAt: new Date().toISOString(),
      passwordVerified: true,
    };

    next();
  } catch (error) {
    next(error);
  }
};
