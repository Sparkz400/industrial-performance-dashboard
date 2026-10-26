import { expect, it, vi } from "vitest";
vi.mock("../../database/dbConnection.js", () => ({ default: {} }));
import { diskRunway } from "../../services/storageRunway.js";
it("uses real observed disk decline and leaves insufficient observations unknown", () => {
  expect(diskRunway(900, 100, 1000, 86400000).daysToReserve).toBe(8);
  expect(diskRunway(900, 100, 1000, 1000).daysToReserve).toBeNull();
  expect(diskRunway(1100, 100, 1000, 86400000).daysToReserve).toBeNull();
  expect(diskRunway(90, 100, 100, 86400000).daysToReserve).toBe(0);
});
