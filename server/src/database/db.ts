import { drizzle } from "drizzle-orm/node-postgres";

import dbManager from "./dbConnection.js";
import * as schema from "./schema.js";

const dbInstances = new WeakMap<object, any>();

const getDbForPool = (pool: object) => {
  const existingInstance = dbInstances.get(pool);
  if (existingInstance) return existingInstance;

  const database = drizzle(pool as any, { schema });
  dbInstances.set(pool, database);
  return database;
};

/**
 * Default write-capable Drizzle client backed by the primary pool.
 */
const db = getDbForPool(dbManager.pool);

/**
 * Returns a read-optimized Drizzle client. When healthy replicas exist, one is
 * selected in round-robin order; otherwise the primary pool is used.
 */
export const getReadDb = () => getDbForPool(dbManager.getReadPool());

export const getWriteDb = () => db;

export default db;
