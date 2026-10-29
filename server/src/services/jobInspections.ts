export interface InspectionRecord {
  id: number;
  product: string;
  checkName: string;
  result: string;
  quantity: number;
  reinspectsId: number | null;
  supersedesId: number | null;
}

/** Records no correction has superseded. */
export function currentInspections<T extends InspectionRecord>(rows: T[]) {
  const replaced = new Set(rows.map((r) => r.supersedesId));
  return rows.filter((r) => !replaced.has(r.id));
}

/**
 * Per product and check: parts inspected first time, passed, failed, unknown, and reworked
 * (failed parts a passing reinspection cleared). A reworked part counts once, never as both
 * scrap and good output. Plan checks without any inspection are listed as missing.
 */
export function summarizeInspections(
  rows: InspectionRecord[],
  plans: { product: string; checks: string[] }[],
) {
  const current = currentInspections(rows);
  const byId = new Map(current.map((r) => [r.id, r]));
  const checks = new Map<
    string,
    {
      product: string;
      check: string;
      inspected: number;
      passed: number;
      failed: number;
      reworked: number;
      unknown: number;
    }
  >();
  const entry = (product: string, check: string) => {
    const key = JSON.stringify([product, check]);
    if (!checks.has(key))
      checks.set(key, {
        product,
        check,
        inspected: 0,
        passed: 0,
        failed: 0,
        reworked: 0,
        unknown: 0,
      });
    return checks.get(key)!;
  };
  for (const r of current)
    if (r.reinspectsId == null) {
      const e = entry(r.product, r.checkName);
      e.inspected += r.quantity;
      if (r.result === "pass") e.passed += r.quantity;
      else if (r.result === "fail") e.failed += r.quantity;
      else e.unknown += r.quantity;
    }
  for (const r of current) {
    const original = r.reinspectsId == null ? null : byId.get(r.reinspectsId);
    if (!original || r.result !== "pass") continue;
    const e = entry(original.product, original.checkName),
      moved = Math.min(r.quantity, e.failed);
    e.failed -= moved;
    e.reworked += moved;
  }
  return {
    checks: [...checks.values()],
    missing: plans.flatMap((p) =>
      p.checks
        .filter((check) => !checks.has(JSON.stringify([p.product, check])))
        .map((check) => ({ product: p.product, check })),
    ),
  };
}
