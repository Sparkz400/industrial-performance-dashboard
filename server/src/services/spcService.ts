import { proposeBaseline } from "./spcBaseline.js";
import { EventEmitter } from "events";
import { sql } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import { opcuaData } from "../database/schema.js";
import type { SpcProfile } from "../database/schema.js";
import {
  spcRepository,
  type SpcProfileInput,
  type AlertFilters,
} from "../repositories/spcRepository.js";
import {
  zScoreCheck,
  movingAverageCheck,
  cusumCheck,
  westernElectricRules,
} from "./spcEvaluator.js";
import logger from "../utils/logger.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import {
  chartPoints,
  referenceLimits,
  type ChartType,
} from "./controlCharts.js";

/** EventEmitter for SPC alert events — consumed by opcuaBridge to broadcast via Socket.IO */
export const spcEvents = new EventEmitter();

// ---------------------------------------------------------------------------
// Each profile owns its samples; aliases shared by different machines are not identity.
// ---------------------------------------------------------------------------
// Windows count samples, not time: OPC UA reports on change, so a quiet signal is not missing.
type Sample = { value: number; at: number };
const ringBuffers = new Map<string, Sample[]>();
const evaluationChains = new Map<string, Promise<void>>();

/** Samples each method needs before it judges anything; fewer is not evidence. */
function requiredSamples(method: string, windowSize: number): number {
  if (method === "zscore") return 1;
  if (method === "std_bands") return 8;
  return windowSize;
}

/**
 * Append a good sample to the profile's window. After a restart the window is rebuilt
 * from stored history, so a verdict does not depend on when the process last started.
 * Returns null for a duplicate or older timestamp (e.g. the value re-sent on reconnect).
 */
async function pushValue(
  key: string,
  sample: Sample,
  maxSize: number,
  machineId: number | undefined,
  nodeKey: string,
): Promise<number[] | null> {
  let buf = ringBuffers.get(key);
  if (!buf) {
    buf =
      machineId == null
        ? []
        : (
            await spcRepository.recentGoodRun(
              machineId,
              nodeKey,
              new Date(sample.at),
              maxSize,
            )
          ).map((row) => ({ value: row.value, at: row.at.getTime() }));
    ringBuffers.set(key, buf);
  }
  if (buf.length && sample.at <= buf[buf.length - 1].at) return null;
  buf.push(sample);
  if (buf.length > maxSize) buf.splice(0, buf.length - maxSize);
  return buf.map((entry) => entry.value);
}

