import client from "prom-client";
import { metricsRegistry } from "./metrics.js";
import { collectorDiagnostics } from "../services/collectorDiagnostics.js";
import opcuaQueueWorker from "../queue/opcuaQueueWorker.js";
import dbClient from "../database/dbConnection.js";

// Values are read at scrape time; series stay absent when their source is unknown.
const TIMEOUT_MS = 3000;
const query = <T extends Record<string, unknown>>(text: string) =>
  dbClient.pool
    .query<T>({ text, query_timeout: TIMEOUT_MS } as never)
    .then((result) => result.rows);

new client.Gauge({
  name: "opcua_connection_reconnects",
  help: "OPC UA reconnects observed since this collector process started",
  labelNames: ["machine_id"] as const,
  registers: [metricsRegistry],
  collect() {
    this.reset();
    for (const [machineId, record] of collectorDiagnostics.connectionEntries())
      this.labels(String(machineId)).set(record.reconnects);
  },
});

new client.Gauge({
  name: "opcua_connection_losses",
  help: "OPC UA connection losses observed since this collector process started",
  labelNames: ["machine_id"] as const,
  registers: [metricsRegistry],
  collect() {
    this.reset();
    for (const [machineId, record] of collectorDiagnostics.connectionEntries())
      this.labels(String(machineId)).set(record.connectionLosses);
  },
});

new client.Gauge({
  name: "measurement_spool_pending",
  help: "Durably accepted measurements waiting for PostgreSQL",
  registers: [metricsRegistry],
  collect() {
    this.set(opcuaQueueWorker.getHealth().pendingMeasurements);
  },
});

new client.Gauge({
  name: "measurement_spool_oldest_age_seconds",
  help: "Age of the oldest measurement waiting for PostgreSQL; 0 when empty, NaN when its receive time is unknown",
  registers: [metricsRegistry],
  collect() {
    const health = opcuaQueueWorker.getHealth();
    this.set(
      health.pendingMeasurements === 0
        ? 0
        : (health.oldestReceivedAgeSeconds ?? Number.NaN),
    );
  },
});

new client.Gauge({
  name: "measurement_last_commit_age_seconds",
  help: "Seconds since measurements of each machine were last committed to PostgreSQL by this process",
  labelNames: ["machine_id"] as const,
  registers: [metricsRegistry],
  collect() {
    this.reset();
    for (const [machineId, record] of collectorDiagnostics.ingestionEntries())
      if (record.lastCommittedAt)
        this.labels(String(machineId)).set(
          (Date.now() - Date.parse(record.lastCommittedAt)) / 1000,
        );
  },
});

// prom-client collects metrics concurrently, so each gauge queries for itself.
async function roundtripSeconds() {
  const started = performance.now();
  try {
    await query("SELECT 1");
    return (performance.now() - started) / 1000;
  } catch {
    return null;
  }
}

new client.Gauge({
  name: "database_up",
  help: "1 when PostgreSQL answered within 3 seconds at this scrape",
  registers: [metricsRegistry],
  async collect() {
    this.set((await roundtripSeconds()) == null ? 0 : 1);
  },
});

new client.Gauge({
  name: "database_roundtrip_seconds",
  help: "PostgreSQL round-trip time at this scrape; NaN when unreachable",
  registers: [metricsRegistry],
  async collect() {
    this.set((await roundtripSeconds()) ?? Number.NaN);
  },
});

new client.Gauge({
  name: "background_jobs",
  help: "Report generation, report email, webhook delivery and retention jobs by state",
  labelNames: ["job", "state"] as const,
  registers: [metricsRegistry],
  async collect() {
    this.reset();
    try {
      const rows = await query<{ job: string; state: string; n: number }>(
        `SELECT 'report_generation' AS job, status AS state, count(*)::int AS n FROM report_history GROUP BY status
         UNION ALL SELECT 'report_email', email_status, count(*)::int FROM report_history WHERE email_status <> 'not-requested' GROUP BY email_status
         UNION ALL SELECT 'webhook_delivery', CASE WHEN attempts > 0 THEN 'retrying' ELSE 'pending' END, count(*)::int FROM webhook_deliveries WHERE delivered_at IS NULL GROUP BY 2
         UNION ALL SELECT 'retention', status, count(*)::int FROM retention_schedules GROUP BY status`,
      );
      for (const row of rows) this.labels(row.job, row.state).set(row.n);
    } catch {
      // Unknown job state stays absent rather than reading as zero.
    }
  },
});
