import type { ConnectionDiagnostics } from "@performance-dashboard/shared";
import manager from "../database/dbConnection.js";
import { collectorDiagnostics } from "./collectorDiagnostics.js";
import worker from "../queue/opcuaQueueWorker.js";
import { NotFoundError } from "../utils/errors.js";

export function sampleFreshness(
  receivedAt: string | null,
  status: string | null,
  now: number,
  thresholdSeconds: number,
) {
  const age = receivedAt ? (now - Date.parse(receivedAt)) / 1000 : NaN;
  return {
    receiveAgeSeconds: Number.isFinite(age) && age >= 0 ? age : null,
    freshness:
      !Number.isFinite(age) || age < 0
        ? ("unknown" as const)
        : age > thresholdSeconds
          ? ("stale" as const)
          : status?.startsWith("Good")
            ? ("fresh" as const)
            : ("unknown" as const),
  };
}
export async function connectionDiagnostics(
  machineId: number,
): Promise<ConnectionDiagnostics> {
  const machine = (
    await manager.pool.query("SELECT name FROM machines WHERE id=$1", [
      machineId,
    ])
  ).rows[0];
  if (!machine) throw new NotFoundError("Machine");
  const profile = (
    await manager.pool.query(
      "SELECT profile FROM machine_profiles WHERE machine_id=$1 ORDER BY id DESC LIMIT 1",
      [machineId],
    )
  ).rows[0];
  const staleAfterSeconds = profile?.profile?.maxGapSeconds ?? 60;
  const rows = (
    await manager.pool.query(
      `SELECT m.node_key,m.sampling_interval,d.timestamp,d.received_at,d.status_code FROM node_mappings m
    LEFT JOIN LATERAL (SELECT timestamp,received_at,status_code FROM opcua_data WHERE machine_id=m.machine_id AND node_key=m.node_key ORDER BY timestamp DESC,id DESC LIMIT 1) d ON true
    WHERE m.machine_id=$1 AND m.is_active ORDER BY m.node_key LIMIT 501`,
      [machineId],
    )
  ).rows;
  let queue = null;
  try {
    queue = worker.getMachineHealth(machineId);
  } catch {
    /* Storage unavailable is unknown, never an empty queue. */
  }
  const now = Date.now(),
    runtime = collectorDiagnostics.connection(machineId);
  return {
    machineId,
    name: machine.name,
    capturedAt: new Date(now).toISOString(),
    runtime: runtime
      ? { ...runtime, signals: runtime.signals.slice(0, 500) }
      : null,
    queue,
    ingestion: collectorDiagnostics.ingestionState(machineId),
    staleAfterSeconds,
    signalsTruncated: rows.length > 500 || (runtime?.signals.length ?? 0) > 500,
    signals: rows.slice(0, 500).map((r) => ({
      key: r.node_key,
      requestedSamplingMs: r.sampling_interval ?? 500,
      lastPersistedAt: r.timestamp?.toISOString() ?? null,
      statusCode: r.status_code,
      receivedAt: r.received_at?.toISOString() ?? null,
      ...sampleFreshness(
        r.received_at?.toISOString() ?? null,
        r.status_code,
        now,
        staleAfterSeconds,
      ),
    })),
  };
}
