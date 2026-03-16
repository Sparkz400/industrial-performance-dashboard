import { eq, sql, and, lt, asc } from "drizzle-orm";

import db from "../database/db.js";
import { edgeSyncQueue, edgeConfig } from "../database/schema.js";
import config from "../config/config.js";
import logger from "../utils/logger.js";

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

let syncLoopTimer: ReturnType<typeof setInterval> | null = null;

export const edgeSyncService = {
  isEdgeMode(): boolean {
    return config.EDGE_MODE_ENABLED === true;
  },

  async isCloudReachable(): Promise<boolean> {
    const cloudUrl = config.EDGE_CLOUD_URL;
    if (!cloudUrl) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${cloudUrl}/api/v1/status`, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok || response.status === 401;
    } catch {
      return false;
    }
  },

  async queueForSync(
    tableName: string,
    operation: string,
    recordId: string,
    payload: unknown,
  ) {
    await db.insert(edgeSyncQueue).values({
      tableName,
      operation,
      recordId: String(recordId),
      payload,
      syncStatus: "pending",
    });
  },

  async getStatus() {
    const pendingResult = await db.execute(
      sql`SELECT count(*) as count FROM edge_sync_queue WHERE sync_status = 'pending'`,
    );
    const retryingResult = await db.execute(
      sql`SELECT count(*) as count FROM edge_sync_queue WHERE sync_status = 'failed' AND retry_count < ${MAX_RETRIES}`,
    );
    const lastSyncResult = await db.execute(
      sql`SELECT synced_at FROM edge_sync_queue WHERE sync_status = 'synced' ORDER BY synced_at DESC LIMIT 1`,
    );
    const lastErrorResult = await db.execute(
      sql`SELECT last_error FROM edge_sync_queue WHERE sync_status = 'failed' ORDER BY created_at DESC LIMIT 1`,
    );

    const cloudReachable = await this.isCloudReachable();

    return {
      isEdgeMode: this.isEdgeMode(),
      cloudReachable,
      syncQueueDepth: Number((pendingResult.rows[0] as any)?.count ?? 0),
      lastSuccessfulSync: (lastSyncResult.rows[0] as any)?.synced_at
        ? new Date((lastSyncResult.rows[0] as any).synced_at).toISOString()
        : null,
      lastSyncError: (lastErrorResult.rows[0] as any)?.last_error ?? null,
      retryingCount: Number((retryingResult.rows[0] as any)?.count ?? 0),
    };
  },

  async processSync(): Promise<number> {
    const cloudUrl = config.EDGE_CLOUD_URL;
    if (!cloudUrl) {
      logger.debug("[Edge] No cloud URL configured, skipping sync");
      return 0;
    }

    const reachable = await this.isCloudReachable();
    if (!reachable) {
      logger.debug("[Edge] Cloud not reachable, skipping sync");
      return 0;
    }

    const batchSize = config.EDGE_SYNC_BATCH_SIZE ?? 500;

    // Get pending items
    const items = await db
      .select()
      .from(edgeSyncQueue)
      .where(and(eq(edgeSyncQueue.syncStatus, "pending")))
      .orderBy(asc(edgeSyncQueue.createdAt))
      .limit(batchSize);

    // Also retry failed items with retry_count < MAX_RETRIES
    const retryItems = await db
      .select()
      .from(edgeSyncQueue)
      .where(
        and(
          eq(edgeSyncQueue.syncStatus, "failed"),
          lt(edgeSyncQueue.retryCount, MAX_RETRIES),
        ),
      )
      .orderBy(asc(edgeSyncQueue.createdAt))
      .limit(Math.max(0, batchSize - items.length));

    const allItems = [...items, ...retryItems];
    if (allItems.length === 0) return 0;

    // Get edge ID
    const edgeId = await this.getEdgeId();

    const payload = {
      edgeId,
      items: allItems.map((item) => ({
        tableName: item.tableName,
        operation: item.operation,
        recordId: item.recordId,
        payload: item.payload,
        originalTimestamp:
          item.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    };

    try {
      // Mark as syncing
      const ids = allItems.map((i) => i.id);
      await db
        .update(edgeSyncQueue)
        .set({ syncStatus: "syncing" })
        .where(sql`id = ANY(${ids})`);

      const response = await fetch(`${cloudUrl}/api/v1/edge/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await db
          .update(edgeSyncQueue)
          .set({ syncStatus: "synced", syncedAt: new Date() })
          .where(sql`id = ANY(${ids})`);
        logger.info(`[Edge] Synced ${allItems.length} items to cloud`);
        return allItems.length;
      } else {
        const errorText = await response.text();
        throw new Error(
          `Cloud responded with ${response.status}: ${errorText}`,
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[Edge] Sync failed: ${errorMsg}`);

      // Mark as failed with incremented retry count
      for (const item of allItems) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, item.retryCount ?? 0);
        await db
          .update(edgeSyncQueue)
          .set({
            syncStatus: "failed",
            retryCount: (item.retryCount ?? 0) + 1,
            lastError: errorMsg,
          })
          .where(eq(edgeSyncQueue.id, item.id));
      }
      return 0;
    }
  },

  async getEdgeId(): Promise<string> {
    const result = await db
      .select()
      .from(edgeConfig)
      .where(eq(edgeConfig.key, "edge_id"))
      .limit(1);

    if (result[0]) {
      return result[0].value as string;
    }

    // Generate and store a new edge ID
    const newId = crypto.randomUUID();
    await db.insert(edgeConfig).values({
      key: "edge_id",
      value: JSON.stringify(newId),
    });
    return newId;
  },

  async getConfig() {
    const rows = await db.select().from(edgeConfig);
    const configMap: Record<string, unknown> = {};
    for (const row of rows) {
      configMap[row.key] = row.value;
    }
    return {
      cloudUrl: config.EDGE_CLOUD_URL ?? null,
      syncIntervalMs: config.EDGE_SYNC_INTERVAL_MS ?? 30000,
      syncBatchSize: config.EDGE_SYNC_BATCH_SIZE ?? 500,
      dataRetentionDays: config.EDGE_DATA_RETENTION_DAYS ?? 7,
      lightweightMode: config.EDGE_LIGHTWEIGHT_MODE === true,
    };
  },

  async updateConfig(updates: Record<string, unknown>) {
    for (const [key, value] of Object.entries(updates)) {
      const existing = await db
        .select()
        .from(edgeConfig)
        .where(eq(edgeConfig.key, key))
        .limit(1);

      if (existing[0]) {
        await db
          .update(edgeConfig)
          .set({ value: JSON.stringify(value), updatedAt: new Date() })
          .where(eq(edgeConfig.key, key));
      } else {
        await db.insert(edgeConfig).values({
          key,
          value: JSON.stringify(value),
        });
      }
    }
    return this.getConfig();
  },

  startSyncLoop() {
    if (!this.isEdgeMode()) {
      logger.info("[Edge] Edge mode not enabled, sync loop not started");
      return;
    }

    const intervalMs = config.EDGE_SYNC_INTERVAL_MS ?? 30000;
    logger.info(`[Edge] Starting sync loop (interval: ${intervalMs}ms)`);

    syncLoopTimer = setInterval(async () => {
      try {
        await this.processSync();
      } catch (error) {
        logger.error("[Edge] Sync loop error:", error);
      }
    }, intervalMs);
  },

  stopSyncLoop() {
    if (syncLoopTimer) {
      clearInterval(syncLoopTimer);
      syncLoopTimer = null;
      logger.info("[Edge] Sync loop stopped");
    }
  },

  /** Cloud-side: ingest data from edge instances. */
  async ingestFromEdge(
    edgeId: string,
    items: Array<{
      tableName: string;
      operation: string;
      recordId: string;
      payload: unknown;
      originalTimestamp: string;
    }>,
  ) {
    // For now, store ingested items in the edge_sync_queue with 'synced' status
    // so they can be processed by the cloud application
    for (const item of items) {
      await db.insert(edgeSyncQueue).values({
        tableName: item.tableName,
        operation: item.operation,
        recordId: item.recordId,
        payload: item.payload,
        syncStatus: "synced",
        syncedAt: new Date(),
      });
    }
    return items.length;
  },
};
