import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NodePgClient } from "drizzle-orm/node-postgres/session";

import dbManager from "./dbConnection.js";
import * as schema from "./schema.js";

type DbInstance = NodePgDatabase<typeof schema>;

const dbInstances = new WeakMap<object, DbInstance>();

const getDbForPool = (pool: object): DbInstance => {
  const existingInstance = dbInstances.get(pool);
  if (existingInstance) return existingInstance;

  const database = drizzle(pool as NodePgClient, { schema });
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

export default db;
