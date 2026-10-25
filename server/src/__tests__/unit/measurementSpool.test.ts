import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MeasurementSpool,
  toMeasurementRow,
} from "../../queue/measurementSpool.js";
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
