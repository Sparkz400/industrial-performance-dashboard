import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import db from "../database/db.js";
import { shareTokens, dashboards } from "../database/schema.js";
import type { ShareTokenRow, Dashboard } from "../database/schema.js";
import { NotFoundError, AppError } from "../utils/errors.js";
import config from "../config/config.js";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const shareService = {
  async createShareToken(input: {
    dashboardId: string;
    expiresInHours?: number | null;
    allowEmbed?: boolean;
    createdBy: number;
  }): Promise<{ token: ShareTokenRow; shareUrl: string; embedUrl: string }> {
    // Verify dashboard exists
    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.id, input.dashboardId));
    if (!dashboard) throw new NotFoundError("Dashboard");

    const token = generateToken();
    const expiresAt = input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000)
      : null;

    const [created] = await db
      .insert(shareTokens)
      .values({
        dashboardId: input.dashboardId,
        token,
        expiresAt,
        isActive: true,
        allowEmbed: input.allowEmbed ?? false,
        createdBy: input.createdBy,
      })
      .returning();

    const baseUrl = config.CLIENT_URL;

    return {
      token: created,
      shareUrl: `${baseUrl}/shared/${token}`,
      embedUrl: `${baseUrl}/embed/${token}`,
    };
  },

  async getSharesForDashboard(dashboardId: string): Promise<ShareTokenRow[]> {
    return db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.dashboardId, dashboardId));
  },

  async revokeShare(tokenId: number): Promise<void> {
    const result = await db
      .update(shareTokens)
      .set({ isActive: false })
      .where(eq(shareTokens.id, tokenId))
      .returning();
    if (result.length === 0) throw new NotFoundError("Share token");
  },

  async getDashboardByToken(token: string): Promise<{ dashboard: Dashboard }> {
    const [shareToken] = await db
      .select()
      .from(shareTokens)
      .where(and(eq(shareTokens.token, token), eq(shareTokens.isActive, true)));

    if (!shareToken) {
      throw new NotFoundError("Share link");
    }

    // Check expiry
    if (shareToken.expiresAt && new Date(shareToken.expiresAt) < new Date()) {
      throw new AppError("This share link has expired", 410, "SHARE_EXPIRED");
    }

    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.id, shareToken.dashboardId));
    if (!dashboard) throw new NotFoundError("Dashboard");

    return { dashboard };
  },

  async getEmbedDashboard(token: string): Promise<{ dashboard: Dashboard }> {
    const [shareToken] = await db
      .select()
      .from(shareTokens)
      .where(
        and(
          eq(shareTokens.token, token),
          eq(shareTokens.isActive, true),
          eq(shareTokens.allowEmbed, true),
        ),
      );

    if (!shareToken) {
      throw new NotFoundError("Embed link");
    }

    if (shareToken.expiresAt && new Date(shareToken.expiresAt) < new Date()) {
      throw new AppError("This embed link has expired", 410, "EMBED_EXPIRED");
    }

    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.id, shareToken.dashboardId));
    if (!dashboard) throw new NotFoundError("Dashboard");

    return { dashboard };
  },
};
