import { describe, expect, it } from "vitest";
import {
  estimateEnergyCosts,
  type EnergyTariff,
} from "../../services/energyCosts.js";
import type {
  EnergyMeter,
  EnergySample,
} from "../../services/energyAnalysis.js";
const start = new Date("2026-01-01T00:00:00Z"),
  end = new Date("2026-01-01T00:02:00Z");
const meter: EnergyMeter = {
  signal: {
    nodeKey: "Energy",
    namespaceUri: "urn:owned",
    identifier: "s=Energy",
    dataType: "Double",
    unit: "kWh",
    scale: 1,
  },
  maxGapSeconds: 60,
  modulus: null,
};
const point = (
  seconds: number,
  value: number | null,
  status = "Good",
): EnergySample => ({
  timestamp: new Date(+start + seconds * 1000),
  value,
  status_code: status,
  signal_metadata: { namespaceUri: "urn:owned", identifier: "s=Energy" },
});
const samples = [point(0, 1), point(60, 2), point(120, 4)];
const tariff: EnergyTariff = {
  id: 1,
  version: 1,
  valid_from: start,
  valid_to: end,
  currency: "EUR",
  price_per_kwh: 0.2,
  kg_co2e_per_kwh: 0.4,
  reference: "Owned factor",
};
describe("energy cost estimates", () => {
  it("walks sorted tariff periods without rereading every period for every sample", () => {
    let reads = 0;
    const data = Array.from({ length: 2001 }, (_, i) => point(i, i));
    const rates = Array.from({ length: 2000 }, (_, i) => ({
      ...tariff,
      id: i + 1,
      version: i + 1,
      get valid_from() {
        reads++;
        return new Date(+start + i * 1000);
      },
      get valid_to() {
        reads++;
        return new Date(+start + (i + 1) * 1000);
      },
    })).reverse();
    const result = estimateEnergyCosts(
      data,
      meter,
      start,
      new Date(+start + 2000000),
      rates,
    );
    expect(result.estimatedCost).toBeCloseTo(400);
    expect(result.tariffs).toHaveLength(2000);
    // One period parse and one evidence serialization; not samples multiplied by periods.
    expect(reads).toBeLessThanOrEqual(8000);
  });
  it("keeps arithmetic overflow and invalid factors unknown", () => {
    const huge = [point(0, 0), point(60, 1e308), point(120, 1e308)];
    const badScale = estimateEnergyCosts(
      huge,
      { ...meter, signal: { ...meter.signal, scale: 10 } },
      start,
      end,
      [tariff],
    );
    expect(badScale.energyComplete).toBe(false);
    expect(badScale.estimatedCost).toBeNull();
    const badCost = estimateEnergyCosts(huge, meter, start, end, [
      { ...tariff, price_per_kwh: 1e9 },
    ]);
    expect(badCost.costComplete).toBe(false);
    expect(badCost.estimatedCost).toBeNull();
    const badFactor = estimateEnergyCosts(huge, meter, start, end, [
      { ...tariff, kg_co2e_per_kwh: 1e6 },
    ]);
    expect(badFactor.emissionsComplete).toBe(false);
    expect(badFactor.estimatedKgCo2e).toBeNull();
    for (const factor of [NaN, Infinity, -1]) {
      const result = estimateEnergyCosts(samples, meter, start, end, [
        { ...tariff, price_per_kwh: factor, kg_co2e_per_kwh: factor },
      ]);
      expect(result.estimatedCost).toBeNull();
      expect(result.estimatedKgCo2e).toBeNull();
    }
  });
  it("uses observed deltas and immutable factors with reproducible evidence", () => {
    const result = estimateEnergyCosts(samples, meter, start, end, [tariff]);
    expect(result.estimatedCost).toBeCloseTo(0.6);
    expect(result.estimatedKgCo2e).toBeCloseTo(1.2);
    expect(result.costComplete).toBe(true);
    expect(result.inputDigest).toBe(
      estimateEnergyCosts(samples, meter, start, end, [{ ...tariff }])
        .inputDigest,
    );
  });
  it("keeps measured zero distinct from missing readings and missing factors", () => {
    expect(
      estimateEnergyCosts(
        [point(0, 0), point(60, 0), point(120, 0)],
        meter,
        start,
        end,
        [tariff],
      ).estimatedCost,
    ).toBe(0);
    expect(
      estimateEnergyCosts([], meter, start, end, [tariff]).estimatedCost,
    ).toBeNull();
    const result = estimateEnergyCosts(samples, meter, start, end, []);
    expect(result.estimatedCost).toBeNull();
    expect(result.observedCosts).toEqual({});
  });
  it("never invents an allocation across price boundaries, including subsecond boundaries", () => {
    const second = {
      ...tariff,
      id: 2,
      version: 2,
      valid_from: new Date(+start + 30000),
      price_per_kwh: 1,
    };
    const first = { ...tariff, valid_to: second.valid_from };
    const result = estimateEnergyCosts(samples, meter, start, end, [
      first,
      second,
    ]);
    expect(result.estimatedCost).toBeNull();
    expect(result.observedCosts.EUR).toBe(2);
    expect(result.unpricedPairs).toBe(1);
    expect(
      estimateEnergyCosts(samples, meter, start, end, [
        { ...tariff, valid_from: new Date(+start + 1) },
      ]).estimatedCost,
    ).toBeNull();
  });
  it("prices exact boundaries and refuses currency conversion", () => {
    const first = { ...tariff, valid_to: new Date(+start + 60000) };
    const second = {
      ...tariff,
      id: 2,
      version: 2,
      valid_from: first.valid_to,
      currency: "USD",
    };
    const result = estimateEnergyCosts(samples, meter, start, end, [
      first,
      second,
    ]);
    expect(result.estimatedCost).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.observedCosts).toEqual({ EUR: 0.2, USD: 0.4 });
  });
  it("missing optional emissions factors leave emissions unknown without erasing known cost", () => {
    const result = estimateEnergyCosts(samples, meter, start, end, [
      { ...tariff, kg_co2e_per_kwh: null },
    ]);
    expect(result.estimatedCost).toBeCloseTo(0.6);
    expect(result.estimatedKgCo2e).toBeNull();
    expect(result.observedKgCo2e).toBeNull();
  });
  it("rejects bad quality, undeclared resets and gaps as full estimates", () => {
    for (const data of [
      [point(0, 1), point(60, 2, "Bad"), point(120, 4)],
      [point(0, 10), point(60, 2), point(120, 4)],
      [point(0, 1), point(120, 4)],
    ])
      expect(
        estimateEnergyCosts(data, meter, start, end, [tariff]).estimatedCost,
      ).toBeNull();
  });
  it("respects Wh scale, declared rollovers and corrected-sample provenance", () => {
    const result = estimateEnergyCosts(
      [
        { ...point(0, 990), correctionRevision: 2 },
        point(60, 10),
        point(120, 20),
      ],
      { ...meter, modulus: 1000, signal: { ...meter.signal, unit: "Wh" } },
      start,
      end,
      [tariff],
    );
    expect(result.estimatedCost).toBeCloseTo(0.006);
    expect(result.correctedSampleCount).toBe(1);
    expect(result.inputDigest).not.toBe(
      estimateEnergyCosts(samples, meter, start, end, [tariff]).inputDigest,
    );
  });
});
