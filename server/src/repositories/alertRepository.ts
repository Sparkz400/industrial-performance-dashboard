import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import {
  alertRules,
  alertHistory,
  notificationChannels,
  type NewAlertRule,
  type NewAlertHistory,
  type NewNotificationChannel,
} from "../database/schema.js";

export interface AlertRuleInput {
  name: string;
  description?: string | null;
  machineId?: number | null;
  plantId?: number | null;
  nodeKey: string;
  condition: string;
  threshold?: number | null;
  thresholdHigh?: number | null;
  rateWindowSeconds?: number | null;
  severity?: string;
  channels?: unknown[];
  cooldownSeconds?: number;
  isActive?: boolean;
  createdBy?: number | null;
}

export interface AlertHistoryInput {
  ruleId?: number | null;
  ruleName?: string | null;
  machineId?: number | null;
  nodeKey?: string | null;
  triggerValue?: number | null;
  threshold?: number | null;
  severity?: string;
  status?: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AlertHistoryFilters {
  ruleId?: number;
  severity?: string;
  status?: string;
  machineId?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  limit?: number;
  offset?: number;
}

export interface NotificationChannelInput {
  name: string;
  type: string;
  config: Record<string, unknown>;
  isActive?: boolean;
  createdBy?: number | null;
}

export const alertRepository = {
  // ---- Rules ----

  async listRules(filters?: { machineId?: number; isActive?: boolean }) {
    const conditions = [];

    if (filters?.machineId) {
      conditions.push(eq(alertRules.machineId, filters.machineId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(alertRules.isActive, filters.isActive));
    }

    return getReadDb()
      .select()
      .from(alertRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertRules.createdAt));
  },

  async findRuleById(id: number) {
    const result = await getReadDb()
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id));
    return result[0] ?? null;
  },

  async createRule(input: AlertRuleInput) {
    const [created] = await db
      .insert(alertRules)
      .values(input as NewAlertRule)
      .returning();
    return created;
  },

  async updateRule(id: number, input: Partial<AlertRuleInput>) {
    const result = await db
      .update(alertRules)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(alertRules.id, id))
      .returning();
    return result[0] ?? null;
  },

  async deleteRule(id: number) {
    const result = await db
      .delete(alertRules)
      .where(eq(alertRules.id, id))
      .returning();
    return result[0] ?? null;
  },

  async getActiveRulesByNodeKey(machineId: number, nodeKey: string) {
    return getReadDb()
      .select()
      .from(alertRules)
      .where(
        and(
          eq(alertRules.machineId, machineId),
          eq(alertRules.nodeKey, nodeKey),
          eq(alertRules.isActive, true),
        ),
      );
  },

  async getAllActiveRules() {
    return getReadDb()
      .select()
      .from(alertRules)
      .where(eq(alertRules.isActive, true));
  },

  // ---- Alert History ----

  async createAlertHistoryEntry(input: AlertHistoryInput) {
    const [created] = await db
      .insert(alertHistory)
      .values(input as NewAlertHistory)
      .returning();
    return created;
  },

  async listAlertHistory(filters: AlertHistoryFilters) {
    const conditions = [];

    if (filters.ruleId) {
      conditions.push(eq(alertHistory.ruleId, filters.ruleId));
    }
    if (filters.severity) {
      conditions.push(eq(alertHistory.severity, filters.severity as any));
    }
    if (filters.status) {
      conditions.push(eq(alertHistory.status, filters.status as any));
    }
    if (filters.machineId) {
      conditions.push(eq(alertHistory.machineId, filters.machineId));
    }
    if (filters.startDate) {
      conditions.push(gte(alertHistory.createdAt, new Date(filters.startDate)));
    }
    if (filters.endDate) {
      conditions.push(lte(alertHistory.createdAt, new Date(filters.endDate)));
    }

    return getReadDb()
      .select()
      .from(alertHistory)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertHistory.createdAt))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);
  },

  async updateAlertStatus(
    id: number,
    status: string,
    acknowledgedBy?: number | null,
  ) {
    const updates: Record<string, unknown> = {
      status,
    };

    if (status === "acknowledged") {
      updates.acknowledgedAt = new Date();
      if (acknowledgedBy) {
        updates.acknowledgedBy = acknowledgedBy;
      }
    } else if (status === "resolved") {
      updates.resolvedAt = new Date();
    }

    const result = await db
      .update(alertHistory)
      .set(updates)
      .where(eq(alertHistory.id, id))
      .returning();
    return result[0] ?? null;
  },

  // ---- Notification Channels ----

  async listChannels() {
    return getReadDb()
      .select()
      .from(notificationChannels)
      .orderBy(desc(notificationChannels.createdAt));
  },

  async findChannelById(id: number) {
    const result = await getReadDb()
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.id, id));
    return result[0] ?? null;
  },

  async createChannel(input: NotificationChannelInput) {
    const [created] = await db
      .insert(notificationChannels)
      .values(input as NewNotificationChannel)
      .returning();
    return created;
  },

  async updateChannel(id: number, input: Partial<NotificationChannelInput>) {
    const result = await db
      .update(notificationChannels)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(notificationChannels.id, id))
      .returning();
    return result[0] ?? null;
  },

  async deleteChannel(id: number) {
    const result = await db
      .delete(notificationChannels)
      .where(eq(notificationChannels.id, id))
      .returning();
    return result[0] ?? null;
  },
};
