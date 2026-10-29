import { statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import config from "../config/config.js";
import manager from "../database/dbConnection.js";
export function diskRunway(
  freeBytes: number,
  reserveBytes: number,
  previousFreeBytes: number,
  elapsedMs: number,
) {
  const consumed = previousFreeBytes - freeBytes;
  const bytesPerDay =
    elapsedMs >= 60000 && consumed > 0
      ? (consumed * 86400000) / elapsedMs
      : null;
  return {
    freeBytes,
    reserveBytes,
    bytesPerDay,
    daysToReserve:
      freeBytes <= reserveBytes
        ? 0
        : bytesPerDay
          ? (freeBytes - reserveBytes) / bytesPerDay
          : null,
  };
}
export async function storageRunway() {
  const paths = [
    {
      kind: "collector",
      path: resolve(dirname(config.OPCUA_SPOOL_PATH)),
      reserve: config.OPCUA_SPOOL_RESERVE_MB * 1024 * 1024,
    },
    ...(process.env.PD_DATABASE_STORAGE_PATH
      ? [
          {
            kind: "database",
            path: resolve(process.env.PD_DATABASE_STORAGE_PATH),
            reserve: 1024 ** 3,
          },
        ]
      : []),
  ];
  const measurements = [];
  for (const location of paths) {
    try {
      const space = await statfs(location.path),
        free = space.bavail * space.bsize,
        now = new Date();
      const previous = (
        await manager.pool.query(
          "SELECT * FROM storage_observations WHERE kind=$1 AND path=$2 AND observed_at >= now()-interval '24 hours' ORDER BY observed_at LIMIT 1",
          [location.kind, location.path],
        )
      ).rows[0];
      await manager.pool.query(
        "INSERT INTO storage_observations(kind,path,observed_at,free_bytes) SELECT $1,$2,$3::timestamptz,$4 WHERE NOT EXISTS (SELECT 1 FROM storage_observations WHERE kind=$1 AND path=$2 AND observed_at>$3::timestamptz-interval '1 minute') ON CONFLICT DO NOTHING",
        [location.kind, location.path, now, free],
      );
      measurements.push({
        kind: location.kind,
        ...diskRunway(
          free,
          location.reserve,
          previous ? Number(previous.free_bytes) : free,
          previous
            ? now.getTime() - new Date(previous.observed_at).getTime()
            : 0,
        ),
        basis:
          "Measured free-space decline on this configured filesystem; includes other writers and cleanup; extrapolation, not a capacity guarantee",
      });
    } catch (error) {
      measurements.push({
        kind: location.kind,
        daysToReserve: null,
        error: "Storage measurement unavailable",
      });
    }
  }
  await manager.pool.query(
    "DELETE FROM storage_observations WHERE observed_at<now()-interval '2 days'",
  );
  if (!process.env.PD_DATABASE_STORAGE_PATH)
    measurements.push({
      kind: "database",
      daysToReserve: null,
      error:
        "Database volume is not mounted for measurement; configure PD_DATABASE_STORAGE_PATH to its verified mount",
    });
  return measurements;
}
