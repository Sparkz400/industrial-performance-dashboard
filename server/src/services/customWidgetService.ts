import { eq } from "drizzle-orm";
import Joi from "joi";
import db from "../database/db.js";
import { customWidgets } from "../database/schema.js";
import type { CustomWidgetRow } from "../database/schema.js";
import { NotFoundError, ValidationError, AppError } from "../utils/errors.js";
import logger from "../utils/logger.js";
import type { CustomWidgetManifest } from "@performance-dashboard/shared";
import {
  assertSafeOutboundUrl,
  fetchSafeOutbound,
} from "../utils/outboundUrlSafety.js";

const size = Joi.number().integer().min(1).max(24).required();
const text = Joi.string().trim().max(500).allow("").default("");
// Unknown keys are dropped so a manifest cannot smuggle in options the runtime would trust.
const manifestSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
    .required(),
  name: Joi.string().trim().min(1).max(100).required(),
  version: Joi.string()
    .pattern(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
    .required(),
  entryUrl: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .max(2048)
    .required(),
  permissions: Joi.array()
    .items(Joi.string().valid("readSeries"))
    .unique()
    .default([]),
  description: text,
  author: text,
  category: text,
  icon: text,
  settingsSchema: Joi.array().max(20),
  defaultConfig: Joi.object().default({}),
  minW: size,
  minH: size,
  defaultW: size,
  defaultH: size,
}).options({ stripUnknown: true });

// Origins of active widget entry pages, allowed as frame sources in the page CSP.
let frameOrigins: string[] = [];

export const customWidgetService = {
  async listWidgets(): Promise<CustomWidgetRow[]> {
    return db.select().from(customWidgets).orderBy(customWidgets.createdAt);
  },

  /** What a dashboard needs to render widgets, for any signed-in account. */
  async runtimeRegistrations() {
    return (await this.listWidgets()).map((w) => {
      const m = w.manifest as CustomWidgetManifest;
      return {
        id: w.id,
        isActive: w.isActive,
        manifest: {
          id: m.id,
          name: m.name,
          version: m.version,
          entryUrl: m.entryUrl,
          permissions: m.permissions ?? [],
          description: m.description,
          defaultW: m.defaultW,
          defaultH: m.defaultH,
          minW: m.minW,
          minH: m.minH,
        },
      };
    });
  },

  frameSources(): string {
    return frameOrigins.join(" ");
  },

  async refreshFrameOrigins() {
    const rows = await db
      .select()
      .from(customWidgets)
      .where(eq(customWidgets.isActive, true));
    frameOrigins = [
      ...new Set(
        rows.map(
          (r) => new URL((r.manifest as CustomWidgetManifest).entryUrl).origin,
        ),
      ),
    ];
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
    let fetched: unknown;
    try {
      const response = await fetchSafeOutbound(safeManifestUrl.toString());
      if (!response.ok) {
        throw new AppError(
          `Failed to fetch widget manifest: HTTP ${response.status}`,
          400,
          "MANIFEST_FETCH_ERROR",
        );
      }
      fetched = await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ValidationError(
        `Could not fetch widget manifest from ${manifestUrl}`,
      );
    }
    const { value: manifest, error } = manifestSchema.validate(fetched);
    if (error)
      throw new ValidationError(`Invalid widget manifest: ${error.message}`);

    await assertSafeOutboundUrl(manifest.entryUrl, "Widget entry URL");

    const [created] = await db
      .insert(customWidgets)
      .values({
        manifestUrl: safeManifestUrl.toString(),
        manifest: manifest as CustomWidgetManifest,
        isActive: true,
        installedBy,
      })
      .returning();
    await this.refreshFrameOrigins();
    logger.info(`Custom widget registered: ${manifest.name} (${manifest.id})`);
    return created;
  },

  async unregisterWidget(id: number): Promise<void> {
    const result = await db
      .delete(customWidgets)
      .where(eq(customWidgets.id, id))
      .returning();
    if (result.length === 0) throw new NotFoundError("Custom widget");
    await this.refreshFrameOrigins();
  },

  async toggleWidget(id: number, isActive: boolean): Promise<CustomWidgetRow> {
    const [updated] = await db
      .update(customWidgets)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(customWidgets.id, id))
      .returning();
    if (!updated) throw new NotFoundError("Custom widget");
    await this.refreshFrameOrigins();
    return updated;
  },
};
