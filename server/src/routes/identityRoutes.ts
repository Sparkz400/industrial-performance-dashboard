import { Router } from "express";
import Joi from "joi";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import db from "../database/db.js";
import {
  machineGrants,
  machines,
  oidcGroupMappings,
  plants,
  serviceTokens,
  users,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import { hashShareToken } from "../services/shareService.js";
import { sessionEvents } from "../services/sessionAccess.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";

// E02: identity-provider group mappings and service accounts. Mounted admin-only.
const router = Router();
export const SERVICE_TOKEN_PREFIX = "pdsa_";
const id = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);
const expiresInDays = Joi.number().integer().min(1).max(365).required();

router.get(
  "/group-mappings",
  asyncHandler(async (_req, res) => {
    res.json(
      await db
        .select()
        .from(oidcGroupMappings)
        .orderBy(oidcGroupMappings.groupName),
    );
  }),
);

router.put(
  "/group-mappings",
  validateBody(
    Joi.object({
      mappings: Joi.array()
        .max(100)
        .unique("groupName")
        .items(
          Joi.object({
            groupName: Joi.string().trim().min(1).max(256).required(),
            // Admin is never granted by a group.
            role: Joi.string()
              .valid("wallboard", "viewer", "operator", "supervisor")
              .required(),
            plantIds: Joi.array()
              .items(Joi.number().integer().positive())
              .max(50)
              .unique()
              .default([]),
          }),
        )
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const mappings: {
      groupName: string;
      role: "wallboard" | "viewer" | "operator" | "supervisor";
      plantIds: number[];
    }[] = req.body.mappings;
    const plantIds = [...new Set(mappings.flatMap((m) => m.plantIds))];
    if (plantIds.length) {
      const known = await db
        .select({ id: plants.id })
        .from(plants)
        .where(inArray(plants.id, plantIds));
      if (known.length !== plantIds.length)
        throw new ValidationError("A mapping names an unknown site");
    }
    const previous = await db.transaction(async (tx) => {
      const before = await tx.select().from(oidcGroupMappings);
      await tx.delete(oidcGroupMappings);
      if (mappings.length)
        await tx
          .insert(oidcGroupMappings)
          .values(
            mappings.map((m) => ({ ...m, updatedBy: req.session.userId! })),
          );
      return before;
    });
    await auditLogService.recordEvent(
      {
        action: "identity.group_mappings.replaced",
        entityType: "identity",
        message: `Group mappings replaced (${mappings.length}); they apply at each account's next sign-in`,
        metadata: {
          previous: previous.map(({ groupName, role, plantIds }) => ({
            groupName,
            role,
            plantIds,
          })),
          current: mappings,
        },
      },
      getAuditActor(req),
    );
    res.json(mappings);
  }),
);

const tokenColumns = {
  id: serviceTokens.id,
  userId: serviceTokens.userId,
  expiresAt: serviceTokens.expiresAt,
  revokedAt: serviceTokens.revokedAt,
  lastUsedAt: serviceTokens.lastUsedAt,
  createdAt: serviceTokens.createdAt,
};
async function issueToken(
  tx: Pick<typeof db, "insert">,
  userId: number,
  days: number,
  createdBy: number,
) {
  const token = SERVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await tx
    .insert(serviceTokens)
    .values({
      userId,
      tokenHash: hashShareToken(token),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      createdBy,
    })
    .returning(tokenColumns);
  // The token is returned once; only its hash is stored.
  return { ...row, token };
}

router.get(
  "/service-accounts",
  asyncHandler(async (_req, res) => {
    const accounts = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.authSource, "service"))
      .orderBy(users.username);
    const ids = accounts.map((a) => a.id);
    const [grants, tokens] = ids.length
      ? await Promise.all([
          db
            .select({
              userId: machineGrants.userId,
              machineId: machineGrants.machineId,
              name: machines.name,
            })
            .from(machineGrants)
            .innerJoin(machines, eq(machines.id, machineGrants.machineId))
            .where(inArray(machineGrants.userId, ids)),
          db
            .select(tokenColumns)
            .from(serviceTokens)
            .where(inArray(serviceTokens.userId, ids))
            .orderBy(desc(serviceTokens.createdAt)),
        ])
      : [[], []];
    res.json(
      accounts.map((a) => ({
        ...a,
        machines: grants
          .filter((g) => g.userId === a.id)
          .map(({ machineId, name }) => ({ id: machineId, name })),
        tokens: tokens.filter((t) => t.userId === a.id),
      })),
    );
  }),
);

router.post(
  "/service-accounts",
  validateBody(
    Joi.object({
      username: Joi.string()
        .pattern(/^[A-Za-z0-9._-]{3,100}$/)
        .required(),
      // Read-only: supervisor only for the work-order completion endpoint.
      role: Joi.string().valid("viewer", "supervisor").default("viewer"),
      machineIds: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .max(200)
        .unique()
        .required(),
      expiresInDays,
    }),
  ),
  asyncHandler(async (req, res) => {
    const { username, role, machineIds, expiresInDays: days } = req.body;
    const known = await db
      .select({ id: machines.id })
      .from(machines)
      .where(inArray(machines.id, machineIds));
    if (known.length !== machineIds.length)
      throw new ValidationError("A machine does not exist");
    const created = await db.transaction(async (tx) => {
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username));
      if (taken)
        throw new ConflictError(`An account named "${username}" exists`);
      const [account] = await tx
        .insert(users)
        .values({ username, role, authSource: "service" })
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
        });
      await tx
        .insert(machineGrants)
        .values(
          machineIds.map((machineId: number) => ({
            userId: account.id,
            machineId,
          })),
        );
      return {
        ...account,
        token: await issueToken(tx, account.id, days, req.session.userId!),
      };
    });
    await auditLogService.recordEvent(
      {
        action: "identity.service_account.created",
        entityType: "user",
        entityId: created.id,
        entityName: created.username,
        message: `Service account "${created.username}" (${role}) created for machines ${machineIds.join(", ")}; token ${created.token.id} expires ${created.token.expiresAt.toISOString()}`,
      },
      getAuditActor(req),
    );
    res.status(201).json(created);
  }),
);

router.post(
  "/service-accounts/:id/tokens",
  id,
  validateBody(Joi.object({ expiresInDays })),
  asyncHandler(async (req, res) => {
    const accountId = Number(req.params.id);
    const [account] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(and(eq(users.id, accountId), eq(users.authSource, "service")));
    if (!account) throw new NotFoundError("Service account");
    const token = await issueToken(
      db,
      account.id,
      req.body.expiresInDays,
      req.session.userId!,
    );
    await auditLogService.recordEvent(
      {
        action: "identity.service_token.issued",
        entityType: "user",
        entityId: account.id,
        entityName: account.username,
        message: `Token ${token.id} issued for "${account.username}", expires ${token.expiresAt.toISOString()}`,
      },
      getAuditActor(req),
    );
    res.status(201).json(token);
  }),
);

router.post(
  "/service-tokens/:id/revoke",
  id,
  asyncHandler(async (req, res) => {
    const [token] = await db
      .update(serviceTokens)
      .set({ revokedAt: new Date() })
      .where(eq(serviceTokens.id, Number(req.params.id)))
      .returning(tokenColumns);
    if (!token) throw new NotFoundError("Service token");
    sessionEvents.emit("userRevoked", token.userId);
    await auditLogService.recordEvent(
      {
        action: "identity.service_token.revoked",
        entityType: "user",
        entityId: token.userId,
        message: `Token ${token.id} revoked`,
      },
      getAuditActor(req),
    );
    res.json(token);
  }),
);

export default router;
