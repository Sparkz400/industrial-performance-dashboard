import { Router } from "express";
import Joi from "joi";
import { and, eq, desc, sql } from "drizzle-orm";
import type { ProductionProfile } from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  maintenancePlans,
  maintenanceEvents,
  operatorEntries,
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
  id = Joi.object({ id: Joi.number().integer().positive().required() });
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
      result.push({
        ...plan,
        events,
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
    }),
  ),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await db.transaction(async (tx) => {
        const [plan] = await tx
          .select()
          .from(maintenancePlans)
          .where(eq(maintenancePlans.id, Number(req.params.id)))
          .for("update");
        if (!plan) throw new NotFoundError("Service plan");
        const { requestId, version, serviced, checks, note, incidentId } =
          req.body;
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
        const [saved] = await tx
          .insert(maintenanceEvents)
          .values({
            requestId,
            planId: plan.id,
            serviced,
            checks,
            note,
            incidentId,
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
export default router;
