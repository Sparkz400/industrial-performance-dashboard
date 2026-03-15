import pg from "pg";
import statusManager from "../utils/status.js";
import StatusConstants from "../utils/statusConstants.js";
import logger from "../utils/logger.js";
import config from "../config/config.js";

const { Pool } = pg;

/**
 * Class for managing database connections with integrated health monitoring
 */
class DatabaseManager {
  pool: InstanceType<typeof Pool>;
  isConnecting: boolean;
  healthCheckInterval: ReturnType<typeof setInterval> | null;
  connectionAttempts: number;
  maxConnectionAttempts: number;
  retryDelay: number;

  constructor() {
    this.isConnecting = false;
    this.healthCheckInterval = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    this.retryDelay = 5000;

    this.pool = new Pool({
      host: config.DB_HOST,
      port: config.DB_PORT,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      database: config.DB_NAME,
      max: config.DB_MAX_POOL,
      connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT,
      idleTimeoutMillis: config.DB_IDLE_TIMEOUT,
    });

    this.pool.on("error", (err: Error) => {
      logger.error("Unexpected error on idle PostgreSQL client:", err);
      statusManager.setDatabaseStatus(StatusConstants.ERROR, {
        message: "Unexpected pool error",
        error: err.message,
      });
      this.scheduleReconnect();
    });

    void this.connect();
  }

  async connect(): Promise<void> {
    if (this.isConnecting) return;

    this.isConnecting = true;
    this.connectionAttempts++;

    statusManager.setDatabaseStatus(StatusConstants.CONNECTING, {
      message: `Attempting connection (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`,
      attempt: this.connectionAttempts,
    });
    logger.info(
      `Attempting database connection (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})...`,
    );

    try {
      const client = await this.pool.connect();
      logger.info(
        `Connected to PostgreSQL database: ${config.DB_NAME} on ${config.DB_HOST}`,
      );

      statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
        message: "Connection successful",
        timestamp: new Date().toISOString(),
      });

      client.release();
      this.connectionAttempts = 0;
      this.retryDelay = 5000;
      this.startHealthCheck();
    } catch (err: any) {
      logger.error("PostgreSQL connection error:", {
        message: err.message,
        code: err.code,
      });
      statusManager.setDatabaseStatus(StatusConstants.ERROR, {
        message: "Connection failed",
        error: err.message,
      });
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  scheduleReconnect(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.connectionAttempts < this.maxConnectionAttempts) {
      const delay = Math.min(this.retryDelay * 1.5, 60000);
      this.retryDelay = delay;

      logger.info(
        `Scheduling database reconnection attempt in ${delay / 1000} seconds...`,
      );
      setTimeout(() => this.connect(), delay);
    } else {
      logger.error(
        `Database connection failed after ${this.maxConnectionAttempts} attempts. Stopping automatic retries. Manual intervention required.`,
      );
      statusManager.setDatabaseStatus(StatusConstants.ERROR, {
        message: `Max connection attempts (${this.maxConnectionAttempts}) reached. Auto-reconnect stopped.`,
        attempts: this.connectionAttempts,
      });
    }
  }

  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const intervalMs = config.DB_HEALTH_CHECK_INTERVAL;

    if (intervalMs <= 0) {
      logger.warn("Database health check is disabled (interval <= 0).");
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const poolStats = {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        };
        logger.debug("Database pool stats:", poolStats);

        const res = await this.pool.query("SELECT 1");
        if (res.rowCount! > 0) {
          if (
            statusManager.getServiceStatus(StatusConstants.DATABASE) !==
            StatusConstants.CONNECTED
          ) {
            logger.info(
              "Database health check passed, restoring status to CONNECTED.",
            );
            statusManager.setDatabaseStatus(StatusConstants.CONNECTED, {
              message: "Health check passed",
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          throw new Error("Health check query returned no rows.");
        }
      } catch (error: any) {
        logger.error("Database health check failed:", {
          message: error.message,
          code: error.code,
        });
        statusManager.setDatabaseStatus(StatusConstants.ERROR, {
          message: "Health check failed",
          error: error.message,
        });
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
        this.scheduleReconnect();
      }
    }, intervalMs);

    logger.info(
      `Database health check scheduled every ${intervalMs / 1000} seconds`,
    );
  }

  async query(
    text: string,
    params: any[] = [],
    options: { maxRetries?: number } = { maxRetries: 2 },
  ): Promise<pg.QueryResult> {
    let retries = 0;
    const maxRetries = options.maxRetries ?? 2;

    while (retries <= maxRetries) {
      try {
        return await this.pool.query(text, params);
      } catch (error: any) {
        logger.error(
          `Database query error (attempt ${retries + 1}/${maxRetries + 1}):`,
          {
            message: error.message,
            code: error.code,
            query: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
          },
        );

        retries++;
        const isRetryable =
          error.code === "ECONNRESET" ||
          error.code === "ETIMEDOUT" ||
          error.code === "57P01" ||
          error.code === "57P03" ||
          error.code === "08003" ||
          error.code === "08006";

        if (retries > maxRetries || !isRetryable) {
          logger.error(`Query failed permanently after ${retries} attempts.`);
          if (isRetryable || error.message.includes("connection")) {
            statusManager.setDatabaseStatus(StatusConstants.ERROR, {
              message: "Persistent connection issue during query",
              error: error.message,
            });
            this.scheduleReconnect();
          }
          throw error;
        }

        const delay = 1000 * retries;
        logger.warn(`Retrying query in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Query retry logic failed unexpectedly.");
  }

  async end(): Promise<void> {
    logger.info("Closing database pool...");
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    try {
      await this.pool.end();
      logger.info("Database pool closed successfully.");
      statusManager.setDatabaseStatus(StatusConstants.DISCONNECTED, {
        message: "Connection pool closed",
      });
    } catch (error: any) {
      logger.error("Error closing database pool:", error);
      statusManager.setDatabaseStatus(StatusConstants.ERROR, {
        message: "Error closing pool",
        error: error.message,
      });
    }
  }
}

const dbManager = new DatabaseManager();
export default dbManager;
