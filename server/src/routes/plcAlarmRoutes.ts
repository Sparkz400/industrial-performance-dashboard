import { Router } from "express";
import Joi from "joi";
import { desc, eq } from "drizzle-orm";
import db from "../database/db.js";
import {
  machines,
  plcAlarmEvents,
  plcAlarmSubscriptions,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { auditRequest } from "../services/auditLogService.js";
import { plcAlarms, plcSeverity } from "../services/plcAlarms.js";
import { NotFoundError } from "../utils/errors.js";

// A07: observed PLC alarms. Reading follows the machine grant; switching is administrator-only.
const router = Router();
const id = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);

router.get(
  "/machines/:id",
  id,
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    const [subscription] = await db
      .select()
      .from(plcAlarmSubscriptions)
      .where(eq(plcAlarmSubscriptions.machineId, machineId));
    const rows = await db
      .select()
      .from(plcAlarmEvents)
      .where(eq(plcAlarmEvents.machineId, machineId))
      .orderBy(desc(plcAlarmEvents.eventTime), desc(plcAlarmEvents.id))
      .limit(201);
    res.json({
      enabled: subscription?.enabled ?? false,
      status: plcAlarms.running
        ? plcAlarms.status(machineId)
        : { state: "collector not running in this process" },
      events: rows
        .slice(0, 200)
        .map((r) => ({ ...r, appSeverity: plcSeverity(r.severity) })),
      truncated: rows.length > 200,
    });
  }),
);

router.put(
  "/machines/:id/subscription",
  requireRole("admin"),
  id,
  validateBody(Joi.object({ enabled: Joi.boolean().required() })),
  auditRequest(
    "plc_alarms.subscription",
    "machine",
    "Changed read-only PLC alarm observation",
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    const [machine] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, machineId));
    if (!machine) throw new NotFoundError("Machine");
    const [saved] = await db
      .insert(plcAlarmSubscriptions)
      .values({
        machineId,
        enabled: req.body.enabled,
        updatedBy: req.session.userId!,
      })
      .onConflictDoUpdate({
        target: plcAlarmSubscriptions.machineId,
        set: {
          enabled: req.body.enabled,
          updatedBy: req.session.userId!,
          updatedAt: new Date(),
        },
      })
      .returning();
    await plcAlarms.reload(machineId);
    res.json(saved);
  }),
);

export default router;
