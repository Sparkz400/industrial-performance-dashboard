import { eq } from "drizzle-orm";
import db from "../database/db.js";
import { shareTokens } from "../database/schema.js";
import { NotFoundError } from "../utils/errors.js";
// Existing records remain available to administrators for revocation; public reads are disabled.
export const shareService = {
  async getSharesForDashboard(dashboardId: string) {
    return db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.dashboardId, dashboardId));
  },
  async revokeShare(id: number): Promise<void> {
    const rows = await db
      .update(shareTokens)
      .set({ isActive: false })
      .where(eq(shareTokens.id, id))
      .returning();
    if (!rows.length) throw new NotFoundError("Share token");
  },
};
