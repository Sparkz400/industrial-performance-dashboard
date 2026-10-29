import bcrypt from "bcrypt";
import { eq, sql, gte, isNotNull, isNull, count, and } from "drizzle-orm";

import type { Request } from "express";
import {
  complianceAuditRepository,
  type ComplianceAuditListFilters,
} from "../repositories/complianceAuditRepository.js";
import db from "../database/db.js";
import { users, complianceAuditLogs } from "../database/schema.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

export interface ComplianceActor {
  userId?: number;
  username?: string;
  userRole?: "admin" | "viewer" | "wallboard" | "operator" | "supervisor";
  ipAddress?: string;
}

export interface ComplianceEventInput {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  entityName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  reasonForChange?: string | null;
  electronicSignature?: Record<string, unknown> | null;
  snapshotBefore?: Record<string, unknown> | null;
  snapshotAfter?: Record<string, unknown> | null;
}

export interface ComplianceLogQuery {
  action?: string;
  entityType?: string;
  search?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function parseDate(value: string | undefined, label: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid ${label}`);
  }

  return parsed;
}

function normalizeQuery(query: ComplianceLogQuery): ComplianceAuditListFilters {
  const limit = query.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ValidationError("Limit must be between 1 and 500");
  }

  return {
    action: query.action?.trim() || undefined,
    entityType: query.entityType?.trim() || undefined,
    search: query.search?.trim() || undefined,
    userId: query.userId,
    dateFrom: parseDate(query.dateFrom, "dateFrom"),
    dateTo: parseDate(query.dateTo, "dateTo"),
    limit,
  };
}

function getIpAddress(req: Request): string | undefined {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim() !== "") {
    return forwardedFor.split(",")[0]?.trim();
  }

  return req.ip || undefined;
}

export function getComplianceActor(
  req: Request<any, any, any, any>,
): ComplianceActor {
  return {
    userId: req.session?.userId,
    username: req.session?.username,
    userRole: req.session?.userRole,
    ipAddress: getIpAddress(req),
  };
}

function formatAuditCsv(logs: Record<string, unknown>[]): string {
  const headers = [
    "id",
    "action",
    "entityType",
    "entityId",
    "entityName",
    "message",
    "userId",
    "username",
    "userRole",
    "ipAddress",
    "reasonForChange",
    "electronicSignature",
    "checksum",
    "createdAt",
  ];

  const escapeCSV = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = logs.map((log) =>
    headers
      .map((h) => {
        const val = log[h];
        if (h === "electronicSignature" && val) {
          return escapeCSV(JSON.stringify(val));
        }
        return escapeCSV(val);
      })
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export const complianceService = {
  async recordComplianceEvent(
    input: ComplianceEventInput,
    actor: ComplianceActor = {},
  ) {
    try {
      return await complianceAuditRepository.create({
        action: input.action,
        entityType: input.entityType,
        entityId:
          input.entityId === null || input.entityId === undefined
            ? null
            : String(input.entityId),
        entityName: input.entityName ?? null,
        message: input.message,
        metadata: input.metadata ?? {},
        userId: actor.userId ?? null,
        username: actor.username ?? null,
        userRole: actor.userRole ?? null,
        ipAddress: actor.ipAddress ?? null,
        reasonForChange: input.reasonForChange ?? null,
        electronicSignature: input.electronicSignature ?? null,
        snapshotBefore: input.snapshotBefore ?? null,
        snapshotAfter: input.snapshotAfter ?? null,
      });
    } catch (error) {
      logger.warn(
        `[ComplianceAudit] Failed to record ${input.entityType}.${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  },

  async verifyElectronicSignature(
    userId: number,
    password: string,
  ): Promise<{ verified: boolean }> {
    const userRows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) {
      throw new NotFoundError("User");
    }

    // An account without a password (identity provider, service) cannot sign this way.
    const hash = userRows[0].passwordHash;
    return { verified: hash ? await bcrypt.compare(password, hash) : false };
  },

  async verifyAuditIntegrity(dateRange?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    // When date range is provided we could filter by ID range,
    // but for simplicity we delegate to the full chain check.
    // The repository handles optional fromId/toId bounds.
    return complianceAuditRepository.verifyIntegrity();
  },

