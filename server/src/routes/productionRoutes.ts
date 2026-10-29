import { Router } from "express";
import { createHash } from "node:crypto";
import Joi from "joi";
import { and, eq, desc, asc, gte, inArray, lte, sql } from "drizzle-orm";
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
  operatorEntries,
  reportHistory,
  users,
  webhookDeliveries,
} from "../database/schema.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { incidentReplay } from "../services/incidentReplay.js";
import {
  auditLogService,
  auditRequest,
  getAuditActor,
} from "../services/auditLogService.js";
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
import { suggestMappings } from "../services/mappingSuggestions.js";
import opcuaQueueWorker from "../queue/opcuaQueueWorker.js";
import { machineScope } from "../services/accessScope.js";

const router = Router();
const idSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});
const instant = Joi.string()
  .isoDate()
  .strict()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();
const windowSchema = Joi.object({ start: instant, end: instant });

router.get(
  "/replay/:id",
  validateParams(idSchema),
  validateQuery(
    Joi.object({
      start: instant,
      end: instant,
      keys: Joi.array()
        .items(Joi.string().max(200).required())
        .single()
        .min(1)
        .max(8)
        .unique()
        .required(),
      maxGapSeconds: Joi.number().integer().min(1).max(3600).default(60),
    }),
  ),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      start: string;
      end: string;
      keys: string[];
      maxGapSeconds: number;
    };
    res.json(
      await incidentReplay(
        Number(req.params.id),
        query.start,
        query.end,
        query.keys,
        query.maxGapSeconds,
      ),
    );
  }),
);

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

