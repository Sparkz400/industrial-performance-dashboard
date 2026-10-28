import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { requireRole } from "../middleware/auth.js";
import { assertMachine } from "../services/accessScope.js";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../utils/errors.js";
import { energyCostEstimate } from "../services/energyCosts.js";
import { report } from "./productionRoutes.js";
const router = Router(),
  id = Joi.object({ id: Joi.number().integer().positive().required() });
const instant = Joi.string()
  .isoDate()
  .strict()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();
router.get(
  "/machines/:id/tariffs",
  validateParams(id),
  asyncHandler(async (req, res) => {
    assertMachine(req.params.id);
    res.json(
      (
        await manager.pool.query(
          "SELECT * FROM energy_tariffs WHERE machine_id=$1 ORDER BY valid_from DESC LIMIT 1000",
          [Number(req.params.id)],
        )
      ).rows,
    );
  }),
);
router.post(
  "/machines/:id/tariffs",
  requireRole("admin", "supervisor"),
  validateParams(id),
  validateBody(
    Joi.object({
      version: Joi.number().integer().min(0).required(),
      validFrom: instant,
      validTo: instant,
      currency: Joi.string()
        .pattern(/^[A-Z]{3}$/)
        .required(),
      pricePerKWh: Joi.number().min(0).max(1e9).required(),
      kgCo2ePerKWh: Joi.number().min(0).max(1e6).allow(null).required(),
      reference: Joi.string().trim().min(1).max(500).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id),
      b = req.body;
    assertMachine(machineId);
    if (Date.parse(b.validTo) <= Date.parse(b.validFrom))
      throw new ValidationError("Tariff end must be after its start");
    const connection = await manager.pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `energy-tariffs:${machineId}`,
      ]);
      const actor = (
        await connection.query(
          "SELECT updated_at FROM users WHERE id=$1 AND is_active AND role IN ('admin','supervisor') FOR SHARE",
          [req.session.userId],
        )
      ).rows[0];
      if (
        !actor ||
        new Date(actor.updated_at).toISOString() !== req.session.userVersion
      )
        throw new ForbiddenError(
          "Your account or asset permissions changed; sign in again before preserving a tariff",
        );
      const current = (
        await connection.query(
          "SELECT coalesce(max(version),0)::int AS version,count(*)::int AS count FROM energy_tariffs WHERE machine_id=$1",
          [machineId],
        )
      ).rows[0];
      if (current.version !== b.version)
        throw new ConflictError("Tariff schedule changed; reload first");
      if (current.count >= 1000)
        throw new ConflictError(
          "Tariff schedule reached 1000 preserved periods",
        );
      if (
        (
          await connection.query(
            "SELECT id FROM energy_tariffs WHERE machine_id=$1 AND valid_from<$3 AND valid_to>$2",
            [machineId, b.validFrom, b.validTo],
          )
        ).rowCount
      )
        throw new ConflictError(
          "Tariff periods must not overlap; existing factors are preserved",
        );
      const saved = (
        await connection.query(
          `INSERT INTO energy_tariffs(machine_id,version,valid_from,valid_to,currency,price_per_kwh,kg_co2e_per_kwh,reference,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            machineId,
            current.version + 1,
            b.validFrom,
            b.validTo,
            b.currency,
            b.pricePerKWh,
            b.kgCo2ePerKWh,
            b.reference,
            req.session.userId,
          ],
        )
      ).rows[0];
      await connection.query("COMMIT");
      res.status(201).json(saved);
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }),
);
router.get(
  "/shifts/:id",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const value = await report(Number(req.params.id));
    assertMachine(value.machineId);
    res.json(await energyCostEstimate(value));
  }),
);
export default router;
