import { oeeRepository } from "../repositories/oeeRepository.js";
import {
  counterDeltas,
  stateTimeline,
  type ShiftSample,
} from "./shiftCalculation.js";
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

// shortcut: legacy OEE uses a 60-second freshness limit; use a production profile for machine-specific gaps and rollover.
const counterPolicy = {
  maxGapSeconds: 60,
  counterPolicy: "reset-to-zero" as const,
};

function classifyDataPoints(
  dataPoints: ShiftSample[],
  config: OeeConfigRow,
  startDate: Date,
  endDate: Date,
) {
  const timeline = stateTimeline(
    dataPoints,
    {
      maxGapSeconds: counterPolicy.maxGapSeconds,
      signals: {},
      states: {
        running: asNumberArray(config.runningModeValues),
        planned: asNumberArray(config.plannedStopModeValues),
        idle: asNumberArray(config.idleModeValues),
        fault: asNumberArray(config.unplannedStopModeValues),
      },
    },
    startDate,
    endDate,
  );
  const result = {
    runningMs: 0,
    plannedStopMs: 0,
    unknownMs: 0,
    totalMs: +endDate - +startDate,
  };
  for (const interval of timeline) {
    const duration = Date.parse(interval.end) - Date.parse(interval.start);
    if (interval.state === "running") result.runningMs += duration;
    if (interval.state === "planned") result.plannedStopMs += duration;
    if (interval.state === "unknown") result.unknownMs += duration;
  }
  return result;
}

async function manualDays(machineId: number, start: Date, end: Date) {
  const dayMs = 86_400_000;
  // Daily declarations cannot be apportioned to an hour or a partial day.
  if (+start % dayMs || +end % dayMs) return [];
  return oeeRepository.getManualEntries(
    machineId,
    start.toISOString().slice(0, 10),
    new Date(+end - 1).toISOString().slice(0, 10),
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
      const measured = counterDeltas(
        countData,
        counterPolicy,
        1,
        startDate,
        endDate,
      );
      totalCount = measured.count ?? 0;
      dataComplete = measured.complete;
    } else if (config.manualEntryEnabled) {
      const entries = await manualDays(machineId, startDate, endDate);
      totalCount = entries.reduce(
        (sum: number, e: { productionCount: number | null }) =>
          sum + (e.productionCount ?? 0),
        0,
      );
      // Daily declarations are provisional, not measured coverage.
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

      const good = counterDeltas(
        goodData,
        counterPolicy,
        1,
        startDate,
        endDate,
      );
      const reject = counterDeltas(
        rejectData,
        counterPolicy,
        1,
        startDate,
        endDate,
      );
      goodCount = good.count ?? 0;
      rejectCount = reject.count ?? 0;
      dataComplete = good.complete && reject.complete;
    } else if (config.manualEntryEnabled) {
      const entries = await manualDays(machineId, startDate, endDate);
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
