import { canonicalJson } from "../utils/canonicalJson.js";

/** Generation times change on every run and say nothing about the evidence. */
export function reproducibleView(value: unknown): Record<string, unknown> {
  return JSON.parse(canonicalJson(value), (key, item) =>
    key === "generatedAt" ? undefined : item,
  );
}

/** Top-level report sections whose content differs between a saved and a regenerated report. */
export function changedSections(saved: unknown, current: unknown): string[] {
  const before = reproducibleView(saved),
    after = reproducibleView(current);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}
