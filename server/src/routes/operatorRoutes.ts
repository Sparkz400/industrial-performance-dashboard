import { Router } from "express";
import Joi from "joi";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  machines,
  operatorEntries,
  operatorEntryEvents,
  productionShifts,
  users,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { liveProduction } from "../services/liveProductionService.js";

const router = Router();
const id = Joi.number().integer().positive().required();
const instant = Joi.string()
  .isoDate()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .allow(null);
router.get(
  "/operator/live",
  validateQuery(
    Joi.object({ ids: Joi.string().pattern(/^[1-9]\d*(,[1-9]\d*){0,5}$/) }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await liveProduction(
        typeof req.query.ids === "string"
          ? req.query.ids.split(",").map(Number)
          : undefined,
      ),
    );
  }),
);
const mutable = {
  text: Joi.string().trim().min(1).max(4000).required(),
  priority: Joi.string().valid("normal", "high").required(),
  ownerId: Joi.number().integer().positive().allow(null).required(),
  dueAt: instant.required(),
};
async function validateOwner(ownerId: number | null) {
  if (ownerId === null) return;
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, ownerId),
        eq(users.isActive, true),
        ne(users.role, "wallboard"),
      ),
    );
  if (!owner)
    throw new ValidationError(
      "Select an active operator or administrator as owner",
    );
}

router.get(
  "/operator/owners",
  asyncHandler(async (_req, res) => {
    res.json(
      await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(and(eq(users.isActive, true), ne(users.role, "wallboard")))
        .orderBy(asc(users.username))
        .limit(200),
    );
  }),
);

router.get(
  "/operator/entries",
  validateQuery(
    Joi.object({
      machineId: id,
      status: Joi.string().valid("open", "all").default("open"),
    }),
  ),
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(operatorEntries)
      .where(
        and(
          eq(operatorEntries.machineId, Number(req.query.machineId)),
          req.query.status === "all"
            ? undefined
            : eq(operatorEntries.status, "open"),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${operatorEntries.priority} = 'high' THEN 0 ELSE 1 END`,
        desc(operatorEntries.updatedAt),
        desc(operatorEntries.id),
      )
      .limit(201);
    res.json({ entries: rows.slice(0, 200), truncated: rows.length > 200 });
  }),
);

router.post(
  "/operator/entries",
  validateBody(
    Joi.object({
      ...mutable,
      requestId: Joi.string().guid().required(),
      machineId: id,
      shiftId: Joi.number().integer().positive().allow(null).required(),
      kind: Joi.string().valid("note", "action", "quantity").required(),
      intervalStart: instant.required(),
      intervalEnd: instant.required(),
      quantity: Joi.object({
        total: Joi.number().integer().min(0).max(1e9).required(),
        good: Joi.number().integer().min(0).max(1e9).required(),
        reject: Joi.number().integer().min(0).max(1e9).required(),
      })
        .allow(null)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body;
    await validateOwner(body.ownerId);
    if (body.kind === "action" && !body.ownerId)
      throw new ValidationError("Assign an owner to an action");
    if ((body.kind === "quantity") !== Boolean(body.quantity))
      throw new ValidationError(
        "Quantity declarations need counts; notes and actions do not accept counts",
      );
    if (
      body.quantity &&
      body.quantity.good + body.quantity.reject !== body.quantity.total
    )
      throw new ValidationError(
        "Good and reject counts must equal the declared total",
      );
    const [machine] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, body.machineId));
    if (!machine) throw new NotFoundError("Machine");
    const [shift] = body.shiftId
      ? await db
          .select()
          .from(productionShifts)
          .where(eq(productionShifts.id, body.shiftId))
      : [];
    if (body.shiftId && (!shift || shift.machineId !== body.machineId))
      throw new ValidationError(
        "The shift must belong to the selected machine",
      );
    if (body.kind === "quantity" && !shift)
      throw new ValidationError("Link quantity declarations to a shift");
    const intervalStart = body.intervalStart
      ? new Date(body.intervalStart)
      : null;
    const intervalEnd = body.intervalEnd ? new Date(body.intervalEnd) : null;
    if (
      Boolean(intervalStart) !== Boolean(intervalEnd) ||
      (intervalStart &&
        intervalEnd &&
        (intervalEnd <= intervalStart ||
          intervalEnd.getTime() - intervalStart.getTime() > 48 * 3600000 ||
          (shift && (intervalStart < shift.start || intervalEnd > shift.end))))
    )
      throw new ValidationError(
        "Use a positive interval of at most 48 hours inside the linked shift",
      );
    const draft = {
      ...body,
      intervalStart,
      intervalEnd,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      createdBy: req.session.userId!,
    };
    const entry = await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(operatorEntries)
        .values(draft)
        .onConflictDoNothing({ target: operatorEntries.requestId })
        .returning();
      if (!saved) {
        const [existing] = await tx
          .select()
          .from(operatorEntries)
          .where(eq(operatorEntries.requestId, body.requestId));
        const [first] = await tx
          .select()
          .from(operatorEntryEvents)
          .where(
            and(
              eq(operatorEntryEvents.entryId, existing.id),
              eq(operatorEntryEvents.version, 1),
            ),
          );
        const original = first.snapshot as typeof draft;
        if (
          existing.createdBy !== req.session.userId ||
          Object.entries(draft).some(
            ([key, value]) =>
              JSON.stringify(original[key]) !== JSON.stringify(value),
          )
        )
          throw new ConflictError(
            "This request ID was used for a different entry",
          );
        return existing;
      }
      await tx
        .insert(operatorEntryEvents)
        .values({
          entryId: saved.id,
          actorId: req.session.userId!,
          version: 1,
          snapshot: saved,
        });
      return saved;
    });
    res.status(201).json(entry);
  }),
);

router.post(
  "/operator/entries/:id",
  validateParams(Joi.object({ id })),
  validateBody(
    Joi.object({
      ...mutable,
      version: Joi.number().integer().positive().required(),
      status: Joi.string().valid("open", "resolved").required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    await validateOwner(req.body.ownerId);
    const entryId = Number(req.params.id);
    const result = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(operatorEntries)
        .where(eq(operatorEntries.id, entryId))
        .for("update");
      if (!entry) throw new NotFoundError("Entry");
      if (entry.version !== req.body.version)
        throw new ConflictError(
          "This entry changed. Refresh and review the latest version before saving",
        );
      if (entry.kind === "quantity" && req.session.userRole !== "admin")
        throw new ForbiddenError(
          "An administrator must review quantity declarations",
        );
      if (entry.kind === "action" && !req.body.ownerId)
        throw new ValidationError("An action needs an owner");
      const [updated] = await tx
        .update(operatorEntries)
        .set({
          ...req.body,
          version: entry.version + 1,
          dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(operatorEntries.id, entryId))
        .returning();
      await tx
        .insert(operatorEntryEvents)
        .values({
          entryId,
          actorId: req.session.userId!,
          version: updated.version,
          snapshot: updated,
        });
      return updated;
    });
    res.json(result);
  }),
);

router.get(
  "/operator/entries/:id/history",
  validateParams(Joi.object({ id })),
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(operatorEntryEvents)
      .where(eq(operatorEntryEvents.entryId, Number(req.params.id)))
      .orderBy(desc(operatorEntryEvents.version))
      .limit(101);
    res.json({ events: rows.slice(0, 100), truncated: rows.length > 100 });
  }),
);
export default router;
