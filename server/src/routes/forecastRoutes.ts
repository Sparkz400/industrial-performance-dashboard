import { Router } from "express";
import Joi from "joi";
import { and, desc, eq, lte } from "drizzle-orm";
import db from "../database/db.js";
import { improvementActions } from "../database/schema.js";
import { requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateParams, validateQuery } from "../middleware/validation.js";
import { assertMachine } from "../services/accessScope.js";
import {
  backtest,
  comparableRuns,
  forecast,
  FORECAST_VERSION,
  MIN_COMPARABLE_RUNS,
} from "../services/completionForecast.js";
import { latestRevisions } from "../services/savedRevisions.js";

// X04: advisory completion estimates for supervisors. Read-only; nothing is rescheduled.
const router = Router();
router.use(requireRole("admin", "supervisor"));

router.get(
  "/machines/:id/completion",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  validateQuery(
    Joi.object({
      product: Joi.string().trim().max(160),
      remaining: Joi.number().integer().min(1).max(10_000_000),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    assertMachine(machineId);
    const { revisions, failedIntegrity } = await latestRevisions(machineId);
    // A declared process change (improvement action) starts a new comparable history.
    const [change] = await db
      .select({
        implementedAt: improvementActions.implementedAt,
        title: improvementActions.title,
      })
      .from(improvementActions)
      .where(
        and(
          eq(improvementActions.machineId, machineId),
          lte(improvementActions.implementedAt, new Date()),
        ),
      )
      .orderBy(desc(improvementActions.implementedAt))
      .limit(1);
    const product = req.query.product as string | undefined;
    const remaining = req.query.remaining as number | undefined;
    const { runs, excluded, products } = comparableRuns(
      revisions,
      product ?? "",
      change?.implementedAt ?? null,
    );
    res.json({
      version: FORECAST_VERSION,
      advisory:
        "An estimate from comparable verified runs; it does not reschedule, plan or control anything.",
      basis:
        "Rates are good parts per planned run hour; actual run ends are not recorded.",
      products,
      product: product ?? null,
      remaining: remaining ?? null,
      processChange: change ?? null,
      minimumRuns: MIN_COMPARABLE_RUNS,
      comparableRuns: product ? runs.length : null,
      excluded: product ? excluded : null,
      failedIntegrity,
      estimate: product && remaining ? forecast(runs, remaining) : null,
      backtest: product ? backtest(runs) : null,
    });
  }),
);

export default router;