// ---------------------------------------------------------------------------
// SPC Service
// ---------------------------------------------------------------------------
export const spcService = {
  // ---- Profile CRUD (delegates to repository) ----

  async createProfile(input: SpcProfileInput) {
    return spcRepository.createProfile(input);
  },

  async getProfile(id: number) {
    const profile = await spcRepository.findProfileById(id);
    if (!profile) {
      throw new NotFoundError("SPC Profile");
    }
    return profile;
  },

  async listProfiles(machineId?: number) {
    return spcRepository.listProfiles(machineId);
  },

  async updateProfile(id: number, data: Partial<SpcProfileInput>) {
    // A subgroup size belongs only to an X̄-R declaration.
    if (data.chartType !== undefined && data.chartType !== "xbar-r")
      data = { ...data, subgroupSize: null };
    const updated = await spcRepository.updateProfile(id, data);
    if (!updated) {
      throw new NotFoundError("SPC Profile");
    }
    clearProfileBuffers(id);
    return updated;
  },

  async deleteProfile(id: number) {
    const deleted = await spcRepository.deleteProfile(id);
    if (!deleted) {
      throw new NotFoundError("SPC Profile");
    }
    clearProfileBuffers(id);
    return deleted;
  },

  // ---- Baseline computation ----

  async computeBaseline(
    profileId: number,
    range?: { start: string; end: string },
  ) {
    return proposeBaseline(profileId, range);
  },

  // ---- Real-time evaluation (called from opcuaBridge) ----

  /** Callers do not await this; evaluation runs per signal in arrival order. */
  evaluateDataPoint(
    nodeKey: string,
    value: number | null,
    machineId?: number,
    at: Date | string | number = Date.now(),
    quality = "Good",
  ): Promise<void> {
    const signal = `${machineId ?? "legacy"}:${nodeKey}`;
    const run = (evaluationChains.get(signal) ?? Promise.resolve()).then(() =>
      this.evaluateInOrder(nodeKey, value, machineId, at, quality),
    );
    evaluationChains.set(
      signal,
      run.catch(() => {}),
    );
    return run;
  },

  async evaluateInOrder(
    nodeKey: string,
    value: number | null,
    machineId: number | undefined,
    at: Date | string | number,
    quality: string,
  ) {
    const time = new Date(at).getTime();
    const profiles = await spcRepository.listActiveProfilesByNodeKey(
      nodeKey,
      machineId,
    );

    if (profiles.length === 0) return;

    for (const profile of profiles) {
      if (profile.machineId !== (machineId ?? null)) continue;
      const key = `${profile.id}:${machineId ?? "legacy"}:${nodeKey}`;
      // A bad or missing value breaks the run; the window starts again afterwards.
      if (
        !quality.startsWith("Good") ||
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isFinite(time)
      ) {
        ringBuffers.set(key, []);
        continue;
      }
      try {
        await evaluateAgainstProfile(profile, nodeKey, value, machineId, time);
      } catch (error) {
        logger.error(
          `[SPC] Error evaluating data point against profile ${profile.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  },

  // ---- Chart data ----

  async getChartData(profileId: number, startDate: Date, endDate: Date) {
    const profile = await spcRepository.findProfileById(profileId);
    if (!profile) {
      throw new NotFoundError("SPC Profile");
    }

    const rows = await getReadDb()
      .select({
        timestamp: opcuaData.timestamp,
        rawValue: opcuaData.rawValue,
        statusCode: opcuaData.statusCode,
        receivedAt: opcuaData.receivedAt,
        sourceTimestamp: opcuaData.sourceTimestamp,
        correctionRevision: opcuaData.correctionRevision,
        reportedStatusCode: opcuaData.reportedStatusCode,
        sourceClockState: opcuaData.sourceClockState,
        value: sql<
          number | null
        >`CASE WHEN ${opcuaData.statusCode} LIKE 'Good%' THEN ${opcuaData.value} ELSE NULL END`,
      })
      .from(opcuaData)
      .where(
        sql`${opcuaData.nodeKey} = ${profile.nodeKey}
            AND ${opcuaData.machineId} IS NOT DISTINCT FROM ${profile.machineId}
            AND ${opcuaData.timestamp} >= ${startDate}
            AND ${opcuaData.timestamp} <= ${endDate}`,
      )
      .orderBy(opcuaData.timestamp, opcuaData.id)
      .limit(5001);

    const ucl = profile.ucl;
    const lcl = profile.lcl;
    const mean = profile.mean;

    const dataPoints = rows.slice(0, 5000).map((row) => ({
      ...row,
      timestamp: row.timestamp,
      value: row.value,
      isAnomaly:
        ucl != null && lcl != null && row.value != null
          ? row.value > ucl || row.value < lcl
          : false,
    }));

    return {
      profile,
      truncated: rows.length > 5000,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      dataPoints,
      ucl,
      lcl,
      mean,
    };
  },

  /** The declared control chart for a window, with limits from the approved reference period. */
  async getControlChart(profileId: number, startDate: Date, endDate: Date) {
    const profile = await spcRepository.findProfileById(profileId);
    if (!profile) throw new NotFoundError("SPC Profile");
    const type = profile.chartType as ChartType | null;
    if (!type)
      throw new ValidationError(
        "Declare the data assumption (individual measurements or rational subgroups) before using a control chart",
      );
    const baseline = (
      await db.execute<{
        id: number;
        evidence: {
          samples: { value: number | string | null }[];
          profile: { machineId: number | null; nodeKey: string };
        };
      }>(
        sql`SELECT id, evidence FROM spc_baselines WHERE profile_id=${profileId} AND approved_at IS NOT NULL AND NOT superseded ORDER BY approved_at DESC LIMIT 1`,
      )
    ).rows[0];
    if (
      !baseline ||
      baseline.evidence.profile.machineId !== profile.machineId ||
      baseline.evidence.profile.nodeKey !== profile.nodeKey
    )
      throw new ValidationError(
        "Approve a reference period for this signal before using a control chart",
      );
    const n = type === "xbar-r" ? profile.subgroupSize! : 1;
    let limits;
    try {
      limits = referenceLimits(
        type,
        baseline.evidence.samples.map((s) => Number(s.value)),
        n,
      );
    } catch (error) {
      throw new ValidationError((error as Error).message);
    }
    const window = await this.getChartData(profileId, startDate, endDate);
    return {
      chartType: type,
      subgroupSize: type === "xbar-r" ? n : null,
      baseline: { id: baseline.id, referencePoints: limits.points },
      primary: {
        label: type === "xbar-r" ? "Subgroup mean" : "Individual",
        ...limits.primary,
      },
      secondary: {
        label: type === "xbar-r" ? "Range" : "Moving range",
        ...limits.secondary,
      },
      points: chartPoints(
        type,
        window.dataPoints.map((p) => ({
          at: new Date(p.timestamp).toISOString(),
          value: p.value,
        })),
        limits,
        n,
      ),
      truncated: window.truncated,
      assumptions:
        type === "xbar-r"
          ? `Consecutive good readings form rational subgroups of ${n}; σ is estimated from within-subgroup ranges (R̄/d2). A bad reading ends a subgroup.`
          : "Individual readings are assumed independent and approximately normal; σ is estimated from the average moving range (MR̄/1.128). A bad reading leaves the next moving range unknown.",
      specificationLimits:
        "Control limits describe the approved reference process, not specification limits; capability uses separate specification limits.",
    };
  },

  // ---- Alerts ----

  async listAlerts(filters: AlertFilters) {
    return spcRepository.listAlerts(filters);
  },

  async acknowledgeAlert(alertId: number, userId: number) {
    const updated = await spcRepository.acknowledgeAlert(alertId, userId);
    if (!updated) {
      throw new NotFoundError("SPC Alert");
    }
    return updated;
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function evaluateAgainstProfile(
  profile: SpcProfile,
  nodeKey: string,
  value: number,
  machineId: number | undefined,
  at: number,
) {
  const windowSize = profile.windowSize ?? 100;
  const buffer = await pushValue(
    `${profile.id}:${machineId ?? "legacy"}:${nodeKey}`,
    { value, at },
    Math.max(windowSize, 8),
    machineId,
    nodeKey,
  );
  if (!buffer || buffer.length < requiredSamples(profile.method, windowSize))
    return;
  // A baseline without positive variation cannot say what is unusual.
  const baselineKnown =
    profile.mean != null && profile.stddev != null && profile.stddev > 0;

  let isAnomaly = false;
  let alertType: string | undefined;
  let threshold: number | undefined;

  switch (profile.method) {
    case "zscore": {
      if (!baselineKnown) break;
      const result = zScoreCheck(
        value,
        profile.mean!,
        profile.stddev!,
        profile.sensitivity ?? 3.0,
      );
      isAnomaly = result.isAnomaly;
      alertType = result.alertType;
      threshold =
        result.alertType === "ucl_breach"
          ? (profile.ucl ?? undefined)
          : (profile.lcl ?? undefined);
      break;
    }

    case "moving_avg": {
      const result = movingAverageCheck(
        buffer,
        windowSize,
        profile.sensitivity ?? 3.0,
      );
      isAnomaly = result.isAnomaly;
      alertType = result.alertType;
      threshold =
        result.alertType === "ucl_breach"
          ? result.movingAverage +
            (profile.sensitivity ?? 3.0) * result.deviation
          : result.movingAverage -
            (profile.sensitivity ?? 3.0) * result.deviation;
      break;
    }

    case "cusum": {
      // No target or variation is invented for a profile without an approved baseline.
      if (!baselineKnown) break;
      const allowance = profile.stddev! * 0.5;
      const result = cusumCheck(
        buffer.slice(-windowSize),
        profile.mean!,
        allowance,
      );
      isAnomaly = result.isAnomaly;
      alertType = result.alertType;
      threshold = allowance * 10;
      break;
    }

    case "std_bands": {
      if (!baselineKnown) break;
      // Use Western Electric rules for std_bands method
      const result = westernElectricRules(
        buffer.slice(-8),
        profile.mean!,
        profile.stddev!,
      );
      isAnomaly = result.isAnomaly;
      alertType = result.alertType;
      threshold =
        alertType === "ucl_breach"
          ? (profile.ucl ?? undefined)
          : (profile.lcl ?? undefined);
      break;
    }

    default:
      logger.warn(
        `[SPC] Unknown method "${profile.method}" for profile ${profile.id}`,
      );
      return;
  }

  if (!isAnomaly || !alertType) return;

  // Deduplication: skip if there is a recent unacknowledged alert for same profile
  const recentAlert = await spcRepository.findRecentUnacknowledgedAlert(
    profile.id,
    5,
  );
  if (recentAlert) return;

  const alert = await spcRepository.createAlert({
    profileId: profile.id,
    machineId: machineId ?? profile.machineId,
    nodeKey,
    alertType,
    value,
    threshold: threshold ?? 0,
    message: `SPC alert: ${alertType} detected on "${profile.name}" (node: ${nodeKey}). Value=${value.toFixed(4)}`,
    severity:
      profile.sensitivity != null && profile.sensitivity >= 4
        ? "high"
        : "medium",
  });

  logger.warn(
    `[SPC] Alert created (id=${alert.id}): ${alertType} on profile ${profile.id}, value=${value}`,
  );

  // Emit event for socket broadcasting
  spcEvents.emit("spcAlert", {
    id: alert.id,
    profileId: alert.profileId,
    machineId: alert.machineId,
    nodeKey: alert.nodeKey,
    alertType: alert.alertType,
    value: alert.value,
    threshold: alert.threshold,
    message: alert.message,
    severity: alert.severity,
    createdAt:
      alert.createdAt instanceof Date
        ? alert.createdAt.toISOString()
        : new Date().toISOString(),
  });
}

export function clearProfileBuffers(profileId: number) {
  for (const key of ringBuffers.keys()) {
    if (key.startsWith(`${profileId}:`)) ringBuffers.delete(key);
  }
}
