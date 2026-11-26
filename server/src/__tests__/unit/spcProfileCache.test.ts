import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const rows: unknown[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    update: () => chain,
    set: () => chain,
    returning: () => Promise.resolve([{ id: 1 }]),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return { rows, chain, select: vi.fn(() => chain) };
});
vi.mock("../../database/db.js", () => ({
  default: { ...mocks.chain, update: () => mocks.chain },
  getReadDb: () => ({ ...mocks.chain, select: mocks.select }),
}));
import {
  clearActiveProfileCache,
  spcRepository,
} from "../../repositories/spcRepository.js";

beforeEach(() => {
  clearActiveProfileCache();
  mocks.select.mockClear();
});

it("looks up a signal's profiles once, not for every sample", async () => {
  for (let sample = 0; sample < 50; sample++)
    await spcRepository.listActiveProfilesByNodeKey("Temp", 1);
  expect(mocks.select).toHaveBeenCalledTimes(1);
  await spcRepository.listActiveProfilesByNodeKey("Temp", 2);
  expect(mocks.select).toHaveBeenCalledTimes(2);
});

it("reloads after a profile changes and after the TTL", async () => {
  await spcRepository.listActiveProfilesByNodeKey("Temp", 1);
  await spcRepository.updateProfile(1, { windowSize: 10 });
  await spcRepository.listActiveProfilesByNodeKey("Temp", 1);
  expect(mocks.select).toHaveBeenCalledTimes(2);
  vi.useFakeTimers({ now: Date.now() + 31_000 });
  try {
    await spcRepository.listActiveProfilesByNodeKey("Temp", 1);
    expect(mocks.select).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});
