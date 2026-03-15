import Redis from "ioredis";
import logger from "./logger.js";
import config from "../config/config.js";

/**
 * Redis cache layer with graceful degradation.
 * Falls back to in-memory Map when Redis is unavailable.
 */
class CacheManager {
  constructor() {
    this.client = null;
    this.fallbackCache = new Map();
    this.isRedisConnected = false;

    this.defaultTTL = 60; // seconds

    if (config.REDIS_URL) {
      this.initRedis(config.REDIS_URL);
    } else {
      logger.info(
        "[Cache] No REDIS_URL configured — using in-memory cache fallback.",
      );
    }
  }

  initRedis(url) {
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 5) {
            logger.warn(
              "[Cache] Redis retry limit reached, falling back to in-memory cache.",
            );
            return null; // stop retrying
          }
          return Math.min(times * 500, 3000);
        },
        lazyConnect: true,
      });

      this.client.on("connect", () => {
        this.isRedisConnected = true;
        logger.info("[Cache] Connected to Redis.");
      });

      this.client.on("error", (err) => {
        this.isRedisConnected = false;
        logger.error("[Cache] Redis error:", err.message);
      });

      this.client.on("close", () => {
        this.isRedisConnected = false;
        logger.warn("[Cache] Redis connection closed.");
      });

      this.client.connect().catch((err) => {
        logger.warn(
          `[Cache] Failed to connect to Redis: ${err.message}. Using in-memory fallback.`,
        );
      });
    } catch (err) {
      logger.warn(
        `[Cache] Failed to initialize Redis: ${err.message}. Using in-memory fallback.`,
      );
    }
  }

  /**
   * Get a cached value by key.
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    try {
      if (this.isRedisConnected && this.client) {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      }
      const entry = this.fallbackCache.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        this.fallbackCache.delete(key);
        return null;
      }
      return entry.value;
    } catch (err) {
      logger.error(`[Cache] Error getting key "${key}":`, err.message);
      return null;
    }
  }

  /**
   * Set a cached value with optional TTL.
   * @param {string} key
   * @param {any} value - Will be JSON-serialized
   * @param {number} [ttl] - Time to live in seconds (default: 60)
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      if (this.isRedisConnected && this.client) {
        await this.client.set(key, JSON.stringify(value), "EX", ttl);
      } else {
        this.fallbackCache.set(key, {
          value,
          expiresAt: Date.now() + ttl * 1000,
        });
      }
    } catch (err) {
      logger.error(`[Cache] Error setting key "${key}":`, err.message);
    }
  }

  /**
   * Delete a cached key.
   * @param {string} key
   */
  async del(key) {
    try {
      if (this.isRedisConnected && this.client) {
        await this.client.del(key);
      } else {
        this.fallbackCache.delete(key);
      }
    } catch (err) {
      logger.error(`[Cache] Error deleting key "${key}":`, err.message);
    }
  }

  /**
   * Delete all keys matching a pattern.
   * @param {string} pattern - e.g. "dashboard:*"
   */
  async delPattern(pattern) {
    try {
      if (this.isRedisConnected && this.client) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } else {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        for (const key of this.fallbackCache.keys()) {
          if (regex.test(key)) {
            this.fallbackCache.delete(key);
          }
        }
      }
    } catch (err) {
      logger.error(`[Cache] Error deleting pattern "${pattern}":`, err.message);
    }
  }

  /**
   * Cache-aside helper: get from cache or compute and store.
   * @param {string} key
   * @param {Function} computeFn - Async function to compute value if cache miss
   * @param {number} [ttl] - TTL in seconds
   */
  async getOrSet(key, computeFn, ttl = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== null) return cached;

    const value = await computeFn();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Gracefully close the Redis connection.
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      logger.info("[Cache] Redis connection closed.");
    }
  }
}

const cache = new CacheManager();
export default cache;
