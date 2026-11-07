import { AsyncMeasurementSpool } from "./asyncMeasurementSpool.js";
import { collectorDiagnostics } from "../services/collectorDiagnostics.js";
import db from "../database/db.js";
import { collectorEpochs, opcuaData } from "../database/schema.js";
import { asc, gte } from "drizzle-orm";
import { currentLease } from "../services/collectorLock.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import alarmEvaluator from "../services/alarmService.js";
import {
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
  private spool?: AsyncMeasurementSpool;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;
  private storageFailure: { at: string; message: string } | null = null;
  private writeFailure: { at: string; message: string } | null = null;
  private commits: { at: number; count: number }[] = [];
  private pendingSamples: { at: number; pending: number }[] = [];

  private getSpool() {
    return (this.spool ??= new AsyncMeasurementSpool(config.OPCUA_SPOOL_PATH, {
      maxEntries: config.OPCUA_SPOOL_MAX_ENTRIES,
      minFreeBytes: config.OPCUA_SPOOL_RESERVE_MB * 1024 * 1024,
    }));
  }

  async enqueue(data: OpcuaDataItem): Promise<void> {
    if (this.stopped) {
      collectorDiagnostics.rejected(data.machineId);
      throw new Error("Measurement collector is stopped");
    }
    // Fail visibly if local storage is unavailable; never acknowledge a lost sample.
    try {
      await this.getSpool().enqueue({
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

  async getHealth() {
    const now = Date.now();
    const since = now - 60000;
    this.commits = this.commits.filter((commit) => commit.at >= since);
    const spool = await this.getSpool().health();
    this.pendingSamples = [
      ...this.pendingSamples.filter((sample) => sample.at >= now - 120000),
      { at: now, pending: spool.pendingMeasurements },
    ];
    return {
      ...spool,
      ...backlogTrend(this.pendingSamples),
      committedLastMinute: this.commits.reduce((sum, c) => sum + c.count, 0),
      writeFailure: this.writeFailure,
      storageFailure: this.storageFailure,
      continuity: "unreceived intervals remain unknown",
    };
  }

  getQuarantine(limit: number) {
    return this.getSpool().quarantined(limit);
  }

  requeueQuarantine(): Promise<number> {
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
      await this.getSpool().quarantine(
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
    let batch = await this.fence(
      await this.getSpool().peek(config.OPCUA_BATCH_SIZE),
    );
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
          await this.getSpool().quarantine(
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
    await this.getSpool().acknowledge(batch);
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
    await this.spool?.close();
    this.spool = undefined;
  }
}

export default new OpcuaQueueWorker();

/**
 * Net backlog change from a sample at least 55 s old (health is polled every few
 * seconds). Ingress continues while the backlog drains, so writes per minute alone
 * would overstate recovery. Without enough history both values stay unknown (null).
 */
export function backlogTrend(samples: { at: number; pending: number }[]): {
  backlogChangePerMinute: number | null;
  backlogClearSeconds: number | null;
} {
  const latest = samples.at(-1);
  const earliest = samples[0];
  if (!latest || !earliest || latest.at - earliest.at < 55000)
    return { backlogChangePerMinute: null, backlogClearSeconds: null };
  const change =
    ((latest.pending - earliest.pending) * 60000) / (latest.at - earliest.at);
  return {
    backlogChangePerMinute: Math.round(change),
    backlogClearSeconds:
      latest.pending === 0
        ? 0
        : change < 0
          ? Math.round((latest.pending / -change) * 60)
          : null,
  };
}
