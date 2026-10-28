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
  actualAvg: number | null;
  actualMin: number | null;
  actualMax: number | null;
  withinTolerance: boolean | null;
  sampleCount: number;
  excludedCount: number;
}

interface BatchSummary {
  computedAt?: string;
  duration: number;
  parameterResults: ParameterResult[];
  overallCompliance: number | null;
}

interface DataPoint {
  timestamp: string;
  value: number | null;
  rawValue: unknown;
  statusCode: string | null;
  sourceTimestamp?: string | null;
  receivedAt?: string | null;
  correctionRevision?: number;
  reportedStatusCode?: string | null;
  sourceClockState?: string;
}

interface BatchDataSeries {
  nodeKey: string;
  displayName: string;
  dataPoints: DataPoint[];
  setpoint?: number;
  targetValue: number;
  tolerance: number;
}

interface RecipeParameter {
  nodeKey: string;
  displayName: string;
  targetValue: number;
  tolerance: number;
  unit?: string;
}

export const batchService = {
  /** Enrich a single batch with recipe name/version and extracted abort reason */
  async _enrichBatch(batch: Record<string, unknown> | null) {
    if (!batch) return batch;
    let recipeName: string | null = null;
    let recipeVersion: number | null = null;
    if (batch.recipeSnapshot) {
      const snapshot = batch.recipeSnapshot as {
        name: string;
        version: number;
      };
      recipeName = snapshot.name;
      recipeVersion = snapshot.version;
    } else if (batch.recipeId) {
      try {
        const recipe = await recipeRepository.findById(
          batch.recipeId as number,
        );
        if (recipe) {
          recipeName = recipe.name;
          recipeVersion = null;
        }
      } catch {
        /* ignore */
      }
    }
    let abortReason: string | null = null;
    if (
      batch.status === "aborted" &&
      typeof batch.notes === "string" &&
      batch.notes
    ) {
      const match = batch.notes.match(/\[ABORTED\]\s*([\s\S]*)/);
      if (match) abortReason = match[1].trim();
    }
    return {
      ...batch,
      recipeName,
      recipeVersion,
      abortReason,
      summary: batch.recipeSnapshot ? batch.summary : null,
      summaryStatus: batch.recipeSnapshot
        ? "frozen-recipe"
        : "unverified-legacy",
    };
  },

  /** Enrich multiple batches efficiently (batch recipe lookups) */
  async _enrichBatches(batchList: Record<string, unknown>[]) {
    const recipeIds = [
      ...new Set(
        batchList.filter((b) => b.recipeId).map((b) => b.recipeId as number),
      ),
    ];
    const recipeMap = new Map<number, { name: string; version: number }>();
    await Promise.all(
      recipeIds.map(async (id) => {
        try {
          const recipe = await recipeRepository.findById(id);
          if (recipe)
            recipeMap.set(id, {
              name: recipe.name,
              version: recipe.version,
            });
        } catch {
          /* ignore */
        }
      }),
    );
    return batchList.map((batch) => {
      const recipe =
        (batch.recipeSnapshot as { name: string; version: number } | null) ??
        (batch.recipeId
          ? (recipeMap.get(batch.recipeId as number) ?? null)
          : null);
      let abortReason: string | null = null;
      if (
        batch.status === "aborted" &&
        typeof batch.notes === "string" &&
        batch.notes
      ) {
        const match = batch.notes.match(/\[ABORTED\]\s*([\s\S]*)/);
        if (match) abortReason = match[1].trim();
      }
      return {
        ...batch,
        recipeName: recipe?.name ?? null,
        recipeVersion: batch.recipeSnapshot ? (recipe?.version ?? null) : null,
        abortReason,
        summary: batch.recipeSnapshot ? batch.summary : null,
        summaryStatus: batch.recipeSnapshot
          ? "frozen-recipe"
          : "unverified-legacy",
      };
    });
  },

  async createBatch(input: BatchCreateInput, actor?: AuditActor) {
    // Auto-generate batch number if not provided
    if (!input.batchNumber) {
      input.batchNumber = `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    // Only server-owned recipe evidence may be frozen into a batch.
    const recipe = input.recipeId
      ? await recipeRepository.findById(input.recipeId)
      : null;
    if (input.recipeId && !recipe) throw new NotFoundError("Recipe");
    if (recipe?.machineId && recipe.machineId !== input.machineId)
      throw new ValidationError("Recipe belongs to another machine");
    const batch = await batchRepository.create({
      ...input,
      recipeSnapshot: recipe
        ? {
            id: recipe.id,
            name: recipe.name,
            version: recipe.version,
            parameters: recipe.parameters,
            setpoints: recipe.setpoints,
          }
        : null,
    });

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

    return this._enrichBatch(batch);
  },

  async getBatch(id: number) {
    const batch = await batchRepository.findById(id);
    if (!batch) {
      throw new NotFoundError("Batch");
    }
    return this._enrichBatch(batch);
  },

  async listBatches(filters: BatchListFilters = {}) {
    const batches = await batchRepository.list(filters);
    return this._enrichBatches(batches);
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

    return this._enrichBatch(updated);
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

    return this._enrichBatch(updated);
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

    return this._enrichBatch(updated);
  },

  async computeBatchSummary(batchId: number) {
    const batch = await batchRepository.findById(batchId);
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (!batch.recipeId && !batch.recipeSnapshot) {
      throw new ValidationError("Batch has no associated recipe");
    }

    const recipe = batch.recipeSnapshot;
    if (!recipe) {
      throw new ValidationError(
        "Historical batch has no frozen recipe revision; its original limits cannot be verified",
      );
    }

    if (!batch.startedAt || !batch.completedAt) {
      throw new ValidationError(
        "Batch must have startedAt and completedAt to compute summary",
      );
    }

    const parameters = (recipe.parameters ?? []) as RecipeParameter[];
    if (parameters.length === 0) {
      const summary: BatchSummary = {
        computedAt: new Date().toISOString(),
        duration: batch.completedAt.getTime() - batch.startedAt.getTime(),
        parameterResults: [],
        overallCompliance: null,
      };
      await batchRepository.update(batchId, { summary });
      return summary;
    }

    const nodeKeys = parameters.map((p) => p.nodeKey);

    const result = await db.execute(
      sql`SELECT node_key,
          avg(value) FILTER (WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real, 'Infinity'::real, '-Infinity'::real)) as avg_value,
          min(value) FILTER (WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real, 'Infinity'::real, '-Infinity'::real)) as min_value,
          max(value) FILTER (WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real, 'Infinity'::real, '-Infinity'::real)) as max_value,
          count(value) FILTER (WHERE status_code LIKE 'Good%' AND value NOT IN ('NaN'::real, 'Infinity'::real, '-Infinity'::real)) as sample_count,
          count(*) as total_count
          FROM opcua_data
          WHERE machine_id = ${batch.machineId}
            AND timestamp >= ${batch.startedAt} AND timestamp < ${batch.completedAt}
            AND node_key IN (${sql.join(
              nodeKeys.map((key) => sql`${key}`),
              sql`, `,
            )})
          GROUP BY node_key`,
    );

    const statsMap = new Map<
      string,
      {
        avg: number | null;
        min: number | null;
        max: number | null;
        sampleCount: number;
        excludedCount: number;
      }
    >();
    for (const row of result.rows as {
      node_key: string;
      avg_value: string | null;
      min_value: string | null;
      max_value: string | null;
      sample_count: string;
      total_count: string;
    }[]) {
      const finite = (value: string | null) =>
        value != null && Number.isFinite(Number(value)) ? Number(value) : null;
      statsMap.set(row.node_key, {
        avg: finite(row.avg_value),
        min: finite(row.min_value),
        max: finite(row.max_value),
        sampleCount: Number(row.sample_count),
        excludedCount: Number(row.total_count) - Number(row.sample_count),
      });
    }

    const parameterResults: ParameterResult[] = parameters.map((param) => {
      const stats = statsMap.get(param.nodeKey);
      const actualAvg = stats?.avg ?? null;
      const actualMin = stats?.min ?? null;
      const actualMax = stats?.max ?? null;

      const withinTolerance =
        actualAvg == null
          ? null
          : Math.abs(actualAvg - param.targetValue) <= param.tolerance;

      return {
        nodeKey: param.nodeKey,
        displayName: param.displayName,
        targetValue: param.targetValue,
        actualAvg,
        actualMin,
        actualMax,
        withinTolerance,
        sampleCount: stats?.sampleCount ?? 0,
        excludedCount: stats?.excludedCount ?? 0,
      };
    });

    const compliantCount = parameterResults.filter(
      (p) => p.withinTolerance,
    ).length;
    const overallCompliance =
      parameterResults.length > 0 &&
      parameterResults.every(
        (p) => p.withinTolerance !== null && p.excludedCount === 0,
      )
        ? Math.round((compliantCount / parameterResults.length) * 100)
        : null;

    const duration = batch.completedAt.getTime() - batch.startedAt.getTime();

    const summary: BatchSummary = {
      computedAt: new Date().toISOString(),
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

    if (!batch.recipeId && !batch.recipeSnapshot) {
      throw new ValidationError("Batch has no associated recipe");
    }

    const recipe = batch.recipeSnapshot;
    if (!recipe) {
      throw new ValidationError(
        "Historical batch has no frozen recipe revision; its original limits cannot be verified",
      );
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
      sql`SELECT node_key, timestamp, value, raw_value, status_code,source_timestamp,received_at,correction_revision,reported_status_code,source_clock_state
          FROM opcua_data
          WHERE machine_id = ${batch.machineId}
            AND timestamp >= ${batch.startedAt} AND timestamp < ${endTime}
            AND node_key IN (${sql.join(
              nodeKeys.map((key) => sql`${key}`),
              sql`, `,
            )})
          ORDER BY node_key, timestamp`,
    );

    const seriesMap = new Map<string, DataPoint[]>();
    for (const row of result.rows as {
      node_key: string;
      timestamp: string;
      value: string | null;
      raw_value: unknown;
      status_code: string | null;
      source_timestamp: string | null;
      received_at: string | null;
      correction_revision: number;
      reported_status_code: string | null;
      source_clock_state: string;
    }[]) {
      if (!seriesMap.has(row.node_key)) {
        seriesMap.set(row.node_key, []);
      }
      seriesMap.get(row.node_key)!.push({
        timestamp: row.timestamp,
        value:
          row.status_code?.startsWith("Good") &&
          row.value != null &&
          Number.isFinite(Number(row.value))
            ? Number(row.value)
            : null,
        rawValue: row.raw_value,
        statusCode: row.status_code,
        sourceTimestamp: row.source_timestamp,
        receivedAt: row.received_at,
        correctionRevision: row.correction_revision,
        reportedStatusCode: row.reported_status_code,
        sourceClockState: row.source_clock_state,
      });
    }

    return parameters.map((param) => ({
      nodeKey: param.nodeKey,
      displayName: param.displayName,
      dataPoints: seriesMap.get(param.nodeKey) ?? [],
      setpoint: setpoints[param.nodeKey] ?? param.targetValue,
      targetValue: param.targetValue,
      tolerance: param.tolerance,
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
          ...dp,
          timestamp: String(new Date(dp.timestamp).getTime() - startTime),
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
    const batch = await batchRepository.findActiveBatch(machineId);
    return this._enrichBatch(batch);
  },
};
