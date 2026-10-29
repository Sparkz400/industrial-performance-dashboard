import express, { Router } from "express";
import Joi from "joi";
import { createHash } from "node:crypto";
import { and, asc, eq, desc, gte, inArray, sql } from "drizzle-orm";
import type { ProductionProfile } from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  downtimeReasons,
  maintenanceAttachments,
  maintenancePlans,
  maintenanceEvents,
  operatorEntries,
  productionShifts,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import {
  ConflictError,
  ValidationError,
  NotFoundError,
} from "../utils/errors.js";
import { commissioningService } from "../services/commissioningService.js";
import { maintenanceUsage } from "../services/maintenanceUsage.js";

interface Plan {
  name: string;
  days: number | null;
  runtimeHours: number | null;
  cycles: number | null;
  checks: string[];
  active: boolean;
}
const router = Router(),
  positive = Joi.number().integer().positive().required(),
  id = Joi.object({ id: positive });
// Content must match the declared type; anything else is refused rather than stored.
const attachmentTypes: Record<string, (file: Buffer) => boolean> = {
  "image/png": (f) =>
    f.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (f) => f[0] === 0xff && f[1] === 0xd8 && f[2] === 0xff,
  "application/pdf": (f) => f.subarray(0, 5).toString("latin1") === "%PDF-",
  "text/plain": (f) => {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(f);
      return !f.includes(0);
    } catch {
      return false;
    }
  },
};
const attachmentColumns = {
  id: maintenanceAttachments.id,
  eventId: maintenanceAttachments.eventId,
  filename: maintenanceAttachments.filename,
  contentType: maintenanceAttachments.contentType,
  size: maintenanceAttachments.size,
  sha256: maintenanceAttachments.sha256,
  createdBy: maintenanceAttachments.createdBy,
  createdAt: maintenanceAttachments.createdAt,
};
const stopColumns = {
  id: downtimeReasons.id,
  shiftId: downtimeReasons.shiftId,
  shiftName: productionShifts.name,
  start: downtimeReasons.start,
  end: downtimeReasons.end,
  category: downtimeReasons.category,
  reason: downtimeReasons.reason,
  supersedesId: downtimeReasons.supersedesId,
};
router.get(
  "/machines/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const plans = await db
        .select()
        .from(maintenancePlans)
        .where(eq(maintenancePlans.machineId, Number(req.params.id)))
        .orderBy(desc(maintenancePlans.id))
        .limit(100),
      result = [];
    for (const plan of plans) {
      const events = await db
        .select()
        .from(maintenanceEvents)
        .where(eq(maintenanceEvents.planId, plan.id))
        .orderBy(desc(maintenanceEvents.id))
        .limit(100);
      const [lastService] = await db
        .select()
        .from(maintenanceEvents)
        .where(
          and(
            eq(maintenanceEvents.planId, plan.id),
            eq(maintenanceEvents.serviced, true),
          ),
        )
        .orderBy(desc(maintenanceEvents.id))
        .limit(1);
      const config = plan.config as Plan,
        start = lastService?.createdAt ?? plan.createdAt,
        end = new Date();
      const usage = await maintenanceUsage(
        plan.machineId,
        plan.profile as ProductionProfile,
        start,
        end,
      );
      const dueDate = config.days
        ? new Date(start.getTime() + config.days * 86400000).toISOString()
        : null;
      const checks = [
        {
          kind: "calendar",
          limit: config.days,
          observed: (end.getTime() - start.getTime()) / 86400000,
          complete: true,
        },
        {
          kind: "runtime",
          limit: config.runtimeHours,
          observed:
            usage.runtimeSeconds.observed == null
              ? null
              : usage.runtimeSeconds.observed / 3600,
          complete: usage.runtimeSeconds.complete,
        },
        { kind: "cycles", limit: config.cycles, ...usage.cycles },
      ].filter((c) => c.limit != null);
      const due = checks.some(
        (c) => c.observed != null && c.observed >= c.limit!,
      );
      const eventIds = events.map((e) => e.id),
        stopIds = events.flatMap((e) => (e.stopId ? [e.stopId] : []));
      const attachments = eventIds.length
        ? await db
            .select(attachmentColumns)
            .from(maintenanceAttachments)
            .where(inArray(maintenanceAttachments.eventId, eventIds))
            .orderBy(asc(maintenanceAttachments.id))
        : [];
      const stops = stopIds.length
        ? await db
            .select(stopColumns)
            .from(downtimeReasons)
            .innerJoin(
              productionShifts,
              eq(productionShifts.id, downtimeReasons.shiftId),
            )
            .where(inArray(downtimeReasons.id, stopIds))
        : [];
      result.push({
        ...plan,
        events: events.map((event) => ({
          ...event,
          stop: stops.find((s) => s.id === event.stopId) ?? null,
          attachments: attachments.filter((a) => a.eventId === event.id),
        })),
        usage,
        dueDate,
        status: !config.active
          ? "inactive"
          : due
            ? "due"
            : checks.some((c) => !c.complete || c.observed == null)
              ? "unknown"
              : "not-due",
      });
    }
    res.json(result);
  }),
);
router.post(
  "/machines/:id",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      id: Joi.number().integer().positive(),
      version: Joi.number()
        .integer()
        .positive()
        .when("id", { is: Joi.exist(), then: Joi.required() }),
      config: Joi.object({
        name: Joi.string().trim().max(160).required(),
        days: Joi.number().positive().max(3650).allow(null).required(),
        runtimeHours: Joi.number()
          .positive()
          .max(1000000)
          .allow(null)
          .required(),
        cycles: Joi.number().integer().positive().allow(null).required(),
        checks: Joi.array()
          .items(Joi.string().trim().max(200))
          .min(1)
          .max(30)
          .unique()
          .required(),
        active: Joi.boolean().required(),
      }).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const config = req.body.config as Plan;
    if (!config.days && !config.runtimeHours && !config.cycles)
      throw new ValidationError("Choose a service interval");
    const machineId = Number(req.params.id),
      profile = await commissioningService.latest(machineId);
    const rows = req.body.id
      ? await db
          .update(maintenancePlans)
          .set({ config, version: sql`${maintenancePlans.version}+1` })
          .where(
            and(
              eq(maintenancePlans.id, req.body.id),
              eq(maintenancePlans.machineId, machineId),
              eq(maintenancePlans.version, req.body.version),
            ),
          )
          .returning()
      : await db
          .insert(maintenancePlans)
          .values({
            machineId,
            config,
            profile: profile.profile,
            createdBy: req.session.userId!,
          })
          .returning();
    if (!rows.length)
      throw new ConflictError("Service plan changed; reload first");
    res.status(201).json(rows[0]);
  }),
);
router.post(
  "/plans/:id/events",
  requireRole("admin", "supervisor", "operator"),
  validateParams(id),
  validateBody(
    Joi.object({
      requestId: Joi.string().uuid().required(),
      version: Joi.number().integer().positive().required(),
      serviced: Joi.boolean().required(),
      checks: Joi.object()
        .pattern(Joi.string().max(200), Joi.boolean().strict())
        .required(),
      note: Joi.string().trim().min(1).max(2000).required(),
      incidentId: Joi.number().integer().positive().allow(null).default(null),
      stopId: Joi.number().integer().positive().allow(null).default(null),
      trend: Joi.object({
        start: Joi.date().iso().required(),
        end: Joi.date().iso().required(),
        keys: Joi.array()
          .items(Joi.string().trim().min(1).max(200))
          .min(1)
          .max(8)
          .unique()
          .required(),
      })
        .allow(null)
        .default(null),
    }),
  ),
  asyncHandler(async (req, res) => {
    const trend = req.body.trend as {
      start: Date;
      end: Date;
      keys: string[];
    } | null;
    if (
      trend &&
      (trend.end <= trend.start ||
        trend.end.getTime() - trend.start.getTime() > 7 * 86400000)
    )
      throw new ValidationError("Link a trend window of at most seven days");
    const trendKey = (t: typeof trend) =>
      t ? JSON.stringify([t.start.getTime(), t.end.getTime(), t.keys]) : null;
    res.status(201).json(
      await db.transaction(async (tx) => {
        const [plan] = await tx
          .select()
          .from(maintenancePlans)
          .where(eq(maintenancePlans.id, Number(req.params.id)))
          .for("update");
        if (!plan) throw new NotFoundError("Service plan");
        const {
          requestId,
          version,
          serviced,
          checks,
          note,
          incidentId,
          stopId,
        } = req.body;
        const [existing] = await tx
          .select()
          .from(maintenanceEvents)
          .where(eq(maintenanceEvents.requestId, requestId));
        if (existing) {
          if (
            existing.planId !== plan.id ||
            existing.createdBy !== req.session.userId ||
            existing.serviced !== serviced ||
            existing.note !== note ||
            existing.incidentId !== incidentId ||
            existing.stopId !== stopId ||
            trendKey(
              existing.trendStart && existing.trendEnd
                ? {
                    start: existing.trendStart,
                    end: existing.trendEnd,
                    keys: existing.trendKeys ?? [],
                  }
                : null,
            ) !== trendKey(trend) ||
            JSON.stringify(Object.entries(existing.checks as object).sort()) !==
              JSON.stringify(Object.entries(checks).sort())
          )
            throw new ConflictError(
              "Request ID belongs to different service evidence",
            );
          return existing;
        }
        if (plan.version !== version)
          throw new ConflictError("Service plan changed; reload first");
        const config = plan.config as Plan;
        if (!config.active)
          throw new ValidationError("Service plan is inactive");
        if (
          Object.keys(checks).length !== config.checks.length ||
          config.checks.some((c) => typeof checks[c] !== "boolean")
        )
          throw new ValidationError("Record every inspection item");
        if (serviced && config.checks.some((c) => !checks[c]))
          throw new ValidationError(
            "All inspections must pass before service completion",
          );
        if (incidentId) {
          const [entry] = await tx
            .select()
            .from(operatorEntries)
            .where(
              and(
                eq(operatorEntries.id, incidentId),
                eq(operatorEntries.machineId, plan.machineId),
              ),
            );
          if (!entry)
            throw new ValidationError("Incident must belong to this machine");
        }
        if (stopId) {
          const [stop] = await tx
            .select({ id: downtimeReasons.id })
            .from(downtimeReasons)
            .innerJoin(
              productionShifts,
              eq(productionShifts.id, downtimeReasons.shiftId),
            )
            .where(
              and(
                eq(downtimeReasons.id, stopId),
                eq(productionShifts.machineId, plan.machineId),
              ),
            );
          const [replaced] = await tx
            .select({ id: downtimeReasons.id })
            .from(downtimeReasons)
            .where(eq(downtimeReasons.supersedesId, stopId));
          if (!stop || replaced)
            throw new ValidationError(
              "Link a current classified stop of this machine",
            );
        }
        const [saved] = await tx
          .insert(maintenanceEvents)
          .values({
            requestId,
            planId: plan.id,
            serviced,
            checks,
            note,
            incidentId,
            stopId,
            trendStart: trend?.start ?? null,
            trendEnd: trend?.end ?? null,
            trendKeys: trend?.keys ?? null,
            createdBy: req.session.userId!,
          })
          .returning();
        await tx
          .update(maintenancePlans)
          .set({ version: plan.version + 1 })
          .where(eq(maintenancePlans.id, plan.id));
        return saved;
      }),
    );
  }),
);
/** Current classified stops of the machine's last 31 days, for linking a service record. */
router.get(
  "/machines/:id/stops",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const rows = await db
      .select(stopColumns)
      .from(downtimeReasons)
      .innerJoin(
        productionShifts,
        eq(productionShifts.id, downtimeReasons.shiftId),
      )
      .where(
        and(
          eq(productionShifts.machineId, Number(req.params.id)),
          gte(downtimeReasons.start, new Date(Date.now() - 31 * 86400000)),
        ),
      )
      .orderBy(desc(downtimeReasons.start))
      .limit(500);
    const replaced = new Set(rows.map((r) => r.supersedesId));
    res.json(rows.filter((r) => !replaced.has(r.id)).slice(0, 200));
  }),
);
const attachmentParams = validateParams(
  Joi.object({ id: positive, eventId: positive }),
);
router.post(
  "/plans/:id/events/:eventId/attachments",
  requireRole("admin", "supervisor", "operator"),
  attachmentParams,
  express.raw({ type: () => true, limit: "5mb" }),
  asyncHandler(async (req, res) => {
    const file = req.body as Buffer,
      type = String(req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    if (!Buffer.isBuffer(file) || !file.length)
      throw new ValidationError("Attach a non-empty file");
    if (!attachmentTypes[type]?.(file))
      throw new ValidationError(
        "Attach a PNG, JPEG, PDF or UTF-8 text file whose content matches its type",
      );
    let filename = "";
    try {
      filename = decodeURIComponent(String(req.headers["x-filename"] ?? ""));
    } catch {
      /* An undecodable name is refused below. */
    }
    filename = filename
      .replace(/[\\/"\u0000-\u001f\u007f]/g, "_")
      .trim()
      .slice(0, 200);
    if (!filename) throw new ValidationError("Name the attached file");
    const saved = await db.transaction(async (tx) => {
      const [event] = await tx
        .select({ id: maintenanceEvents.id })
        .from(maintenanceEvents)
        .where(
          and(
            eq(maintenanceEvents.id, Number(req.params.eventId)),
            eq(maintenanceEvents.planId, Number(req.params.id)),
          ),
        )
        .for("update");
      if (!event) throw new NotFoundError("Service record");
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(maintenanceAttachments)
        .where(eq(maintenanceAttachments.eventId, event.id));
      if (count >= 10)
        throw new ValidationError(
          "A service record keeps at most 10 attachments",
        );
      const [row] = await tx
        .insert(maintenanceAttachments)
        .values({
          eventId: event.id,
          filename,
          contentType: type,
          size: file.length,
          sha256: createHash("sha256").update(file).digest("hex"),
          data: file,
          createdBy: req.session.userId!,
        })
        .returning(attachmentColumns);
      return row;
    });
    res.status(201).json(saved);
  }),
);
router.get(
  "/plans/:id/events/:eventId/attachments/:attachmentId",
  validateParams(
    Joi.object({ id: positive, eventId: positive, attachmentId: positive }),
  ),
  asyncHandler(async (req, res) => {
    const [file] = await db
      .select({ ...attachmentColumns, data: maintenanceAttachments.data })
      .from(maintenanceAttachments)
      .innerJoin(
        maintenanceEvents,
        eq(maintenanceEvents.id, maintenanceAttachments.eventId),
      )
      .where(
        and(
          eq(maintenanceAttachments.id, Number(req.params.attachmentId)),
          eq(maintenanceAttachments.eventId, Number(req.params.eventId)),
          eq(maintenanceEvents.planId, Number(req.params.id)),
        ),
      );
    if (!file) throw new NotFoundError("Attachment");
    // Always a download, never rendered in the application's origin.
    res.set({
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
    });
    res.send(file.data);
  }),
);
export default router;
