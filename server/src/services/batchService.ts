import { sql } from "drizzle-orm";
import db from "../database/db.js";
import { getReadDb } from "../database/db.js";
import {
  batchRepository,
  type BatchCreateInput,
  type BatchUpdateInput,
  type BatchListFilters,
} from "../repositories/batchRepository.js";
import { recipeRepository } from "../repositories/recipeRepository.js";
import logger from "../utils/logger.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../utils/errors.js";
import {
  auditLogService,
  type AuditActor,
} from "../services/auditLogService.js";

interface ParameterResult {
  nodeKey: string;
  displayName: string;
  targetValue: number;
  actualAvg: number;
  actualMin: number;
  actualMax: number;
  withinTolerance: boolean;
}

interface BatchSummary {
  duration: number;
  parameterResults: ParameterResult[];
  overallCompliance: number;
}

interface DataPoint {
  timestamp: string;
  value: number;
}

interface BatchDataSeries {
  nodeKey: string;
  displayName: string;
  dataPoints: DataPoint[];
  setpoint?: number;
}

interface RecipeParameter {
  nodeKey: string;
  displayName: string;
  targetValue: number;
  tolerance: number;
  unit?: string;
}

export const batchService = {
  async createBatch(input: BatchCreateInput, actor?: AuditActor) {
    const batch = await batchRepository.create(input);

    logger.info(
      `[Batch] Created batch "${batch.batchNumber}" (id=${batch.id})`,
    );

    await auditLogService.recordEvent(
      {
        action: "batch.created",
        entityType: "batch",
        entityId: batch.id,
        entityName: batch.batchNumber,
        message: `Created batch "${batch.batchNumber}"`,
        metadata: {
          recipeId: batch.recipeId,
          machineId: batch.machineId,
        },
      },
      actor,
    );

    return batch;
  },

  async getBatch(id: number) {
    const batch = await batchRepository.findById(id);
    if (!batch) {
      throw new NotFoundError("Batch");
    }
    return batch;
  },

  async listBatches(filters: BatchListFilters = {}) {
    return batchRepository.list(filters);
  },

  async updateBatch(id: number, data: BatchUpdateInput, actor?: AuditActor) {
    const existing = await batchRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Batch");
    }

    const updated = await batchRepository.update(id, data);
    return updated;
  },

  async startBatch(id: number, userId: number, actor?: AuditActor) {
    const batch = await batchRepository.findById(id);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (batch.status !== "planned") {
      throw new ValidationError(
        `Cannot start batch: current status is "${batch.status}", expected "planned"`,
      );
    }

    if (batch.machineId) {
      const activeBatch = await batchRepository.findActiveBatch(
        batch.machineId,
      );
      if (activeBatch) {
        throw new ConflictError(
          `Machine already has a running batch: "${activeBatch.batchNumber}" (id=${activeBatch.id})`,
        );
      }
    }

    const updated = await batchRepository.update(id, {
      status: "running",
      startedAt: new Date(),
      startedBy: userId,
    });

    logger.info(`[Batch] Started batch "${batch.batchNumber}" (id=${id})`);

    await auditLogService.recordEvent(
      {
        action: "batch.started",
        entityType: "batch",
        entityId: id,
        entityName: batch.batchNumber,
        message: `Started batch "${batch.batchNumber}"`,
        metadata: { machineId: batch.machineId, startedBy: userId },
      },
      actor,
    );

    return updated;
  },

  async completeBatch(id: number, userId: number, actor?: AuditActor) {
    const batch = await batchRepository.findById(id);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (batch.status !== "running") {
      throw new ValidationError(
        `Cannot complete batch: current status is "${batch.status}", expected "running"`,
      );
    }

    let updated = await batchRepository.update(id, {
      status: "completed",
      completedAt: new Date(),
      completedBy: userId,
    });

    // Compute summary after completion
    try {
      await this.computeBatchSummary(id);
      // Reload to get the summary
      updated = await batchRepository.findById(id);
    } catch (error) {
      logger.warn(
        `[Batch] Failed to compute summary for batch ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    logger.info(`[Batch] Completed batch "${batch.batchNumber}" (id=${id})`);

    await auditLogService.recordEvent(
      {
        action: "batch.completed",
        entityType: "batch",
        entityId: id,
        entityName: batch.batchNumber,
        message: `Completed batch "${batch.batchNumber}"`,
        metadata: { machineId: batch.machineId, completedBy: userId },
      },
      actor,
    );

    return updated;
  },

  async abortBatch(
    id: number,
    userId: number,
    reason?: string,
    actor?: AuditActor,
  ) {
    const batch = await batchRepository.findById(id);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (batch.status !== "running") {
      throw new ValidationError(
        `Cannot abort batch: current status is "${batch.status}", expected "running"`,
      );
    }

    const notes = reason
      ? batch.notes
        ? `${batch.notes}\n[ABORTED] ${reason}`
        : `[ABORTED] ${reason}`
      : batch.notes;

    const updated = await batchRepository.update(id, {
      status: "aborted",
      completedAt: new Date(),
      completedBy: userId,
      notes,
    });

    logger.info(
      `[Batch] Aborted batch "${batch.batchNumber}" (id=${id}), reason: ${reason ?? "none"}`,
    );

    await auditLogService.recordEvent(
      {
        action: "batch.aborted",
        entityType: "batch",
        entityId: id,
        entityName: batch.batchNumber,
        message: `Aborted batch "${batch.batchNumber}"${reason ? `: ${reason}` : ""}`,
        metadata: { machineId: batch.machineId, completedBy: userId, reason },
      },
      actor,
    );

    return updated;
  },

  async computeBatchSummary(batchId: number) {
    const batch = await batchRepository.findById(batchId);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (!batch.recipeId) {
      throw new ValidationError("Batch has no associated recipe");
    }

    const recipe = await recipeRepository.findById(batch.recipeId);
    if (!recipe) {
      throw new NotFoundError("Recipe");
    }

    if (!batch.startedAt || !batch.completedAt) {
      throw new ValidationError(
        "Batch must have startedAt and completedAt to compute summary",
      );
    }

    const parameters = (recipe.parameters ?? []) as RecipeParameter[];
    if (parameters.length === 0) {
      const summary: BatchSummary = {
        duration: batch.completedAt.getTime() - batch.startedAt.getTime(),
        parameterResults: [],
        overallCompliance: 100,
      };
      await batchRepository.update(batchId, { summary });
      return summary;
    }

    const nodeKeys = parameters.map((p) => p.nodeKey);

    const result = await db.execute(
      sql`SELECT node_key, avg(value) as avg_value, min(value) as min_value, max(value) as max_value
          FROM opcua_data
          WHERE machine_id = ${batch.machineId}
            AND timestamp BETWEEN ${batch.startedAt} AND ${batch.completedAt}
            AND node_key = ANY(${nodeKeys})
          GROUP BY node_key`,
    );

    const statsMap = new Map<
      string,
      { avg: number; min: number; max: number }
    >();
    for (const row of result.rows as any[]) {
      statsMap.set(row.node_key, {
        avg: parseFloat(row.avg_value) || 0,
        min: parseFloat(row.min_value) || 0,
        max: parseFloat(row.max_value) || 0,
      });
    }

    const parameterResults: ParameterResult[] = parameters.map((param) => {
      const stats = statsMap.get(param.nodeKey);
      const actualAvg = stats?.avg ?? 0;
      const actualMin = stats?.min ?? 0;
      const actualMax = stats?.max ?? 0;

      const withinTolerance =
        Math.abs(actualAvg - param.targetValue) <= param.tolerance;

      return {
        nodeKey: param.nodeKey,
        displayName: param.displayName,
        targetValue: param.targetValue,
        actualAvg,
        actualMin,
        actualMax,
        withinTolerance,
      };
    });

    const compliantCount = parameterResults.filter(
      (p) => p.withinTolerance,
    ).length;
    const overallCompliance =
      parameterResults.length > 0
        ? Math.round((compliantCount / parameterResults.length) * 100)
        : 100;

    const duration = batch.completedAt.getTime() - batch.startedAt.getTime();

    const summary: BatchSummary = {
      duration,
      parameterResults,
      overallCompliance,
    };

    await batchRepository.update(batchId, { summary });

    return summary;
  },

  async getBatchData(batchId: number): Promise<BatchDataSeries[]> {
    const batch = await batchRepository.findById(batchId);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (!batch.recipeId) {
      throw new ValidationError("Batch has no associated recipe");
    }

    const recipe = await recipeRepository.findById(batch.recipeId);
    if (!recipe) {
      throw new NotFoundError("Recipe");
    }

    if (!batch.startedAt) {
      throw new ValidationError("Batch has not been started");
    }

    const endTime = batch.completedAt ?? new Date();
    const parameters = (recipe.parameters ?? []) as RecipeParameter[];

    if (parameters.length === 0) {
      return [];
    }

    const nodeKeys = parameters.map((p) => p.nodeKey);
    const setpoints = (recipe.setpoints ?? {}) as Record<string, number>;

    const result = await getReadDb().execute(
      sql`SELECT node_key, timestamp, value
          FROM opcua_data
          WHERE machine_id = ${batch.machineId}
            AND timestamp BETWEEN ${batch.startedAt} AND ${endTime}
            AND node_key = ANY(${nodeKeys})
          ORDER BY node_key, timestamp`,
    );

    const seriesMap = new Map<string, DataPoint[]>();
    for (const row of result.rows as any[]) {
      const nodeKey = row.node_key as string;
      if (!seriesMap.has(nodeKey)) {
        seriesMap.set(nodeKey, []);
      }
      seriesMap.get(nodeKey)!.push({
        timestamp: row.timestamp,
        value: parseFloat(row.value) || 0,
      });
    }

    const paramMap = new Map(parameters.map((p) => [p.nodeKey, p]));

    return parameters.map((param) => ({
      nodeKey: param.nodeKey,
      displayName: param.displayName,
      dataPoints: seriesMap.get(param.nodeKey) ?? [],
      setpoint: setpoints[param.nodeKey] ?? param.targetValue,
    }));
  },

  async compareBatches(
    batchIds: number[],
  ): Promise<
    { batchId: number; batchNumber: string; data: BatchDataSeries[] }[]
  > {
    const results = [];

    for (const batchId of batchIds) {
      const batch = await batchRepository.findById(batchId);
      if (!batch) {
        throw new NotFoundError(`Batch (id=${batchId})`);
      }

      const data = await this.getBatchData(batchId);

      // Normalize datapoints to elapsed time (ms from start)
      const startTime = batch.startedAt?.getTime() ?? 0;
      const normalizedData = data.map((series) => ({
        ...series,
        dataPoints: series.dataPoints.map((dp) => ({
          timestamp: String(new Date(dp.timestamp).getTime() - startTime),
          value: dp.value,
        })),
      }));

      results.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        data: normalizedData,
      });
    }

    return results;
  },

  async findActiveBatch(machineId: number) {
    return batchRepository.findActiveBatch(machineId);
  },
};
