import db from "../database/db.js";
import { opcuaData } from "../database/schema.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";
import {
  MeasurementSpool,
  toMeasurementRow,
  type OpcuaDataItem,
} from "./measurementSpool.js";

export type { OpcuaDataItem } from "./measurementSpool.js";

export class OpcuaQueueWorker {
  private spool?: MeasurementSpool;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;

  private getSpool() {
    return (this.spool ??= new MeasurementSpool(config.OPCUA_SPOOL_PATH));
  }

  enqueue(data: OpcuaDataItem): void {
    if (this.stopped) throw new Error("Measurement collector is stopped");
    // Fail visibly if local storage is unavailable; never acknowledge a lost sample.
    this.getSpool().enqueue(data);
  }

  async processBatch(): Promise<void> {
    const batch = this.getSpool().peek(config.OPCUA_BATCH_SIZE);
    if (!batch.length) return;
    await db
      .insert(opcuaData)
      .values(batch.map(toMeasurementRow))
      .onConflictDoNothing();
    // Retrying after an ambiguous PostgreSQL commit is safe because event IDs are stable.
    this.getSpool().acknowledge(batch);
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
