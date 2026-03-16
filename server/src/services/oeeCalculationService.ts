import {
  oeeRepository,
  type ManualEntryInput,
} from "../repositories/oeeRepository.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import logger from "../utils/logger.js";
import type { OeeConfigRow } from "../database/schema.js";

// --- Types ---

export interface AvailabilityResult {
  availability: number;
  runningTimeMinutes: number;
  plannedStopTimeMinutes: number;
  totalTimeMinutes: number;
}

export interface PerformanceResult {
  performance: number;
  totalCount: number;
}

export interface QualityResult {
  quality: number;
  goodCount: number;
  rejectCount: number;
}

export interface OeeResult {
  oee: number;
  availability: AvailabilityResult;
  performance: PerformanceResult;
  quality: QualityResult;
  startDate: string;
  endDate: string;
}

export interface OeeHistoryEntry extends OeeResult {
  bucketStart: string;
  bucketEnd: string;
}

type Granularity = "hour" | "day" | "week";

// --- Helpers ---

function ensureConfig(config: OeeConfigRow | null): OeeConfigRow {
  if (!config) {
    throw new NotFoundError("OEE configuration");
  }
  return config;
}

function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  return [];
}

function classifyDataPoints(
  dataPoints: { timestamp: Date; value: number | null }[],
  config: OeeConfigRow,
): { runningMs: number; plannedStopMs: number; totalMs: number } {
  const runningValues = new Set(asNumberArray(config.runningModeValues));
  const plannedStopValues = new Set(
    asNumberArray(config.plannedStopModeValues),
  );

  let runningMs = 0;
  let plannedStopMs = 0;
  let totalMs = 0;

  for (let i = 0; i < dataPoints.length - 1; i++) {
    const current = dataPoints[i];
    const next = dataPoints[i + 1];
    const gapMs =
      new Date(next.timestamp).getTime() -
      new Date(current.timestamp).getTime();

    if (gapMs <= 0) continue;

    totalMs += gapMs;
    const modeValue = current.value;

    if (modeValue !== null && runningValues.has(modeValue)) {
      runningMs += gapMs;
    } else if (modeValue !== null && plannedStopValues.has(modeValue)) {
      plannedStopMs += gapMs;
    }
    // idle and unplanned stop time is implicitly totalMs - runningMs - plannedStopMs
  }

  return { runningMs, plannedStopMs, totalMs };
}

function getCountFromDataPoints(
  dataPoints: { timestamp: Date; value: number | null }[],
): number {
  if (dataPoints.length < 2) return 0;

  const earliest = dataPoints[0].value ?? 0;
  const latest = dataPoints[dataPoints.length - 1].value ?? 0;

  return Math.max(0, latest - earliest);
}

function generateBuckets(
  startDate: Date,
  endDate: Date,
  granularity: Granularity,
): { start: Date; end: Date }[] {
  const buckets: { start: Date; end: Date }[] = [];
  let current = new Date(startDate);

  while (current < endDate) {
    const bucketStart = new Date(current);
    let bucketEnd: Date;

    switch (granularity) {
      case "hour":
        bucketEnd = new Date(current.getTime() + 60 * 60 * 1000);
        break;
      case "day":
        bucketEnd = new Date(current);
        bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 1);
        break;
      case "week":
        bucketEnd = new Date(current);
        bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 7);
        break;
    }

    // Clamp to endDate
    if (bucketEnd > endDate) {
      bucketEnd = new Date(endDate);
    }

    buckets.push({ start: bucketStart, end: bucketEnd });
    current = bucketEnd;
  }

  return buckets;
}

// --- Service ---

