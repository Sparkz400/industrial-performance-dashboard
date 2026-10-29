import { Router } from "express";
import Joi from "joi";
import { createHash } from "node:crypto";
import { and, eq, gte, lte, asc, desc, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  improvementActions,
  shiftReportRevisions,
  productionShifts,
  maintenanceEvents,
  maintenancePlans,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import {
  comparePeriods,
  type ComparisonSnapshot,
} from "../services/periodComparison.js";
import { evaluateImprovement } from "../services/improvementEvaluation.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";

const router = Router();
const machineParams = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);

/** A saved revision of one of the machine's shifts whose snapshot still matches its digest. */
async function readRevision(machineId: number, id: number) {
  const [row] = await db
    .select({ revision: shiftReportRevisions })
    .from(shiftReportRevisions)
    .innerJoin(
      productionShifts,
      eq(productionShifts.id, shiftReportRevisions.shiftId),
    )
    .where(
      and(
        eq(shiftReportRevisions.id, id),
        eq(productionShifts.machineId, machineId),
      ),
    );
  if (!row) throw new NotFoundError("Report revision for this machine");
  const revision = row.revision,
    snapshot = revision.snapshot as ComparisonSnapshot;
  if (
    !snapshot ||
    snapshot.revision !== "shift-v1" ||
    snapshot.machineId !== machineId ||
    snapshot.id !== revision.shiftId ||
    !snapshot.profile ||
    !snapshot.seconds ||
    !snapshot.quantities ||
    !snapshot.oee ||
    !snapshot.job ||
    !Array.isArray(snapshot.reasons) ||
    !Array.isArray(snapshot.issues) ||
    ![snapshot.start, snapshot.end, snapshot.generatedAt].every((date) =>
      Number.isFinite(Date.parse(date)),
    ) ||
    Date.parse(snapshot.end) <= Date.parse(snapshot.start) ||
    createHash("sha256").update(canonicalJson(snapshot)).digest("hex") !==
      revision.digest
  )
    throw new ConflictError(
      "Report revision cannot be verified; save a new revision before comparing",
    );
  const [latest] = await db
    .select({ id: shiftReportRevisions.id })
    .from(shiftReportRevisions)
    .where(eq(shiftReportRevisions.shiftId, revision.shiftId))
    .orderBy(desc(shiftReportRevisions.id))
    .limit(1);
  return { revision: { ...revision, snapshot }, latest: latest.id };
}

router.get(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  machineParams,
  validateQuery(
    Joi.object({
      before: Joi.number().integer().positive().required(),
      after: Joi.number().integer().positive().required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const [before, after] = await Promise.all([
      readRevision(machineId, Number(req.query.before)),
      readRevision(machineId, Number(req.query.after)),
    ]);
    const comparison = comparePeriods(before.revision, after.revision, [
      before.latest,
      after.latest,
    ]);
    const interventions = await db
      .select({
        id: maintenanceEvents.id,
        planId: maintenanceEvents.planId,
        note: maintenanceEvents.note,
        createdBy: maintenanceEvents.createdBy,
        createdAt: maintenanceEvents.createdAt,
      })
      .from(maintenanceEvents)
      .innerJoin(
        maintenancePlans,
        eq(maintenancePlans.id, maintenanceEvents.planId),
      )
      .where(
        and(
          eq(maintenancePlans.machineId, machineId),
          eq(maintenanceEvents.serviced, true),
          gte(
            maintenanceEvents.createdAt,
            new Date(comparison.before.report.end),
          ),
          lte(
            maintenanceEvents.createdAt,
            new Date(comparison.after.report.start),
          ),
        ),
      )
      .orderBy(asc(maintenanceEvents.createdAt), asc(maintenanceEvents.id))
      .limit(101);
    res.json({
      ...comparison,
      interventions: interventions.slice(0, 100),
      interventionsTruncated: interventions.length > 100,
      interventionsReadAt: new Date().toISOString(),
    });
  }),
);

/** The latest saved revision of each of the machine's shifts, newest shift first. */
router.get(
  "/machines/:id/revisions",
  requireRole("admin", "supervisor"),
  machineParams,
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (s.id) r.id AS "revisionId", s.id AS "shiftId", s.name AS "shiftName",
        s.start, s."end", r.created_at AS "savedAt"
      FROM ${shiftReportRevisions} r JOIN ${productionShifts} s ON s.id = r.shift_id
      WHERE s.machine_id = ${machineId}
      ORDER BY s.id, r.id DESC`);
    res.json(
      [...rows.rows]
        .sort(
          (a, b) => Date.parse(String(b.start)) - Date.parse(String(a.start)),
        )
        .slice(0, 200),
    );
  }),
);

async function evaluate(
  machineId: number,
  action: typeof improvementActions.$inferSelect,
) {
  const load = (ids: number[]) =>
    Promise.all(
      ids.map(
        async (id) => (await readRevision(machineId, id)).revision.snapshot,
      ),
    );
  return {
    ...action,
    evaluation: evaluateImprovement(
      action.implementedAt,
      await load(action.beforeRevisionIds),
      await load(action.afterRevisionIds),
    ),
  };
}

router.get(
  "/machines/:id/actions",
  requireRole("admin", "supervisor"),
  machineParams,
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const actions = await db
      .select()
      .from(improvementActions)
      .where(eq(improvementActions.machineId, machineId))
      .orderBy(desc(improvementActions.id))
      .limit(50);
    const evaluated = [];
    // One revision that no longer verifies marks only its own action as unverifiable.
    for (const action of actions)
      evaluated.push(
        await evaluate(machineId, action).catch((error: Error) => ({
          ...action,
          evaluation: null,
          problem: error.message,
        })),
      );
    res.json(evaluated);
  }),
);

const revisionIds = Joi.array()
  .items(Joi.number().integer().positive())
  .min(1)
  .max(31)
  .unique()
  .required();
router.post(
  "/machines/:id/actions",
  requireRole("admin", "supervisor"),
  machineParams,
  validateBody(
    Joi.object({
      title: Joi.string().trim().min(1).max(200).required(),
      description: Joi.string().trim().min(1).max(4000).required(),
      implementedAt: Joi.date().iso().required(),
      beforeRevisionIds: revisionIds,
      afterRevisionIds: revisionIds,
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const implementedAt = new Date(req.body.implementedAt);
    const sides = [req.body.beforeRevisionIds, req.body.afterRevisionIds] as [
      number[],
      number[],
    ];
    const [before, after] = await Promise.all(
      sides.map((ids) =>
        Promise.all(ids.map((id) => readRevision(machineId, id))),
      ),
    );
    const shifts = [...before, ...after].map((r) => r.revision.shiftId);
    if (new Set(shifts).size !== shifts.length)
      throw new ValidationError(
        "Choose each shift once, on one side of the action",
      );
    if (
      before.some(
        (r) => Date.parse(r.revision.snapshot.end) > implementedAt.getTime(),
      ) ||
      after.some(
        (r) => Date.parse(r.revision.snapshot.start) < implementedAt.getTime(),
      )
    )
      throw new ValidationError(
        "Before shifts must end by the action and after shifts start after it",
      );
    const [saved] = await db
      .insert(improvementActions)
      .values({
        machineId,
        title: req.body.title,
        description: req.body.description,
        implementedAt,
        beforeRevisionIds: sides[0],
        afterRevisionIds: sides[1],
        createdBy: req.session.userId!,
      })
      .returning();
    res.status(201).json(await evaluate(machineId, saved));
  }),
);
export default router;
