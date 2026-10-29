import { Router } from "express";
import Joi from "joi";
import { and, eq, inArray } from "drizzle-orm";
import db from "../database/db.js";
import {
  improvementActions,
  maintenanceActions,
  recommendationDecisions,
  usefulnessEvents,
} from "../database/schema.js";
import manager from "../database/dbConnection.js";
import { requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import { maintenanceActionOutcomes } from "../services/maintenanceActions.js";
import { recommend } from "../services/recommendations.js";
import { latestRevisions } from "../services/savedRevisions.js";
import { ConflictError, ValidationError } from "../utils/errors.js";

// X06: rule-based recommendations for supervisors, their decisions and a usefulness log.
const router = Router();
router.use(requireRole("admin", "supervisor"));
const machine = validateParams(
  Joi.object({ id: Joi.number().integer().positive().required() }),
);

async function current(machineId: number) {
  const [{ revisions }, maintenance, improvements] = await Promise.all([
    latestRevisions(machineId),
    maintenanceActionOutcomes(machineId),
    db
      .select({
        id: improvementActions.id,
        implementedAt: improvementActions.implementedAt,
      })
      .from(improvementActions)
      .where(eq(improvementActions.machineId, machineId)),
  ]);
  return recommend({ revisions, maintenance, improvements });
}

router.get(
  "/machines/:id",
  machine,
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const recommendations = await current(machineId);
    const decisions = await db
      .select()
      .from(recommendationDecisions)
      .where(eq(recommendationDecisions.machineId, machineId));
    const outcomes = await maintenanceActionOutcomes(machineId);
    const linkedImprovements = decisions
      .map((d) => d.improvementActionId)
      .filter((id): id is number => id != null);
    const improvements = linkedImprovements.length
      ? await db
          .select({
            id: improvementActions.id,
            title: improvementActions.title,
            implementedAt: improvementActions.implementedAt,
          })
          .from(improvementActions)
          .where(inArray(improvementActions.id, linkedImprovements))
      : [];
    const decided = (key: string) => {
      const decision = decisions.find((d) => d.key === key);
      if (!decision) return null;
      return {
        ...decision,
        improvementAction:
          improvements.find((i) => i.id === decision.improvementActionId) ??
          null,
        maintenanceOutcome:
          outcomes.find((o) => o.id === decision.maintenanceActionId)
            ?.outcome ?? null,
      };
    };
    res.json(recommendations.map((r) => ({ ...r, decision: decided(r.key) })));
  }),
);

router.post(
  "/machines/:id/decisions",
  machine,
  validateBody(
    Joi.object({
      key: Joi.string().max(300).required(),
      decision: Joi.string().valid("accepted", "dismissed").required(),
      reason: Joi.string().trim().min(3).max(1000).when("decision", {
        is: "dismissed",
        then: Joi.required(),
      }),
      improvementActionId: Joi.number().integer().positive(),
      maintenanceActionId: Joi.number().integer().positive(),
    }).when(Joi.object({ decision: Joi.valid("accepted") }).unknown(), {
      then: Joi.object().or("improvementActionId", "maintenanceActionId"),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const { key, decision, reason, improvementActionId, maintenanceActionId } =
      req.body;
    if (!(await current(machineId)).some((r) => r.key === key))
      throw new ValidationError(
        "This recommendation is not current for the machine",
      );
    // Linked actions must belong to the same machine.
    if (improvementActionId) {
      const [action] = await db
        .select({ id: improvementActions.id })
        .from(improvementActions)
        .where(
          and(
            eq(improvementActions.id, improvementActionId),
            eq(improvementActions.machineId, machineId),
          ),
        );
      if (!action)
        throw new ValidationError(
          "The improvement action is not on this machine",
        );
    }
    if (maintenanceActionId) {
      const [action] = await db
        .select({ id: maintenanceActions.id })
        .from(maintenanceActions)
        .where(
          and(
            eq(maintenanceActions.id, maintenanceActionId),
            eq(maintenanceActions.machineId, machineId),
          ),
        );
      if (!action)
        throw new ValidationError("The alarm action is not on this machine");
    }
    const saved = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(recommendationDecisions)
        .values({
          machineId,
          key,
          decision,
          reason: reason ?? null,
          improvementActionId: improvementActionId ?? null,
          maintenanceActionId: maintenanceActionId ?? null,
          decidedBy: req.session.userId!,
        })
        .onConflictDoNothing()
        .returning();
      if (!row)
        throw new ConflictError("This recommendation was already decided");
      await tx.insert(usefulnessEvents).values({
        machineId,
        source: "recommendations",
        event: decision,
        key,
        userId: req.session.userId!,
      });
      return row;
    });
    await auditLogService.recordEvent(
      {
        action: `recommendation.${decision}`,
        entityType: "machine",
        entityId: machineId,
        message: `Recommendation ${key} ${decision}${reason ? `: ${reason}` : ""}`,
      },
      getAuditActor(req),
    );
    res.status(201).json(saved);
  }),
);

router.post(
  "/machines/:id/usefulness",
  machine,
  validateBody(
    Joi.object({
      source: Joi.string().valid("recommendations", "ranked-losses").required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    await db.insert(usefulnessEvents).values({
      machineId,
      source: req.body.source,
      event: "shown",
      userId: req.session.userId!,
    });
    res.status(204).end();
  }),
);

router.get(
  "/machines/:id/usefulness",
  machine,
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const counts = await manager.pool.query(
      `SELECT source, event, count(*)::int AS n, count(DISTINCT user_id)::int AS people
       FROM usefulness_events WHERE machine_id=$1 GROUP BY source, event`,
      [machineId],
    );
    // Proxy for the ranked list: improvement actions created by someone within 7 days after
    // they were shown the list. It is not proof that the list caused the action.
    const proxy = await manager.pool.query(
      `SELECT count(DISTINCT a.id)::int AS n FROM improvement_actions a
       WHERE a.machine_id=$1 AND EXISTS (SELECT 1 FROM usefulness_events u
         WHERE u.machine_id=a.machine_id AND u.source='ranked-losses' AND u.user_id=a.created_by
           AND a.created_at BETWEEN u.at AND u.at + interval '7 days')`,
      [machineId],
    );
    const pick = (source: string, event: string) =>
      counts.rows.find((r) => r.source === source && r.event === event)?.n ?? 0;
    res.json({
      note: "A log for the pilot review (P06). Counts show what was seen and done here; they do not show that either list caused an improvement.",
      recommendations: {
        shown: pick("recommendations", "shown"),
        accepted: pick("recommendations", "accepted"),
        dismissed: pick("recommendations", "dismissed"),
      },
      rankedLosses: {
        shown: pick("ranked-losses", "shown"),
        actionsWithin7DaysOfViewing: proxy.rows[0].n,
      },
    });
  }),
);

export default router;
