import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import {
  reportTemplates,
  reportSchedules,
  reportHistory,
} from "../database/schema.js";

export const reportRepository = {
  // ===== Report Templates =====

  async listTemplates(filters?: { isActive?: boolean }) {
    const readDb = getReadDb();
    const conditions = [];
    if (filters?.isActive != null) {
      conditions.push(eq(reportTemplates.isActive, filters.isActive));
    }

    return readDb
      .select()
      .from(reportTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportTemplates.createdAt));
  },

  async findTemplateById(id: number) {
    const [template] = await getReadDb()
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, id));
    return template ?? null;
  },

  async createTemplate(input: typeof reportTemplates.$inferInsert) {
    const [created] = await db
      .insert(reportTemplates)
      .values(input)
      .returning();
    return created;
  },

  async updateTemplate(
    id: number,
    input: Partial<typeof reportTemplates.$inferInsert>,
  ) {
    const [updated] = await db
      .update(reportTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(reportTemplates.id, id))
      .returning();
    return updated ?? null;
  },

  async deleteTemplate(id: number) {
    const [deleted] = await db
      .delete(reportTemplates)
      .where(eq(reportTemplates.id, id))
      .returning();
    return deleted ?? null;
  },

  // ===== Report Schedules =====

  async listSchedules(filters?: { isActive?: boolean; templateId?: number }) {
    const readDb = getReadDb();
    const conditions = [];
    if (filters?.isActive != null) {
      conditions.push(eq(reportSchedules.isActive, filters.isActive));
    }
    if (filters?.templateId != null) {
      conditions.push(eq(reportSchedules.templateId, filters.templateId));
    }

    return readDb
      .select()
      .from(reportSchedules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportSchedules.createdAt));
  },

  async findScheduleById(id: number) {
    const [schedule] = await getReadDb()
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, id));
    return schedule ?? null;
  },

  async createSchedule(input: typeof reportSchedules.$inferInsert) {
    const [created] = await db
      .insert(reportSchedules)
      .values(input)
      .returning();
    return created;
  },

  async updateSchedule(
    id: number,
    input: Partial<typeof reportSchedules.$inferInsert>,
  ) {
    const [updated] = await db
      .update(reportSchedules)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(reportSchedules.id, id))
      .returning();
    return updated ?? null;
  },

  async deleteSchedule(id: number) {
    const [deleted] = await db
      .delete(reportSchedules)
      .where(eq(reportSchedules.id, id))
      .returning();
    return deleted ?? null;
  },

  async getAllActiveSchedules() {
    return getReadDb()
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.isActive, true));
  },

  // ===== Report History =====

  async createHistory(input: typeof reportHistory.$inferInsert) {
    const [created] = await db.insert(reportHistory).values(input).returning();
    return created;
  },

  async updateHistoryStatus(
    id: number,
    update: {
      status: string;
      filePath?: string;
      fileSize?: number;
      error?: string;
      completedAt?: Date;
    },
  ) {
    const [updated] = await db
      .update(reportHistory)
      .set(update)
      .where(eq(reportHistory.id, id))
      .returning();
    return updated ?? null;
  },

  async listHistory(filters?: {
    scheduleId?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const readDb = getReadDb();
    const conditions = [];

    if (filters?.scheduleId != null) {
      conditions.push(eq(reportHistory.scheduleId, filters.scheduleId));
    }
    if (filters?.status) {
      conditions.push(eq(reportHistory.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(
        gte(reportHistory.generatedAt, new Date(filters.startDate)),
      );
    }
    if (filters?.endDate) {
      conditions.push(
        lte(reportHistory.generatedAt, new Date(filters.endDate)),
      );
    }

    return readDb
      .select()
      .from(reportHistory)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportHistory.generatedAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0);
  },

  async findHistoryById(id: number) {
    const [entry] = await getReadDb()
      .select()
      .from(reportHistory)
      .where(eq(reportHistory.id, id));
    return entry ?? null;
  },
};
