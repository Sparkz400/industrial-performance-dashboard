import { and, eq, desc } from "drizzle-orm";
import db from "../database/db.js";
import { getReadDb } from "../database/db.js";
import { batches, type NewBatch } from "../database/schema.js";

export interface BatchCreateInput {
  batchNumber: string;
  recipeId?: number | null;
  machineId?: number | null;
  status?: "planned" | "running" | "completed" | "aborted";
  notes?: string | null;
  metadata?: Record<string, unknown>;
  startedBy?: number | null;
  recipeSnapshot?: NewBatch["recipeSnapshot"];
}

export interface BatchUpdateInput {
  status?: "planned" | "running" | "completed" | "aborted";
  startedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  summary?: unknown;
  startedBy?: number | null;
  completedBy?: number | null;
}

export interface BatchListFilters {
  machineId?: number;
  recipeId?: number;
  status?: "planned" | "running" | "completed" | "aborted";
  limit?: number;
}

export const batchRepository = {
  async create(input: BatchCreateInput) {
    const [created] = await db
      .insert(batches)
      .values(input satisfies NewBatch)
      .returning();

    return created;
  },

  async findById(id: number) {
    const result = await getReadDb()
      .select()
      .from(batches)
      .where(eq(batches.id, id));

    return result[0] ?? null;
  },

  async list(filters: BatchListFilters = {}) {
    const conditions = [];

    if (filters.machineId !== undefined) {
      conditions.push(eq(batches.machineId, filters.machineId));
    }
    if (filters.recipeId !== undefined) {
      conditions.push(eq(batches.recipeId, filters.recipeId));
    }
    if (filters.status !== undefined) {
      conditions.push(eq(batches.status, filters.status));
    }

    const limit = filters.limit ?? 100;

    const query = getReadDb()
      .select()
      .from(batches)
      .orderBy(desc(batches.createdAt))
      .limit(limit);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }

    return query;
  },

  async update(id: number, data: BatchUpdateInput) {
    const result = await db
      .update(batches)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(batches.id, id))
      .returning();

    return result[0] ?? null;
  },

  async findActiveBatch(machineId: number) {
    const result = await getReadDb()
      .select()
      .from(batches)
      .where(
        and(eq(batches.machineId, machineId), eq(batches.status, "running")),
      );

    return result[0] ?? null;
  },
};
