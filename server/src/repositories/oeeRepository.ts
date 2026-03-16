import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm";
import db from "../database/db.js";
import { getReadDb } from "../database/db.js";
import { oeeConfig, oeeManualEntries, opcuaData } from "../database/schema.js";

export interface OeeConfigInput {
  runningModeValues: number[];
  idleModeValues: number[];
  plannedStopModeValues: number[];
  unplannedStopModeValues: number[];
  idealCycleTimeMs: number | null;
  productionCountNodeKey: string | null;
  goodCountNodeKey: string | null;
  rejectCountNodeKey: string | null;
  manualEntryEnabled: boolean;
  plannedProductionHoursPerDay: number;
}

export interface ManualEntryInput {
  date: string;
  productionCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
  plannedDowntimeMinutes: number | null;
  notes: string | null;
  createdBy?: number;
}

export const oeeRepository = {
  async getConfig(machineId: number) {
    const result = await getReadDb()
      .select()
      .from(oeeConfig)
      .where(eq(oeeConfig.machineId, machineId));

    return result[0] ?? null;
  },

  async saveConfig(machineId: number, input: OeeConfigInput) {
    const [saved] = await db
      .insert(oeeConfig)
      .values({
        machineId,
        runningModeValues: input.runningModeValues,
        idleModeValues: input.idleModeValues,
        plannedStopModeValues: input.plannedStopModeValues,
        unplannedStopModeValues: input.unplannedStopModeValues,
        idealCycleTimeMs: input.idealCycleTimeMs,
        productionCountNodeKey: input.productionCountNodeKey,
        goodCountNodeKey: input.goodCountNodeKey,
        rejectCountNodeKey: input.rejectCountNodeKey,
        manualEntryEnabled: input.manualEntryEnabled,
        plannedProductionHoursPerDay: input.plannedProductionHoursPerDay,
      })
      .onConflictDoUpdate({
        target: [oeeConfig.machineId],
        set: {
          runningModeValues: input.runningModeValues,
          idleModeValues: input.idleModeValues,
          plannedStopModeValues: input.plannedStopModeValues,
          unplannedStopModeValues: input.unplannedStopModeValues,
          idealCycleTimeMs: input.idealCycleTimeMs,
          productionCountNodeKey: input.productionCountNodeKey,
          goodCountNodeKey: input.goodCountNodeKey,
          rejectCountNodeKey: input.rejectCountNodeKey,
          manualEntryEnabled: input.manualEntryEnabled,
          plannedProductionHoursPerDay: input.plannedProductionHoursPerDay,
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
  },

  async getManualEntries(
    machineId: number,
    startDate?: string,
    endDate?: string,
  ) {
    const conditions = [eq(oeeManualEntries.machineId, machineId)];

    if (startDate) {
      conditions.push(gte(oeeManualEntries.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(oeeManualEntries.date, endDate));
    }

    return getReadDb()
      .select()
      .from(oeeManualEntries)
      .where(and(...conditions))
      .orderBy(desc(oeeManualEntries.date));
  },

  async saveManualEntry(machineId: number, input: ManualEntryInput) {
    const [saved] = await db
      .insert(oeeManualEntries)
      .values({
        machineId,
        date: input.date,
        productionCount: input.productionCount,
        goodCount: input.goodCount,
        rejectCount: input.rejectCount,
        plannedDowntimeMinutes: input.plannedDowntimeMinutes,
        notes: input.notes,
        createdBy: input.createdBy,
      })
      .onConflictDoUpdate({
        target: [oeeManualEntries.machineId, oeeManualEntries.date],
        set: {
          productionCount: input.productionCount,
          goodCount: input.goodCount,
          rejectCount: input.rejectCount,
          plannedDowntimeMinutes: input.plannedDowntimeMinutes,
          notes: input.notes,
        },
      })
      .returning();

    return saved;
  },

  async getOperationModeData(
    machineId: number,
    startDate: Date,
    endDate: Date,
  ) {
    return getReadDb()
      .select({
        timestamp: opcuaData.timestamp,
        value: opcuaData.value,
      })
      .from(opcuaData)
      .where(
        and(
          eq(opcuaData.nodeKey, "OperationMode"),
          eq(opcuaData.machineId, machineId),
          gte(opcuaData.timestamp, startDate),
          lte(opcuaData.timestamp, endDate),
        ),
      )
      .orderBy(asc(opcuaData.timestamp));
  },

  async getNodeData(
    nodeKey: string,
    machineId: number,
    startDate: Date,
    endDate: Date,
  ) {
    return getReadDb()
      .select({
        timestamp: opcuaData.timestamp,
        value: opcuaData.value,
      })
      .from(opcuaData)
      .where(
        and(
          eq(opcuaData.nodeKey, nodeKey),
          eq(opcuaData.machineId, machineId),
          gte(opcuaData.timestamp, startDate),
          lte(opcuaData.timestamp, endDate),
        ),
      )
      .orderBy(asc(opcuaData.timestamp));
  },
};
