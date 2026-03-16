import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

import db from "../database/db.js";
import { auditLogs } from "../database/schema.js";

export interface AuditLogRecordInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: number | null;
  username?: string | null;
  userRole?: "admin" | "viewer" | null;
  ipAddress?: string | null;
}

export interface AuditLogListFilters {
  action?: string;
  entityType?: string;
  search?: string;
  userId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
}

export const auditLogRepository = {
  async create(input: AuditLogRecordInput) {
    await db.insert(auditLogs).values({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityName: input.entityName ?? null,
      message: input.message,
      metadata: input.metadata ?? {},
      userId: input.userId ?? null,
      username: input.username ?? null,
      userRole: input.userRole ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  },

  async list(filters: AuditLogListFilters) {
    const searchTerm = filters.search?.trim();
    const conditions = [
      filters.action ? eq(auditLogs.action, filters.action) : undefined,
      filters.entityType
        ? eq(auditLogs.entityType, filters.entityType)
        : undefined,
      typeof filters.userId === "number"
        ? eq(auditLogs.userId, filters.userId)
        : undefined,
      filters.dateFrom ? gte(auditLogs.createdAt, filters.dateFrom) : undefined,
      filters.dateTo ? lte(auditLogs.createdAt, filters.dateTo) : undefined,
      searchTerm
        ? or(
            ilike(auditLogs.message, `%${searchTerm}%`),
            ilike(auditLogs.entityName, `%${searchTerm}%`),
            ilike(auditLogs.entityId, `%${searchTerm}%`),
            ilike(auditLogs.username, `%${searchTerm}%`),
          )
        : undefined,
    ].filter((condition) => condition !== undefined);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const baseQuery = db.select().from(auditLogs);

    if (whereClause) {
      return baseQuery
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(filters.limit);
    }

    return baseQuery.orderBy(desc(auditLogs.createdAt)).limit(filters.limit);
  },
};
