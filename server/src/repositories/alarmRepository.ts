import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import { alertRules, alertHistory } from "../database/schema.js";

export const alarmRepository = {
  // ===== Alert Rules =====

  async listRules(filters?: { machineId?: number; isActive?: boolean }) {
    const readDb = getReadDb();
    const conditions = [];
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
      .where(eq(alertRules.id, id));
    return rule ?? null;
  },

  async createRule(input: typeof alertRules.$inferInsert) {
    const [created] = await db.insert(alertRules).values(input).returning();
    return created;
  },

  async updateRule(id: number, input: Partial<typeof alertRules.$inferInsert>) {
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
    return getReadDb()
      .select()
      .from(alertRules)
      .where(eq(alertRules.isActive, true));
  },

  // ===== Alert History (Alarms) =====

  async listAlarms(filters?: {
    severity?: string;
    status?: string;
    machineId?: number;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const readDb = getReadDb();
    const conditions = [];

    if (filters?.severity)
      conditions.push(eq(alertHistory.severity, filters.severity as any));
    if (filters?.status)
      conditions.push(eq(alertHistory.status, filters.status as any));
    if (filters?.machineId != null)
      conditions.push(eq(alertHistory.machineId, filters.machineId));
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
      .where(eq(alertHistory.id, id));
    return alarm ?? null;
  },

  async createAlarm(input: typeof alertHistory.$inferInsert) {
    const [created] = await db.insert(alertHistory).values(input).returning();
    return created;
  },

  async acknowledgeAlarm(id: number, userId: number) {
    const [updated] = await db
      .update(alertHistory)
      .set({
        status: "acknowledged",
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      } as any)
      .where(eq(alertHistory.id, id))
      .returning();
    return updated ?? null;
  },

  async clearAlarm(id: number) {
    const [updated] = await db
      .update(alertHistory)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
      } as any)
      .where(eq(alertHistory.id, id))
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
          eq(alertHistory.status, "active" as any),
        ),
      );
    return result[0]?.count ?? 0;
  },
};
