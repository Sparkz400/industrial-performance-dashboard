import { EventEmitter } from "node:events";
import type { Request } from "express";
import { eq, sql } from "drizzle-orm";
import config from "../config/config.js";
import db from "../database/db.js";
import { users } from "../database/schema.js";
import { AppError } from "../utils/errors.js";

export const sessionEvents = new EventEmitter();

export async function getSessionUser(session?: {
  userId?: number;
  userVersion?: string;
  oidcAuthTime?: number;
}) {
  if (!session?.userId || typeof session.userVersion !== "string") return null;
  // An identity-provider session must return to the provider after the configured age.
  if (
    session.oidcAuthTime &&
    Date.now() - session.oidcAuthTime > config.OIDC_MAX_SESSION_HOURS * 3600_000
  )
    return null;
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId));
  return user?.isActive && session.userVersion === user.updatedAt?.toISOString()
    ? user
    : null;
}

const sessionStep = (req: Request, step: "regenerate" | "save") =>
  new Promise<void>((resolve, reject) =>
    req.session[step]((err) =>
      err
        ? reject(new AppError("Login failed. Please try again.", 500))
        : resolve(),
    ),
  );

/** Starts a fresh session (no fixation) for a signed-in account. */
export async function beginSession(
  req: Request,
  user: {
    id: number;
    username: string;
    role: NonNullable<Request["session"]["userRole"]>;
    updatedAt: Date | null;
  },
  identity?: { issuer: string; subject: string; sid?: string },
) {
  await sessionStep(req, "regenerate");
  req.session.userId = user.id;
  req.session.userVersion = user.updatedAt?.toISOString();
  req.session.userRole = user.role;
  req.session.username = user.username;
  if (identity) {
    req.session.oidcIssuer = identity.issuer;
    req.session.oidcSubject = identity.subject;
    req.session.oidcSid = identity.sid;
    req.session.oidcAuthTime = Date.now();
  }
  await sessionStep(req, "save");
}

/** Back-channel logout: deletes the named provider session, or all of the subject's sessions. */
export async function endProviderSessions(target: {
  issuer: string;
  subject?: string;
  sid?: string;
}) {
  const result = await db.execute(
    sql`DELETE FROM session WHERE sess->>'oidcIssuer' = ${target.issuer} AND ${
      target.sid
        ? sql`sess->>'oidcSid' = ${target.sid}`
        : sql`sess->>'oidcSubject' = ${target.subject ?? ""}`
    } RETURNING sid`,
  );
  const ended = (result.rows as { sid: string }[]).map((row) => row.sid);
  for (const sid of ended) sessionEvents.emit("sessionRevoked", sid);
  return ended.length;
}
