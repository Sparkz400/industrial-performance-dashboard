import { Router } from "express";
import Joi from "joi";
import { eq, inArray, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  users,
  machines,
  plants,
  machineGrants,
  machineSites,
  plantMemberships,
  dashboardAssets,
  dashboards,
} from "../database/schema.js";
import {
  accessScope,
  loadAccessScope,
  changeAccess,
} from "../services/accessScope.js";
import { sessionEvents } from "../services/sessionAccess.js";
import { requireRole } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";

const router = Router();
const ids = Joi.array()
  .items(Joi.number().integer().positive())
  .unique()
  .max(500)
  .required();
const idParam = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);
router.get(
  "/me",
  asyncHandler(async (_req, res) => {
    res.json(accessScope.getStore());
  }),
);
router.use(requireRole("admin"));
router.get(
  "/configuration",
  asyncHandler(async (_req, res) => {
    const [
      accounts,
      assets,
      sites,
      grants,
      memberships,
      assignments,
      views,
      viewGrants,
    ] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users),
      db.select({ id: machines.id, name: machines.name }).from(machines),
      db.select().from(plants),
      db.select().from(machineGrants),
      db.select().from(plantMemberships),
      db.select().from(machineSites),
      db.select({ id: dashboards.id, name: dashboards.name }).from(dashboards),
      db.select().from(dashboardAssets),
    ]);
    res.json({
      accounts,
      assets,
      sites,
      grants,
      memberships,
      assignments,
      views,
      viewGrants,
    });
  }),
);

router.put(
  "/users/:id",
  idParam,
  validateBody(Joi.object({ machineIds: ids, plantIds: ids })),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new NotFoundError("User");
    await db.transaction(async (tx) => {
      // Lock the account so concurrent grants cannot restore a revoked permission.
      await tx.select().from(users).where(eq(users.id, id)).for("update");
      const machineIds = req.body.machineIds as number[],
        plantIds = req.body.plantIds as number[];
      if (
        machineIds.length &&
        (
          await tx
            .select()
            .from(machines)
            .where(inArray(machines.id, machineIds))
        ).length !== machineIds.length
      )
        throw new ValidationError("Unknown machine");
      if (
        plantIds.length &&
        (await tx.select().from(plants).where(inArray(plants.id, plantIds)))
          .length !== plantIds.length
      )
        throw new ValidationError("Unknown site");
      await tx.delete(machineGrants).where(eq(machineGrants.userId, id));
      await tx.delete(plantMemberships).where(eq(plantMemberships.userId, id));
      if (machineIds.length)
        await tx
          .insert(machineGrants)
          .values(machineIds.map((machineId) => ({ userId: id, machineId })));
      if (plantIds.length)
        await tx.insert(plantMemberships).values(
          plantIds.map((plantId) => ({
            userId: id,
            plantId,
            role: "viewer" as const,
          })),
        );
      await tx
        .update(users)
        .set({
          updatedAt: sql`greatest(now(), ${users.updatedAt} + interval '1 millisecond')`,
        })
        .where(eq(users.id, id));
    });
    sessionEvents.emit("userRevoked", id);
    await auditLogService.recordEvent(
      {
        action: "access.updated",
        entityType: "user",
        entityId: id,
        message: "Machine and site permissions replaced; sessions revoked",
        metadata: req.body,
      },
      getAuditActor(req),
    );
    res.json(await loadAccessScope(id, user.role));
  }),
);

router.put(
  "/machines/:id/site",
  idParam,
  validateBody(
    Joi.object({
      plantId: Joi.number().integer().positive().allow(null).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await db.select().from(machines).where(eq(machines.id, id))).length)
      throw new NotFoundError("Machine");
    await changeAccess(async (tx) => {
      if (req.body.plantId === null)
        await tx.delete(machineSites).where(eq(machineSites.machineId, id));
      else {
        if (
          !(
            await tx
              .select()
              .from(plants)
              .where(eq(plants.id, req.body.plantId))
          ).length
        )
          throw new ValidationError("Unknown site");
        await tx
          .insert(machineSites)
          .values({ machineId: id, plantId: req.body.plantId })
          .onConflictDoUpdate({
            target: machineSites.machineId,
            set: { plantId: req.body.plantId },
          });
      }
    });
    await auditLogService.recordEvent(
      {
        action: "access.machine-site",
        entityType: "machine",
        entityId: id,
        message: "Site assignment changed; scoped sessions revoked",
        metadata: req.body,
      },
      getAuditActor(req),
    );
    res.json({ ok: true });
  }),
);
router.put(
  "/dashboards/:id",
  validateParams(Joi.object({ id: Joi.string().min(3).max(100).required() })),
  validateBody(Joi.object({ machineIds: ids })),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id),
      machineIds = req.body.machineIds as number[];
    if (
      !(await db.select().from(dashboards).where(eq(dashboards.id, id))).length
    )
      throw new NotFoundError("Dashboard");
    await changeAccess(async (tx) => {
      await tx
        .select()
        .from(dashboards)
        .where(eq(dashboards.id, id))
        .for("update");
      if (
        machineIds.length &&
        (
          await tx
            .select()
            .from(machines)
            .where(inArray(machines.id, machineIds))
        ).length !== machineIds.length
      )
        throw new ValidationError("Unknown machine");
      await tx
        .delete(dashboardAssets)
        .where(eq(dashboardAssets.dashboardId, id));
      if (machineIds.length)
        await tx
          .insert(dashboardAssets)
          .values(
            machineIds.map((machineId) => ({ dashboardId: id, machineId })),
          );
    });
    await auditLogService.recordEvent(
      {
        action: "access.dashboard",
        entityType: "dashboard",
        entityId: id,
        message: "Dashboard asset scope changed",
        metadata: req.body,
      },
      getAuditActor(req),
    );
    res.json({ ok: true });
  }),
);
export default router;
