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
  const failedRows = mocks.values.mock.calls[0][0];
  await worker.stop();
  worker = new OpcuaQueueWorker();
  await worker.processBatch();
  expect(mocks.values.mock.calls[1][0]).toEqual(failedRows);
  await worker.processBatch();
  expect(mocks.values).toHaveBeenCalledTimes(2);
});
