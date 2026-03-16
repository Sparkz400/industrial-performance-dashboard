import { sql } from "drizzle-orm";
import db from "../database/db.js";
import { opcuaDataDlq } from "../database/schema.js";
import logger from "../utils/logger.js";
import { AsyncQueue } from "../utils/queue.js";
import config from "../config/config.js";

export interface OpcuaDataItem {
  key: string;
  label: string;
  timestamp: any;
  value: any;
  machineId?: number;
}

const BATCH_SIZE: number = config.OPCUA_BATCH_SIZE;
const QUEUE_PROCESS_DELAY: number = config.OPCUA_QUEUE_DELAY;
const MAX_QUEUE_LOG_THRESHOLD: number = config.OPCUA_QUEUE_WARN_THRESHOLD;

export class OpcuaQueueWorker {
  private queue = new AsyncQueue<OpcuaDataItem>();
  private isShuttingDown = false;
  private processingPromise: Promise<void> | null = null;

  constructor() {
    // Periodic queue size logging
    setInterval(() => {
      const currentSize = this.queue.size();
      if (currentSize > 0) {
        logger.info(`OPC UA Data Queue Size: ${currentSize}`);
        if (currentSize > MAX_QUEUE_LOG_THRESHOLD) {
          logger.warn(
            `[ALERT] OPC UA Data Queue size (${currentSize}) exceeds threshold (${MAX_QUEUE_LOG_THRESHOLD}). Processing might be falling behind.`,
          );
        }
      }
    }, 60000);
  }

  enqueue(data: OpcuaDataItem): void {
    if (this.isShuttingDown) {
      logger.warn(
        "Shutdown in progress. Dropping incoming OPC UA data:",
        data.key,
      );
      return;
    }
    try {
      this.queue.enqueue(data);
    } catch (error: any) {
      if (error.message === "Queue overflow") {
        logger.error(
          "OPC UA Data Queue Overflow! Data loss is occurring. Check database insert performance or increase queue size/batch size.",
          { maxQueueSize: this.queue.MAX_QUEUE_SIZE },
        );
      } else {
        logger.error("Error enqueuing OPC UA data:", error);
      }
    }
  }

  start(): void {
    this.processingPromise = this.processLoop().catch((err) => {
      logger.error(
        "Fatal error: Queue processing loop exited unexpectedly.",
        err,
      );
      process.exit(1);
    });
  }

  private async persistToDLQ(
    batch: OpcuaDataItem[],
    error: Error,
  ): Promise<void> {
    logger.warn(
      `[DLQ] Persisting batch of size ${batch.length} to Dead-Letter Queue due to error: ${error.message}`,
      {
        error: error.toString(),
        sampleBatch: batch
          .slice(0, 5)
          .map((d) => ({ key: d.key, ts: d.timestamp, val: d.value })),
      },
    );
    try {
      await db.insert(opcuaDataDlq).values({
        errorMessage: error.message || "Unknown error",
        batchData: batch,
      });
      logger.info(
        `[DLQ] Successfully persisted batch of size ${batch.length} to DLQ.`,
      );
    } catch (dlqError: any) {
      logger.error(
        `[DLQ] CRITICAL ERROR: Failed to persist batch to Dead-Letter Queue! Data loss occurred. DLQ Error: ${dlqError.message}`,
        {
          originalError: error.message,
          dlqError: dlqError.toString(),
          batchSize: batch.length,
        },
      );
    }
  }

  private async processBatch(): Promise<boolean> {
    const batch = this.queue.drain(BATCH_SIZE);
    if (batch.length === 0) return false;

    try {
      // Use raw SQL with UNNEST for efficient bulk insert (Drizzle's sql template)
      await db.execute(sql`
                INSERT INTO opcua_data(node_key, node_label, timestamp, value, machine_id)
                SELECT * FROM UNNEST(
                    ${batch.map((d) => d.key)}::text[],
                    ${batch.map((d) => d.label)}::text[],
                    ${batch.map((d) => new Date(d.timestamp))}::timestamptz[],
                    ${batch.map((d) => (typeof d.value === "number" ? d.value : null))}::float[],
                    ${batch.map((d) => d.machineId || null)}::int[]
                )
                ON CONFLICT DO NOTHING
            `);
      logger.debug(
        `Successfully inserted batch of ${batch.length} OPC UA data points.`,
      );
      return true;
    } catch (error: any) {
      logger.error(
        `Failed to insert OPC UA data batch after retries. Dropping batch. Error: ${error.message}`,
        {
          batchSize: batch.length,
          sampleBatch: batch
            .slice(0, 5)
            .map((d) => ({ key: d.key, ts: d.timestamp, val: d.value })),
          dbErrorCode: error.code,
        },
      );
      await this.persistToDLQ(batch, error);
      return false;
    }
  }

  private async processLoop(): Promise<void> {
    let isRunning = true;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    const stopProcessing = (): void => {
      logger.info(
        "[Queue] Received stop signal. Finishing current batch if any, then exiting loop.",
      );
      isRunning = false;
    };

    process.on("SIGTERM", stopProcessing);
    process.on("SIGINT", stopProcessing);

    logger.info(
      `Starting OPC UA data queue processor with batch size ${BATCH_SIZE} and delay ${QUEUE_PROCESS_DELAY}ms.`,
    );

    while (isRunning) {
      try {
        if (!isRunning) break;

        const processed = await this.processBatch();

        if (!isRunning) break;

        if (processed) {
          consecutiveErrors = 0;
          if (!this.queue.isEmpty() && isRunning) {
            await new Promise<void>((resolve) => setImmediate(resolve));
            continue;
          }
        }
        if (isRunning) {
          if (!isRunning) break;
          await new Promise<void>((resolve) =>
            setTimeout(resolve, QUEUE_PROCESS_DELAY),
          );
        }
      } catch (error) {
        logger.error("Unexpected error in queue processing loop:", error);
        if (!isRunning) break;

        consecutiveErrors++;
        if (consecutiveErrors > maxConsecutiveErrors) {
          logger.error(
            `[ALERT] Queue processor encountered ${consecutiveErrors} consecutive errors. Pausing for 60 seconds.`,
          );
          if (!isRunning) break;
          await new Promise<void>((resolve) => setTimeout(resolve, 60000));
          consecutiveErrors = 0;
        } else {
          if (!isRunning) break;
          await new Promise<void>((resolve) =>
            setTimeout(resolve, QUEUE_PROCESS_DELAY * consecutiveErrors),
          );
        }
      }
    }
    logger.info("Queue processing loop is exiting due to shutdown signal.");
  }
}

const opcuaQueueWorker = new OpcuaQueueWorker();
export default opcuaQueueWorker;
