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

/**
 * The machine's latest maintenance actions with measured outcome: open, recurred (the same
 * alarm rule fired again after the service event), awaiting-recovery or recovered-observed.
 */
export async function maintenanceActionOutcomes(machineId: number) {
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
    [machineId],
  );
  return result.rows as ({
    id: number;
    rule_name: string | null;
    repeated_alarms: number;
    completed_at: Date | null;
    outcome: "open" | "recurred" | "awaiting-recovery" | "recovered-observed";
  } & Record<string, unknown>)[];
}
