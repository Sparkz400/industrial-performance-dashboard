import { Router } from "express";
import Joi from "joi";
import { asc, desc, eq } from "drizzle-orm";
import type { ProductRun, ShiftReport } from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  inspectionPlans,
  jobInspections,
  productionShifts,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import {
  currentInspections,
  summarizeInspections,
} from "../services/jobInspections.js";

// Q03: inspection plans per product and manual inspections of a shift's product or job.
const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The shift's products: its job and every product run. */
function products(shift: typeof productionShifts.$inferSelect) {
  const job = shift.job as ShiftReport["job"];
  return [
    ...new Set(
      [
        job.product,
        ...(shift.runs as ProductRun[]).map((r) => r.product),
      ].filter(Boolean),
    ),
  ];
}

async function currentPlans(
  database: Pick<typeof db, "select">,
  machineId: number,
  names: string[],
) {
  const rows = await database
    .select()
    .from(inspectionPlans)
    .where(eq(inspectionPlans.machineId, machineId))
    .orderBy(desc(inspectionPlans.id));
  return names.flatMap(
    (product) => rows.find((p) => p.product === product) ?? [],
  );
}

router.get(
  "/machines/:id/inspection-plans",
  validateParams(id),
  asyncHandler(async (req, res) => {
    res.json(
      await db
        .select()
        .from(inspectionPlans)
        .where(eq(inspectionPlans.machineId, Number(req.params.id)))
        .orderBy(desc(inspectionPlans.id))
        .limit(200),
    );
  }),
);
router.post(
  "/machines/:id/inspection-plans",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      product: Joi.string().trim().min(1).max(160).required(),
      checks: Joi.array()
        .items(Joi.string().trim().min(1).max(200))
        .min(1)
        .max(30)
        .unique()
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const [saved] = await db
      .insert(inspectionPlans)
      .values({
        machineId: Number(req.params.id),
        product: req.body.product,
        checks: req.body.checks,
        createdBy: req.session.userId!,
      })
      .returning();
    res.status(201).json(saved);
  }),
);

router.get(
  "/shifts/:id/inspections",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const [shift] = await db
      .select()
      .from(productionShifts)
      .where(eq(productionShifts.id, Number(req.params.id)));
    if (!shift) throw new NotFoundError("Shift");
    const plans = await currentPlans(db, shift.machineId, products(shift));
    const rows = await db
      .select()
      .from(jobInspections)
      .where(eq(jobInspections.shiftId, shift.id))
      .orderBy(asc(jobInspections.id))
      .limit(2001);
    const current = new Set(currentInspections(rows).map((r) => r.id));
    res.json({
      source: "manual inspection",
      products: products(shift),
      plans,
      inspections: rows
        .slice(0, 2000)
        .map((r) => ({ ...r, current: current.has(r.id) })),
      summary: summarizeInspections(rows, plans),
      truncated: rows.length > 2000,
    });
  }),
);

router.post(
  "/shifts/:id/inspections",
  validateParams(id),
  validateBody(
    Joi.object({
      requestId: Joi.string().uuid().required(),
      product: Joi.string().trim().min(1).max(160).required(),
      check: Joi.string().trim().min(1).max(200).required(),
      result: Joi.string().valid("pass", "fail", "unknown").required(),
      quantity: Joi.number().integer().positive().max(1000000000).required(),
      defectReason: Joi.string()
        .trim()
        .max(500)
        .when("result", {
          is: "fail",
          then: Joi.required(),
          otherwise: Joi.valid(null).default(null),
        }),
      note: Joi.string().trim().max(2000).allow("").default(""),
      reinspectsId: Joi.number().integer().positive().allow(null).default(null),
      supersedesId: Joi.number().integer().positive().allow(null).default(null),
      correctionReason: Joi.string()
        .trim()
        .max(500)
        .when("supersedesId", {
          is: Joi.number().required(),
          then: Joi.required(),
          otherwise: Joi.valid(null).default(null),
        }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (body.reinspectsId && body.supersedesId)
      throw new ValidationError(
        "Record either a correction or a reinspection, not both",
      );
    const saved = await db.transaction(async (tx: Tx) => {
      const [shift] = await tx
        .select()
        .from(productionShifts)
        .where(eq(productionShifts.id, Number(req.params.id)))
        .for("update");
      if (!shift) throw new NotFoundError("Shift");
      const [replayed] = await tx
        .select()
        .from(jobInspections)
        .where(eq(jobInspections.requestId, body.requestId));
      if (replayed) {
        const same =
          replayed.shiftId === shift.id &&
          replayed.product === body.product &&
          replayed.checkName === body.check &&
          replayed.result === body.result &&
          replayed.quantity === body.quantity &&
          replayed.defectReason === body.defectReason &&
          replayed.note === body.note &&
          replayed.createdBy === req.session.userId;
        if (!same)
          throw new ConflictError(
            "Request ID already identifies different inspection evidence",
          );
        return replayed;
      }
      if (!products(shift).includes(body.product))
        throw new ValidationError(
          "Inspect a product of this shift's job or runs",
        );
      const rows = await tx
        .select()
        .from(jobInspections)
        .where(eq(jobInspections.shiftId, shift.id));
      const current = currentInspections(rows);
      const find = (target: number | null) =>
        target == null ? undefined : current.find((r) => r.id === target);
      let reinspectsId: number | null = body.reinspectsId;
      if (body.supersedesId) {
        const target = find(body.supersedesId);
        if (!target)
          throw new ConflictError(
            "Correct only a current inspection of this shift",
          );
        if (target.product !== body.product || target.checkName !== body.check)
          throw new ValidationError(
            "A correction keeps the product and check of the inspection it corrects",
          );
        if (current.some((r) => r.reinspectsId === target.id))
          throw new ConflictError(
            "Correct the reinspections of this inspection first",
          );
        reinspectsId = target.reinspectsId;
      } else if (body.reinspectsId) {
        const target = find(body.reinspectsId);
        if (
          !target ||
          target.reinspectsId != null ||
          target.result !== "fail" ||
          target.product !== body.product ||
          target.checkName !== body.check
        )
          throw new ValidationError(
            "A reinspection re-checks a current failed inspection of the same product and check",
          );
        const cleared = current
          .filter((r) => r.reinspectsId === target.id && r.result === "pass")
          .reduce((n, r) => n + r.quantity, 0);
        if (body.quantity > target.quantity - cleared)
          throw new ValidationError(
            "Reinspect at most the parts of that inspection that are still failed",
          );
      }
      const [plan] = await currentPlans(tx, shift.machineId, [body.product]);
      const [row] = await tx
        .insert(jobInspections)
        .values({
          requestId: body.requestId,
          shiftId: shift.id,
          product: body.product,
          planId: plan?.checks.includes(body.check) ? plan.id : null,
          checkName: body.check,
          result: body.result,
          quantity: body.quantity,
          defectReason: body.defectReason,
          note: body.note,
          reinspectsId,
          supersedesId: body.supersedesId,
          correctionReason: body.correctionReason,
          createdBy: req.session.userId!,
        })
        .returning();
      return row;
    });
    res.status(201).json(saved);
  }),
);

export default router;
