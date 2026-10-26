import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MeasurementSpool,
  toMeasurementRow,
} from "../../queue/measurementSpool.js";
import { measurementIdentity } from "../../opc-ua/measurementIdentity.js";
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const sample = {
  key: "Running",
  label: "Running",
  timestamp: "2026-01-01T00:00:00Z",
  value: true,
  statusCode: "Good",
  dataType: "Boolean",
  machineId: 1,
};
describe("durable measurement spool", () => {
  it("reports receive age and empty queue as unknown rather than zero-age data", () => {
    const spool = new MeasurementSpool(":memory:");
    try {
      expect(spool.health()).toMatchObject({
        pendingMeasurements: 0,
        oldestReceivedAt: null,
        oldestReceivedAgeSeconds: null,
      });
      spool.enqueue({
        ...sample,
        receivedAt: new Date(Date.now() - 10000).toISOString(),
      });
      expect(spool.health().pendingMeasurements).toBe(1);
      expect(spool.health().oldestReceivedAgeSeconds).toBeGreaterThanOrEqual(
        10,
      );
      spool.acknowledge(spool.peek(1));
      expect(spool.health().oldestReceivedAt).toBeNull();
    } finally {
      spool.close();
    }
  });
  it("retains source identity and receive time across spool replay", () => {
    const spool = new MeasurementSpool(":memory:");
    try {
      const signalMetadata = measurementIdentity(
        "opc.tcp://owned:4841",
        1,
        "Running",
        { nodeId: "ns=1;s=Running", dataType: "Boolean", label: "Running" },
        ["core", "urn:owned"],
        null,
      );
      const receivedAt = "2026-01-01T00:00:01.000Z";
      spool.enqueue({ ...sample, receivedAt, signalMetadata });
      const row = toMeasurementRow(spool.peek(1)[0]);
      expect(row.signalMetadata).toEqual(signalMetadata);
      expect(row.receivedAt?.toISOString()).toBe(receivedAt);
      expect(
        toMeasurementRow({ id: "old", data: sample }).signalMetadata,
      ).toBeNull();
      expect(
        toMeasurementRow({ id: "old", data: sample }).receivedAt,
      ).toBeNull();
    } finally {
      spool.close();
    }
  });
  it("reopens unacknowledged measurements with the same replay identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "dashboard-spool-"));
    directories.push(dir);
    const file = join(dir, "queue.sqlite");
    let spool = new MeasurementSpool(file);
    spool.enqueue(sample);
    const batch = spool.peek(10);
    spool.close();
    spool = new MeasurementSpool(file);
    try {
      expect(spool.peek(10)).toEqual(batch);
      spool.acknowledge(batch);
      expect(spool.peek(10)).toEqual([]);
    } finally {
      spool.close();
    }
  });
  it("preserves scalar values, quality, and source timestamps without polluting numeric calculations", () => {
    const entry = { id: "sample-1", data: sample };
    expect(toMeasurementRow(entry)).toMatchObject({
      value: 1,
      rawValue: true,
      statusCode: "Good",
      eventId: "sample-1",
    });
    expect(
      toMeasurementRow({ ...entry, data: { ...sample, value: "Fault 42" } }),
    ).toMatchObject({ value: null, rawValue: "Fault 42" });
    expect(
      toMeasurementRow({
        ...entry,
        data: { ...sample, value: 12, statusCode: "BadNoCommunication" },
      }),
    ).toMatchObject({
      value: null,
      rawValue: 12,
      statusCode: "BadNoCommunication",
    });
    expect(
      toMeasurementRow({ ...entry, data: { ...sample, value: 16777217 } })
        .value,
    ).toBe(16777217);
  });
  it("rejects invalid data before acknowledging it", () => {
    const spool = new MeasurementSpool(":memory:");
    try {
      expect(() => spool.enqueue({ ...sample, value: NaN })).toThrow("finite");
      expect(() => spool.enqueue({ ...sample, timestamp: "bad" })).toThrow(
        "timestamp",
      );
      expect(spool.peek(10)).toEqual([]);
    } finally {
      spool.close();
    }
  });
});
