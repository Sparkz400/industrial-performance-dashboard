import { Router } from "express";
import Joi from "joi";
import { and, eq, desc, asc, gte, lte, sql } from "drizzle-orm";
import type {
  ProductionProfile,
  DowntimeReason,
  ShiftReport,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  machines,
  machineProfiles,
  productionShifts,
  downtimeReasons,
  opcuaData,
} from "../database/schema.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  commissioningService,
  validateProfile,
} from "../services/commissioningService.js";
import {
  calculateShift,
  type TimeWindow,
} from "../services/shiftCalculation.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import opcuaQueueWorker from "../queue/opcuaQueueWorker.js";

const router = Router();
const idSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});
const instant = Joi.string()
  .isoDate()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();
const windowSchema = Joi.object({ start: instant, end: instant });

function window(start: string, end: string) {
  const from = new Date(start),
    to = new Date(end);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > 48 * 3600000
  )
    throw new ValidationError(
      "Window must be positive and at most 48 hours; include an explicit UTC offset",
    );
  return { from, to };
}

async function report(id: number): Promise<ShiftReport> {
  const [shift] = await db
    .select()
    .from(productionShifts)
    .where(eq(productionShifts.id, id));
  if (!shift) throw new NotFoundError("Shift");
  const profile = shift.profile as ProductionProfile;
  const samples: Parameters<typeof calculateShift>[0]["samples"] = {};
  for (const signal of Object.values(profile.signals)) {
    const filter = and(
      eq(opcuaData.machineId, shift.machineId),
      eq(opcuaData.nodeKey, signal.nodeKey),
    );
    const projection = {
      timestamp: opcuaData.timestamp,
      value: opcuaData.value,
      statusCode: opcuaData.statusCode,
      signalMetadata: opcuaData.signalMetadata,
    };
    const previous = await db
      .select(projection)
      .from(opcuaData)
      .where(and(filter, lte(opcuaData.timestamp, shift.start)))
      .orderBy(desc(opcuaData.timestamp), desc(opcuaData.id))
      .limit(1);
    const rows = await db
      .select(projection)
      .from(opcuaData)
      .where(
        and(
          filter,
          gte(opcuaData.timestamp, shift.start),
          lte(opcuaData.timestamp, shift.end),
        ),
      )
      .orderBy(asc(opcuaData.timestamp), asc(opcuaData.id))
      .limit(100001);
    if (rows.length > 100000)
      throw new ValidationError(
        "Shift exceeds 100000 samples per signal; use a shorter window",
      );
    const ordered = [...previous, ...rows];
    const unique = new Map<number, (typeof ordered)[number]>();
    for (const row of ordered) unique.set(row.timestamp.getTime(), row);
    samples[signal.nodeKey] = [...unique.values()].map((row) => ({
      ...row,
      value:
        row.signalMetadata?.namespaceUri === signal.namespaceUri &&
        row.signalMetadata.identifier === signal.identifier
          ? row.value
          : null,
    }));
  }
  const reasons = await db
    .select()
    .from(downtimeReasons)
    .where(eq(downtimeReasons.shiftId, id))
    .orderBy(asc(downtimeReasons.id));
  return calculateShift({
    ...shift,
    profile,
    job: shift.job as ShiftReport["job"],
    breaks: shift.breaks as TimeWindow[],
    evidence: shift.evidence as ShiftReport["evidence"],
    reasons: reasons.map((reason) => ({
      ...reason,
      category: reason.category as DowntimeReason["category"],
      start: reason.start.toISOString(),
      end: reason.end.toISOString(),
      createdAt: reason.createdAt.toISOString(),
    })),
    samples,
  });
}

