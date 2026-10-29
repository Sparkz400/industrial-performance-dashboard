import { and, eq, desc, isNull, isNotNull, lt, sql, asc } from "drizzle-orm";
import db, { getReadDb } from "../database/db.js";
import {
  opcuaData,
  spcProfiles,
  spcAlerts,
  type NewSpcProfile,
  type NewSpcAlert,
} from "../database/schema.js";

export interface SpcProfileInput {
  name: string;
  machineId: number | null;
  nodeKey: string;
  method: string;
  windowSize: number;
  ucl?: number | null;
  lcl?: number | null;
  mean?: number | null;
  stddev?: number | null;
  sensitivity?: number;
  chartType?: "individuals" | "xbar-r" | null;
  subgroupSize?: number | null;
  isActive?: boolean;
  createdBy?: number | null;
}

export interface SpcAlertInput {
  profileId: number;
  machineId: number | null;
  nodeKey: string;
  alertType: string;
  value: number;
  threshold: number;
  message: string;
  severity?: string;
}

export interface AlertFilters {
  profileId?: number;
  machineId?: number;
  acknowledged?: boolean;
  limit?: number;
}

export const spcRepository = {
  // ---- Profiles ----

  async createProfile(input: SpcProfileInput) {
    const [created] = await db
      .insert(spcProfiles)
      .values(input satisfies NewSpcProfile)
      .returning();
    return created;
  },

  async updateProfile(id: number, data: Partial<SpcProfileInput>) {
    const result = await db
      .update(spcProfiles)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(spcProfiles.id, id))
      .returning();
    return result[0] ?? null;
  },

  async deleteProfile(id: number) {
    const result = await db
      .delete(spcProfiles)
      .where(eq(spcProfiles.id, id))
      .returning();
    return result[0] ?? null;
  },

  async findProfileById(id: number) {
    const result = await getReadDb()
      .select()
      .from(spcProfiles)
      .where(eq(spcProfiles.id, id));
    return result[0] ?? null;
  },

  async listProfiles(machineId?: number) {
    const conditions = machineId
      ? eq(spcProfiles.machineId, machineId)
      : undefined;

    return getReadDb()
      .select()
      .from(spcProfiles)
      .where(conditions)
      .orderBy(asc(spcProfiles.name));
  },

  async listActiveProfilesByNodeKey(nodeKey: string, machineId?: number) {
    const conditions = and(
      eq(spcProfiles.nodeKey, nodeKey),
      eq(spcProfiles.isActive, true),
      machineId == null
        ? isNull(spcProfiles.machineId)
        : eq(spcProfiles.machineId, machineId),
    );

    return getReadDb().select().from(spcProfiles).where(conditions);
  },

  /**
   * Newest stored samples before `before`, oldest first, ending at the last bad or
   * missing value: the contiguous good run a live window may continue after a restart.
   */
  async recentGoodRun(
    machineId: number,
    nodeKey: string,
    before: Date,
    limit: number,
  ) {
    const rows = await db
      .select({
        value: opcuaData.value,
        at: opcuaData.timestamp,
        statusCode: opcuaData.statusCode,
      })
      .from(opcuaData)
      .where(
        and(
          eq(opcuaData.machineId, machineId),
          eq(opcuaData.nodeKey, nodeKey),
          lt(opcuaData.timestamp, before),
        ),
      )
      .orderBy(desc(opcuaData.timestamp), desc(opcuaData.id))
      .limit(limit);
    const run: { value: number; at: Date }[] = [];
    for (const row of rows) {
      if (!row.statusCode?.startsWith("Good") || !Number.isFinite(row.value))
        break;
      run.unshift({ value: row.value as number, at: row.at });
    }
    return run;
  },

  // ---- Alerts ----

  async createAlert(input: SpcAlertInput) {
    const [created] = await db
      .insert(spcAlerts)
      .values(input satisfies NewSpcAlert)
      .returning();
    return created;
  },

  async listAlerts(filters: AlertFilters) {
    const conditions = [];

    if (filters.profileId) {
      conditions.push(eq(spcAlerts.profileId, filters.profileId));
    }
    if (filters.machineId) {
      conditions.push(eq(spcAlerts.machineId, filters.machineId));
    }
    if (filters.acknowledged === true) {
      conditions.push(isNotNull(spcAlerts.acknowledgedAt));
    } else if (filters.acknowledged === false) {
      conditions.push(isNull(spcAlerts.acknowledgedAt));
    }

    const rows = await getReadDb()
      .select({
        id: spcAlerts.id,
        profileId: spcAlerts.profileId,
        profileName: spcProfiles.name,
        machineId: spcAlerts.machineId,
        nodeKey: spcAlerts.nodeKey,
        alertType: spcAlerts.alertType,
        value: spcAlerts.value,
        threshold: spcAlerts.threshold,
        message: spcAlerts.message,
        severity: spcAlerts.severity,
        acknowledgedAt: spcAlerts.acknowledgedAt,
        acknowledgedBy: spcAlerts.acknowledgedBy,
        createdAt: spcAlerts.createdAt,
      })
      .from(spcAlerts)
      .leftJoin(spcProfiles, eq(spcAlerts.profileId, spcProfiles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(spcAlerts.createdAt))
      .limit(filters.limit ?? 100);

    return rows;
  },

  async acknowledgeAlert(id: number, userId: number) {
    const result = await db
      .update(spcAlerts)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      })
      .where(eq(spcAlerts.id, id))
      .returning();
    return result[0] ?? null;
  },

  async findRecentUnacknowledgedAlert(
    profileId: number,
    withinMinutes: number,
  ) {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);

    const result = await getReadDb()
      .select()
      .from(spcAlerts)
      .where(
        and(
          eq(spcAlerts.profileId, profileId),
          isNull(spcAlerts.acknowledgedAt),
          sql`${spcAlerts.createdAt} > ${cutoff}`,
        ),
      )
      .orderBy(desc(spcAlerts.createdAt))
      .limit(1);

    return result[0] ?? null;
  },
};
