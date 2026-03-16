import { and, eq, sql, desc, asc, max } from "drizzle-orm";
import db from "../database/db.js";
import { getReadDb } from "../database/db.js";
import { recipes, type NewRecipe } from "../database/schema.js";

export interface RecipeCreateInput {
  name: string;
  version?: number;
  description?: string | null;
  machineId?: number | null;
  status?: "draft" | "active" | "archived";
  parameters?: unknown[];
  setpoints?: Record<string, unknown>;
  parentId?: number | null;
  createdBy?: number | null;
}

export interface RecipeUpdateInput {
  name?: string;
  description?: string | null;
  machineId?: number | null;
  status?: "draft" | "active" | "archived";
  parameters?: unknown[];
  setpoints?: Record<string, unknown>;
}

export interface RecipeListFilters {
  machineId?: number;
  status?: "draft" | "active" | "archived";
}

export const recipeRepository = {
  async create(input: RecipeCreateInput) {
    const [created] = await db
      .insert(recipes)
      .values(input satisfies NewRecipe)
      .returning();

    return created;
  },

  async findById(id: number) {
    const result = await getReadDb()
      .select()
      .from(recipes)
      .where(eq(recipes.id, id));

    return result[0] ?? null;
  },

  async list(filters: RecipeListFilters = {}) {
    const conditions = [];

    if (filters.machineId !== undefined) {
      conditions.push(eq(recipes.machineId, filters.machineId));
    }
    if (filters.status !== undefined) {
      conditions.push(eq(recipes.status, filters.status));
    }

    const query = getReadDb()
      .select()
      .from(recipes)
      .orderBy(asc(recipes.name), asc(recipes.version));

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }

    return query;
  },

  async update(id: number, data: RecipeUpdateInput) {
    const result = await db
      .update(recipes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    return result[0] ?? null;
  },

  async archive(id: number) {
    const result = await db
      .update(recipes)
      .set({
        status: "archived" as const,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    return result[0] ?? null;
  },

  async getMaxVersion(name: string): Promise<number> {
    const [row] = await getReadDb()
      .select({ maxVersion: max(recipes.version) })
      .from(recipes)
      .where(eq(recipes.name, name));

    return row?.maxVersion ?? 0;
  },
};
