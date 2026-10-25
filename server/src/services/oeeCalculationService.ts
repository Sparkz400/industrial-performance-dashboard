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
  unknownTimeMinutes: number;
}

export interface PerformanceResult {
  performance: number;
  totalCount: number;
  dataComplete: boolean;
}

export interface QualityResult {
  quality: number;
  goodCount: number;
  rejectCount: number;
  dataComplete: boolean;
}

export interface OeeResult {
  oee: number;
  availability: AvailabilityResult;
  performance: PerformanceResult;
  quality: QualityResult;
  startDate: string;
  endDate: string;
  dataComplete: boolean;
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
  startDate: Date,
  endDate: Date,
): {
  runningMs: number;
  plannedStopMs: number;
  totalMs: number;
  unknownMs: number;
} {
  const runningValues = new Set(asNumberArray(config.runningModeValues));
  const plannedStopValues = new Set(
    asNumberArray(config.plannedStopModeValues),
  );

  let runningMs = 0;
  let plannedStopMs = 0;
  const totalMs = endDate.getTime() - startDate.getTime();
  let knownMs = 0;
  const knownValues = new Set([
    ...runningValues,
    ...plannedStopValues,
    ...asNumberArray(config.idleModeValues),
    ...asNumberArray(config.unplannedStopModeValues),
  ]);

  for (let i = 0; i < dataPoints.length; i++) {
    const current = dataPoints[i];
    const next = dataPoints[i + 1];
    const gapMs =
      Math.min(
        next ? new Date(next.timestamp).getTime() : endDate.getTime(),
        endDate.getTime(),
      ) - Math.max(new Date(current.timestamp).getTime(), startDate.getTime());

    if (gapMs <= 0) continue;

    const modeValue = current.value;
    if (modeValue === null || !knownValues.has(modeValue)) continue;
    knownMs += gapMs;

    if (modeValue !== null && runningValues.has(modeValue)) {
      runningMs += gapMs;
    } else if (modeValue !== null && plannedStopValues.has(modeValue)) {
      plannedStopMs += gapMs;
    }
    // idle and unplanned stop time is implicitly totalMs - runningMs - plannedStopMs
  }

  return { runningMs, plannedStopMs, totalMs, unknownMs: totalMs - knownMs };
}

function getCountFromDataPoints(
  dataPoints: { timestamp: Date; value: number | null }[],
): number {
  let count = 0;
  let previous: number | null = null;
  for (const { value } of dataPoints) {
    if (value === null || !Number.isFinite(value) || value < 0) {
      previous = null;
      continue;
    }
    if (previous !== null) {
      // shortcut: a decrease means reset to zero; modulus rollover needs machine-specific configuration.
      count += value >= previous ? value - previous : value;
    }
    previous = value;
  }
  return count;
}

function hasCounterCoverage(
  data: { timestamp: Date; value: number | null }[],
  startDate: Date,
) {
  return (
    data.length > 0 &&
    new Date(data[0].timestamp) <= startDate &&
    data.every(
      (point) =>
        point.value !== null &&
        Number.isFinite(point.value) &&
        point.value >= 0,
    )
  );
}

function validateRange(startDate: Date, endDate: Date) {
  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate
  ) {
    throw new ValidationError("endDate must be after startDate");
  }
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
    validateRange(startDate, endDate);
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    const dataPoints = await oeeRepository.getOperationModeData(
      machineId,
      startDate,
      endDate,
    );

    const { runningMs, plannedStopMs, totalMs, unknownMs } = classifyDataPoints(
      dataPoints,
      config,
      startDate,
      endDate,
    );

    const scheduledMs = totalMs - plannedStopMs;
    const availability = scheduledMs > 0 ? runningMs / scheduledMs : 0;

    return {
      availability: Math.min(1, Math.max(0, availability)),
      runningTimeMinutes: runningMs / 60_000,
      plannedStopTimeMinutes: plannedStopMs / 60_000,
      totalTimeMinutes: totalMs / 60_000,
      unknownTimeMinutes: unknownMs / 60_000,
    };
  },

  async calculatePerformance(
    machineId: number,
    startDate: Date,
    endDate: Date,
    runningTimeMinutes?: number,
  ): Promise<PerformanceResult> {
    validateRange(startDate, endDate);
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    let totalCount = 0;
    let dataComplete = false;

    // Try to get count from OPC-UA data first
    if (config.productionCountNodeKey) {
      const countData = await oeeRepository.getNodeData(
        config.productionCountNodeKey,
        machineId,
        startDate,
        endDate,
      );
      totalCount = getCountFromDataPoints(countData);
      dataComplete = hasCounterCoverage(countData, startDate);
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
      dataComplete =
        entries.length > 0 && entries.every((e) => e.productionCount !== null);
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
      dataComplete,
    };
  },

  async calculateQuality(
    machineId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<QualityResult> {
    validateRange(startDate, endDate);
    const config = ensureConfig(await oeeRepository.getConfig(machineId));

    let goodCount = 0;
    let rejectCount = 0;
    let dataComplete = false;

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
      dataComplete =
        hasCounterCoverage(goodData, startDate) &&
        hasCounterCoverage(rejectData, startDate);
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
      dataComplete =
        entries.length > 0 &&
        entries.every((e) => e.goodCount !== null && e.rejectCount !== null);
    }

    const totalCount = goodCount + rejectCount;
    const quality = totalCount > 0 ? goodCount / totalCount : 0;

    return {
      quality: Math.min(1, Math.max(0, quality)),
      goodCount,
      rejectCount,
      dataComplete: dataComplete && totalCount > 0,
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
      dataComplete:
        availability.unknownTimeMinutes === 0 &&
        performance.dataComplete &&
        quality.dataComplete,
    };
  },

  async calculateOeeHistory(
    machineId: number,
    startDate: Date,
    endDate: Date,
    granularity: Granularity,
  ): Promise<OeeHistoryEntry[]> {
    validateRange(startDate, endDate);
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
