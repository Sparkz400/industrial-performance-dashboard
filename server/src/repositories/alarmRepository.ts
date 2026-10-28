import { eq, and, desc, gte, lte, sql, isNull } from "drizzle-orm";
import { validateAlarmRule } from "../services/alarmRuleValidation.js";
import db, { getReadDb } from "../database/db.js";
import { machineScope } from "../services/accessScope.js";
import {
  alertRules,
  alertHistory,
  type AlertHistoryRow,
} from "../database/schema.js";

export const alarmRepository = {
  // ===== Alert Rules =====

  async listRules(filters?: { machineId?: number; isActive?: boolean }) {
    const readDb = getReadDb();
    const conditions = [machineScope(alertRules.machineId)];
    if (filters?.machineId != null)
      conditions.push(eq(alertRules.machineId, filters.machineId));
    if (filters?.isActive != null)
      conditions.push(eq(alertRules.isActive, filters.isActive));

    return readDb
      .select()
      .from(alertRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertRules.createdAt));
  },

  async findRuleById(id: number) {
    const [rule] = await getReadDb()
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.id, id), machineScope(alertRules.machineId)));
    return rule ?? null;
  },

  async createRule(input: typeof alertRules.$inferInsert) {
    validateAlarmRule(input);
    const [created] = await db.insert(alertRules).values(input).returning();
    return created;
  },

  async updateRule(id: number, input: Partial<typeof alertRules.$inferInsert>) {
    const current = await this.findRuleById(id);
    if (!current) return null;
    validateAlarmRule({ ...current, ...input });
    const [updated] = await db
      .update(alertRules)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(alertRules.id, id))
      .returning();
    return updated ?? null;
  },

  async deleteRule(id: number) {
    const [deleted] = await db
      .delete(alertRules)
      .where(eq(alertRules.id, id))
      .returning();
    return deleted ?? null;
  },

  async getActiveRulesForNode(machineId: number, nodeKey: string) {
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
    return db.select().from(alertRules).where(eq(alertRules.isActive, true));
  },

  // ===== Alert History (Alarms) =====

  async listAlarms(filters?: {
    severity?: string;
    status?: string;
    machineId?: number;
    nodeKey?: string;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const readDb = getReadDb();
    const conditions = [machineScope(alertHistory.machineId)];

    if (filters?.severity)
      conditions.push(sql`${alertHistory.severity} = ${filters.severity}`);
    if (filters?.status)
      conditions.push(sql`${alertHistory.status} = ${filters.status}`);
    if (filters?.machineId != null)
      conditions.push(eq(alertHistory.machineId, filters.machineId));
    if (filters?.nodeKey != null)
      conditions.push(eq(alertHistory.nodeKey, filters.nodeKey));
    if (filters?.startDate)
      conditions.push(gte(alertHistory.createdAt, new Date(filters.startDate)));
    if (filters?.endDate)
      conditions.push(lte(alertHistory.createdAt, new Date(filters.endDate)));

    return readDb
      .select()
      .from(alertHistory)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertHistory.createdAt))
      .limit(filters?.limit ?? 100)
      .offset(filters?.offset ?? 0);
  },

  async findAlarmById(id: number) {
    const [alarm] = await getReadDb()
      .select()
      .from(alertHistory)
      .where(
        and(eq(alertHistory.id, id), machineScope(alertHistory.machineId)),
      );
    return alarm ?? null;
  },

  async createAlarm(input: typeof alertHistory.$inferInsert) {
    const [created] = await db.insert(alertHistory).values(input).returning();
    return created;
  },

  async acknowledgeAlarm(id: number, userId: number | null) {
    const [updated] = await db
      .update(alertHistory)
      .set({
        status:
          "acknowledged" as (typeof alertHistory.status.enumValues)[number],
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(
        and(
          eq(alertHistory.id, id),
          machineScope(alertHistory.machineId),
          isNull(alertHistory.resolvedAt),
          isNull(alertHistory.acknowledgedAt),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async getActiveAlarmCountByRule(ruleId: number): Promise<number> {
    const result = await getReadDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(alertHistory)
      .where(
        and(
          eq(alertHistory.ruleId, ruleId),
          sql`${alertHistory.status} = 'active'`,
        ),
      );
    return result[0]?.count ?? 0;
  },
};