export const oeeCalculationService = {
  async calculateAvailability(
    machineId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<AvailabilityResult> {
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    const dataPoints = await oeeRepository.getOperationModeData(
      machineId,
      startDate,
      endDate,
    );

    if (dataPoints.length < 2) {
      logger.debug(
        `[OEE] No sufficient OperationMode data for machine ${machineId}`,
      );
      return {
        availability: 0,
        runningTimeMinutes: 0,
        plannedStopTimeMinutes: 0,
        totalTimeMinutes: 0,
      };
    }

    const { runningMs, plannedStopMs, totalMs } = classifyDataPoints(
      dataPoints,
      config,
    );

    const scheduledMs = totalMs - plannedStopMs;
    const availability = scheduledMs > 0 ? runningMs / scheduledMs : 0;

    return {
      availability: Math.min(1, Math.max(0, availability)),
      runningTimeMinutes: runningMs / 60_000,
      plannedStopTimeMinutes: plannedStopMs / 60_000,
      totalTimeMinutes: totalMs / 60_000,
    };
  },

  async calculatePerformance(
    machineId: number,
    startDate: Date,
    endDate: Date,
    runningTimeMinutes?: number,
  ): Promise<PerformanceResult> {
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    let totalCount = 0;

    // Try to get count from OPC-UA data first
    if (config.productionCountNodeKey) {
      const countData = await oeeRepository.getNodeData(
        config.productionCountNodeKey,
        machineId,
        startDate,
        endDate,
      );
      totalCount = getCountFromDataPoints(countData);
    } else if (config.manualEntryEnabled) {
      // Fall back to manual entries
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];
      const entries = await oeeRepository.getManualEntries(
        machineId,
        startStr,
        endStr,
      );
      totalCount = entries.reduce(
        (sum: number, e: { productionCount: number | null }) =>
          sum + (e.productionCount ?? 0),
        0,
      );
    }

    let performance = 0;

    if (config.idealCycleTimeMs && totalCount > 0) {
      // If runningTimeMinutes not provided, calculate it
      let actualRunningMinutes = runningTimeMinutes;
      if (actualRunningMinutes === undefined) {
        const availResult = await this.calculateAvailability(
          machineId,
          startDate,
          endDate,
        );
        actualRunningMinutes = availResult.runningTimeMinutes;
      }

      if (actualRunningMinutes > 0) {
        performance =
          (config.idealCycleTimeMs * totalCount) /
          (actualRunningMinutes * 60_000);
      }
    }

    return {
      performance: Math.min(1, Math.max(0, performance)),
      totalCount,
    };
  },

  async calculateQuality(
    machineId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<QualityResult> {
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    let goodCount = 0;
    let rejectCount = 0;

    if (config.goodCountNodeKey && config.rejectCountNodeKey) {
      // Get counts from OPC-UA data
      const [goodData, rejectData] = await Promise.all([
        oeeRepository.getNodeData(
          config.goodCountNodeKey,
          machineId,
          startDate,
          endDate,
        ),
        oeeRepository.getNodeData(
          config.rejectCountNodeKey,
          machineId,
          startDate,
          endDate,
        ),
      ]);

      goodCount = getCountFromDataPoints(goodData);
      rejectCount = getCountFromDataPoints(rejectData);
    } else if (config.manualEntryEnabled) {
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];
      const entries = await oeeRepository.getManualEntries(
        machineId,
        startStr,
        endStr,
      );
      goodCount = entries.reduce(
        (sum: number, e: { goodCount: number | null }) =>
          sum + (e.goodCount ?? 0),
        0,
      );
      rejectCount = entries.reduce(
        (sum: number, e: { rejectCount: number | null }) =>
          sum + (e.rejectCount ?? 0),
        0,
      );
    }

    const totalCount = goodCount + rejectCount;
    const quality = totalCount > 0 ? goodCount / totalCount : 1.0;

    return {
      quality: Math.min(1, Math.max(0, quality)),
      goodCount,
      rejectCount,
    };
  },

  async calculateOee(
    machineId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<OeeResult> {
    const availability = await this.calculateAvailability(
      machineId,
      startDate,
      endDate,
    );

    const performance = await this.calculatePerformance(
      machineId,
      startDate,
      endDate,
      availability.runningTimeMinutes,
    );

    const quality = await this.calculateQuality(machineId, startDate, endDate);

    const oee =
      availability.availability * performance.performance * quality.quality;

    logger.debug(
      `[OEE] Machine ${machineId}: A=${availability.availability.toFixed(3)} ` +
        `P=${performance.performance.toFixed(3)} Q=${quality.quality.toFixed(3)} ` +
        `OEE=${oee.toFixed(3)}`,
    );

    return {
      oee: Math.min(1, Math.max(0, oee)),
      availability,
      performance,
      quality,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  },

  async calculateOeeHistory(
    machineId: number,
    startDate: Date,
    endDate: Date,
    granularity: Granularity,
  ): Promise<OeeHistoryEntry[]> {
    // Validate config exists before iterating buckets
    ensureConfig(await oeeRepository.getConfig(machineId));

    const buckets = generateBuckets(startDate, endDate, granularity);
    const results: OeeHistoryEntry[] = [];

    for (const bucket of buckets) {
      const oeeResult = await this.calculateOee(
        machineId,
        bucket.start,
        bucket.end,
      );

      results.push({
        ...oeeResult,
        bucketStart: bucket.start.toISOString(),
        bucketEnd: bucket.end.toISOString(),
      });
    }

    return results;
  },
};
