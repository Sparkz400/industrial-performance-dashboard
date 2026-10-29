import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import db from "../database/db.js";
import { serviceTokens, users } from "../database/schema.js";
import { hashShareToken } from "../services/shareService.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

// E02: a service token reads only the integration contract's endpoints, with its grants.
const TOKEN = /^Bearer (pdsa_[A-Za-z0-9_-]{43})$/;
const CONTRACT_READS = [
  /^\/production\/assets\/?$/,
  /^\/history\/\d+\/summaries\/?$/,
  /^\/production\/replay\/\d+\/?$/,
  /^\/work-orders\/machines\/\d+\/completions\/?$/,
];

export const hasServiceToken = (req: Request) =>
  /^Bearer pdsa_/.test(req.headers.authorization ?? "");

/**
 * Runs instead of the session middleware for token requests (no cookie session is created
 * or read). Sets a request-only identity that requireAuth and the asset checks verify as usual.
 */
export async function serviceTokenAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!hasServiceToken(req)) return next();
  try {
    const match = TOKEN.exec(req.headers.authorization ?? "");
    if (!match) throw new UnauthorizedError("Malformed service token");
    const [row] = await db
      .select({
        tokenId: serviceTokens.id,
        id: users.id,
        username: users.username,
        role: users.role,
        updatedAt: users.updatedAt,
      })
      .from(serviceTokens)
      .innerJoin(users, eq(users.id, serviceTokens.userId))
      .where(
        and(
          eq(serviceTokens.tokenHash, hashShareToken(match[1])),
          isNull(serviceTokens.revokedAt),
          gt(serviceTokens.expiresAt, new Date()),
          eq(users.authSource, "service"),
          eq(users.isActive, true),
        ),
      );
    if (!row)
      throw new UnauthorizedError("Service token unknown, expired or revoked");
    if (req.method !== "GET" || !CONTRACT_READS.some((re) => re.test(req.path)))
      throw new ForbiddenError(
        "Service tokens read only the integration API's read endpoints",
      );
    // Not an express-session: nothing is persisted and no cookie is set.
    (req as { session: unknown }).session = {
      userId: row.id,
      userRole: row.role,
      username: row.username,
      userVersion: row.updatedAt?.toISOString(),
    };
    void db
      .update(serviceTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(serviceTokens.id, row.tokenId))
      .catch(() => {});
    next();
  } catch (error) {
    next(error);
  }
}
