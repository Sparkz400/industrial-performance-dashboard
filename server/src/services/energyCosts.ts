import { createHash } from "node:crypto";
import type { ShiftReport } from "@performance-dashboard/shared";
import {
  calculateEnergy,
  loadEnergySamples,
  type EnergyMeter,
  type EnergySample,
} from "./energyAnalysis.js";
import manager from "../database/dbConnection.js";
import { canonicalJson } from "../utils/canonicalJson.js";

export interface EnergyTariff {
  id: number;
  version: number;
  valid_from: Date | string;
  valid_to: Date | string;
  currency: string;
  price_per_kwh: number;
  kg_co2e_per_kwh: number | null;
  reference: string;
}
export function estimateEnergyCosts(
  samples: EnergySample[],
  meter: EnergyMeter,
  start: Date,
  end: Date,
  tariffs: EnergyTariff[],
) {
  const energy = calculateEnergy(samples, meter, start, end, []);
  const periods = tariffs
    .map((tariff) => ({
      tariff,
      from: new Date(tariff.valid_from).getTime(),
      to: new Date(tariff.valid_to).getTime(),
    }))
    .sort((a, b) => a.from - b.from);
  let periodIndex = 0;
  const costs: Record<string, number> = {};
  let pricedSeconds = 0,
    emissionSeconds = 0,
    observedKgCo2e = 0,
    pricedPairs = 0,
    emissionPairs = 0,
    unpricedPairs = 0;
  const used = new Set<number>();
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const measured = calculateEnergy([a, b], meter, start, end, []);
    if (measured.observedKWh === null) continue;
    while (
      periodIndex < periods.length &&
      periods[periodIndex].to <= a.timestamp.getTime()
    )
      periodIndex++;
    const period = periods[periodIndex],
      next = periods[periodIndex + 1];
    // A meter delta cannot be split across prices without assuming when energy was used.
    // Saved periods cannot overlap. Defensively leave an ambiguous input unpriced too.
    if (
      !period ||
      period.from > a.timestamp.getTime() ||
      period.to < b.timestamp.getTime() ||
      (next && next.from < b.timestamp.getTime())
    ) {
      unpricedPairs++;
      continue;
    }
    const tariff = period.tariff,
      seconds = (b.timestamp.getTime() - a.timestamp.getTime()) / 1000;
    const nextCost =
      (costs[tariff.currency] ?? 0) +
      measured.observedKWh * tariff.price_per_kwh;
    if (!Number.isFinite(nextCost) || tariff.price_per_kwh < 0) {
      unpricedPairs++;
      continue;
    }
    used.add(tariff.id);
    costs[tariff.currency] = nextCost;
    pricedPairs++;
    pricedSeconds += seconds;
    if (tariff.kg_co2e_per_kwh !== null) {
      const nextEmissions =
        observedKgCo2e + measured.observedKWh * tariff.kg_co2e_per_kwh;
      if (!Number.isFinite(nextEmissions) || tariff.kg_co2e_per_kwh < 0)
        continue;
      observedKgCo2e = nextEmissions;
      emissionSeconds += seconds;
      emissionPairs++;
    }
  }
  const currencies = Object.keys(costs),
    seconds = (end.getTime() - start.getTime()) / 1000;
  const costComplete =
    energy.complete && pricedSeconds === seconds && currencies.length === 1;
  const emissionsComplete = energy.complete && emissionSeconds === seconds;
  return {
    observedKWh: energy.observedKWh,
    energyComplete: energy.complete,
    observedCosts: costs,
    estimatedCost: costComplete ? costs[currencies[0]] : null,
    currency: currencies.length === 1 ? currencies[0] : null,
    observedKgCo2e: emissionPairs ? observedKgCo2e : null,
    estimatedKgCo2e: emissionsComplete ? observedKgCo2e : null,
    costComplete,
    emissionsComplete,
    coveredSeconds: energy.coveredSeconds,
    pricedSeconds,
    emissionSeconds,
    pricedPairs,
    unpricedPairs,
    tariffs: tariffs.filter((tariff) => used.has(tariff.id)),
    correctedSampleCount: samples.filter(
      (sample) => (sample.correctionRevision ?? 0) > 0,
    ).length,
    inputDigest: createHash("sha256")
      .update(canonicalJson({ samples, meter, start, end, tariffs }))
      .digest("hex"),
    assumptions:
      "Estimates use observed cumulative-meter deltas and user-supplied factors. Deltas crossing a tariff boundary remain unpriced; missing energy or factors never become zero. Currencies are not converted. Taxes, demand charges and fixed charges are excluded. Not billing-grade or certified emissions evidence.",
  };
}
export async function energyCostEstimate(report: ShiftReport) {
  const source = await loadEnergySamples(report);
  if (!source) return { configured: false };
  const tariffs = (
    await manager.pool.query<EnergyTariff>(
      "SELECT * FROM energy_tariffs WHERE machine_id=$1 AND valid_from<$3 AND valid_to>$2 ORDER BY valid_from LIMIT 1001",
      [report.machineId, report.start, report.end],
    )
  ).rows;
  return {
    configured: true,
    shiftId: report.id,
    machineId: report.machineId,
    start: report.start,
    end: report.end,
    meterVersion: source.meter.version,
    ...estimateEnergyCosts(
      source.rows,
      source.config,
      new Date(report.start),
      new Date(report.end),
      tariffs,
    ),
  };
}
