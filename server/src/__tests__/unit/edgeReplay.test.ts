import { expect, it, vi } from "vitest";
// Scripted transaction: every awaited step resolves to the next queued value.
const mocks = vi.hoisted(() => {
  const inserted: unknown[][] = [];
  const results: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const step of [
    "select",
    "from",
    "where",
    "for",
    "update",
    "set",
    "orderBy",
    "limit",
    "insert",
    "onConflictDoNothing",
  ])
    chain[step] = () => chain;
  chain.values = (rows: unknown) => {
    if (Array.isArray(rows)) inserted.push(rows);
    return chain;
  };
  chain.returning = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve(results.shift());
  return {
    inserted,
    results,
    db: { transaction: async (work: (tx: unknown) => unknown) => work(chain) },
  };
});
vi.mock("../../database/db.js", () => ({ default: mocks.db }));
import { ingestBatch, type EdgeBatch } from "../../services/edgeCentral.js";

const edge = { id: 3, name: "Hall B" } as never;
const batch: EdgeBatch = {
  schemaVersion: 1,
  softwareVersion: "1.0",
  backlog: 0,
  cursor: 2,
  appliedConfigRevision: 0,
  configRejection: null,
  machines: [{ id: 9, name: "Press", definitionDigest: "d" }],
  rows: [
    {
      id: 1,
      machineId: 9,
      eventId: "ev-1",
      nodeKey: "Count",
      timestamp: "2026-01-01T00:00:00Z",
      value: 1,
      statusCode: "Good",
    },
    {
      id: 2,
      machineId: 9,
      nodeKey: "Count",
      timestamp: "2026-01-01T00:00:01Z",
      value: 2,
      statusCode: "Good",
    },
  ],
} as never;

const run = () => {
  mocks.results.push(
    [{ id: 3, name: "Hall B", revokedAt: null, plantId: 1 }], // lock the edge row
    [{ machineId: 40 }], // known remote machine
    [{ id: 1 }], // rows stored this time
    undefined, // edge status update
    [], // no newer config
  );
  return ingestBatch(edge, batch);
};

it("gives replayed rows the same stable event identity, so nothing is stored twice", async () => {
  await run();
  await run();
  const [first, second] = mocks.inserted as {
    eventId: string;
    machineId: number;
  }[][];
  expect(first.map((r) => r.eventId)).toEqual(["edge3:ev-1", "edge3:row2"]);
  expect(second.map((r) => r.eventId)).toEqual(first.map((r) => r.eventId));
  expect(first.every((r) => r.machineId === 40)).toBe(true);
});

it("rejects rows from undeclared machines or beyond the cursor before writing", async () => {
  await expect(
    ingestBatch(edge, { ...batch, machines: [] } as EdgeBatch),
  ).rejects.toThrow(/declared/);
  await expect(
    ingestBatch(edge, { ...batch, cursor: 1 } as EdgeBatch),
  ).rejects.toThrow(/cursor/);
  await expect(
    ingestBatch(edge, { ...batch, schemaVersion: 99 } as EdgeBatch),
  ).rejects.toThrow(/Schema version/);
});
