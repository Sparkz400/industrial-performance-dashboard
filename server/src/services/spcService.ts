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

// ---------------------------------------------------------------------------
// Ring-buffer: in-memory recent values per nodeKey, capped at windowSize
// ---------------------------------------------------------------------------
const ringBuffers = new Map<string, number[]>();

function getBuffer(nodeKey: string): number[] {
  let buf = ringBuffers.get(nodeKey);
  if (!buf) {
    buf = [];
    ringBuffers.set(nodeKey, buf);
  }
  return buf;
}

function pushValue(nodeKey: string, value: number, maxSize: number): number[] {
  const buf = getBuffer(nodeKey);
  buf.push(value);
  if (buf.length > maxSize) {
    buf.splice(0, buf.length - maxSize);
  }
  return buf;
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
    const updated = await spcRepository.updateProfile(id, data);
    if (!updated) {
      throw new NotFoundError("SPC Profile");
    }
    return updated;
  },

  async deleteProfile(id: number) {
    const deleted = await spcRepository.deleteProfile(id);
    if (!deleted) {
      throw new NotFoundError("SPC Profile");
    }
    return deleted;
  },

  // ---- Baseline computation ----

  async computeBaseline(profileId: number) {
    const profile = await spcRepository.findProfileById(profileId);
    if (!profile) {
      throw new NotFoundError("SPC Profile");
    }

    const result = await db.execute(
      sql`SELECT avg(value)::real AS mean, stddev(value)::real AS stddev
          FROM opcua_data
          WHERE node_key = ${profile.nodeKey}
            AND timestamp > now() - interval '7 days'`,
    );

    const row = (result as any).rows?.[0] ?? (result as any)[0];
    const mean = row?.mean != null ? Number(row.mean) : null;
    const stddev = row?.stddev != null ? Number(row.stddev) : null;

    if (mean == null || stddev == null) {
      throw new ValidationError(
        "Insufficient data to compute baseline. Ensure opcua_data contains recent values for this node key.",
      );
    }

    const sensitivity = profile.sensitivity ?? 3.0;
    const ucl = mean + sensitivity * stddev;
    const lcl = mean - sensitivity * stddev;

    const updated = await spcRepository.updateProfile(profileId, {
      mean,
      stddev,
      ucl,
      lcl,
    });

    // Also update lastComputedAt separately (not part of SpcProfileInput)
    await db.execute(
      sql`UPDATE spc_profiles SET last_computed_at = now() WHERE id = ${profileId}`,
    );

    logger.info(
      `[SPC] Computed baseline for profile ${profileId} (${profile.name}): mean=${mean}, stddev=${stddev}, ucl=${ucl}, lcl=${lcl}`,
    );

    return { ...updated, lastComputedAt: new Date(), ucl, lcl, mean, stddev };
  },

  // ---- Real-time evaluation (called from opcuaBridge) ----

  async evaluateDataPoint(nodeKey: string, value: number, machineId?: number) {
    const profiles = await spcRepository.listActiveProfilesByNodeKey(
      nodeKey,
      machineId,
    );

    if (profiles.length === 0) return;

    for (const profile of profiles) {
      try {
        await evaluateAgainstProfile(profile, nodeKey, value, machineId);
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
        value: opcuaData.value,
      })
      .from(opcuaData)
      .where(
        sql`${opcuaData.nodeKey} = ${profile.nodeKey}
            AND ${opcuaData.timestamp} >= ${startDate}
            AND ${opcuaData.timestamp} <= ${endDate}`,
      )
      .orderBy(opcuaData.timestamp);

    const ucl = profile.ucl;
    const lcl = profile.lcl;
    const mean = profile.mean;

    const dataPoints = rows.map(
      (row: { timestamp: Date | null; value: number | null }) => ({
        timestamp: row.timestamp,
        value: row.value,
        isAnomaly:
          ucl != null && lcl != null && row.value != null
            ? row.value > ucl || row.value < lcl
            : false,
      }),
    );

    return {
      profile,
      dataPoints,
      ucl,
      lcl,
      mean,
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
  machineId?: number,
) {
  const windowSize = profile.windowSize ?? 100;
  const buffer = pushValue(nodeKey, value, windowSize);

  let isAnomaly = false;
  let alertType: string | undefined;
  let threshold: number | undefined;

  switch (profile.method) {
    case "zscore": {
      if (profile.mean == null || profile.stddev == null) break;
      const result = zScoreCheck(
        value,
        profile.mean,
        profile.stddev,
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
      const target = profile.mean ?? 0;
      const allowance = (profile.stddev ?? 1) * 0.5;
      const result = cusumCheck(buffer, target, allowance);
      isAnomaly = result.isAnomaly;
      alertType = result.alertType;
      threshold = allowance * 5;
      break;
    }

    case "std_bands": {
      if (profile.mean == null || profile.stddev == null) break;
      // Use Western Electric rules for std_bands method
      const result = westernElectricRules(
        buffer.slice(-8),
        profile.mean,
        profile.stddev,
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
}
