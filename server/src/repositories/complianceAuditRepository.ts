import crypto from "node:crypto";
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import db from "../database/db.js";
import { complianceAuditLogs } from "../database/schema.js";

export interface ComplianceAuditRecordInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  userId?: number | null;
  username?: string | null;
  userRole?:
    "admin" | "viewer" | "wallboard" | "operator" | "supervisor" | null;
  ipAddress?: string | null;
  reasonForChange?: string | null;
  electronicSignature?: Record<string, unknown> | null;
  snapshotBefore?: Record<string, unknown> | null;
  snapshotAfter?: Record<string, unknown> | null;
}

export interface ComplianceAuditListFilters {
  action?: string;
  entityType?: string;
  search?: string;
  userId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
}

export interface IntegrityCheckResult {
  valid: boolean;
  checkedRecords: number;
  firstBrokenId: number | null;
}

function computeChecksum(
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  message: string,
  metadata: Record<string, unknown> | undefined,
  userId: number | null | undefined,
  createdAt: string,
  previousChecksum: string | null,
): string {
  const payload = [
    action,
    entityType,
    entityId ?? "",
    message,
    JSON.stringify(metadata ?? {}),
    String(userId ?? ""),
    createdAt,
    previousChecksum ?? "",
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex");
}

export const complianceAuditRepository = {
  async create(input: ComplianceAuditRecordInput) {
    // Fetch the previous checksum from the latest record
    const lastRow = await db
      .select({ checksum: complianceAuditLogs.checksum })
      .from(complianceAuditLogs)
      .orderBy(desc(complianceAuditLogs.id))
      .limit(1);

    const previousChecksum = lastRow.length > 0 ? lastRow[0].checksum : null;
    const createdAt = new Date().toISOString();

    const checksum = computeChecksum(
      input.action,
      input.entityType,
      input.entityId,
      input.message,
      input.metadata,
      input.userId,
      createdAt,
      previousChecksum,
    );

    const [created] = await db
      .insert(complianceAuditLogs)
      .values({
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
        reasonForChange: input.reasonForChange ?? null,
        electronicSignature: input.electronicSignature ?? null,
        snapshotBefore: input.snapshotBefore ?? null,
        snapshotAfter: input.snapshotAfter ?? null,
        checksum,
        previousChecksum,
        createdAt: new Date(createdAt),
      })
      .returning();

    return created;
  },

  async list(filters: ComplianceAuditListFilters) {
    const searchTerm = filters.search?.trim();
    const conditions = [
      filters.action
        ? eq(complianceAuditLogs.action, filters.action)
        : undefined,
      filters.entityType
        ? eq(complianceAuditLogs.entityType, filters.entityType)
        : undefined,
      typeof filters.userId === "number"
        ? eq(complianceAuditLogs.userId, filters.userId)
        : undefined,
      filters.dateFrom
        ? gte(complianceAuditLogs.createdAt, filters.dateFrom)
        : undefined,
      filters.dateTo
        ? lte(complianceAuditLogs.createdAt, filters.dateTo)
        : undefined,
      searchTerm
        ? or(
            ilike(complianceAuditLogs.message, `%${searchTerm}%`),
            ilike(complianceAuditLogs.entityName, `%${searchTerm}%`),
            ilike(complianceAuditLogs.entityId, `%${searchTerm}%`),
            ilike(complianceAuditLogs.username, `%${searchTerm}%`),
          )
        : undefined,
    ].filter((condition) => condition !== undefined);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const baseQuery = db.select().from(complianceAuditLogs);

    if (whereClause) {
      return baseQuery
        .where(whereClause)
        .orderBy(desc(complianceAuditLogs.createdAt))
        .limit(filters.limit);
    }

    return baseQuery
      .orderBy(desc(complianceAuditLogs.createdAt))
      .limit(filters.limit);
  },

  async verifyIntegrity(
    fromId?: number,
    toId?: number,
  ): Promise<IntegrityCheckResult> {
    const conditions = [
      fromId !== undefined ? gte(complianceAuditLogs.id, fromId) : undefined,
      toId !== undefined ? lte(complianceAuditLogs.id, toId) : undefined,
    ].filter((c) => c !== undefined);

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db.select().from(complianceAuditLogs);
    const rows = whereClause
      ? await baseQuery.where(whereClause).orderBy(asc(complianceAuditLogs.id))
      : await baseQuery.orderBy(asc(complianceAuditLogs.id));

    if (rows.length === 0) {
      return { valid: true, checkedRecords: 0, firstBrokenId: null };
    }

    for (const row of rows) {
      const expected = computeChecksum(
        row.action,
        row.entityType,
        row.entityId,
        row.message,
        row.metadata as Record<string, unknown> | undefined,
        row.userId,
        (row.createdAt as Date).toISOString(),
        row.previousChecksum,
      );

      if (expected !== row.checksum) {
        return {
          valid: false,
          checkedRecords: rows.length,
          firstBrokenId: row.id,
        };
      }
    }

    return { valid: true, checkedRecords: rows.length, firstBrokenId: null };
  },
};
