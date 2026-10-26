import { eq, and } from "drizzle-orm";
import { dashboardScope } from "../services/accessScope.js";
import db, { getReadDb } from "../database/db.js";
import { dashboards, dashboardHistory } from "../database/schema.js";

export interface DashboardRecordInput {
  id: string;
  name: string;
  widgets: unknown[];
  layout: unknown[];
}

const selectAllDashboards = async (database: typeof db) =>
  database
    .select()
    .from(dashboards)
    .where(dashboardScope(dashboards.id))
    .orderBy(dashboards.name);

export const dashboardRepository = {
  async listFromReadDb() {
    return selectAllDashboards(getReadDb());
  },

  async listFromPrimary() {
    return selectAllDashboards(db);
  },

  async findByIdFromReadDb(id: string) {
    const result = await getReadDb()
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), dashboardScope(dashboards.id)));

    return result[0] ?? null;
  },

  async findById(id: string) {
    const result = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), dashboardScope(dashboards.id)));
    return result[0] ?? null;
  },

  async create(input: DashboardRecordInput) {
    const [created] = await db.insert(dashboards).values(input).returning();
    return created;
  },

  async saveWithHistory(
    input: DashboardRecordInput,
    onHistoryError?: (error: unknown) => void,
  ) {
    const [saved] = await db.transaction(async (tx: any) => {
      const result = await tx
        .insert(dashboards)
        .values(input)
        .onConflictDoUpdate({
          target: dashboards.id,
          set: {
            name: input.name,
            widgets: input.widgets,
            layout: input.layout,
          },
        })
        .returning();

      try {
        await tx.insert(dashboardHistory).values({
          dashboardId: input.id,
          action: "UPDATE",
          userId: null,
        });
      } catch (error) {
        onHistoryError?.(error);
      }

      return result;
    });

    return saved;
  },

  async deleteById(id: string) {
    await db.delete(dashboards).where(eq(dashboards.id, id));
  },
};
