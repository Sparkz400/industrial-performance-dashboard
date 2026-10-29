import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { assertMachine } from "../services/accessScope.js";
import {
  maintenanceActionOutcomes,
  maintenanceOwners,
  validateMaintenanceAction,
} from "../services/maintenanceActions.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() }),
  version = Joi.number().integer().positive().required(),
  instant = Joi.string()
    .isoDate()
    .strict()
    .pattern(/(?:Z|[+-]\d{2}:\d{2})$/),
  fields = {
    ownerId: Joi.number().integer().positive().required(),
    escalationOwnerId: Joi.number().integer().positive().required(),
    dueAt: instant.required(),
    action: Joi.string().trim().min(1).max(2000).required(),
    suppressionUntil: instant.allow(null).default(null),
    quietStart: Joi.number().integer().min(0).max(1439).allow(null).required(),
    quietEnd: Joi.number().integer().min(0).max(1439).allow(null).required(),
  };
router.use(requireRole("admin", "supervisor"));
async function actionRecord(id: number) {
  const row = (
    await manager.pool.query(
      "SELECT machine_id,due_at FROM maintenance_actions WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!row) throw new NotFoundError("Maintenance action");
  assertMachine(row.machine_id);
  return row as { machine_id: number; due_at: Date };
}
router.get(
  "/machines/:id/owners",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    res.json(await maintenanceOwners(machineId));
  }),
);
router.get(
  "/machines/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.json(await maintenanceActionOutcomes(Number(req.params.id)));
  }),
);
router.post(
  "/machines/:id",
  validateParams(id),
  validateBody(
    Joi.object({
      alarmId: Joi.number().integer().positive().required(),
      ...fields,
    }),
  ),
  asyncHandler(async (req, res) => {
    const b = req.body,
      machineId = Number(req.params.id);
    assertMachine(machineId);
    await validateMaintenanceAction(b, machineId);
    const saved = await manager.pool.query(
      `INSERT INTO maintenance_actions(machine_id,alarm_id,owner_id,escalation_owner_id,due_at,action,suppression_until,quiet_start,quiet_end,created_by)
    SELECT machine_id,id,$3,$4,$5,$6,$7,$8,$9,$10 FROM alert_history WHERE id=$2 AND machine_id=$1
    ON CONFLICT(alarm_id) DO NOTHING RETURNING *`,
      [
        machineId,
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
  "/:id/revise",
  validateParams(id),
  validateBody(
    Joi.object({
      version,
      reason: Joi.string().trim().min(1).max(2000).required(),
      ...fields,
    }),
  ),
  asyncHandler(async (req, res) => {
    const b = req.body,
      actionId = Number(req.params.id),
      current = await actionRecord(actionId);
    await validateMaintenanceAction(b, current.machine_id, current.due_at);
    // shortcut: keep up to 100 corrections per action; use a history table if longer action lifecycles are needed.
    // Retain every prior version and its correction reason in the same atomic update.
    const saved = await manager.pool.query(
      `UPDATE maintenance_actions a SET owner_id=$3,escalation_owner_id=$4,due_at=$5,action=$6,suppression_until=$7,quiet_start=$8,quiet_end=$9,
       version=a.version+1,revisions=revisions || jsonb_build_array(jsonb_build_object('previous',to_jsonb(a)-'revisions','changedBy',$10::int,'changedAt',now(),'reason',$11::text))
       WHERE a.id=$1 AND a.version=$2 AND a.completed_at IS NULL AND jsonb_array_length(a.revisions)<100 RETURNING a.*`,
      [
        actionId,
        b.version,
        b.ownerId,
        b.escalationOwnerId,
        b.dueAt,
        b.action,
        b.suppressionUntil,
        b.quietStart,
        b.quietEnd,
        req.session.userId,
        b.reason,
      ],
    );
    if (!saved.rowCount)
      throw new ConflictError(
        "Action changed, is completed or reached 100 corrections; reload before continuing",
      );
    res.json(saved.rows[0]);
  }),
);
router.post(
  "/:id/complete",
  validateParams(id),
  validateBody(
    Joi.object({
      version,
      serviceEventId: Joi.number().integer().positive().required(),
      note: Joi.string().trim().min(1).max(2000).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await actionRecord(Number(req.params.id));
    const saved = await manager.pool.query(
      `UPDATE maintenance_actions a SET completed_at=now(),completed_by=$3,service_event_id=e.id,completion_note=$4,suppression_until=NULL,version=a.version+1
    FROM maintenance_events e JOIN maintenance_plans p ON p.id=e.plan_id WHERE a.id=$1 AND a.version=$5 AND a.completed_at IS NULL AND e.id=$2
    AND p.machine_id=a.machine_id AND e.serviced AND e.created_at>=a.created_at RETURNING a.*`,
      [
        Number(req.params.id),
        req.body.serviceEventId,
        req.session.userId,
        req.body.note,
        req.body.version,
      ],
    );
    if (!saved.rowCount)
      throw new ConflictError(
        "Action changed or inspection is invalid; reload and link a newer completed service on this machine",
      );
    res.json(saved.rows[0]);
  }),
);
export default router;
