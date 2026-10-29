import { Router } from "express";
import Joi from "joi";
import { createHash } from "node:crypto";
import { canonicalJson } from "../utils/canonicalJson.js";
import { and, eq, desc, gt, gte, lte, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  historySummaries,
  measurementCorrections,
  opcuaData,
  operatorEntries,
  productionCalendars,
  productionShifts,
  shiftReportRevisions,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { commissioningService } from "../services/commissioningService.js";
import {
  calendarWindows,
  type CalendarConfig,
} from "../services/productionCalendar.js";
import { report } from "./productionRoutes.js";
import { energyAnalysis } from "../services/energyAnalysis.js";
import { changedSections } from "../services/reportRevisionCheck.js";
import type {
  ProductRun,
  ReportRevisionCheck,
  ShiftReport,
} from "@performance-dashboard/shared";

const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : helpers.error("any.invalid");
  });
const job = Joi.object({
  reference: Joi.string().trim().max(160).required(),
  product: Joi.string().trim().max(160).required(),
  target: Joi.number().integer().min(0).allow(null).required(),
});
const configSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  timezone: Joi.string().max(80).required(),
  weekdays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .min(1)
    .max(7)
    .unique()
    .required(),
  startTime: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  durationMinutes: Joi.number().integer().min(1).max(1440).required(),
  holidays: Joi.array().items(date).max(500).unique().default([]),
  fold: Joi.string().valid("reject", "earlier", "later").default("reject"),
  breaks: Joi.array()
    .items(
      Joi.object({
        offsetMinutes: Joi.number().integer().min(0).required(),
        durationMinutes: Joi.number().integer().min(1).required(),
      }),
    )
    .max(20)
    .default([]),
  job: job.required(),
});
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
router.get(
  "/machines/:id/calendars",
  validateParams(id),
  asyncHandler(async (req, res) => {
    res.json(
      await db
        .select()
        .from(productionCalendars)
        .where(eq(productionCalendars.machineId, Number(req.params.id)))
        .orderBy(desc(productionCalendars.id)),
    );
  }),
);
router.post(
  "/machines/:id/calendars",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      config: configSchema.required(),
      id: Joi.number().integer().positive(),
      version: Joi.number()
        .integer()
        .positive()
        .when("id", { is: Joi.exist(), then: Joi.required() }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const config = req.body.config as CalendarConfig;
    try {
      new Intl.DateTimeFormat("en", { timeZone: config.timezone });
    } catch {
      throw new ValidationError("Unknown timezone");
    }
    const sorted = [...config.breaks].sort(
      (a, b) => a.offsetMinutes - b.offsetMinutes,
    );
    if (
      sorted.some(
        (b, i) =>
          b.offsetMinutes + b.durationMinutes > config.durationMinutes ||
          (i > 0 &&
            b.offsetMinutes <
              sorted[i - 1].offsetMinutes + sorted[i - 1].durationMinutes),
      )
    )
      throw new ValidationError(
        "Breaks must fit inside the shift without overlapping",
      );
    const saved = req.body.id
      ? await db
          .update(productionCalendars)
          .set({ config, version: sql`${productionCalendars.version}+1` })
          .where(
            and(
              eq(productionCalendars.id, req.body.id),
              eq(productionCalendars.machineId, Number(req.params.id)),
              eq(productionCalendars.version, req.body.version),
            ),
          )
          .returning()
      : await db
          .insert(productionCalendars)
          .values({
            machineId: Number(req.params.id),
            config,
            createdBy: req.session.userId!,
          })
          .returning();
    if (!saved.length)
      throw new ConflictError("Calendar changed; reload before saving");
    res.status(201).json(saved[0]);
  }),
);
router.post(
  "/machines/:id/plan",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      calendarId: Joi.number().integer().positive().required(),
      from: date.required(),
      to: date.required(),
      confirmDigest: Joi.string().hex().length(64),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${machineId}::integer)`,
      );
      const [calendar] = await tx
        .select()
        .from(productionCalendars)
        .where(
          and(
            eq(productionCalendars.id, req.body.calendarId),
            eq(productionCalendars.machineId, machineId),
          ),
        )
        .for("update");
      if (!calendar) throw new NotFoundError("Calendar");
      const config = calendar.config as CalendarConfig,
        windows = calendarWindows(config, req.body.from, req.body.to),
        profile = await commissioningService.latest(machineId);
      const token = digest({ calendar, windows, profile });
      if (req.body.confirmDigest && req.body.confirmDigest !== token)
        throw new ConflictError("Plan inputs changed; preview again");
      const items = [];
      for (const window of windows) {
        const key = `${calendar.id}:${window.date}`;
        const overlap = await tx
          .select({
            id: productionShifts.id,
            calendarKey: productionShifts.calendarKey,
          })
          .from(productionShifts)
          .where(
            and(
              eq(productionShifts.machineId, machineId),
              sql`${productionShifts.start}<${window.end}::timestamptz AND ${productionShifts.end}>${window.start}::timestamptz`,
            ),
          );
        const existing = await tx
          .select({ id: productionShifts.id })
          .from(productionShifts)
          .where(eq(productionShifts.calendarKey, key));
        const status = existing.length
          ? "already-planned"
          : overlap.length
            ? "conflict"
            : "new";
        if (req.body.confirmDigest && status === "conflict")
          throw new ConflictError(`Another shift overlaps ${window.date}`);
        if (req.body.confirmDigest && status === "new")
          await tx.insert(productionShifts).values({
            machineId,
            name: `${config.name} ${window.date}`,
            timezone: config.timezone,
            start: new Date(window.start),
            end: new Date(window.end),
            profile: profile.profile,
            job: config.job,
            breaks: window.breaks,
            calendarKey: key,
            createdBy: req.session.userId!,
          });
        items.push({ ...window, status });
      }
      return { digest: token, items, applied: !!req.body.confirmDigest };
    });
    res.json(result);
  }),
);
router.get(
  "/shifts/:id/runs",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const [shift] = await db
      .select({
        runs: productionShifts.runs,
        version: productionShifts.planVersion,
        start: productionShifts.start,
        end: productionShifts.end,
      })
      .from(productionShifts)
      .where(eq(productionShifts.id, Number(req.params.id)));
    if (!shift) throw new NotFoundError("Shift");
    res.json(shift);
  }),
);
router.put(
  "/shifts/:id/runs",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      version: Joi.number().integer().positive().required(),
      runs: Joi.array()
        .max(30)
        .items(
          job.keys({
            start: Joi.string()
              .isoDate()
              .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
              .required(),
            end: Joi.string()
              .isoDate()
              .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
              .required(),
            idealCycleMs: Joi.number().positive().max(86400000).required(),
          }),
        )
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await db.transaction(async (tx) => {
        const [shift] = await tx
          .select()
          .from(productionShifts)
          .where(eq(productionShifts.id, Number(req.params.id)))
          .for("update");
        if (!shift) throw new NotFoundError("Shift");
        if (shift.planVersion !== req.body.version)
          throw new ConflictError("Plan changed; reload first");
        const runs = (req.body.runs as ProductRun[]).sort(
          (a, b) => Date.parse(a.start) - Date.parse(b.start),
        );
        if (
          runs.some(
            (r, i) =>
              Date.parse(r.start) < shift.start.getTime() ||
              Date.parse(r.end) > shift.end.getTime() ||
              Date.parse(r.end) <= Date.parse(r.start) ||
              (i > 0 && Date.parse(r.start) < Date.parse(runs[i - 1].end)),
          )
        )
          throw new ValidationError(
            "Product runs must fit inside the shift without overlapping",
          );
        const [saved] = await tx
          .update(productionShifts)
          .set({ runs, planVersion: shift.planVersion + 1 })
          .where(eq(productionShifts.id, shift.id))
          .returning();
        return { runs: saved.runs, version: saved.planVersion };
      }),
    );
  }),
);
router.get(
  "/shifts/:id/revisions",
  validateParams(id),
  asyncHandler(async (req, res) => {
    res.json(
      await db
        .select({
          id: shiftReportRevisions.id,
          digest: shiftReportRevisions.digest,
          reason: shiftReportRevisions.reason,
          createdAt: shiftReportRevisions.createdAt,
          createdBy: shiftReportRevisions.createdBy,
        })
        .from(shiftReportRevisions)
        .where(eq(shiftReportRevisions.shiftId, Number(req.params.id)))
        .orderBy(desc(shiftReportRevisions.id))
        .limit(100),
    );
  }),
);
router.get(
  "/shifts/:id/revisions/:revision",
  validateParams(
    id.keys({ revision: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    const [revision] = await db
      .select()
      .from(shiftReportRevisions)
      .where(
        and(
          eq(shiftReportRevisions.id, Number(req.params.revision)),
          eq(shiftReportRevisions.shiftId, Number(req.params.id)),
        ),
      );
    if (!revision) throw new NotFoundError("Report revision");
    res.json(revision);
  }),
);
const revisionParams = validateParams(
  id.keys({ revision: Joi.number().integer().positive().required() }),
);
/** Regenerates the report read-only and names what changed since the revision was saved. */
router.get(
  "/shifts/:id/revisions/:revision/verify",
  revisionParams,
  asyncHandler(async (req, res) => {
    const [revision] = await db
      .select()
      .from(shiftReportRevisions)
      .where(
        and(
          eq(shiftReportRevisions.id, Number(req.params.revision)),
          eq(shiftReportRevisions.shiftId, Number(req.params.id)),
        ),
      );
    if (!revision) throw new NotFoundError("Report revision");
    const current = await db.transaction(
      async (tx) => {
        const production = await report(revision.shiftId, undefined, tx);
        return { ...production, energy: await energyAnalysis(production, tx) };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
    const saved = revision.snapshot as ShiftReport;
    const start = new Date(saved.start),
      end = new Date(saved.end);
    const count = sql<number>`count(*)::int`;
    const [corrections] = await db
      .select({ n: count })
      .from(measurementCorrections)
      .where(
        and(
          eq(measurementCorrections.machineId, saved.machineId),
          gte(measurementCorrections.measuredAt, start),
          lte(measurementCorrections.measuredAt, end),
          gt(measurementCorrections.createdAt, revision.createdAt),
        ),
      );
    const [late] = await db
      .select({ n: count })
      .from(opcuaData)
      .where(
        and(
          eq(opcuaData.machineId, saved.machineId),
          gte(opcuaData.timestamp, start),
          lte(opcuaData.timestamp, end),
          gt(opcuaData.receivedAt, revision.createdAt),
        ),
      );
    const [declarations] = await db
      .select({ n: count })
      .from(operatorEntries)
      .where(
        and(
          eq(operatorEntries.shiftId, revision.shiftId),
          eq(operatorEntries.kind, "quantity"),
          gt(operatorEntries.updatedAt, revision.createdAt),
        ),
      );
    const [summarised] = await db
      .select({
        n: sql<number>`coalesce(sum(${historySummaries.samples}),0)::int`,
      })
      .from(historySummaries)
      .where(
        and(
          eq(historySummaries.machineId, saved.machineId),
          gte(
            historySummaries.bucket,
            sql`date_trunc('hour', ${start}::timestamptz)`,
          ),
          lte(historySummaries.bucket, end),
        ),
      );
    const changed = changedSections(saved, current);
    const check: ReportRevisionCheck = {
      revisionId: revision.id,
      reproducible: changed.length === 0,
      changedSections: changed,
      causes: {
        laterCorrections: corrections.n,
        lateArrivals: late.n,
        laterDeclarations: declarations.n,
        planChanged: saved.planVersion !== current.planVersion,
        removedSamplesInOverlappingHours: summarised.n,
      },
      checkedAt: new Date().toISOString(),
    };
    res.json(check);
  }),
);
router.post(
  "/shifts/:id/revisions",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({ reason: Joi.string().trim().max(500).allow("").default("") }),
  ),
  asyncHandler(async (req, res) => {
    const reason = String(req.body.reason).trim() || null;
    const saved = await db.transaction(
      async (tx) => {
        const [{ n: earlier }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(shiftReportRevisions)
          .where(eq(shiftReportRevisions.shiftId, Number(req.params.id)));
        if (earlier && !reason)
          throw new ValidationError(
            "A new revision needs a reason, such as the correction it records",
          );
        const production = await report(Number(req.params.id), undefined, tx);
        const snapshot = {
          ...production,
          energy: await energyAnalysis(production, tx),
        };
        const [revision] = await tx
          .insert(shiftReportRevisions)
          .values({
            shiftId: snapshot.id,
            snapshot,
            digest: digest(snapshot),
            reason,
            createdBy: req.session.userId!,
          })
          .returning();
        return revision;
      },
      { isolationLevel: "repeatable read" },
    );
    res.status(201).json(saved);
  }),
);
export default router;
