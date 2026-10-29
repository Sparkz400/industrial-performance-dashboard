import type { Request, Response, NextFunction } from "express";
import { complianceService } from "../services/complianceService.js";
import { ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";

/** What a signer declares by signing; recorded with the signature. */
export const SIGNATURE_MEANINGS = ["authored", "reviewed", "approved"] as const;

/**
 * Middleware: requires a non-empty reasonForChange in the request body.
 * These are application audit records, not a validated regulatory system.
 */
export const requireReasonForChange = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const reason = req.body?.reasonForChange;
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    next(new ValidationError("A reason for change is required."));
    return;
  }
  next();
};

/**
 * Verifies a submitted signature (signer's password plus a meaning) and returns the
 * server-made record. Client-supplied signature metadata is never recorded as such.
 */
async function verifiedSignature(req: Request) {
  const signature = req.body?.electronicSignature;
  if (signature == null) return null;
  const { password, meaning } = (
    typeof signature === "object" ? signature : {}
  ) as { password?: unknown; meaning?: unknown };
  if (typeof password !== "string" || !password)
    throw new ValidationError(
      "An electronic signature must include the signer's password.",
    );
  if (
    typeof meaning !== "string" ||
    !(SIGNATURE_MEANINGS as readonly string[]).includes(meaning)
  )
    throw new ValidationError(
      `An electronic signature must state its meaning: ${SIGNATURE_MEANINGS.join(", ")}.`,
    );
  const userId = req.session?.userId;
  if (!userId)
    throw new ValidationError(
      "Authentication required for electronic signature verification.",
    );
  const result = await complianceService.verifyElectronicSignature(
    userId,
    password,
  );
  if (!result.verified)
    throw new ValidationError(
      "Electronic signature verification failed — incorrect password.",
    );
  return {
    userId,
    username: req.session?.username ?? null,
    meaning,
    signedAt: new Date().toISOString(),
    passwordVerified: true,
  };
}

/** Middleware: requires a verified electronic signature. */
export const requireElectronicSignature = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const signature = await verifiedSignature(req);
    if (!signature) {
      next(
        new ValidationError(
          "An electronic signature is required for this action.",
        ),
      );
      return;
    }
    req.body.electronicSignature = signature;
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
 * Middleware: optionally captures reasonForChange and a verified electronic
 * signature. A submitted signature that cannot be verified rejects the request.
 */
export const optionalComplianceFields = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reason = req.body.reasonForChange;
    req.body.reasonForChange =
      typeof reason === "string" && reason.trim() ? reason.trim() : null;
    req.body.electronicSignature = await verifiedSignature(req);
    next();
  } catch (error) {
    next(error);
  }
};
