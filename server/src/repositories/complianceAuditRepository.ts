import crypto from "node:crypto";
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql } from "drizzle-orm";

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
  /** "checksum": a record's content changed; "link": a record is missing, reordered or forked. */
  brokenReason: "checksum" | "link" | null;
  /** Record this outside the database to detect a rewritten chain later. */
  lastChecksum: string | null;
}

/** JSON with keys sorted at every level, so PostgreSQL's jsonb key order cannot change it. */
function canonical(value: unknown): string {
  if (value && typeof (value as { toJSON?: unknown }).toJSON === "function")
    return canonical((value as { toJSON: () => unknown }).toJSON());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

type ChainedRecord = Required<
  Omit<ComplianceAuditRecordInput, "metadata"> & {
    metadata: Record<string, unknown>;
  }
>;

/** Version 2 covers every recorded field, including actor, reason, signature and snapshots. */
function checksumV2(
  record: ChainedRecord,
  createdAt: string,
  previousChecksum: string | null,
): string {
  return crypto
    .createHash("sha256")
    .update(canonical({ ...record, createdAt, previousChecksum }))
    .digest("hex");
}

/** Version 1 (records before checksum_version 2): insertion-order JSON of fewer fields. */
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
    const record: ChainedRecord = {
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
    };
    return db.transaction(async (tx) => {
      // One writer at a time, so every record links to the one committed before it.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('compliance-audit-chain'))`,
      );
      const [last] = await tx
        .select({ checksum: complianceAuditLogs.checksum })
        .from(complianceAuditLogs)
        .orderBy(desc(complianceAuditLogs.id))
        .limit(1);
      const previousChecksum = last?.checksum ?? null;
      const createdAt = new Date();
      const [created] = await tx
        .insert(complianceAuditLogs)
        .values({
          ...record,
          checksum: checksumV2(
            record,
            createdAt.toISOString(),
            previousChecksum,
          ),
          checksumVersion: 2,
          previousChecksum,
          createdAt,
        })
        .returning();
      return created;
    });
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

    // A range starts from the record before it, so a deleted first record is still found.
    let previous =
      fromId === undefined
        ? null
        : ((
            await db
              .select({ checksum: complianceAuditLogs.checksum })
              .from(complianceAuditLogs)
              .where(lt(complianceAuditLogs.id, fromId))
              .orderBy(desc(complianceAuditLogs.id))
              .limit(1)
          )[0]?.checksum ?? null);
    const broken = (id: number, brokenReason: "checksum" | "link") => ({
      valid: false,
      checkedRecords: rows.length,
      firstBrokenId: id,
      brokenReason,
      lastChecksum: rows.at(-1)!.checksum,
    });

    for (const row of rows) {
      if (row.previousChecksum !== previous) return broken(row.id, "link");
      const createdAt = (row.createdAt as Date).toISOString();
      const expected =
        row.checksumVersion >= 2
          ? checksumV2(
              {
                action: row.action,
                entityType: row.entityType,
                entityId: row.entityId,
                entityName: row.entityName,
                message: row.message,
                metadata: (row.metadata ?? {}) as Record<string, unknown>,
                userId: row.userId,
                username: row.username,
                userRole: row.userRole,
                ipAddress: row.ipAddress,
                reasonForChange: row.reasonForChange,
                electronicSignature: row.electronicSignature as Record<
                  string,
                  unknown
                > | null,
                snapshotBefore: row.snapshotBefore as Record<
                  string,
                  unknown
                > | null,
                snapshotAfter: row.snapshotAfter as Record<
                  string,
                  unknown
                > | null,
              },
              createdAt,
              row.previousChecksum,
            )
          : computeChecksum(
              row.action,
              row.entityType,
              row.entityId,
              row.message,
              row.metadata as Record<string, unknown> | undefined,
              row.userId,
              createdAt,
              row.previousChecksum,
            );
      if (expected !== row.checksum) return broken(row.id, "checksum");
      previous = row.checksum;
    }

    return {
      valid: true,
      checkedRecords: rows.length,
      firstBrokenId: null,
      brokenReason: null,
      lastChecksum: previous,
    };
  },
};
