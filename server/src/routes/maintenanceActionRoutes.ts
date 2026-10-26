import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { ValidationError, ConflictError } from "../utils/errors.js";
const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
router.use(requireRole("admin"));
router.get(
  "/machines/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const result = await manager.pool.query(
      `SELECT a.*,h.rule_name,h.resolved_at,
    (SELECT count(*)::int FROM alert_history r WHERE r.machine_id=a.machine_id AND r.rule_id IS NOT DISTINCT FROM h.rule_id AND (h.rule_id IS NOT NULL OR (h.metadata->>'healthKey' IS NOT NULL AND r.metadata->>'healthKey'=h.metadata->>'healthKey')) AND r.id<>h.id AND r.created_at>=a.created_at) AS repeated_alarms,
    (SELECT count(*)::int FROM webhook_deliveries d WHERE d.event->'payload'->>'machineId'=a.machine_id::text AND d.delivered_at IS NULL AND d.attempts>0) AS notification_failures,
    CASE WHEN a.completed_at IS NULL THEN 'open'
      WHEN EXISTS(SELECT 1 FROM alert_history r WHERE r.machine_id=a.machine_id AND r.rule_id IS NOT DISTINCT FROM h.rule_id AND (h.rule_id IS NOT NULL OR (h.metadata->>'healthKey' IS NOT NULL AND r.metadata->>'healthKey'=h.metadata->>'healthKey')) AND r.id<>h.id AND r.created_at>=e.created_at) THEN 'recurred'
      WHEN h.resolved_at IS NULL OR h.resolved_at<e.created_at THEN 'awaiting-recovery'
      ELSE 'recovered-observed' END AS outcome
    FROM maintenance_actions a JOIN alert_history h ON h.id=a.alarm_id
    LEFT JOIN maintenance_events e ON e.id=a.service_event_id WHERE a.machine_id=$1 ORDER BY a.id DESC LIMIT 100`,
      [Number(req.params.id)],
    );
    res.json(result.rows);
  }),
);
router.post(
  "/machines/:id",
  validateParams(id),
  validateBody(
    Joi.object({
      alarmId: Joi.number().integer().positive().required(),
      ownerId: Joi.number().integer().positive().required(),
      escalationOwnerId: Joi.number().integer().positive().required(),
      dueAt: Joi.date().iso().required(),
      action: Joi.string().trim().min(1).max(2000).required(),
      suppressionUntil: Joi.date().iso().allow(null).default(null),
      quietStart: Joi.number()
        .integer()
        .min(0)
        .max(1439)
        .allow(null)
        .required(),
      quietEnd: Joi.number().integer().min(0).max(1439).allow(null).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const b = req.body,
      now = Date.now();
    if (new Date(b.dueAt).getTime() <= now)
      throw new ValidationError("Deadline must be in the future");
    if (
      b.suppressionUntil &&
      (new Date(b.suppressionUntil).getTime() <= now ||
        new Date(b.suppressionUntil).getTime() > now + 86400000)
    )
      throw new ValidationError(
        "Maintenance suppression must end within 24 hours",
      );
    if (
      (b.quietStart == null) !== (b.quietEnd == null) ||
      (b.quietStart != null && b.quietStart === b.quietEnd)
    )
      throw new ValidationError(
        "Quiet hours require distinct UTC start and end minutes",
      );
    const saved = await manager.pool.query(
      `INSERT INTO maintenance_actions(machine_id,alarm_id,owner_id,escalation_owner_id,due_at,action,suppression_until,quiet_start,quiet_end,created_by)
    SELECT machine_id,id,$3,$4,$5,$6,$7,$8,$9,$10 FROM alert_history WHERE id=$2 AND machine_id=$1
    ON CONFLICT(alarm_id) DO NOTHING RETURNING *`,
      [
        Number(req.params.id),
        b.alarmId,
        b.ownerId,
        b.escalationOwnerId,
        b.dueAt,
        b.action,
        b.suppressionUntil,
        b.quietStart,
        b.quietEnd,
        req.session.userId,
      ],
    );
    if (!saved.rowCount)
      throw new ConflictError(
        "Alarm must belong to this machine and have no existing action",
      );
    res.status(201).json(saved.rows[0]);
  }),
);
router.post(
  "/:id/complete",
  validateParams(id),
  validateBody(
    Joi.object({
      serviceEventId: Joi.number().integer().positive().required(),
      note: Joi.string().trim().min(1).max(2000).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const saved = await manager.pool.query(
      `UPDATE maintenance_actions a SET completed_at=now(),completed_by=$3,service_event_id=e.id,completion_note=$4,suppression_until=NULL
    FROM maintenance_events e JOIN maintenance_plans p ON p.id=e.plan_id WHERE a.id=$1 AND a.completed_at IS NULL AND e.id=$2
    AND p.machine_id=a.machine_id AND e.serviced AND e.created_at>=a.created_at RETURNING a.*`,
      [
        Number(req.params.id),
        req.body.serviceEventId,
        req.session.userId,
        req.body.note,
      ],
    );
    if (!saved.rowCount)
      throw new ValidationError(
        "Link a completed service inspection performed after this action on the same machine",
      );
    res.json(saved.rows[0]);
  }),
);
export default router;
