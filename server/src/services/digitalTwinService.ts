import { sql } from "drizzle-orm";

import {
  digitalTwinRepository,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type CreateInstanceInput,
  type UpdateInstanceInput,
} from "../repositories/digitalTwinRepository.js";
import db from "../database/db.js";
import { opcuaData } from "../database/schema.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";

/** Strip <script> tags and event handler attributes from SVG content. */
function sanitizeSvg(svgContent: string): string {
  let sanitized = svgContent.replace(/<script[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "");
  return sanitized;
}

export const digitalTwinService = {
  // --- Templates ---

  async listTemplates() {
    return digitalTwinRepository.listTemplates();
  },

  async getTemplateById(id: number) {
    const template = await digitalTwinRepository.findTemplateById(id);
    if (!template) throw new NotFoundError("Digital twin template");
    return template;
  },

  async createTemplate(input: CreateTemplateInput) {
    if (!input.svgContent || input.svgContent.trim().length === 0) {
      throw new ValidationError("SVG content is required");
    }
    return digitalTwinRepository.createTemplate({
      ...input,
      svgContent: sanitizeSvg(input.svgContent),
    });
  },

  async updateTemplate(id: number, data: UpdateTemplateInput) {
    await this.getTemplateById(id);
    const updateData = { ...data };
    if (updateData.svgContent) {
      updateData.svgContent = sanitizeSvg(updateData.svgContent);
    }
    const updated = await digitalTwinRepository.updateTemplate(id, updateData);
    if (!updated) throw new NotFoundError("Digital twin template");
    return updated;
  },

  async deleteTemplate(id: number) {
    await this.getTemplateById(id);
    await digitalTwinRepository.deleteTemplate(id);
  },

  // --- Instances ---

  async listInstances(machineId?: number) {
    return digitalTwinRepository.listInstances(machineId);
  },

  async getInstanceById(id: number) {
    const instance = await digitalTwinRepository.findInstanceById(id);
    if (!instance) throw new NotFoundError("Digital twin instance");
    return instance;
  },

  async createInstance(input: CreateInstanceInput) {
    // Validate template exists
    await this.getTemplateById(input.templateId);
    return digitalTwinRepository.createInstance(input);
  },

  async updateInstance(id: number, data: UpdateInstanceInput) {
    await this.getInstanceById(id);
    const updated = await digitalTwinRepository.updateInstance(id, data);
    if (!updated) throw new NotFoundError("Digital twin instance");
    return updated;
  },

  async deleteInstance(id: number) {
    await this.getInstanceById(id);
    await digitalTwinRepository.deleteInstance(id);
  },

  /** Get instance with latest live values for all bound nodes. */
  async getInstanceWithLiveData(id: number) {
    const instance = await this.getInstanceById(id);
    const bindings = instance.nodeBindings as Array<{
      nodeKey: string;
      svgElementId: string;
    }>;
    if (!bindings || bindings.length === 0) {
      return { instance, values: {} };
    }

    const nodeKeys = bindings.map((b) => b.nodeKey);
    try {
      const result = await db.execute(
        sql`SELECT DISTINCT ON (node_key) node_key, value, timestamp
            FROM opcua_data
            WHERE node_key = ANY(${nodeKeys})
              AND machine_id = ${instance.machineId}
            ORDER BY node_key, timestamp DESC`,
      );
      const values: Record<string, { value: unknown; timestamp: string }> = {};
      for (const row of result.rows as { node_key: string; value: unknown; timestamp: string }[]) {
        values[row.node_key] = {
          value: row.value,
          timestamp: new Date(row.timestamp).toISOString(),
        };
      }
      return { instance, values };
    } catch (error) {
      logger.warn(
        `Failed to fetch live data for twin instance ${id}: ${error}`,
      );
      return { instance, values: {} };
    }
  },

  /** Get historical data for a specific element binding. */
  async getElementHistory(
    instanceId: number,
    svgElementId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const instance = await this.getInstanceById(instanceId);
    const bindings = instance.nodeBindings as Array<{
      nodeKey: string;
      svgElementId: string;
    }>;
    const binding = bindings?.find((b) => b.svgElementId === svgElementId);
    if (!binding) {
      throw new NotFoundError("Element binding");
    }

    const result = await db.execute(
      sql`SELECT timestamp, value
          FROM opcua_data
          WHERE node_key = ${binding.nodeKey}
            AND machine_id = ${instance.machineId}
            AND timestamp BETWEEN ${startDate} AND ${endDate}
          ORDER BY timestamp ASC
          LIMIT 5000`,
    );

    return {
      svgElementId,
      nodeKey: binding.nodeKey,
      dataPoints: (result.rows as { timestamp: string; value: unknown }[]).map((row) => ({
        timestamp: new Date(row.timestamp).toISOString(),
        value: row.value,
      })),
    };
  },
};
