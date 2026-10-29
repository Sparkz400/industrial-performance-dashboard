import { Router } from "express";
import Joi from "joi";
import { desc, eq, inArray, max } from "drizzle-orm";
import config from "../config/config.js";
import db from "../database/db.js";
import {
  edgeConfigRevisions,
  edgeMachines,
  edgeNodes,
  machines,
  opcuaData,
  plants,
} from "../database/schema.js";
import { requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { accessScope } from "../services/accessScope.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import { issueEnrollment } from "../services/edgeCentral.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

// E03/E04 central side: edge lifecycle (administrators) and the site overview (granted users).
const router = Router();
const admin = requireRole("admin");
const id = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);
const OFFLINE_FLOOR_MS = 120_000;

const recordEdge = (
  req: Parameters<typeof getAuditActor>[0],
  action: string,
  edgeId: number,
  message: string,
) =>
  auditLogService.recordEvent(
    { action, entityType: "edge", entityId: edgeId, message },
    getAuditActor(req),
  );
async function edgeOr404(edgeId: number) {
  const [edge] = await db
    .select()
    .from(edgeNodes)
    .where(eq(edgeNodes.id, edgeId));
  if (!edge) throw new NotFoundError("Edge");
  return edge;
}
const latestConfigs = async (edgeIds: number[]) =>
  edgeIds.length
    ? db
        .select()
        .from(edgeConfigRevisions)
        .where(inArray(edgeConfigRevisions.edgeId, edgeIds))
        .orderBy(desc(edgeConfigRevisions.revision))
    : [];

/** Online only with recent contact; an unknown or silent site is never shown as producing. */
function availability(
  edge: typeof edgeNodes.$inferSelect,
  intervalSeconds: number,
) {
  if (edge.revokedAt) return "revoked";
  if (!edge.enrolledAt) return "not enrolled";
  if (!edge.lastContactAt) return "never connected";
  const offlineAfter = Math.max(3 * intervalSeconds * 1000, OFFLINE_FLOOR_MS);
  return Date.now() - edge.lastContactAt.getTime() > offlineAfter
    ? "offline"
    : "online";
}

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const scope = accessScope.getStore();
    const linked = await db
      .select({
        edgeId: edgeMachines.edgeId,
        machineId: edgeMachines.machineId,
        name: machines.name,
        remoteName: edgeMachines.remoteName,
        definitionDigest: edgeMachines.definitionDigest,
      })
      .from(edgeMachines)
      .innerJoin(machines, eq(machines.id, edgeMachines.machineId));
    const visible = linked.filter(
      (m) =>
        !scope ||
        scope.role === "admin" ||
        scope.machineIds.includes(m.machineId),
    );
    const edgeIds = [...new Set(visible.map((m) => m.edgeId))];
    const isAdmin = !scope || scope.role === "admin";
    const edges = (
      await db
        .select({ edge: edgeNodes, site: plants.name })
        .from(edgeNodes)
        .innerJoin(plants, eq(plants.id, edgeNodes.plantId))
        .orderBy(plants.name, edgeNodes.name)
    ).filter(({ edge }) => isAdmin || edgeIds.includes(edge.id));
    const newest = visible.length
      ? await db
          .select({
            machineId: opcuaData.machineId,
            newest: max(opcuaData.timestamp),
          })
          .from(opcuaData)
          .where(
            inArray(
              opcuaData.machineId,
              visible.map((m) => m.machineId),
            ),
          )
          .groupBy(opcuaData.machineId)
      : [];
    const configs = await latestConfigs(edges.map(({ edge }) => edge.id));
    res.json(
      edges.map(({ edge, site }) => {
        const applied = configs.find(
          (c) =>
            c.edgeId === edge.id && c.revision === edge.appliedConfigRevision,
        );
        const interval =
          (applied?.settings as { syncIntervalSeconds?: number } | undefined)
            ?.syncIntervalSeconds ?? config.EDGE_SYNC_INTERVAL_MS / 1000;
        return {
          id: edge.id,
          name: edge.name,
          site,
          availability: availability(edge, interval),
          lastContactAt: edge.lastContactAt,
          lastSuccessfulSyncAt: edge.lastBatchAt,
          newestReadingAt: edge.newestReadingAt,
          backlogAtLastContact: edge.backlog,
          machines: visible
            .filter((m) => m.edgeId === edge.id)
            .map((m) => ({
              id: m.machineId,
              name: m.name,
              definitionDigest: m.definitionDigest,
              newestReadingAt:
                newest.find((n) => n.machineId === m.machineId)?.newest ?? null,
            })),
        };
      }),
    );
  }),
);

