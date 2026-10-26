import type { Request } from "express";

import {
  auditLogRepository,
  type AuditLogListFilters,
} from "../repositories/auditLogRepository.js";
import logger from "../utils/logger.js";
import { ValidationError } from "../utils/errors.js";

export interface AuditActor {
  userId?: number;
  username?: string;
  userRole?: "admin" | "viewer" | "wallboard" | "operator" | "supervisor";
  ipAddress?: string;
}

export interface AuditEventInput {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  entityName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogQuery {
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

function normalizeQuery(query: AuditLogQuery): AuditLogListFilters {
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

export function getAuditActor(req: Request<any, any, any, any>): AuditActor {
  return {
    userId: req.session?.userId,
    username: req.session?.username,
    userRole: req.session?.userRole,
    ipAddress: getIpAddress(req),
  };
}

export const auditLogService = {
  async recordEvent(input: AuditEventInput, actor: AuditActor = {}) {
    try {
      await auditLogRepository.create({
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
      });
    } catch (error) {
      logger.warn(
        `[Audit] Failed to record ${input.entityType}.${input.action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },

  async listLogs(query: AuditLogQuery) {
    return auditLogRepository.list(normalizeQuery(query));
  },
};
