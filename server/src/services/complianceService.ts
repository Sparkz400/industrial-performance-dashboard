import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

import type { Request } from "express";
import {
  complianceAuditRepository,
  type ComplianceAuditListFilters,
} from "../repositories/complianceAuditRepository.js";
import db from "../database/db.js";
import { users } from "../database/schema.js";
import logger from "../utils/logger.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";

export interface ComplianceActor {
  userId?: number;
  username?: string;
  userRole?: "admin" | "viewer";
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

    const verified = await bcrypt.compare(password, userRows[0].passwordHash);
    return { verified };
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
};
