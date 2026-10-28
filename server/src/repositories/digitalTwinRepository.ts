import { and, eq, desc } from "drizzle-orm";
import { machineScope } from "../services/accessScope.js";

import db from "../database/db.js";
import { getReadDb } from "../database/db.js";
import {
  digitalTwinTemplates,
  digitalTwinInstances,
} from "../database/schema.js";

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  svgContent: string;
  elementMappings?: unknown[];
  thumbnail?: string | null;
  category?: string;
  createdBy?: number | null;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  svgContent?: string;
  elementMappings?: unknown[];
  thumbnail?: string | null;
  category?: string;
}

export interface CreateInstanceInput {
  templateId: number;
  machineId: number;
  name: string;
  nodeBindings?: unknown[];
  displayConfig?: Record<string, unknown>;
  createdBy?: number | null;
}

export interface UpdateInstanceInput {
  name?: string;
  nodeBindings?: unknown[];
  displayConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export const digitalTwinRepository = {
  // --- Templates ---

  async listTemplates() {
    return getReadDb()
      .select()
      .from(digitalTwinTemplates)
      .orderBy(digitalTwinTemplates.name);
  },

  async findTemplateById(id: number) {
    const rows = await db
      .select()
      .from(digitalTwinTemplates)
      .where(eq(digitalTwinTemplates.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async createTemplate(input: CreateTemplateInput) {
    const rows = await db
      .insert(digitalTwinTemplates)
      .values({
        name: input.name,
        description: input.description ?? null,
        svgContent: input.svgContent,
        elementMappings: input.elementMappings ?? [],
        thumbnail: input.thumbnail ?? null,
        category: input.category ?? "general",
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return rows[0]!;
  },

  async updateTemplate(id: number, data: UpdateTemplateInput) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) values.name = data.name;
    if (data.description !== undefined) values.description = data.description;
    if (data.svgContent !== undefined) values.svgContent = data.svgContent;
    if (data.elementMappings !== undefined)
      values.elementMappings = data.elementMappings;
    if (data.thumbnail !== undefined) values.thumbnail = data.thumbnail;
    if (data.category !== undefined) values.category = data.category;

    const rows = await db
      .update(digitalTwinTemplates)
      .set(values)
      .where(eq(digitalTwinTemplates.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async deleteTemplate(id: number) {
    await db
      .delete(digitalTwinTemplates)
      .where(eq(digitalTwinTemplates.id, id));
  },

  // --- Instances ---

  async listInstances(machineId?: number) {
    const query = db.select().from(digitalTwinInstances);
    if (machineId !== undefined) {
      return query
        .where(
          and(
            eq(digitalTwinInstances.machineId, machineId),
            machineScope(digitalTwinInstances.machineId),
          ),
        )
        .orderBy(digitalTwinInstances.name);
    }
    return query
      .where(machineScope(digitalTwinInstances.machineId))
      .orderBy(digitalTwinInstances.name);
  },

  async findInstanceById(id: number) {
    const rows = await db
      .select()
      .from(digitalTwinInstances)
      .where(eq(digitalTwinInstances.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async createInstance(input: CreateInstanceInput) {
    const rows = await db
      .insert(digitalTwinInstances)
      .values({
        templateId: input.templateId,
        machineId: input.machineId,
        name: input.name,
        nodeBindings: input.nodeBindings ?? [],
        displayConfig: input.displayConfig ?? {},
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return rows[0]!;
  },

  async updateInstance(id: number, data: UpdateInstanceInput) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) values.name = data.name;
    if (data.nodeBindings !== undefined)
      values.nodeBindings = data.nodeBindings;
    if (data.displayConfig !== undefined)
      values.displayConfig = data.displayConfig;
    if (data.isActive !== undefined) values.isActive = data.isActive;

    const rows = await db
      .update(digitalTwinInstances)
      .set(values)
      .where(eq(digitalTwinInstances.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async deleteInstance(id: number) {
    await db
      .delete(digitalTwinInstances)
      .where(eq(digitalTwinInstances.id, id));
  },
};
