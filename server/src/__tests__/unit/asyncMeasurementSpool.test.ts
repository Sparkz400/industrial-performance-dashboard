import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncMeasurementSpool } from "../../queue/asyncMeasurementSpool.js";
import { MeasurementSpool } from "../../queue/measurementSpool.js";

const limits = { maxEntries: 2000, minFreeBytes: 0 };
const sample = (value: number) => ({
  key: "Count",
  label: "Count",
  value,
  timestamp: new Date(),
  eventId: `owned-${value}`,
});
const directories: string[] = [];
const spools: AsyncMeasurementSpool[] = [];
const create = (filename = ":memory:") => {
  const spool = new AsyncMeasurementSpool(filename, limits);
  spools.push(spool);
  return spool;
};
afterEach(async () => {
  await Promise.all(
    spools.splice(0).map((spool) => spool.close().catch(() => {})),
  );
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("commits before resolving, preserves order and identity, and drains writes on shutdown", async () => {
  const directory = mkdtempSync(join(tmpdir(), "async-spool-"));
  directories.push(directory);
  const path = join(directory, "queue.sqlite"),
    spool = create(path);
  const writes = Array.from({ length: 10 }, (_, i) => spool.enqueue(sample(i)));
  const close = spool.close();
  await Promise.all(writes);
  await close;
  const disk = new MeasurementSpool(path, limits);
  expect(disk.peek(20).map((row) => row.data.value)).toEqual(
    Array.from({ length: 10 }, (_, i) => i),
  );
  disk.close();
  const reopened = create(path);
  await reopened.enqueue(sample(0));
  expect((await reopened.health()).pendingMeasurements).toBe(10);
  await expect(spool.enqueue(sample(11))).rejects.toThrow();
});

it("rolls back the whole batch and rejects every acceptance when a sample is invalid", async () => {
  const spool = create();
  const results = await Promise.allSettled([
    spool.enqueue(sample(1)),
    spool.enqueue({ ...sample(2), value: NaN }),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "rejected",
    "rejected",
  ]);
  expect((await spool.health()).pendingMeasurements).toBe(0);
});

it("bounds uncommitted input and reports storage thread failures", async () => {
  const spool = create();
  const results = await Promise.allSettled(
    Array.from({ length: 1001 }, (_, i) => spool.enqueue(sample(i))),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1000);
  expect(results[1000]).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({
      message: expect.stringContaining("backlog capacity"),
    }),
  });
  expect((await spool.health()).pendingMeasurements).toBe(1000);
  const directory = mkdtempSync(join(tmpdir(), "refused-spool-"));
  directories.push(directory);
  const refused = create(directory);
  await expect(refused.enqueue(sample(1))).rejects.toThrow();
  await expect(refused.health()).rejects.toThrow();
});
