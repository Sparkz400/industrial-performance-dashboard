import { and, desc, eq, max } from "drizzle-orm";

import db from "../database/db.js";
import { dashboardVersions } from "../database/schema.js";

export interface DashboardVersionInput {
  dashboardId: string;
  version: number;
  name: string;
  widgets: unknown;
  layout: unknown;
  changeDescription?: string | null;
  createdBy?: number | null;
}

export const dashboardVersionRepository = {
  async createVersion(input: DashboardVersionInput) {
    const [created] = await db
      .insert(dashboardVersions)
      .values({
        dashboardId: input.dashboardId,
        version: input.version,
        name: input.name,
        widgets: input.widgets ?? [],
        layout: input.layout ?? [],
        changeDescription: input.changeDescription ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();

    return created;
  },

  async listVersions(dashboardId: string) {
    return db
      .select()
      .from(dashboardVersions)
      .where(eq(dashboardVersions.dashboardId, dashboardId))
      .orderBy(desc(dashboardVersions.version));
  },

  async getVersion(dashboardId: string, version: number) {
    const rows = await db
      .select()
      .from(dashboardVersions)
      .where(
        and(
          eq(dashboardVersions.dashboardId, dashboardId),
          eq(dashboardVersions.version, version),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  },

  async getLatestVersionNumber(dashboardId: string): Promise<number> {
    const result = await db
      .select({ maxVersion: max(dashboardVersions.version) })
      .from(dashboardVersions)
      .where(eq(dashboardVersions.dashboardId, dashboardId));

    return result[0]?.maxVersion ?? 0;
  },
};
