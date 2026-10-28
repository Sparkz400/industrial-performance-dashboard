import { performance } from "node:perf_hooks";

import pg from "pg";

import config from "../config/config.js";
import logger from "../utils/logger.js";
import statusManager from "../utils/status.js";
import StatusConstants from "../utils/statusConstants.js";
import DatabaseQueryMonitor from "./queryMonitor.js";

const { Pool } = pg;

type PoolInstance = InstanceType<typeof Pool>;
type PoolRole = "primary" | "replica";
type QueryTarget = "read" | "write";
type QueryOptions = {
  maxRetries?: number;
  target?: QueryTarget;
};

interface MonitoredPool {
  name: string;
  role: PoolRole;
  pool: PoolInstance;
  rawQuery: PoolInstance["query"];
  isHealthy: boolean;
  isConnecting: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connectionAttempts: number;
  maxConnectionAttempts: number;
  retryDelay: number;
}

const isRetryableError = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return code != null && [
    "ECONNRESET",
    "ETIMEDOUT",
    "57P01",
    "57P03",
    "08003",
    "08006",
    "40001",
  ].includes(code);
};

const formatQueryPreview = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 140) + (normalized.length > 140 ? "..." : "");
};

const parseReplicaUrls = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Class for managing database connections with integrated health monitoring.
 * Primary traffic always goes to the writer pool. Replica pools are used for
 * read-only queries when available and fall back to the writer automatically.
 */
class DatabaseManager {
  pool: PoolInstance;
  private readonly primaryPoolState: MonitoredPool;
  private readonly replicaPoolStates: MonitoredPool[];
  private healthCheckInterval: ReturnType<typeof setInterval> | null;
  private readonly queryMonitor: DatabaseQueryMonitor;
  private readReplicaCursor: number;
  private lastReadTarget: string;
  private readonly wrappedClients = new WeakSet<object>();

  constructor() {
    this.healthCheckInterval = null;
    this.readReplicaCursor = 0;
    this.lastReadTarget = "primary";
    this.queryMonitor = new DatabaseQueryMonitor(
      config.DB_QUERY_SLOW_THRESHOLD_MS,
      config.DB_QUERY_METRICS_MAX_SAMPLES,
    );

    this.primaryPoolState = this.createMonitoredPool("primary", "primary", {
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      max: config.DB_MAX_POOL,
      connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT,
      idleTimeoutMillis: config.DB_IDLE_TIMEOUT,
    });

    this.replicaPoolStates = parseReplicaUrls(config.DB_READ_REPLICA_URLS).map(
      (connectionString, index) =>
        this.createMonitoredPool(`replica-${index + 1}`, "replica", {
          connectionString,
          max: config.DB_REPLICA_MAX_POOL,
          connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT,
          idleTimeoutMillis: config.DB_IDLE_TIMEOUT,
        }),
    );

    this.pool = this.primaryPoolState.pool;

    void this.connectPool(this.primaryPoolState);
    for (const replicaPoolState of this.replicaPoolStates) {
      void this.connectPool(replicaPoolState);
    }
  }

  private createMonitoredPool(
    name: string,
    role: PoolRole,
    poolConfig: pg.PoolConfig,
  ): MonitoredPool {
    const pool = new Pool(poolConfig);
    const rawQuery = pool.query.bind(pool);
    const poolState: MonitoredPool = {
      name,
      role,
      pool,
      rawQuery,
      isHealthy: false,
      isConnecting: false,
      reconnectTimer: null,
      connectionAttempts: 0,
      maxConnectionAttempts: 5,
      retryDelay: 5000,
    };

    pool.on("error", (error: Error) => {
      logger.error("Unexpected PostgreSQL pool error", {
        pool: poolState.name,
        role: poolState.role,
        error: error.message,
      });

      poolState.isHealthy = false;
      this.scheduleReconnect(poolState);
      this.refreshDatabaseStatus("Unexpected database pool error");
    });

    pool.on("connect", (client) => {
      // The pool's error listener is removed while a client is checked out.
      client.on("error", (error: Error) => {
        logger.error("PostgreSQL client disconnected", {
          pool: poolState.name,
          role: poolState.role,
          error: error.message,
        });
        poolState.isHealthy = false;
        this.scheduleReconnect(poolState);
        this.refreshDatabaseStatus("Database client disconnected");
      });
      this.wrapClientQuery(client as pg.PoolClient, poolState.name);
    });

    return poolState;
  }

