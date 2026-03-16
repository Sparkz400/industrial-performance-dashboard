import { eq } from "drizzle-orm";
import db from "../database/db.js";
import { customWidgets } from "../database/schema.js";
import type { CustomWidgetRow } from "../database/schema.js";
import { NotFoundError, ValidationError, AppError } from "../utils/errors.js";
import logger from "../utils/logger.js";
import type { CustomWidgetManifest } from "@performance-dashboard/shared";
import { assertSafeOutboundUrl } from "../utils/outboundUrlSafety.js";

const REQUIRED_MANIFEST_FIELDS = [
  "id",
  "name",
  "version",
  "entryUrl",
  "defaultW",
  "defaultH",
  "minW",
  "minH",
];

function validateManifest(manifest: unknown): manifest is CustomWidgetManifest {
  if (!manifest || typeof manifest !== "object") return false;
  return REQUIRED_MANIFEST_FIELDS.every(
    (field) => field in (manifest as Record<string, unknown>),
  );
}

export const customWidgetService = {
  async listWidgets(): Promise<CustomWidgetRow[]> {
    return db.select().from(customWidgets).orderBy(customWidgets.createdAt);
  },

  async registerWidget(
    manifestUrl: string,
    installedBy: number,
  ): Promise<CustomWidgetRow> {
    const safeManifestUrl = await assertSafeOutboundUrl(
      manifestUrl,
      "Manifest URL",
    );

    // Fetch the manifest from the URL
    let manifest: CustomWidgetManifest;
    try {
      const response = await fetch(safeManifestUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new AppError(
          `Failed to fetch widget manifest: HTTP ${response.status}`,
          400,
          "MANIFEST_FETCH_ERROR",
        );
      }
      manifest = (await response.json()) as CustomWidgetManifest;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(
        `Could not fetch widget manifest from ${manifestUrl}`,
      );
    }

    if (!validateManifest(manifest)) {
      throw new ValidationError(
        "Invalid widget manifest. Required fields: " +
          REQUIRED_MANIFEST_FIELDS.join(", "),
      );
    }

    await assertSafeOutboundUrl(manifest.entryUrl, "Widget entry URL");

    const [created] = await db
      .insert(customWidgets)
      .values({
        manifestUrl: safeManifestUrl.toString(),
        manifest,
        isActive: true,
        installedBy,
      })
      .returning();

    logger.info(`Custom widget registered: ${manifest.name} (${manifest.id})`);
    return created;
  },

  async unregisterWidget(id: number): Promise<void> {
    const result = await db
      .delete(customWidgets)
      .where(eq(customWidgets.id, id))
      .returning();
    if (result.length === 0) throw new NotFoundError("Custom widget");
  },

  async toggleWidget(id: number, isActive: boolean): Promise<CustomWidgetRow> {
    const [updated] = await db
      .update(customWidgets)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(customWidgets.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Custom widget");
    return updated;
  },
};
