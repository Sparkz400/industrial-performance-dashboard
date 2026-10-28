import { eq, sql, inArray } from "drizzle-orm";

import {
  digitalTwinRepository,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type CreateInstanceInput,
  type UpdateInstanceInput,
} from "../repositories/digitalTwinRepository.js";
import db from "../database/db.js";
import { machines, opcuaData } from "../database/schema.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { sanitizeSvg } from "../utils/sanitizeSvg.js";
import { assertMachine } from "./accessScope.js";
import { trendingDataService } from "./trendingDataService.js";
import { JSDOM } from "jsdom";

export interface AssetBinding {
  elementId: string;
  nodeKey: string;
  label: string;
  unit?: string;
}
export function assetBindings(input: unknown): AssetBinding[] {
  if (!Array.isArray(input) || input.length > 100)
    throw new ValidationError("Choose at most 100 element bindings");
  const seen = new Set<string>();
  return input.map((item) => {
    const elementId = item?.elementId ?? item?.svgElementId;
    if (
      typeof elementId !== "string" ||
      !/^[A-Za-z_][\w:.-]{0,159}$/.test(elementId) ||
      seen.has(elementId) ||
      typeof item.nodeKey !== "string" ||
      !item.nodeKey.trim() ||
      item.nodeKey.length > 200 ||
      (item.label != null &&
        (typeof item.label !== "string" || item.label.length > 160)) ||
      (item.unit != null &&
        (typeof item.unit !== "string" || item.unit.length > 40))
    )
      throw new ValidationError(
        "Bindings need unique SVG IDs, signal keys and bounded labels",
      );
    seen.add(elementId);
    return {
      elementId,
      nodeKey: item.nodeKey,
      label: item.label || item.nodeKey,
      ...(item.unit ? { unit: item.unit } : {}),
    };
  });
}
function checkElements(svg: string, bindings: AssetBinding[]) {
  const dom = new JSDOM(svg);
  try {
    for (const binding of bindings)
      if (!dom.window.document.getElementById(binding.elementId))
        throw new ValidationError(
          `SVG element ${binding.elementId} does not exist`,
        );
  } finally {
    dom.window.close();
  }
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
    const rows = await digitalTwinRepository.listInstances(machineId);
    return rows.map((row) => ({
      ...row,
      nodeBindings: assetBindings(row.nodeBindings ?? []),
    }));
  },

  async getInstanceById(id: number) {
    const instance = await digitalTwinRepository.findInstanceById(id);
    if (!instance) throw new NotFoundError("Digital twin instance");
    assertMachine(instance.machineId);
    return instance;
  },

  async createInstance(input: CreateInstanceInput) {
    // Validate template exists
    const template = await this.getTemplateById(input.templateId);
    const bindings = assetBindings(input.nodeBindings ?? []);
    checkElements(template.svgContent, bindings);
    return digitalTwinRepository.createInstance({
      ...input,
      nodeBindings: bindings,
    });
  },

  async updateInstance(id: number, data: UpdateInstanceInput) {
    const instance = await this.getInstanceById(id);
    if (data.nodeBindings) {
      data = { ...data, nodeBindings: assetBindings(data.nodeBindings) };
      checkElements(
        (await this.getTemplateById(instance.templateId)).svgContent,
        data.nodeBindings as AssetBinding[],
      );
    }
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
    const template = await this.getTemplateById(instance.templateId);
    const [machine] = await db
      .select({ name: machines.name, status: machines.status })
      .from(machines)
      .where(eq(machines.id, instance.machineId));
    const bindings = assetBindings(instance.nodeBindings ?? []);
    const asset = {
      ...instance,
      bindings,
      svgContent: sanitizeSvg(template.svgContent),
      templateName: template.name,
      machineName: machine?.name,
      connection: instance.isActive
        ? (machine?.status ?? "unknown")
        : "inactive",
    };
    if (!bindings || bindings.length === 0) {
      return { instance: asset, values: {} };
    }

    const nodeKeys = bindings.map((b) => b.nodeKey);
    const result = await db.execute(
      sql`SELECT DISTINCT ON (node_key) node_key, value, raw_value, status_code, received_at, timestamp
            FROM opcua_data
            WHERE ${inArray(opcuaData.nodeKey, nodeKeys)}
              AND machine_id = ${instance.machineId}
            ORDER BY node_key, timestamp DESC, id DESC`,
    );
    const values: Record<
      string,
      {
        value: unknown;
        rawValue: unknown;
        statusCode: string | null;
        receivedAt: string | null;
        timestamp: string;
      }
    > = Object.create(null);
    for (const row of result.rows as {
      node_key: string;
      value: unknown;
      raw_value: unknown;
      status_code: string | null;
      received_at: string | null;
      timestamp: string;
    }[]) {
      values[row.node_key] = {
        value: row.status_code?.startsWith("Good")
          ? (row.raw_value ?? row.value)
          : null,
        rawValue: row.raw_value ?? row.value,
        statusCode: row.status_code,
        receivedAt: row.received_at
          ? new Date(row.received_at).toISOString()
          : null,
        timestamp: new Date(row.timestamp).toISOString(),
      };
    }
    return { instance: asset, values };
  },

  /** Get historical data for a specific element binding. */
  async getElementHistory(
    instanceId: number,
    svgElementId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const instance = await this.getInstanceById(instanceId);
    const bindings = assetBindings(instance.nodeBindings ?? []);
    const binding = bindings.find((b) => b.elementId === svgElementId);
    if (!binding) {
      throw new NotFoundError("Element binding");
    }

    const result = await trendingDataService.queryTrendingData({
      machineId: instance.machineId,
      nodeKeys: [binding.nodeKey],
      startDate,
      endDate,
      aggregation: "last",
    });

    return {
      svgElementId,
      nodeKey: binding.nodeKey,
      dataPoints: result.series[0]?.data ?? [],
      series: result.series[0] ?? null,
    };
  },
};
