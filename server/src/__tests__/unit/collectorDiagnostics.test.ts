import { it, expect } from "vitest";
import {
  CollectorDiagnostics,
  observeSignal,
} from "../../services/collectorDiagnostics.js";
import { sampleFreshness } from "../../services/connectionDiagnostics.js";
import { MeasurementSpool } from "../../queue/measurementSpool.js";
it("keeps absent runtime evidence unknown and bounds counters to a connection observation period", () => {
  const diagnostics = new CollectorDiagnostics();
  expect(diagnostics.connection(1)).toBeNull();
  expect(diagnostics.ingestionState(1)).toBeNull();
  const record = diagnostics.begin(1, {
    Pressure: {
      nodeId: "ns=1;s=P",
      label: "P",
      dataType: "Double",
      samplingInterval: 100,
    },
  });
  expect(record.signals[0].revisedSamplingMs).toBeNull();
  expect(record.signals[0].revisedQueueSize).toBeNull();
  observeSignal(
    record.signals[0],
    new Date(10000),
    new Date(9000),
    "BadCommunicationError",
  );
  expect(record.signals[0].unusableObservations).toBe(1);
  expect(record.signals[0].lastSourceAt).toBe(new Date(9000).toISOString());
  diagnostics.rejected(1);
  expect(diagnostics.ingestionState(1)?.rejected).toBe(1);
  expect(diagnostics.ingestionState(1)?.lastCommittedAt).toBeNull();
  diagnostics.committed(1);
  expect(diagnostics.ingestionState(1)?.lastCommittedAt).not.toBeNull();
  observeSignal(record.signals[0], new Date(11000), null, "Good#Overflow");
  expect(record.signals[0].overflowIndications).toBe(1);
  expect(record.signals[0].observations).toBe(2);
  expect(record.signals[0].unusableObservations).toBe(1);
  diagnostics.begin(1, {});
  expect(diagnostics.connection(1)?.signals).toEqual([]);
  expect(diagnostics.ingestionState(1)?.rejected).toBe(1);
  expect(diagnostics.connection(2)).toBeNull();
});
it("does not turn missing, future or bad-quality timestamps into fresh good data", () => {
  expect(sampleFreshness(null, "Good", 100000, 60).freshness).toBe("unknown");
  expect(
    sampleFreshness(new Date(101000).toISOString(), "Good", 100000, 60)
      .receiveAgeSeconds,
  ).toBeNull();
  expect(
    sampleFreshness(new Date(99000).toISOString(), "Bad", 100000, 60).freshness,
  ).toBe("unknown");
  expect(
    sampleFreshness(new Date(1000).toISOString(), "Good", 100000, 60).freshness,
  ).toBe("stale");
  expect(
    sampleFreshness(new Date(99000).toISOString(), "Good", 100000, 60)
      .freshness,
  ).toBe("fresh");
});
it("isolates durable queue counts by machine without acknowledging either machine", () => {
  const spool = new MeasurementSpool(":memory:");
  try {
    const sample = {
      key: "P",
      label: "P",
      value: 0,
      timestamp: new Date(),
      receivedAt: "2026-01-01T00:00:00Z",
    };
    spool.enqueue({ ...sample, machineId: 1 });
    spool.enqueue({ ...sample, machineId: 2 });
    expect(spool.machineHealth(1)).toEqual({
      pending: 1,
      oldestReceivedAt: sample.receivedAt,
      unknownReceiveTimes: 0,
    });
    expect(spool.machineHealth(3).pending).toBe(0);
    expect(spool.count()).toBe(2);
  } finally {
    spool.close();
  }
});
