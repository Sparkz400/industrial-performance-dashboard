import { Router } from "express";
import Joi from "joi";
import { createHash } from "node:crypto";
import { and, eq, gte, lte, asc, desc } from "drizzle-orm";
import db from "../database/db.js";
import {
  shiftReportRevisions,
  productionShifts,
  maintenanceEvents,
  maintenancePlans,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { validateParams, validateQuery } from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import {
  comparePeriods,
  type ComparisonSnapshot,
} from "../services/periodComparison.js";
import { canonicalJson } from "../utils/canonicalJson.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

const router = Router();
router.get(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
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
    const read = async (id: number) => {
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
    };
    const [before, after] = await Promise.all([
      read(Number(req.query.before)),
      read(Number(req.query.after)),
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
export default router;
