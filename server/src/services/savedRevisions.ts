import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import db from "../database/db.js";
import { productionShifts, shiftReportRevisions } from "../database/schema.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import type { ComparisonSnapshot } from "./periodComparison.js";

type RevisionRow = typeof shiftReportRevisions.$inferSelect;

/** A saved revision whose snapshot has the expected shape and still matches its digest. */
export function isIntact(revision: RevisionRow, machineId: number) {
  const snapshot = revision.snapshot as ComparisonSnapshot;
  return Boolean(
    snapshot &&
    snapshot.revision === "shift-v1" &&
    snapshot.machineId === machineId &&
    snapshot.id === revision.shiftId &&
    snapshot.profile &&
    snapshot.seconds &&
    snapshot.quantities &&
    snapshot.oee &&
    snapshot.job &&
    Array.isArray(snapshot.reasons) &&
    Array.isArray(snapshot.issues) &&
    [snapshot.start, snapshot.end, snapshot.generatedAt].every((date) =>
      Number.isFinite(Date.parse(date)),
    ) &&
    Date.parse(snapshot.end) > Date.parse(snapshot.start) &&
    createHash("sha256").update(canonicalJson(snapshot)).digest("hex") ===
      revision.digest,
  );
}

/**
 * The latest saved revision of each of the machine's shifts, oldest shift first. Revisions
 * that fail the integrity check are counted, not used.
 */
export async function latestRevisions(machineId: number, limit = 500) {
  const rows = await db
    .selectDistinctOn([shiftReportRevisions.shiftId], {
      revision: shiftReportRevisions,
    })
    .from(shiftReportRevisions)
    .innerJoin(
      productionShifts,
      eq(productionShifts.id, shiftReportRevisions.shiftId),
    )
    .where(eq(productionShifts.machineId, machineId))
    .orderBy(shiftReportRevisions.shiftId, desc(shiftReportRevisions.id))
    .limit(limit);
  const intact = rows
    .map((row) => row.revision)
    .filter((revision) => isIntact(revision, machineId))
    .map((revision) => ({
      revisionId: revision.id,
      shiftId: revision.shiftId,
      snapshot: revision.snapshot as ComparisonSnapshot,
    }))
    .sort(
      (a, b) =>
        Date.parse(a.snapshot.start) - Date.parse(b.snapshot.start) ||
        a.revisionId - b.revisionId,
    );
  return { revisions: intact, failedIntegrity: rows.length - intact.length };
}
