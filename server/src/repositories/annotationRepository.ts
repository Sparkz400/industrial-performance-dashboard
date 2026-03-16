import { eq, and } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import { annotations } from "../database/schema.js";

export const annotationRepository = {
  async listByDashboard(dashboardId: string) {
    return getReadDb()
      .select()
      .from(annotations)
      .where(eq(annotations.dashboardId, dashboardId));
  },

  async findById(id: string) {
    const [annotation] = await getReadDb()
      .select()
      .from(annotations)
      .where(eq(annotations.id, id));
    return annotation ?? null;
  },

  async create(input: typeof annotations.$inferInsert) {
    const [created] = await db.insert(annotations).values(input).returning();
    return created;
  },

  async update(id: string, input: Partial<typeof annotations.$inferInsert>) {
    const [updated] = await db
      .update(annotations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(annotations.id, id))
      .returning();
    return updated ?? null;
  },

  async delete(id: string) {
    const [deleted] = await db
      .delete(annotations)
      .where(eq(annotations.id, id))
      .returning();
    return deleted ?? null;
  },
};