  private wrapClientQuery(client: pg.PoolClient, target: string): void {
    if (this.wrappedClients.has(client)) return;

    this.wrappedClients.add(client);
    const originalQuery = client.query.bind(client) as (...args: unknown[]) => unknown;

    // Override the query method to add monitoring
    (client as unknown as { query: typeof originalQuery }).query = async (...args: unknown[]) => {
      if (
        typeof args[1] === "function" ||
        typeof args[2] === "function" ||
        typeof args[0] === "function"
      ) {
        return originalQuery(...args);
      }

      const queryText = this.extractQueryText(args[0] as string | { text?: string } | undefined);
      const startedAt = performance.now();

      try {
        const result = await (originalQuery(...args) as Promise<pg.QueryResult>);
        this.recordQueryExecution({
          target,
          text: queryText,
          durationMs: performance.now() - startedAt,
          rowCount: result.rowCount,
        });
        return result;
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        this.recordQueryExecution({
          target,
          text: queryText,
          durationMs: performance.now() - startedAt,
          errorCode: err?.code,
          errorMessage: err?.message,
        });
        throw error;
      }
    };
  }

  private extractQueryText(
    query: string | { text?: string } | undefined,
  ): string {
    if (typeof query === "string") return query;
    if (query && typeof query.text === "string") return query.text;
    return "unknown";
  }

  private recordQueryExecution(record: {
    target: string;
    text: string;
    durationMs: number;
    rowCount?: number | null;
    errorCode?: string;
    errorMessage?: string;
  }): void {
    const durationMs = Number(record.durationMs.toFixed(2));

    this.queryMonitor.record({
      text: record.text,
      target: record.target,
      durationMs,
      rowCount: record.rowCount,
      errorCode: record.errorCode,
      errorMessage: record.errorMessage,
    });

    if (durationMs >= config.DB_QUERY_SLOW_THRESHOLD_MS) {
      logger.warn("Slow database query detected", {
        target: record.target,
        durationMs,
        rowCount: record.rowCount ?? 0,
        query: formatQueryPreview(record.text),
      });
    }
  }

  private async connectPool(poolState: MonitoredPool): Promise<void> {
    if (poolState.isConnecting) return;

    poolState.isConnecting = true;
    poolState.connectionAttempts += 1;

    if (poolState.role === "primary") {
      statusManager.setDatabaseStatus(StatusConstants.CONNECTING, {
        message: `Attempting primary database connection (${poolState.connectionAttempts}/${poolState.maxConnectionAttempts})`,
        attempt: poolState.connectionAttempts,
      });
    }

    logger.info("Attempting database connection", {
      pool: poolState.name,
      role: poolState.role,
      attempt: poolState.connectionAttempts,
      maxAttempts: poolState.maxConnectionAttempts,
    });

    try {
      const client = await poolState.pool.connect();
      client.release();

      poolState.isHealthy = true;
      poolState.connectionAttempts = 0;
      poolState.retryDelay = 5000;

      logger.info("Connected to PostgreSQL pool", {
        pool: poolState.name,
        role: poolState.role,
      });

      if (poolState.reconnectTimer) {
        clearTimeout(poolState.reconnectTimer);
        poolState.reconnectTimer = null;
      }

      if (poolState.role === "primary") {
        this.startHealthCheck();
      }

      this.refreshDatabaseStatus("Database connection successful");
    } catch (error: unknown) {
      poolState.isHealthy = false;
      const err = error as { message?: string; code?: string };

      logger.error("PostgreSQL connection error", {
        pool: poolState.name,
        role: poolState.role,
        message: err.message,
        code: err.code,
      });

      if (poolState.role === "primary") {
        statusManager.setDatabaseStatus(StatusConstants.ERROR, {
          message: "Primary database connection failed",
          error: err.message,
          pool: poolState.name,
        });
      }

      this.scheduleReconnect(poolState);
      this.refreshDatabaseStatus("Database connection failed");
    } finally {
      poolState.isConnecting = false;
    }
  }

