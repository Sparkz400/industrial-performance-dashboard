import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ShiftReport } from "@performance-dashboard/shared";
import type { calculateShift } from "./shiftCalculation.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import { ValidationError } from "../utils/errors.js";

const evidenceLimit = 32 * 1024 * 1024;

export async function shiftEvidence(
  report: ShiftReport,
  calculations: Parameters<typeof calculateShift>[0][],
  revisions: {
    id: number;
    digest: string;
    reason: string | null;
    createdAt: Date;
  }[],
) {
  // Handover names and free-text notes are unrelated to the OEE calculation.
  const production = JSON.parse(
    JSON.stringify(report, (key, value) =>
      key === "handover" ? undefined : value,
    ),
  );
  const calculator = await readFile(
    new URL("../../assets/shiftCalculation.ts", import.meta.url),
  );
  const payload = {
    format: "performance-dashboard-shift-evidence-v1",
    exportedAt: new Date().toISOString(),
    sourceRevision: process.env.SOURCE_REVISION ?? "unversioned",
    calculatorSha256: createHash("sha256")
      .update(calculator.toString("utf8").replace(/\r\n/g, "\n"))
      .digest("hex"),
    privacy:
      "Contains production names, references, reason text, timestamps and numeric record/actor IDs. Handover notes, usernames, credentials and endpoints are excluded. Review before sharing.",
    scope:
      "Current retained inputs, one shift and its product runs. Revision entries are historical references, not reproduced snapshots. Hashes detect changes; they do not authenticate a publisher or prove physical accuracy.",
    report: production,
    calculations,
    revisions,
  };
  const text = canonicalJson(payload);
  if (Buffer.byteLength(text) > evidenceLimit)
    throw new ValidationError(
      "Evidence exceeds 32 MiB; export a smaller shift",
    );
  return { payload, sha256: createHash("sha256").update(text).digest("hex") };
}