router.get(
  "/",
  admin,
  asyncHandler(async (_req, res) => {
    const edges = await db.select().from(edgeNodes).orderBy(edgeNodes.name);
    const configs = await latestConfigs(edges.map((e) => e.id));
    res.json(
      edges.map(({ tokenHash, enrollmentHash, ...edge }) => ({
        ...edge,
        enrolled: Boolean(tokenHash),
        enrollmentPending: Boolean(enrollmentHash),
        latestConfig: configs.find((c) => c.edgeId === edge.id) ?? null,
      })),
    );
  }),
);

router.post(
  "/",
  admin,
  validateBody(
    Joi.object({
      name: Joi.string()
        .pattern(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/)
        .required(),
      plantId: Joi.number().integer().positive().required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const [site] = await db
      .select({ id: plants.id })
      .from(plants)
      .where(eq(plants.id, req.body.plantId));
    if (!site) throw new ValidationError("Unknown site");
    const [edge] = await db
      .insert(edgeNodes)
      .values({ ...req.body, createdBy: req.session.userId! })
      .returning({ id: edgeNodes.id, name: edgeNodes.name });
    const enrollment = await issueEnrollment(edge.id);
    await recordEdge(
      req,
      "edge.created",
      edge.id,
      `Edge "${edge.name}" created for site ${req.body.plantId}; enrollment code issued`,
    );
    // The code is returned once; only its hash is stored.
    res.status(201).json({ ...edge, enrollment });
  }),
);

router.post(
  "/:id/enrollment",
  admin,
  id,
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(Number(req.params.id));
    if (edge.revokedAt)
      throw new ValidationError(
        "A revoked edge is not re-enrolled; create a new one",
      );
    const enrollment = await issueEnrollment(edge.id);
    await recordEdge(
      req,
      "edge.enrollment_issued",
      edge.id,
      `New enrollment code for "${edge.name}"; enrolling with it replaces the current token`,
    );
    res.status(201).json({ id: edge.id, name: edge.name, enrollment });
  }),
);

router.post(
  "/:id/revoke",
  admin,
  id,
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(Number(req.params.id));
    await db
      .update(edgeNodes)
      .set({
        revokedAt: new Date(),
        enrollmentHash: null,
        enrollmentExpiresAt: null,
      })
      .where(eq(edgeNodes.id, edge.id));
    await recordEdge(
      req,
      "edge.revoked",
      edge.id,
      `Edge "${edge.name}" revoked; its stored history is kept`,
    );
    res.json({ id: edge.id, revoked: true });
  }),
);

router.put(
  "/:id/target-version",
  admin,
  id,
  validateBody(
    Joi.object({
      targetVersion: Joi.string()
        .pattern(/^[A-Za-z0-9._-]{1,40}$/)
        .allow(null)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(Number(req.params.id));
    await db
      .update(edgeNodes)
      .set({ targetVersion: req.body.targetVersion })
      .where(eq(edgeNodes.id, edge.id));
    await recordEdge(
      req,
      "edge.target_version",
      edge.id,
      `Staged upgrade for "${edge.name}": ${req.body.targetVersion ?? "none"} (was ${edge.targetVersion ?? "none"}; running ${edge.softwareVersion ?? "unknown"})`,
    );
    res.json({ id: edge.id, targetVersion: req.body.targetVersion });
  }),
);

router.post(
  "/:id/config",
  admin,
  id,
  validateBody(
    Joi.object({
      // The edge decides whether it supports the schema and settings; it rejects what it cannot apply.
      schemaVersion: Joi.number().integer().min(1).max(100).default(1),
      settings: Joi.object().max(20).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const edge = await edgeOr404(Number(req.params.id));
    if (JSON.stringify(req.body.settings).length > 2000)
      throw new ValidationError("Settings are limited to 2,000 characters");
    const saved = await db.transaction(async (tx) => {
      const [{ latest }] = await tx
        .select({ latest: max(edgeConfigRevisions.revision) })
        .from(edgeConfigRevisions)
        .where(eq(edgeConfigRevisions.edgeId, edge.id));
      const [row] = await tx
        .insert(edgeConfigRevisions)
        .values({
          edgeId: edge.id,
          revision: (latest ?? 0) + 1,
          schemaVersion: req.body.schemaVersion,
          settings: req.body.settings,
          createdBy: req.session.userId!,
        })
        .returning();
      return row;
    });
    await recordEdge(
      req,
      "edge.config_revision",
      edge.id,
      `Configuration revision ${saved.revision} for "${edge.name}": ${JSON.stringify(saved.settings)}`,
    );
    res.status(201).json(saved);
  }),
);

export default router;