  private scheduleReconnect(poolState: MonitoredPool): void {
    if (poolState.reconnectTimer) return;

    if (poolState.connectionAttempts >= poolState.maxConnectionAttempts) {
      logger.error("Maximum database reconnect attempts reached", {
        pool: poolState.name,
        role: poolState.role,
        attempts: poolState.connectionAttempts,
      });

      if (poolState.role === "primary") {
        statusManager.setDatabaseStatus(StatusConstants.ERROR, {
          message: `Primary database reconnect limit reached (${poolState.maxConnectionAttempts})`,
          attempts: poolState.connectionAttempts,
        });
      }

      return;
    }

    const delay = Math.min(poolState.retryDelay * 1.5, 60000);
    poolState.retryDelay = delay;

    logger.info("Scheduling database reconnect", {
      pool: poolState.name,
      role: poolState.role,
      delayMs: delay,
    });

    poolState.reconnectTimer = setTimeout(() => {
      poolState.reconnectTimer = null;
      void this.connectPool(poolState);
    }, delay);
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const intervalMs = config.DB_HEALTH_CHECK_INTERVAL;

    if (intervalMs <= 0) {
      logger.warn("Database health check is disabled (interval <= 0).");
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      void this.performHealthCheck();
    }, intervalMs);

    logger.info("Database health check scheduled", {
      intervalMs,
      replicas: this.replicaPoolStates.length,
    });
  }

  private async performHealthCheck(): Promise<void> {
    const primaryHealthy = await this.checkPoolHealth(this.primaryPoolState);
    const replicaResults = await Promise.all(
      this.replicaPoolStates.map((replicaPoolState) =>
        this.checkPoolHealth(replicaPoolState),
      ),
    );

    if (!primaryHealthy) {
      this.scheduleReconnect(this.primaryPoolState);
    }

    for (let index = 0; index < this.replicaPoolStates.length; index += 1) {
      if (!replicaResults[index]) {
        this.scheduleReconnect(this.replicaPoolStates[index]);
      }
    }

    this.refreshDatabaseStatus("Database health check completed");
  }

  private async checkPoolHealth(poolState: MonitoredPool): Promise<boolean> {
    try {
      const result = await poolState.rawQuery("SELECT 1");

      if (result.rowCount && result.rowCount > 0) {
        poolState.isHealthy = true;
        return true;
      }

      throw new Error("Health check returned no rows");
    } catch (error: unknown) {
      poolState.isHealthy = false;
      const err = error as { message?: string; code?: string };

      logger.error("Database health check failed", {
        pool: poolState.name,
        role: poolState.role,
        message: err.message,
        code: err.code,
      });

      return false;
    }
  }

  private refreshDatabaseStatus(message: string): void {
    const healthyReplicas = this.replicaPoolStates.filter(
      (poolState) => poolState.isHealthy,
    ).length;
    const replicasConfigured = this.replicaPoolStates.length;
    const databaseStatus = !this.primaryPoolState.isHealthy
      ? StatusConstants.ERROR
      : healthyReplicas < replicasConfigured
        ? StatusConstants.WARNING
        : StatusConstants.CONNECTED;

    const summaryMessage = !this.primaryPoolState.isHealthy
      ? "Primary database unavailable"
      : replicasConfigured === 0
        ? "Primary database connected; no read replicas configured"
        : healthyReplicas === 0
          ? "Primary database connected; read traffic is falling back to primary"
          : `${healthyReplicas}/${replicasConfigured} read replicas available`;

    statusManager.setDatabaseStatus(databaseStatus, {
      message: `${summaryMessage}. ${message}`,
      timestamp: new Date().toISOString(),
      primary: this.getPoolSnapshot(this.primaryPoolState),
      replicas: this.replicaPoolStates.map((poolState) =>
        this.getPoolSnapshot(poolState),
      ),
      queryMetrics: this.queryMonitor.getStatusSummary(),
      readRouting: {
        strategy:
          this.replicaPoolStates.length > 0
            ? "replica-preferred"
            : "primary-only",
        lastTarget: this.lastReadTarget,
      },
    });
  }

  private getPoolSnapshot(poolState: MonitoredPool): Record<string, unknown> {
    return {
      name: poolState.name,
      role: poolState.role,
      healthy: poolState.isHealthy,
      totalCount: poolState.pool.totalCount,
      idleCount: poolState.pool.idleCount,
      waitingCount: poolState.pool.waitingCount,
      connectionAttempts: poolState.connectionAttempts,
    };
  }

  private selectReadPoolState(): MonitoredPool {
    const healthyReplicas = this.replicaPoolStates.filter(
      (poolState) => poolState.isHealthy,
    );

    if (healthyReplicas.length === 0) {
      this.lastReadTarget = this.primaryPoolState.name;
      return this.primaryPoolState;
    }

    const selectedPoolState =
      healthyReplicas[this.readReplicaCursor % healthyReplicas.length];
    this.readReplicaCursor += 1;
    this.lastReadTarget = selectedPoolState.name;
    return selectedPoolState;
  }

  getReadPool(): PoolInstance {
    return this.selectReadPoolState().pool;
  }

  getQueryMetrics() {
    return this.queryMonitor.getSnapshot(10);
  }

  getConnectionOverview() {
    return {
      primary: this.getPoolSnapshot(this.primaryPoolState),
      replicas: this.replicaPoolStates.map((poolState) =>
        this.getPoolSnapshot(poolState),
      ),
      readRouting: {
        strategy:
          this.replicaPoolStates.length > 0
            ? "replica-preferred"
            : "primary-only",
        lastTarget: this.lastReadTarget,
      },
    };
  }

  async query(
    text: string,
    params: any[] = [],
    options: QueryOptions = { maxRetries: 2, target: "write" },
  ): Promise<pg.QueryResult> {
    let retries = 0;
    const maxRetries = options.maxRetries ?? 2;
    let poolState =
      options.target === "read"
        ? this.selectReadPoolState()
        : this.primaryPoolState;

    while (retries <= maxRetries) {
      try {
        return await poolState.pool.query(text, params);
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string };
        logger.error("Database query error", {
          pool: poolState.name,
          role: poolState.role,
          attempt: retries + 1,
          maxAttempts: maxRetries + 1,
          message: err.message,
          code: err.code,
          query: formatQueryPreview(text),
        });

        if (options.target === "read" && poolState.role === "replica") {
          logger.warn("Read query on replica failed; falling back to primary", {
            failedPool: poolState.name,
            code: err.code,
          });

          poolState.isHealthy = false;
          this.scheduleReconnect(poolState);
          poolState = this.primaryPoolState;
          this.lastReadTarget = this.primaryPoolState.name;
          continue;
        }

        retries += 1;
        if (retries > maxRetries || !isRetryableError(error)) {
          if (poolState.role === "primary") {
            this.primaryPoolState.isHealthy = false;
            this.scheduleReconnect(this.primaryPoolState);
            this.refreshDatabaseStatus("Primary database query failure");
          }
          throw error;
        }

        const delayMs = 1000 * retries;
        logger.warn("Retrying database query", {
          pool: poolState.name,
          delayMs,
          nextAttempt: retries + 1,
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error("Query retry logic failed unexpectedly.");
  }

  async end(): Promise<void> {
    logger.info("Closing database pools...");

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const pools = [this.primaryPoolState, ...this.replicaPoolStates];

    for (const poolState of pools) {
      if (poolState.reconnectTimer) {
        clearTimeout(poolState.reconnectTimer);
        poolState.reconnectTimer = null;
      }
    }

    try {
      await Promise.all(pools.map((poolState) => poolState.pool.end()));
      logger.info("Database pools closed successfully.");
      statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
        message: "All database pools closed",
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Error closing database pools", {
        message: err.message,
      });
      statusManager.setDatabaseStatus(StatusConstants.ERROR, {
        message: "Error closing database pools",
        error: err.message,
      });
    }
  }
}

const dbManager = new DatabaseManager();
export default dbManager;
