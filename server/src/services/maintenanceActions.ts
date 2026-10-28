import { ValidationError } from "../utils/errors.js";
import manager from "../database/dbConnection.js";
export function notificationResume(
  now: Date,
  suppression: Date | null,
  quietStart: number | null,
  quietEnd: number | null,
): Date | null {
  let resume =
    suppression && suppression > now ? suppression.getTime() : now.getTime();
  if (quietStart != null && quietEnd != null && quietStart !== quietEnd) {
    const at = new Date(resume),
      minute = at.getUTCHours() * 60 + at.getUTCMinutes();
    const quiet =
      quietStart < quietEnd
        ? minute >= quietStart && minute < quietEnd
        : minute >= quietStart || minute < quietEnd;
    if (quiet) {
      at.setUTCHours(0, quietEnd, 0, 0);
      if (at.getTime() <= resume) at.setUTCDate(at.getUTCDate() + 1);
      resume = at.getTime();
    }
  }
  return resume > now.getTime() ? new Date(resume) : null;
}
export async function escalateMaintenanceActions() {
  // The overdue marker and notification outbox are committed together, once per action.
  await manager.pool.query(`WITH overdue AS (
    UPDATE maintenance_actions SET escalated_at=now() WHERE due_at<=now() AND escalated_at IS NULL AND completed_at IS NULL RETURNING *
  ) INSERT INTO webhook_deliveries(webhook_id,event)
    SELECT w.id,jsonb_build_object('type','maintenance.escalated','timestamp',now(),'payload',jsonb_build_object(
      'actionId',a.id,'alarmId',a.alarm_id,'machineId',a.machine_id,'ownerId',a.owner_id,'escalationOwnerId',a.escalation_owner_id,'dueAt',a.due_at))
    FROM overdue a CROSS JOIN webhooks w WHERE w.is_active AND (w.events ? 'maintenance.escalated' OR w.events ? '*')`);
}

export async function maintenanceOwners(
  machineId: number,
  ownerIds: number[] | null = null,
) {
  return (
    await manager.pool.query<{ id: number; username: string }>(
      `SELECT u.id,u.username FROM users u WHERE u.is_active AND u.role IN ('admin','supervisor','operator')
      AND ($2::int[] IS NULL OR u.id=ANY($2::int[]))
      AND (u.role='admin' OR EXISTS(SELECT 1 FROM machine_grants g WHERE g.user_id=u.id AND g.machine_id=$1)
        OR EXISTS(SELECT 1 FROM machine_sites s JOIN plants p ON p.id=s.plant_id AND p.is_active
          JOIN plant_memberships m ON m.plant_id=p.id AND m.user_id=u.id WHERE s.machine_id=$1)) ORDER BY u.username`,
      [machineId, ownerIds],
    )
  ).rows;
}
export async function validateMaintenanceAction(
  b: {
    dueAt: string;
    suppressionUntil: string | null;
    quietStart: number | null;
    quietEnd: number | null;
    ownerId: number;
    escalationOwnerId: number;
  },
  machineId: number,
  previousDueAt?: Date,
) {
  const now = Date.now();
  if (
    Date.parse(b.dueAt) <= now &&
    Date.parse(b.dueAt) !== previousDueAt?.getTime()
  )
    throw new ValidationError("Deadline must be in the future");
  if (
    b.suppressionUntil &&
    (Date.parse(b.suppressionUntil) <= now ||
      Date.parse(b.suppressionUntil) > now + 86400000)
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
  const owners = await maintenanceOwners(machineId, [
    b.ownerId,
    b.escalationOwnerId,
  ]);
  if (
    ![b.ownerId, b.escalationOwnerId].every((id) =>
      owners.some((owner) => owner.id === id),
    )
  )
    throw new ValidationError(
      "Choose active owners with permission to operate this machine",
    );
}
