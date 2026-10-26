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
