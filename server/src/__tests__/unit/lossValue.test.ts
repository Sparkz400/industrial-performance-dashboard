import { expect, it } from "vitest";
import { lossValue } from "../../services/lossValue.js";

const report = {
  job: { reference: "J1", product: "Bracket", target: null },
  quantities: { total: 110, good: 100, reject: 10 },
  reasons: [
    { reason: "Cleaning", category: "planned" },
    { reason: "Jam at infeed", category: "unplanned" },
  ],
  losses: [
    { reason: "Jam at infeed", seconds: 600 },
    { reason: "Unclassified stop", seconds: 120 },
    { reason: "Cleaning", seconds: 300 },
    { reason: "Planned break", seconds: 900 },
    { reason: "Unknown data", seconds: 60 },
  ],
} as never;
const price = {
  product: "Bracket",
  currency: "EUR",
  unitValue: 2.5,
  scrapCost: 4,
};

it("prices unplanned stops at the ideal rate and rejects at the scrap cost", () => {
  // 6 s ideal cycle: 600 s jam = 100 lost parts = 250 EUR; 120 s = 20 parts = 50 EUR.
  const value = lossValue(report, 6000, price);
  expect(value.lines.map((l) => l.value)).toEqual([250, 50, null, null, null]);
  expect(value.scrap).toEqual({ parts: 10, value: 40 });
  expect(value.total).toBe(340);
  expect(value.currency).toBe("EUR");
  // Planned and unknown time are listed but never priced.
  expect(value.unpricedSeconds).toBe(300 + 900 + 60);
});

it("leaves everything unpriced without a product value", () => {
  const value = lossValue(report, 6000, undefined);
  expect(value.total).toBeNull();
  expect(value.scrap.value).toBeNull();
  expect(value.lines.every((l) => l.value === null)).toBe(true);
});

it("does not price scrap when the reject count is unknown", () => {
  const unknownRejects = {
    ...(report as object),
    quantities: { total: null, good: null, reject: null },
  };
  expect(lossValue(unknownRejects as never, 6000, price).scrap).toEqual({
    parts: null,
    value: null,
  });
});
