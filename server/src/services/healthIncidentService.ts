import { asc, gt } from "drizzle-orm";
import db from "../database/db.js";
import { machineProfiles } from "../database/schema.js";
import worker from "../queue/opcuaQueueWorker.js";
import alarmEvaluator from "./alarmService.js";
import { liveProduction } from "./liveProductionService.js";
import logger from "../utils/logger.js";
import { escalateMaintenanceActions } from "./maintenanceActions.js";
import { storageRunway } from "./storageRunway.js";
import { runRetentionSchedules } from "./historyRetention.js";

class HealthIncidentService {
  private timer?: ReturnType<typeof setInterval>;
  private startup?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private cursor = 0;
  start(): void {
    if (this.startup || this.timer) return;
    // Allow connection establishment before reporting unattended acquisition failures.
    this.startup = setTimeout(() => {
      this.startup = undefined;
      void this.check();
      this.timer = setInterval(() => {
        void this.check();
      }, 10000);
      this.timer.unref();
    }, 120000);
    this.startup.unref();
  }
  async stop(): Promise<void> {
    clearTimeout(this.startup);
    clearInterval(this.timer);
    this.startup = undefined;
    this.timer = undefined;
    await this.pending;
  }
  async check(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.inspect()
      .catch((error) => {
        logger.error("[HealthIncidents] Inspection failed", error);
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  private async inspect(): Promise<void> {
    await escalateMaintenanceActions();
    await runRetentionSchedules();
    for (const disk of await storageRunway())
      await alarmEvaluator.observeHealth(
        `disk-runway-${disk.kind}`,
        null,
        disk.daysToReserve == null ? null : disk.daysToReserve < 2,
        "Storage runway",
        `${disk.kind}: ${disk.daysToReserve == null ? "unknown" : disk.daysToReserve.toFixed(1) + " days to reserve"} based on observed free-space decline`,
      );
    let health: ReturnType<typeof worker.getHealth>;
    try {
      health = worker.getHealth();
    } catch {
      await alarmEvaluator.observeHealth(
        "collector-storage",
        null,
        true,
        "Collector storage unavailable",
        "Collector storage cannot be inspected. Check the collector and persistent volume; unreceived intervals remain unknown.",
      );
      return;
    }
    await alarmEvaluator.observeHealth(
      "collector-storage",
      null,
      Boolean(health.storageFailure),
      "Collector storage failure",
      "Collector acquisition stopped after a storage failure. Restore storage and restart; unreceived intervals remain unknown.",
    );
    await alarmEvaluator.observeHealth(
      "collector-backlog",
      null,
      health.pendingMeasurements > 0 &&
        ((health.oldestReceivedAgeSeconds ?? 0) >= 60 ||
          health.unknownReceiveTimes > 0),
      "Collector backlog",
      `Pending measurements: ${health.pendingMeasurements}; oldest receive age: ${health.oldestReceivedAgeSeconds == null ? "unknown" : Math.round(health.oldestReceivedAgeSeconds) + " seconds"}.`,
    );
    await alarmEvaluator.observeHealth(
      "collector-space",
      null,
      health.freeStorageBytes == null
        ? null
        : health.freeStorageBytes < health.storageReserveBytes * 2,
      "Collector low disk space",
      "Free collector storage is below twice its configured safety reserve.",
    );
    let batch = await db
      .selectDistinct({ id: machineProfiles.machineId })
      .from(machineProfiles)
      .where(gt(machineProfiles.machineId, this.cursor))
      .orderBy(asc(machineProfiles.machineId))
      .limit(6);
    if (!batch.length) {
      this.cursor = 0;
      batch = await db
        .selectDistinct({ id: machineProfiles.machineId })
        .from(machineProfiles)
        .orderBy(asc(machineProfiles.machineId))
        .limit(6);
    }
    if (!batch.length) return;
    this.cursor = batch.at(-1)!.id;
    const current = await liveProduction(
      batch.map((asset) => asset.id),
      false,
    );
    for (const asset of current.machines)
      await alarmEvaluator.observeHealth(
        `machine-${asset.id}`,
        asset.id,
        asset.freshness !== "fresh",
        "Machine data unavailable",
        `${asset.name}: ${asset.freshness}; last measurement ${asset.lastMeasurement ?? "unknown"}. Current production state is unknown.`,
      );
  }
}
export const healthIncidentService = new HealthIncidentService();
