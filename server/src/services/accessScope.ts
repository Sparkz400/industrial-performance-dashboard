import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import type { UserRole } from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  machineGrants,
  machineSites,
  plantMemberships,
  machines,
  dashboardAssets,
  users,
  plants,
} from "../database/schema.js";
import { sessionEvents } from "./sessionAccess.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";

export interface AccessScope {
  userId: number;
  role: UserRole;
  machineIds: number[];
  dashboardIds: string[];
}
export const accessScope = new AsyncLocalStorage<AccessScope>();

export async function loadAccessScope(
  userId: number,
  role: UserRole,
): Promise<AccessScope> {
  if (role === "admin")
    return { userId, role, machineIds: [], dashboardIds: [] };
  const rows = await db
    .selectDistinct({ id: machines.id })
    .from(machines)
    .leftJoin(
      machineGrants,
      and(
        eq(machineGrants.machineId, machines.id),
        eq(machineGrants.userId, userId),
      ),
    )
    .leftJoin(machineSites, eq(machineSites.machineId, machines.id))
    .leftJoin(
      plants,
      and(eq(plants.id, machineSites.plantId), eq(plants.isActive, true)),
    )
    .leftJoin(
      plantMemberships,
      and(
        eq(plantMemberships.plantId, machineSites.plantId),
        eq(plantMemberships.userId, userId),
      ),
    )
    .where(
      sql`${machineGrants.userId} IS NOT NULL OR (${plantMemberships.userId} IS NOT NULL AND ${plants.id} IS NOT NULL)`,
    );
  const machineIds = rows.map((row) => row.id);
  const grants = await db.select().from(dashboardAssets);
  const grouped = new Map<string, number[]>();
  for (const grant of grants)
    grouped.set(grant.dashboardId, [
      ...(grouped.get(grant.dashboardId) ?? []),
      grant.machineId,
    ]);
  const dashboardIds = [...grouped]
    .filter(([, ids]) => ids.every((id) => machineIds.includes(id)))
    .map(([id]) => id);
  return { userId, role, machineIds, dashboardIds };
}

/** No context is reserved for trusted background collection/jobs, never request input. */
export function machineScope(column: SQLWrapper) {
  const scope = accessScope.getStore();
  return !scope || scope.role === "admin"
    ? undefined
    : scope.machineIds.length
      ? inArray(column, scope.machineIds)
      : sql`false`;
}
export function dashboardScope(column: SQLWrapper) {
  const scope = accessScope.getStore();
  return !scope || scope.role === "admin"
    ? undefined
    : scope.dashboardIds.length
      ? inArray(column, scope.dashboardIds)
      : sql`false`;
}
export function assertMachine(id: unknown, scope = accessScope.getStore()) {
  if (!scope || scope.role === "admin") return;
  if (
    !Number.isSafeInteger(Number(id)) ||
    !scope.machineIds.includes(Number(id))
  )
    throw new ForbiddenError("Machine access denied");
}
export function assertDashboard(id: unknown, scope = accessScope.getStore()) {
  if (
    scope &&
    scope.role !== "admin" &&
    !scope.dashboardIds.includes(String(id))
  )
    throw new ForbiddenError("Dashboard access denied");
}
export function canOperate(role: string) {
  return ["admin", "operator", "supervisor"].includes(role);
}
export function canSupervise(role: string) {
  return ["admin", "supervisor"].includes(role);
}

type AccessTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Grant changes and session versions commit together; live sockets close before acknowledgment. */
export async function changeAccess<T>(
  change: (tx: AccessTransaction) => Promise<T>,
): Promise<T> {
  const result = await db.transaction(async (tx) => {
    const value = await change(tx);
    const revoked = await tx
      .update(users)
      .set({
        updatedAt: sql`greatest(now(), ${users.updatedAt} + interval '1 millisecond')`,
      })
      .where(sql`${users.role} <> 'admin'`)
      .returning({ id: users.id });
    return { value, revoked };
  });
  for (const user of result.revoked) sessionEvents.emit("userRevoked", user.id);
  return result.value;
}

const parents = {
  twin: "digital_twin_instances",
  shift: "production_shifts",
  entry: "operator_entries",
  alarm: "alert_history",
  rule: "alert_rules",
  profile: "spc_profiles",
  maintenance: "maintenance_plans",
  spcAlert: "spc_alerts",
} as const;
export async function assertResource(kind: keyof typeof parents, id: unknown) {
  const scope = accessScope.getStore();
  if (!scope || scope.role === "admin") return;
  if (!/^\d+$/.test(String(id)))
    throw new ForbiddenError("Invalid resource identifier");
  const result = await db.execute<{ machineId: number }>(
    sql`SELECT machine_id AS "machineId" FROM ${sql.identifier(parents[kind])} WHERE id = ${Number(id)}`,
  );
  if (!result.rows[0]) throw new NotFoundError("Resource");
  assertMachine(result.rows[0].machineId, scope);
}