export async function report(
  id: number,
  range?: {
    start: string;
    end: string;
    job: ShiftReport["job"];
    idealCycleMs: number;
  },
  database: Pick<typeof db, "select"> = db,
): Promise<ShiftReport> {
  const [shift] = await database
    .select()
    .from(productionShifts)
    .where(eq(productionShifts.id, id));
  if (!shift) throw new NotFoundError("Shift");
  const profile = { ...(shift.profile as ProductionProfile) };
  if (range) {
    shift.start = new Date(range.start);
    shift.end = new Date(range.end);
    shift.job = range.job;
    shift.evidence = null;
    profile.idealCycleMs = range.idealCycleMs;
  }
  const samples: Parameters<typeof calculateShift>[0]["samples"] = {};
  const measurementEvidence = new Map<
    string,
    {
      id: number;
      timestamp: Date;
      value: number | null;
      statusCode: string | null;
      correctionRevision: number;
      receivedAt: Date | null;
    }
  >();
  for (const signal of Object.values(profile.signals)) {
    const filter = and(
      eq(opcuaData.machineId, shift.machineId),
      eq(opcuaData.nodeKey, signal.nodeKey),
    );
    const projection = {
      id: opcuaData.id,
      correctionRevision: opcuaData.correctionRevision,
      receivedAt: opcuaData.receivedAt,
      timestamp: opcuaData.timestamp,
      value: opcuaData.value,
      statusCode: opcuaData.statusCode,
      signalMetadata: opcuaData.signalMetadata,
    };
    const previous = await database
      .select(projection)
      .from(opcuaData)
      .where(and(filter, lte(opcuaData.timestamp, shift.start)))
      .orderBy(desc(opcuaData.timestamp), desc(opcuaData.id))
      .limit(1);
    const rows = await database
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
    for (const row of ordered) {
      unique.set(row.timestamp.getTime(), row);
      measurementEvidence.set(`${row.timestamp.toISOString()}:${row.id}`, row);
    }
    samples[signal.nodeKey] = [...unique.values()].map((row) => ({
      ...row,
      value:
        row.signalMetadata?.namespaceUri === signal.namespaceUri &&
        row.signalMetadata.identifier === signal.identifier
          ? row.value
          : null,
    }));
  }
  const reasons = await database
    .select()
    .from(downtimeReasons)
    .where(eq(downtimeReasons.shiftId, id))
    .orderBy(asc(downtimeReasons.id));
  // Declarations describe the whole shift, so product-run windows keep their measured counts.
  const [declared] = range
    ? []
    : await database
        .select()
        .from(operatorEntries)
        .where(
          and(
            eq(operatorEntries.shiftId, id),
            eq(operatorEntries.kind, "quantity"),
            eq(operatorEntries.status, "resolved"),
          ),
        )
        .orderBy(desc(operatorEntries.updatedAt), desc(operatorEntries.id))
        .limit(1);
  // Reviewed state declarations apply to the shift and to each product-run window.
  const manualStates = (
    await database
      .select()
      .from(operatorEntries)
      .where(
        and(
          eq(operatorEntries.shiftId, id),
          eq(operatorEntries.kind, "state"),
          eq(operatorEntries.status, "resolved"),
        ),
      )
      .orderBy(asc(operatorEntries.id))
  ).flatMap((entry) =>
    entry.manualState && entry.intervalStart && entry.intervalEnd
      ? [
          {
            entryId: entry.id,
            start: entry.intervalStart.toISOString(),
            end: entry.intervalEnd.toISOString(),
            state: entry.manualState,
          },
        ]
      : [],
  );
  const result = calculateShift({
    manualStates,
    declaration: declared?.quantity
      ? {
          entryId: declared.id,
          ...declared.quantity,
          reviewedAt: declared.updatedAt.toISOString(),
        }
      : null,
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
  result.planVersion = shift.planVersion;
  if (!range) {
    const open = await database
      .select({ entry: operatorEntries, ownerName: users.username })
      .from(operatorEntries)
      .leftJoin(users, eq(users.id, operatorEntries.ownerId))
      .where(
        and(
          eq(operatorEntries.shiftId, id),
          eq(operatorEntries.status, "open"),
          inArray(operatorEntries.kind, ["note", "action"]),
        ),
      )
      .orderBy(
        desc(eq(operatorEntries.priority, "high")),
        asc(operatorEntries.dueAt),
        asc(operatorEntries.id),
      )
      .limit(50);
    const iso = (value: Date | null) => value?.toISOString() ?? null;
    result.handover = open.map(({ entry, ownerName }) => ({
      id: entry.id,
      kind: entry.kind as "note" | "action",
      text: entry.text,
      priority: entry.priority as "normal" | "high",
      ownerId: entry.ownerId,
      ownerName: ownerName ?? null,
      dueAt: iso(entry.dueAt),
      intervalStart: iso(entry.intervalStart),
      intervalEnd: iso(entry.intervalEnd),
    }));
  }
  const evidenceRows = [...measurementEvidence.values()].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime() || a.id - b.id,
  );
  const received = evidenceRows
    .flatMap((row) => (row.receivedAt ? [row.receivedAt.toISOString()] : []))
    .sort();
  result.measurementEvidence = {
    digest: createHash("sha256")
      .update(JSON.stringify(evidenceRows))
      .digest("hex"),
    samples: evidenceRows.length,
    correctedSamples: evidenceRows.filter((row) => row.correctionRevision > 0)
      .length,
    lateSamples: evidenceRows.filter(
      (row) =>
        row.receivedAt &&
        row.receivedAt.getTime() - row.timestamp.getTime() > 300_000,
    ).length,
    latestReceivedAt: received.at(-1) ?? null,
  };
  if (!range && shift.runs.length) {
    result.runs = [];
    for (const plan of shift.runs)
      result.runs.push({
        plan,
        report: await report(
          id,
          {
            ...plan,
            job: {
              reference: plan.reference,
              product: plan.product,
              target: plan.target,
            },
          },
          database,
        ),
      });
    const running = result.intervals.filter((i) => i.state === "running");
    const uncovered = running.some((interval) => {
      const coverage = shift.runs.reduce(
        (sum, run) =>
          sum +
          Math.max(
            0,
            Math.min(Date.parse(interval.end), Date.parse(run.end)) -
              Math.max(Date.parse(interval.start), Date.parse(run.start)),
          ),
        0,
      );
      return coverage !== Date.parse(interval.end) - Date.parse(interval.start);
    });
    const complete = result.runs.every(
      (r) =>
        r.report.quantities.total != null &&
        !r.report.issues.some((issue) => issue.startsWith("total counter")),
    );
    const milliseconds = running.reduce(
      (sum, i) => sum + Date.parse(i.end) - Date.parse(i.start),
      0,
    );
    result.oee.performance =
      complete &&
      !uncovered &&
      milliseconds > 0 &&
      !result.issues.some((issue) =>
        issue.startsWith("Running overlaps an excluded break"),
      )
        ? result.runs.reduce(
            (sum, r) => sum + r.report.quantities.total! * r.plan.idealCycleMs,
            0,
          ) / milliseconds
        : null;
    if (result.oee.performance == null)
      result.issues.push(
        "Product run performance is unknown: incomplete run counters, unassigned running time or running during excluded breaks.",
      );
    result.oee.overall =
      result.oee.availability != null &&
      result.oee.performance != null &&
      result.oee.quality != null
        ? result.oee.availability * result.oee.performance * result.oee.quality
        : null;
    result.verified = result.issues.length === 0;
  }
  return result;
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
        .from(machines)
        .where(machineScope(machines.id)),
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
// Records PostgreSQL refused stay in the local spool until exported or requeued.
router.get(
  "/quarantine",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const entries = opcuaQueueWorker.getQuarantine(1001);
    await auditLogService.recordEvent(
      {
        action: "collector.quarantine.exported",
        entityType: "measurement_quarantine",
        message: `Exported ${Math.min(entries.length, 1000)} quarantined measurements`,
      },
      getAuditActor(req),
    );
    res.set("Cache-Control", "no-store");
    res.json({
      format: "measurement-quarantine-v1",
      exportedAt: new Date().toISOString(),
      entries: entries.slice(0, 1000),
      truncated: entries.length > 1000,
    });
  }),
);
router.post(
  "/quarantine/requeue",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const requeued = opcuaQueueWorker.requeueQuarantine();
    await auditLogService.recordEvent(
      {
        action: "collector.quarantine.requeued",
        entityType: "measurement_quarantine",
        message: `Requeued ${requeued} quarantined measurements`,
      },
      getAuditActor(req),
    );
    res.json({ requeued });
  }),
);
router.get(
  "/diagnostics",
  requireRole("admin"),
  auditRequest(
    "export.diagnostics",
    "system",
    "Exported a support diagnostics snapshot",
  ),
  asyncHandler(async (_req, res) => {
    const snapshot = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
      const machineStates = await tx
        .select({
          id: machines.id,
          status: machines.status,
          securityMode: machines.securityMode,
          securityPolicy: machines.securityPolicy,
        })
        .from(machines)
        .orderBy(desc(machines.id))
        .limit(200);
      const reports = await tx
        .select({
          id: reportHistory.id,
          status: reportHistory.status,
          generatedAt: reportHistory.generatedAt,
          completedAt: reportHistory.completedAt,
          attempts: reportHistory.attempts,
          retryAt: reportHistory.retryAt,
          emailStatus: reportHistory.emailStatus,
          emailAttempts: reportHistory.emailAttempts,
          emailRetryAt: reportHistory.emailRetryAt,
        })
        .from(reportHistory)
        .orderBy(desc(reportHistory.id))
        .limit(200);
      const deliveries = await tx
        .select({
          id: webhookDeliveries.id,
          attempts: webhookDeliveries.attempts,
          nextAttemptAt: webhookDeliveries.nextAttemptAt,
          deliveredAt: webhookDeliveries.deliveredAt,
        })
        .from(webhookDeliveries)
        .orderBy(desc(webhookDeliveries.id))
        .limit(200);
      return { machineStates, reports, deliveries };
    });
    const health = opcuaQueueWorker.getHealth();
    res.json({
      format: "support-diagnostics-v1",
      generatedAt: new Date().toISOString(),
      node: process.version,
      limits:
        "Latest 200 rows per category; 3 seconds per database statement. This is a diagnostic snapshot, not an audit export.",
      ...snapshot,
      collector: {
        ...health,
        storageFailure: health.storageFailure
          ? {
              at: health.storageFailure.at,
              reason: "Local storage unavailable",
            }
          : null,
        writeFailure: health.writeFailure
          ? { at: health.writeFailure.at, reason: "Database write failed" }
          : null,
      },
      redacted: [
        "credentials",
        "endpoints",
        "names",
        "values",
        "SQL",
        "logs",
        "file paths",
        "recipients",
        "webhook payloads",
      ],
    });
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
  "/machines/:id/suggest",
  requireRole("admin"),
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    res.json(await suggestMappings(Number(req.params.id)));
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
        .where(machineScope(productionShifts.machineId))
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
      category: Joi.string()
        .valid("planned", "unplanned", "changeover")
        .required(),
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
  requireRole("admin", "supervisor"),
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
