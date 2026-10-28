import type { ShiftReport } from "./production.js";

export type ComparisonReason =
  | "unverified"
  | "coverage"
  | "schedule"
  | "duration"
  | "definitions"
  | "product-mix"
  | "unfinished"
  | "energy-unavailable"
  | "energy-definition";
export interface ComparisonPeriod {
  revisionId: number;
  digest: string;
  savedAt: string;
  savedBy: number;
  latestRevisionId: number;
  report: ShiftReport;
  productMix: {
    product: string;
    idealCycleMs: number;
    scheduledSeconds: number;
  }[];
  unassignedScheduledSeconds: number;
}
export interface PeriodComparison {
  version: "period-comparison-v1";
  machineId: number;
  before: ComparisonPeriod;
  after: ComparisonPeriod;
  comparable: boolean;
  reasons: ComparisonReason[];
  metrics: {
    key:
      | "goodPerHour"
      | "availability"
      | "quality"
      | "oee"
      | "idleFaultSeconds"
      | "kWhPerGoodPart";
    unit: "parts/hour" | "%" | "seconds" | "kWh/part";
    before: number | null;
    after: number | null;
    delta: number | null;
    reasons: ComparisonReason[];
  }[];
  interventions: {
    id: number;
    planId: number;
    note: string;
    createdBy: number;
    createdAt: string;
  }[];
  interventionsTruncated: boolean;
  interventionsReadAt: string;
}