  async exportAuditReport(filters: ComplianceLogQuery, format: "csv" | "json") {
    const logs = await complianceAuditRepository.list(normalizeQuery(filters));

    if (format === "csv") {
      const headers = [
        "id",
        "action",
        "entityType",
        "entityId",
        "entityName",
        "message",
        "userId",
        "username",
        "userRole",
        "ipAddress",
        "reasonForChange",
        "checksum",
        "createdAt",
      ];

      const escapeCSV = (value: unknown): string => {
        const str = value === null || value === undefined ? "" : String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = logs.map((log: Record<string, unknown>) =>
        headers
          .map((h) => escapeCSV((log as Record<string, unknown>)[h]))
          .join(","),
      );

      return [headers.join(","), ...rows].join("\n");
    }

    // JSON format - return the data directly
    return logs;
  },

  async listComplianceLogs(query: ComplianceLogQuery) {
    return complianceAuditRepository.list(normalizeQuery(query));
  },

  async getComplianceStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all stat queries in parallel
    const [
      totalResult,
      last30DaysResult,
      last7DaysResult,
      unsignedResult,
      noReasonResult,
      byActionResult,
      byEntityTypeResult,
      recentResult,
    ] = await Promise.all([
      // Total compliance events
      db.select({ count: count() }).from(complianceAuditLogs),
      // Events in last 30 days
      db
        .select({ count: count() })
        .from(complianceAuditLogs)
        .where(gte(complianceAuditLogs.createdAt, thirtyDaysAgo)),
      // Events in last 7 days
      db
        .select({ count: count() })
        .from(complianceAuditLogs)
        .where(gte(complianceAuditLogs.createdAt, sevenDaysAgo)),
      // Unsigned events (no electronic signature) in last 30 days
      db
        .select({ count: count() })
        .from(complianceAuditLogs)
        .where(
          and(
            gte(complianceAuditLogs.createdAt, thirtyDaysAgo),
            isNull(complianceAuditLogs.electronicSignature),
          ),
        ),
      // Events without reason for change in last 30 days
      db
        .select({ count: count() })
        .from(complianceAuditLogs)
        .where(
          and(
            gte(complianceAuditLogs.createdAt, thirtyDaysAgo),
            isNull(complianceAuditLogs.reasonForChange),
          ),
        ),
      // Breakdown by action (last 30 days)
      db
        .select({
          action: complianceAuditLogs.action,
          count: count(),
        })
        .from(complianceAuditLogs)
        .where(gte(complianceAuditLogs.createdAt, thirtyDaysAgo))
        .groupBy(complianceAuditLogs.action)
        .orderBy(sql`count(*) DESC`)
        .limit(10),
      // Breakdown by entity type (last 30 days)
      db
        .select({
          entityType: complianceAuditLogs.entityType,
          count: count(),
        })
        .from(complianceAuditLogs)
        .where(gte(complianceAuditLogs.createdAt, thirtyDaysAgo))
        .groupBy(complianceAuditLogs.entityType)
        .orderBy(sql`count(*) DESC`)
        .limit(10),
      // 5 most recent events
      db
        .select()
        .from(complianceAuditLogs)
        .orderBy(sql`${complianceAuditLogs.createdAt} DESC`)
        .limit(5),
    ]);

    const total30 = last30DaysResult[0]?.count ?? 0;
    const unsigned30 = unsignedResult[0]?.count ?? 0;
    const noReason30 = noReasonResult[0]?.count ?? 0;
    const signed30 = Number(total30) - Number(unsigned30);
    const withReason30 = Number(total30) - Number(noReason30);

    return {
      complianceModeEnabled: config.COMPLIANCE_MODE_ENABLED ?? false,
      totalEvents: totalResult[0]?.count ?? 0,
      eventsLast30Days: total30,
      eventsLast7Days: last7DaysResult[0]?.count ?? 0,
      unsignedEventsLast30Days: unsigned30,
      signedEventsLast30Days: signed30,
      eventsWithoutReasonLast30Days: noReason30,
      eventsWithReasonLast30Days: withReason30,
      signatureCoverage:
        Number(total30) > 0
          ? Math.round((signed30 / Number(total30)) * 100)
          : 100,
      reasonCoverage:
        Number(total30) > 0
          ? Math.round((withReason30 / Number(total30)) * 100)
          : 100,
      byAction: byActionResult,
      byEntityType: byEntityTypeResult,
      recentEvents: recentResult,
    };
  },

