import { beforeEach, expect, it, vi } from "vitest";

const { query, health } = vi.hoisted(() => ({
  query: vi.fn(),
  health: vi.fn(),
}));
vi.mock("../../database/dbConnection.js", () => ({
  default: { pool: { query } },
}));
vi.mock("../../queue/opcuaQueueWorker.js", () => ({
  default: { getHealth: health },
}));
import { collectorDiagnostics } from "../../services/collectorDiagnostics.js";
import { metricsRegistry } from "../../observability/metrics.js";
import "../../observability/operationalMetrics.js";

const line = (text: string, name: string) =>
  text.split("\n").find((l) => l.startsWith(name));

beforeEach(() => {
  query.mockReset();
  health.mockReturnValue({
    pendingMeasurements: 0,
    oldestReceivedAgeSeconds: null,
  });
});

it("exposes reconnects, spool age, commit age and job states", async () => {
  const record = collectorDiagnostics.begin(4, {});
  record.reconnects = 3;
  record.connectionLosses = 2;
  collectorDiagnostics.committed(4);
  health.mockReturnValue({
    pendingMeasurements: 12,
    oldestReceivedAgeSeconds: 42,
  });
  query.mockImplementation(async ({ text }: { text: string }) => ({
    rows:
      text === "SELECT 1"
        ? [{}]
        : [
            { job: "report_generation", state: "failed", n: 2 },
            { job: "webhook_delivery", state: "retrying", n: 1 },
          ],
  }));
  const text = await metricsRegistry.metrics();
  expect(line(text, 'opcua_connection_reconnects{machine_id="4"}')).toMatch(
    / 3$/,
  );
  expect(line(text, 'opcua_connection_losses{machine_id="4"}')).toMatch(/ 2$/);
  expect(line(text, "measurement_spool_pending ")).toBe(
    "measurement_spool_pending 12",
  );
  expect(line(text, "measurement_spool_oldest_age_seconds ")).toBe(
    "measurement_spool_oldest_age_seconds 42",
  );
  expect(
    line(text, 'measurement_last_commit_age_seconds{machine_id="4"}'),
  ).toMatch(/ 0(\.\d+)?$/);
  expect(line(text, "database_up ")).toBe("database_up 1");
  expect(line(text, "database_roundtrip_seconds ")).toBeDefined();
  expect(
    line(text, 'background_jobs{job="report_generation",state="failed"}'),
  ).toBe('background_jobs{job="report_generation",state="failed"} 2');
});

it("marks unknown spool age and database timing, and omits job states when unreachable", async () => {
  health.mockReturnValue({
    pendingMeasurements: 5,
    oldestReceivedAgeSeconds: null,
  });
  query.mockRejectedValue(new Error("connection refused"));
  const text = await metricsRegistry.metrics();
  // prom-client writes "Nan"; Prometheus parses NaN case-insensitively.
  expect(line(text, "measurement_spool_oldest_age_seconds ")).toMatch(/ nan$/i);
  expect(line(text, "database_up ")).toBe("database_up 0");
  expect(line(text, "database_roundtrip_seconds ")).toMatch(/ nan$/i);
  expect(line(text, "background_jobs{")).toBeUndefined();
});
