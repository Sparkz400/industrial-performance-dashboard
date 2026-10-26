import { sql } from "drizzle-orm";
import db from "../database/db.js";
import { AppError } from "../utils/errors.js";

function unavailable(): never {
  throw new AppError(
    "Edge synchronization is disabled until authenticated central historian ingestion is implemented (H08). Existing queue records are retained.",
    501,
    "EDGE_NOT_IMPLEMENTED",
  );
}

export const edgeSyncService = {
  // The former receiver acknowledged queue rows without storing canonical measurements.
  isEdgeMode(): boolean {
    return false;
  },
  async queueForSync(
    _tableName: string,
    _operation: string,
    _recordId: string,
    _payload: unknown,
  ): Promise<void> {
    unavailable();
  },
  async processSync(): Promise<number> {
    unavailable();
  },
  async ingestFromEdge(_edgeId: string, _items: unknown[]): Promise<number> {
    unavailable();
  },
  async updateConfig(_updates: Record<string, unknown>): Promise<never> {
    unavailable();
  },
  async getConfig() {
    return {
      enabled: false,
      cloudUrl: "",
      syncIntervalSeconds: 30,
      batchSize: 500,
      retentionDays: 7,
      centralHistory: "unavailable",
    };
  },
  async getStatus() {
    const result = await db.execute(
      sql`SELECT sync_status, count(*)::int AS count FROM edge_sync_queue GROUP BY sync_status`,
    );
    const rows = result.rows as { sync_status: string; count: number }[];
    const pending = rows
      .filter((row) => row.sync_status !== "synced")
      .reduce((sum, row) => sum + row.count, 0);
    const transferred =
      rows.find((row) => row.sync_status === "synced")?.count ?? 0;
    return {
      enabled: false,
      isEdgeMode: false,
      cloudConnected: false,
      cloudReachable: false,
      lastSyncAt: null,
      lastSuccessfulSync: null,
      lastSyncError: null,
      syncQueueDepth: pending,
      pendingRecords: pending,
      legacyTransferredRecords: transferred,
      centralHistory: "unavailable",
      retryingCount: 0,
    };
  },
  startSyncLoop() {},
  stopSyncLoop() {},
};