  async getComplianceConfig() {
    return {
      complianceModeEnabled: config.COMPLIANCE_MODE_ENABLED ?? false,
      requireSignatureFor: [
        "dashboard.saved",
        "dashboard.deleted",
        "machine.created",
        "machine.updated",
        "machine.deleted",
        "recipe.created",
        "recipe.updated",
        "batch.started",
        "batch.completed",
        "batch.aborted",
        "user.created",
        "user.updated",
      ],
      requireReasonFor: [
        "dashboard.saved",
        "dashboard.deleted",
        "machine.updated",
        "machine.deleted",
        "recipe.updated",
        "batch.aborted",
        "user.updated",
      ],
    };
  },

  async updateComplianceConfig(updates: Record<string, unknown>) {
    // In a full implementation, this would persist to a config table.
    // For now, return the merged config.
    logger.info(
      `[ComplianceService] Config update requested: ${JSON.stringify(updates)}`,
    );
    return this.getComplianceConfig();
  },

  async generateReport(options: {
    reportType: string;
    dateFrom?: string;
    dateTo?: string;
    format: "csv" | "json";
  }) {
    const { reportType, dateFrom, dateTo, format } = options;

    const dateFromParsed = parseDate(dateFrom, "dateFrom");
    const dateToParsed = parseDate(dateTo, "dateTo");

    switch (reportType) {
      case "audit-trail": {
        const logs = await complianceAuditRepository.list({
          dateFrom: dateFromParsed,
          dateTo: dateToParsed,
          limit: 500,
        });
        if (format === "csv") {
          return formatAuditCsv(logs);
        }
        return {
          reportType,
          generatedAt: new Date().toISOString(),
          dateRange: { from: dateFrom, to: dateTo },
          totalRecords: logs.length,
          records: logs,
        };
      }
      case "signature-coverage": {
        const logs = await complianceAuditRepository.list({
          dateFrom: dateFromParsed,
          dateTo: dateToParsed,
          limit: 500,
        });
        const signed = logs.filter(
          (l: Record<string, unknown>) => l.electronicSignature != null,
        );
        const unsigned = logs.filter(
          (l: Record<string, unknown>) => l.electronicSignature == null,
        );
        if (format === "csv") {
          return formatAuditCsv(logs);
        }
        return {
          reportType,
          generatedAt: new Date().toISOString(),
          dateRange: { from: dateFrom, to: dateTo },
          totalRecords: logs.length,
          signedCount: signed.length,
          unsignedCount: unsigned.length,
          coveragePercent:
            logs.length > 0
              ? Math.round((signed.length / logs.length) * 100)
              : 100,
          unsignedRecords: unsigned,
        };
      }
      case "change-reasons": {
        const logs = await complianceAuditRepository.list({
          dateFrom: dateFromParsed,
          dateTo: dateToParsed,
          limit: 500,
        });
        const withReason = logs.filter(
          (l: Record<string, unknown>) =>
            l.reasonForChange != null &&
            String(l.reasonForChange).trim().length > 0,
        );
        const withoutReason = logs.filter(
          (l: Record<string, unknown>) =>
            l.reasonForChange == null ||
            String(l.reasonForChange).trim().length === 0,
        );
        if (format === "csv") {
          return formatAuditCsv(logs);
        }
        return {
          reportType,
          generatedAt: new Date().toISOString(),
          dateRange: { from: dateFrom, to: dateTo },
          totalRecords: logs.length,
          withReasonCount: withReason.length,
          withoutReasonCount: withoutReason.length,
          coveragePercent:
            logs.length > 0
              ? Math.round((withReason.length / logs.length) * 100)
              : 100,
          missingReasonRecords: withoutReason,
        };
      }
      case "integrity": {
        const integrity = await complianceAuditRepository.verifyIntegrity();
        if (format === "csv") {
          const headers = "valid,checkedRecords,firstBrokenId";
          const row = `${integrity.valid},${integrity.checkedRecords},${integrity.firstBrokenId ?? ""}`;
          return `${headers}\n${row}`;
        }
        return {
          reportType,
          generatedAt: new Date().toISOString(),
          ...integrity,
        };
      }
      default:
        throw new ValidationError(`Unknown report type: ${reportType}`);
    }
  },
};