router.get(
  "/assets",
  asyncHandler(async (_req, res) => {
    res.json(
      await db
        .select({
          id: machines.id,
          name: machines.name,
          status: machines.status,
        })
        .from(machines),
    );
  }),
);
router.get(
  "/health",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    res.json(opcuaQueueWorker.getHealth());
  }),
);
router.post(
  "/profiles/validate",
  requireRole("admin"),
  validateBody(Joi.object({ profile: Joi.object().required() })),
  asyncHandler(async (req, res) => {
    res.json(validateProfile(req.body.profile));
  }),
);
router.get(
  "/profiles",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    res.json(
      await db
        .select()
        .from(machineProfiles)
        .orderBy(desc(machineProfiles.id))
        .limit(100),
    );
  }),
);
router.post(
  "/machines/:id/inspect",
  requireRole("admin"),
  validateParams(idSchema),
  validateBody(Joi.object({ profile: Joi.object().optional() })),
  asyncHandler(async (req, res) => {
    res.json(
      await commissioningService.inspect(
        Number(req.params.id),
        req.body.profile ? validateProfile(req.body.profile) : undefined,
      ),
    );
  }),
);
router.post(
  "/machines/:id/commission",
  requireRole("admin"),
  validateParams(idSchema),
  validateBody(
    Joi.object({
      profile: Joi.object().required(),
      reviewed: Joi.boolean().valid(true).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await commissioningService.save(
          Number(req.params.id),
          validateProfile(req.body.profile),
          req.session.userId!,
        ),
      );
  }),
);
router.get(
  "/shifts",
  asyncHandler(async (_req, res) => {
    res.json(
      await db
        .select({
          id: productionShifts.id,
          name: productionShifts.name,
          machineId: productionShifts.machineId,
          start: productionShifts.start,
          end: productionShifts.end,
          timezone: productionShifts.timezone,
        })
        .from(productionShifts)
        .orderBy(desc(productionShifts.start))
        .limit(100),
    );
  }),
);
router.post(
  "/shifts",
  validateBody(
    Joi.object({
      machineId: Joi.number().integer().positive().required(),
      name: Joi.string().trim().min(1).max(160).required(),
      timezone: Joi.string().max(80).required(),
      start: instant,
      end: instant,
      breaks: Joi.array().items(windowSchema).max(20).default([]),
      job: Joi.object({
        reference: Joi.string().trim().min(1).max(160).required(),
        product: Joi.string().trim().min(1).max(160).required(),
        target: Joi.number().integer().min(0).allow(null).required(),
      }).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { from, to } = window(req.body.start, req.body.end);
    try {
      new Intl.DateTimeFormat("en", { timeZone: req.body.timezone }).format(
        from,
      );
    } catch {
      throw new ValidationError("Unknown IANA timezone");
    }
    const breaks = req.body.breaks as TimeWindow[];
    const sorted = breaks
      .map((b) => window(b.start, b.end))
      .sort((a, b) => a.from.getTime() - b.from.getTime());
    if (
      sorted.some(
        (b, i) =>
          b.from < from || b.to > to || (i > 0 && b.from < sorted[i - 1].to),
      )
    )
      throw new ValidationError(
        "Breaks must be inside the shift and must not overlap",
      );
    const profile = await commissioningService.latest(req.body.machineId);
    const shift = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${req.body.machineId}::integer)`,
      );
      const overlapping = await tx
        .select()
        .from(productionShifts)
        .where(
          and(
            eq(productionShifts.machineId, req.body.machineId),
            sql`${productionShifts.start} < ${to} AND ${productionShifts.end} > ${from}`,
          ),
        )
        .limit(1);
      if (overlapping.length)
        throw new ValidationError(
          "A shift already overlaps this machine and window",
        );
      const [saved] = await tx
        .insert(productionShifts)
        .values({
          ...req.body,
          start: from,
          end: to,
          profile: profile.profile,
          createdBy: req.session.userId,
        })
        .returning();
      return saved;
    });
    res.status(201).json(shift);
  }),
);
router.get(
  "/shifts/:id/report",
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await report(Number(req.params.id)));
  }),
);
router.post(
  "/shifts/:id/reasons",
  validateParams(idSchema),
  validateBody(
    Joi.object({
      start: instant,
      end: instant,
      category: Joi.string().valid("planned", "unplanned").required(),
      reason: Joi.string().trim().min(1).max(500).required(),
      supersedesId: Joi.number().integer().positive().allow(null).default(null),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id),
      { from, to } = window(req.body.start, req.body.end);
    const current = await report(id);
    if (
      from < new Date(current.start) ||
      to > new Date(current.end) ||
      to.getTime() > Date.now()
    )
      throw new ValidationError("Reason must be inside the observed shift");
    const overlappingIntervals = current.intervals.filter(
      (i) =>
        Date.parse(i.start) < to.getTime() &&
        Date.parse(i.end) > from.getTime(),
    );
    if (
      !overlappingIntervals.length ||
      overlappingIntervals.some(
        (i) => i.state === "unknown" || i.state === "running",
      )
    )
      throw new ValidationError(
        "Only observed stopped intervals can receive downtime reasons",
      );
    const saved = await db.transaction(async (tx) => {
      await tx
        .select()
        .from(productionShifts)
        .where(eq(productionShifts.id, id))
        .for("update");
      const history = await tx
        .select()
        .from(downtimeReasons)
        .where(eq(downtimeReasons.shiftId, id));
      const replaced = new Set(history.map((r) => r.supersedesId));
      const active = history.filter((r) => !replaced.has(r.id));
      if (
        req.body.supersedesId &&
        !active.some((r) => r.id === req.body.supersedesId)
      )
        throw new ValidationError(
          "Correction must reference a current reason in this shift",
        );
      if (
        active.some(
          (r) => r.id !== req.body.supersedesId && r.start < to && r.end > from,
        )
      )
        throw new ValidationError("Downtime reasons must not overlap");
      const [row] = await tx
        .insert(downtimeReasons)
        .values({
          ...req.body,
          shiftId: id,
          start: from,
          end: to,
          actorId: req.session.userId,
        })
        .returning();
      return row;
    });
    res.status(201).json(saved);
  }),
);
router.post(
  "/shifts/:id/reconcile",
  requireRole("admin"),
  validateParams(idSchema),
  validateBody(
    Joi.object({
      total: Joi.number().integer().min(0).required(),
      good: Joi.number().integer().min(0).required(),
      reject: Joi.number().integer().min(0).required(),
      reference: Joi.string().trim().min(1).max(500).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (req.body.total !== req.body.good + req.body.reject)
      throw new ValidationError(
        "Independent total must equal good plus reject",
      );
    const [saved] = await db
      .update(productionShifts)
      .set({ evidence: { ...req.body, actorId: req.session.userId } })
      .where(
        and(
          eq(productionShifts.id, id),
          sql`${productionShifts.evidence} IS NULL`,
        ),
      )
      .returning();
    if (!saved)
      throw new ValidationError(
        "Shift missing or evidence already recorded; original evidence is preserved",
      );
    res.json(await report(id));
  }),
);
export default router;
