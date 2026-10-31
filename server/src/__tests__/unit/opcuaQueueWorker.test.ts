import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
  commit: vi.fn(),
}));
vi.mock("../../database/db.js", () => ({ default: { insert: mocks.insert } }));
vi.mock("../../utils/logger.js", () => ({ default: { error: vi.fn() } }));
// Unstamped samples (no collector lease) are not fenced; fencing is covered by test-collector-fencing.mjs.
vi.mock("../../services/collectorLock.js", () => ({
  currentLease: () => undefined,
}));
import config from "../../config/config.js";
import { OpcuaQueueWorker } from "../../queue/opcuaQueueWorker.js";
let dir: string;
let worker: OpcuaQueueWorker;
afterEach(async () => {
  await worker.stop();
  rmSync(dir, { recursive: true, force: true });
});
it("retains a failed write across restart and retries the identical event ID", async () => {
  dir = mkdtempSync(join(tmpdir(), "dashboard-worker-"));
  config.OPCUA_SPOOL_PATH = join(dir, "queue.sqlite");
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.commit });
  mocks.commit
    .mockRejectedValueOnce(new Error("database offline"))
    .mockResolvedValue(undefined);
  worker = new OpcuaQueueWorker();
  worker.enqueue({
    key: "Counter",
    label: "Counter",
    timestamp: new Date(),
    value: 10,
    statusCode: "Good",
  });
  await expect(worker.processBatch()).rejects.toThrow("offline");
  expect(worker.getHealth().writeFailure?.message).toBe("database offline");
  const failedRows = mocks.values.mock.calls[0][0];
  await worker.stop();
  worker = new OpcuaQueueWorker();
  await worker.processBatch();
  expect(mocks.values.mock.calls[1][0]).toEqual(failedRows);
  expect(worker.getHealth()).toMatchObject({
    writeFailure: null,
    committedLastMinute: 1,
    pendingMeasurements: 0,
  });
  await worker.processBatch();
  expect(mocks.values).toHaveBeenCalledTimes(2);
});
it("quarantines a record PostgreSQL refuses and writes the rest", async () => {
  dir = mkdtempSync(join(tmpdir(), "dashboard-worker-"));
  config.OPCUA_SPOOL_PATH = join(dir, "queue.sqlite");
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.commit });
  const refused = Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("unsupported Unicode escape sequence"), {
      code: "22P05",
    }),
  });
  mocks.commit.mockReset();
  mocks.commit
    .mockRejectedValueOnce(refused) // whole batch
    .mockResolvedValueOnce(undefined) // first record alone
    .mockRejectedValueOnce(refused); // second record alone
  mocks.values.mockClear();
  worker = new OpcuaQueueWorker();
  for (const value of [1, "bad\u0000"])
    worker.enqueue({ key: "K", label: "K", timestamp: new Date(), value });
  await worker.processBatch();
  expect(mocks.values).toHaveBeenCalledTimes(3);
  expect(worker.getHealth()).toMatchObject({
    pendingMeasurements: 0,
    quarantinedMeasurements: 1,
    committedLastMinute: 1,
    writeFailure: null,
  });
  expect(worker.getQuarantine(10)[0]).toMatchObject({
    reason: "unsupported Unicode escape sequence",
    data: { value: "bad\u0000" },
  });
  // A connection failure is not a refusal: nothing is quarantined, the batch stays.
  worker.requeueQuarantine();
  mocks.commit.mockRejectedValueOnce(
    Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("terminated"), { code: "57P01" }),
    }),
  );
  await expect(worker.processBatch()).rejects.toThrow();
  expect(worker.getHealth()).toMatchObject({
    pendingMeasurements: 1,
    quarantinedMeasurements: 0,
  });
  expect(worker.getHealth().writeFailure).not.toBeNull();
});
// 1,000 durable writes at the minimum valid capacity: ~5 s on Windows CI, 33 s on a slow runner disk.
it("stops acquisition at the configured spool capacity", async () => {
  dir = mkdtempSync(join(tmpdir(), "dashboard-worker-"));
  config.OPCUA_SPOOL_PATH = join(dir, "queue.sqlite");
  config.OPCUA_SPOOL_MAX_ENTRIES = 1000;
  worker = new OpcuaQueueWorker();
  try {
    for (let i = 0; i < 1000; i++)
      worker.enqueue({ key: "C", label: "C", timestamp: new Date(), value: i });
    expect(() =>
      worker.enqueue({ key: "C", label: "C", timestamp: new Date(), value: 0 }),
    ).toThrow("capacity");
    const health = worker.getHealth();
    expect(health).toMatchObject({
      pendingMeasurements: 1000,
      capacityMeasurements: 1000,
    });
    expect(health.spoolBytes).toBeGreaterThan(0);
    expect(health.storageFailure?.message).toMatch("capacity");
  } finally {
    config.OPCUA_SPOOL_MAX_ENTRIES = 1_000_000;
  }
}, 60_000);
