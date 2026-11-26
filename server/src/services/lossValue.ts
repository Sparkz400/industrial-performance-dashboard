import type { ShiftReport } from "@performance-dashboard/shared";

export interface ProductValue {
  product: string;
  currency: string;
  unitValue: number;
  scrapCost: number;
}

export interface LossValueLine {
  reason: string;
  seconds: number;
  /** Parts the stop cost at the ideal rate; null when the stop is not priced. */
  lostParts: number | null;
  value: number | null;
}

export interface LossValue {
  product: string;
  currency: string | null;
  lines: LossValueLine[];
  scrap: { parts: number | null; value: number | null };
  /** Sum of the priced amounts; unpriced parts are listed, never counted as zero. */
  total: number | null;
  unpricedSeconds: number;
}

// These rows are not lost capacity: unknown is not downtime, planned time is not a loss.
const NOT_PRICED = new Set(["Unknown data", "Planned break"]);

/**
 * Money value of one shift's (or product run's) stops and scrap: stop seconds at the ideal
 * cycle become lost parts at the product's unit value; rejected parts cost the scrap cost.
 */
export function lossValue(
  report: Pick<ShiftReport, "losses" | "reasons" | "quantities" | "job">,
  idealCycleMs: number,
  price: ProductValue | undefined,
): LossValue {
  const planned = new Set(
    report.reasons.filter((r) => r.category === "planned").map((r) => r.reason),
  );
  let unpricedSeconds = 0;
  const lines = report.losses.map((loss) => {
    const priced =
      !!price &&
      idealCycleMs > 0 &&
      !NOT_PRICED.has(loss.reason) &&
      !planned.has(loss.reason);
    if (!priced) {
      unpricedSeconds += loss.seconds;
      return { ...loss, lostParts: null, value: null };
    }
    const lostParts = (loss.seconds * 1000) / idealCycleMs;
    return { ...loss, lostParts, value: lostParts * price.unitValue };
  });
  const rejects = report.quantities.reject;
  const scrap = {
    parts: rejects,
    value: price && rejects != null ? rejects * price.scrapCost : null,
  };
  const amounts = [...lines.map((l) => l.value), scrap.value].filter(
    (v): v is number => v != null,
  );
  return {
    product: report.job.product,
    currency: price?.currency ?? null,
    lines,
    scrap,
    total: amounts.length ? amounts.reduce((a, b) => a + b, 0) : null,
    unpricedSeconds,
  };
}
