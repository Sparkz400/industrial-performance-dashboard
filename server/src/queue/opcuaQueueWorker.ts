import { collectorDiagnostics } from "../services/collectorDiagnostics.js";
import db from "../database/db.js";
import { collectorEpochs, opcuaData } from "../database/schema.js";
import { asc, gte } from "drizzle-orm";
import { currentLease } from "../services/collectorLock.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import alarmEvaluator from "../services/alarmService.js";
import {
  MeasurementSpool,
  toMeasurementRow,
  type OpcuaDataItem,
  type SpoolEntry,
} from "./measurementSpool.js";

export type { OpcuaDataItem } from "./measurementSpool.js";

/** PostgreSQL data (22) or integrity (23) errors: retrying the same record cannot succeed. */
function refusedRecord(error: unknown): boolean {
  const code = ((error as { cause?: { code?: unknown } }).cause?.code ??
    (error as { code?: unknown }).code) as unknown;
  return typeof code === "string" && /^2[23]/.test(code);
}

export class OpcuaQueueWorker {
  private spool?: MeasurementSpool;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;
  private storageFailure: { at: string; message: string } | null = null;
  private writeFailure: { at: string; message: string } | null = null;
  private commits: { at: number; count: number }[] = [];

  private getSpool() {
    return (this.spool ??= new MeasurementSpool(config.OPCUA_SPOOL_PATH, {
      maxEntries: config.OPCUA_SPOOL_MAX_ENTRIES,
      minFreeBytes: config.OPCUA_SPOOL_RESERVE_MB * 1024 * 1024,
    }));
  }

  enqueue(data: OpcuaDataItem): void {
    if (this.stopped) {
      collectorDiagnostics.rejected(data.machineId);
      throw new Error("Measurement collector is stopped");
    }
    // Fail visibly if local storage is unavailable; never acknowledge a lost sample.
    try {
      this.getSpool().enqueue({
        ...data,
        leaseEpoch: data.leaseEpoch ?? currentLease()?.epoch,
      });
      collectorDiagnostics.accepted(data.machineId);
    } catch (error) {
      collectorDiagnostics.rejected(data.machineId);
      this.storageFailure = {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Storage unavailable",
      };
      throw error;
    }
  }

  getMachineHealth(machineId: number) {
    return this.getSpool().machineHealth(machineId);
  }

  getHealth() {
    const since = Date.now() - 60000;
    this.commits = this.commits.filter((commit) => commit.at >= since);
    return {
      ...this.getSpool().health(),
      committedLastMinute: this.commits.reduce((sum, c) => sum + c.count, 0),
      writeFailure: this.writeFailure,
      storageFailure: this.storageFailure,
      continuity: "unreceived intervals remain unknown",
    };
  }

  getQuarantine(limit: number) {
    return this.getSpool().quarantined(limit);
  }

  requeueQuarantine(): number {
    return this.getSpool().requeueQuarantined();
  }

  private async write(entries: SpoolEntry[]) {
    try {
      await db
        .insert(opcuaData)
        .values(entries.map(toMeasurementRow))
        .onConflictDoNothing();
    } catch (error) {
      if (!refusedRecord(error))
        this.writeFailure = {
          at: new Date().toISOString(),
          message: error instanceof Error ? error.message : "Write failed",
        };
      throw error;
    }
  }

  /**
   * D08 fencing: a sample received after a different collector's newer lease began is a
   * duplicate collection by a collector that lost its lock; it is quarantined, not stored.
   * A collector's own backlog after its own restart or retake is kept.
   */
  private async fence(batch: SpoolEntry[]) {
    const stamped = batch.filter((entry) => entry.data.leaseEpoch != null);
    if (!stamped.length) return batch;
    const oldest = Math.min(...stamped.map((entry) => entry.data.leaseEpoch!));
    const epochs = await db
      .select()
      .from(collectorEpochs)
      .where(gte(collectorEpochs.epoch, oldest))
      .orderBy(asc(collectorEpochs.epoch));
    const accepted: SpoolEntry[] = [];
    for (const entry of batch) {
      const own = epochs.find((e) => e.epoch === entry.data.leaseEpoch);
      const received = entry.data.receivedAt
        ? new Date(entry.data.receivedAt).getTime()
        : NaN;
      const newer =
        own && Number.isFinite(received)
          ? epochs.find(
              (e) =>
                e.epoch > own.epoch &&
                e.holder !== own.holder &&
                e.acquiredAt.getTime() <= received,
            )
          : undefined;
      if (!newer) {
        accepted.push(entry);
        continue;
      }
      this.getSpool().quarantine(
        entry,
        `Fenced: received after collector lease ${newer.epoch} (${newer.holder}) began; taken under lease ${own!.epoch} (${own!.holder})`,
      );
      logger.error(
        "Measurement from a superseded collector lease quarantined",
        {
          id: entry.id,
          lease: own!.epoch,
          newer: newer.epoch,
        },
      );
    }
    return accepted;
  }

  async processBatch(): Promise<void> {
    let batch = await this.fence(this.getSpool().peek(config.OPCUA_BATCH_SIZE));
    if (!batch.length) return;
    try {
      await this.write(batch);
    } catch (error) {
      if (!refusedRecord(error)) throw error;
      // One record PostgreSQL refuses must not block every later measurement.
      const accepted: SpoolEntry[] = [];
      for (const entry of batch) {
        try {
          await this.write([entry]);
          accepted.push(entry);
        } catch (rowError) {
          if (!refusedRecord(rowError)) throw rowError;
          const cause = (rowError as { cause?: Error }).cause ?? rowError;
          this.getSpool().quarantine(
            entry,
            cause instanceof Error ? cause.message.slice(0, 500) : "Refused",
          );
          logger.error("Measurement refused by PostgreSQL; quarantined", {
            id: entry.id,
          });
        }
      }
      batch = accepted;
    }
    for (const machineId of new Set(batch.map((entry) => entry.data.machineId)))
      collectorDiagnostics.committed(machineId);
    for (const entry of batch) await alarmEvaluator.evaluate(entry);
    // Retrying after an ambiguous PostgreSQL commit is safe because event IDs are stable.
    this.getSpool().acknowledge(batch);
    this.writeFailure = null;
    this.commits.push({ at: Date.now(), count: batch.length });
  }

  start(): void {
    if (this.pending || this.timer) return;
    this.stopped = false;
    const tick = () => {
      this.pending = this.processBatch()
        .catch((error) => {
          logger.error(
            "Measurement write failed; samples retained on disk for retry",
            error,
          );
        })
        .finally(() => {
          this.pending = undefined;
          if (!this.stopped)
            this.timer = setTimeout(tick, config.OPCUA_QUEUE_DELAY);
        });
    };
    tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.pending;
    this.spool?.close();
    this.spool = undefined;
  }
}

export default new OpcuaQueueWorker();
