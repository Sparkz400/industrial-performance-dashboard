import { expect, it, vi } from "vitest";

// The suggestion module opens sessions through commissioning; the name rule needs neither.
vi.mock("../../services/commissioningService.js", () => ({
  withMachineSession: vi.fn(),
}));
const { nameRole, ITEM_STATE_VALUES } =
  await import("../../services/mappingSuggestions.js");

it("guesses roles from browse names with rejects before goods before totals", () => {
  expect(
    [
      "NOKCount",
      "ScrapParts",
      "OKCount",
      "GoodParts",
      "PartsTotal",
      "MachineStatus",
      "Temperature",
    ].map(nameRole),
  ).toEqual(["reject", "reject", "good", "good", "total", "state", null]);
});

it("leaves Machinery NotAvailable unmapped", () => {
  expect(Object.values(ITEM_STATE_VALUES).flat().sort()).toEqual([1, 2, 3]);
});
