import { EventEmitter } from "node:events";
import { eq } from "drizzle-orm";
import db from "../database/db.js";
import { users } from "../database/schema.js";

export const sessionEvents = new EventEmitter();

export async function getSessionUser(session?: {
  userId?: number;
  userVersion?: string;
}) {
  if (!session?.userId || typeof session.userVersion !== "string") return null;
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
