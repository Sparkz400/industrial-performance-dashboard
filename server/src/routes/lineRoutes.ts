import { Router } from "express";
import Joi from "joi";
import manager from "../database/dbConnection.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { accessScope, assertMachine } from "../services/accessScope.js";
import { requireRole } from "../middleware/auth.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";
import {
  analyzeLine,
  type LineConfig,
  type LineSample,
} from "../services/lineAnalysis.js";
const router = Router();
router.use(requireRole("admin", "supervisor"));
const id = Joi.object({ id: Joi.number().integer().positive().required() });
const key = Joi.string().trim().min(1).max(200);
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const scope = accessScope.getStore()!;
    res.json(
      (
        await manager.pool.query(
          `SELECT * FROM production_lines l WHERE $1 OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(l.config->'machines') m
        WHERE NOT ((m->>'machineId')::int = ANY($2::int[]))
      ) ORDER BY id`,
          [scope.role === "admin", scope.machineIds],
        )
      ).rows,
    );
  }),
);
router.post(
  "/",
  validateBody(
    Joi.object({
      name: key.required(),
      maxGapSeconds: Joi.number().min(1).max(300).required(),
      microstopSeconds: Joi.number().min(1).max(300).required(),
      machines: Joi.array()
        .items(
          Joi.object({
            machineId: Joi.number().integer().positive().required(),
            stateKey: key.required(),
            cycleKey: key.allow(null).required(),
            outputKey: key.allow(null).required(),
            states: Joi.object(
              Object.fromEntries(
                ["running", "idle", "fault", "blocked", "starved"].map((s) => [
                  s,
                  Joi.array().items(Joi.number()).max(32).required(),
                ]),
              ),
            ).required(),
          }),
        )
        .min(2)
        .max(30)
        .unique("machineId")
        .required(),
      buffers: Joi.array()
        .items(
          Joi.object({
            from: Joi.number().integer().positive().required(),
            to: Joi.number().integer().positive().required(),
            machineId: Joi.number().integer().positive().required(),
            nodeKey: key.required(),
            capacity: Joi.number().positive().required(),
          }),
        )
        .max(60)
        .required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const config = req.body as LineConfig,
      ids = config.machines.map((m) => m.machineId);
    ids.forEach((id) => assertMachine(id));
    for (const m of config.machines) {
      const codes = Object.values(m.states).flat();
      if (new Set(codes).size !== codes.length)
        throw new ValidationError("State codes must be unambiguous");
    }
    if (
      config.buffers.some(
        (b) =>
          b.from === b.to ||
          ![b.from, b.to, b.machineId].every((i) => ids.includes(i)),
      )
    )
      throw new ValidationError(
        "Buffers must link distinct machines in this line",
      );
    const walk = (id: number, seen: Set<number>): boolean =>
      seen.has(id) ||
      config.buffers
        .filter((b) => b.from === id)
        .some((b) => walk(b.to, new Set([...seen, id])));
    if (ids.some((i) => walk(i, new Set())))
      throw new ValidationError("Line relationships must not contain cycles");
    if (
      (
        await manager.pool.query("SELECT id FROM machines WHERE id=ANY($1)", [
          ids,
        ])
      ).rowCount !== ids.length
    )
      throw new ValidationError("Unknown machine");
    res
      .status(201)
      .json(
        (
          await manager.pool.query(
            "INSERT INTO production_lines(config,created_by) VALUES($1,$2) RETURNING *",
            [config, req.session.userId],
          )
        ).rows[0],
      );
  }),
);
router.get(
  "/:id/report",
  validateParams(id),
  validateQuery(
    Joi.object({
      start: Joi.string().isoDate().required(),
      end: Joi.string().isoDate().required(),
      target: Joi.number().positive().required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const start = Date.parse(String(req.query.start)),
      end = Date.parse(String(req.query.end));
    if (end <= start || end - start > 48 * 3600000)
      throw new ValidationError("Choose a positive window of at most 48 hours");
    const line = (
      await manager.pool.query("SELECT * FROM production_lines WHERE id=$1", [
        Number(req.params.id),
      ])
    ).rows[0];
    if (!line) throw new NotFoundError("Line");
    const config = line.config as LineConfig,
      signals = new Map<string, { id: number; key: string }>();
    config.machines.forEach((m) => assertMachine(m.machineId));
    config.buffers.forEach((b) => assertMachine(b.machineId));
    for (const m of config.machines)
      for (const key of [m.stateKey, m.cycleKey, m.outputKey])
        if (key) signals.set(`${m.machineId}:${key}`, { id: m.machineId, key });
    for (const b of config.buffers)
      signals.set(`${b.machineId}:${b.nodeKey}`, {
        id: b.machineId,
        key: b.nodeKey,
      });
    const data: Record<string, LineSample[]> = {};
    let totalRows = 0;
    for (const [identity, s] of signals) {
      const rows = (
        await manager.pool.query(
          "SELECT timestamp,value,status_code FROM opcua_data WHERE machine_id=$1 AND node_key=$2 AND timestamp >= $3 AND timestamp <= $4 ORDER BY timestamp,id LIMIT 100001",
          [
            s.id,
            s.key,
            new Date(start - config.maxGapSeconds * 1000),
            new Date(end),
          ],
        )
      ).rows;
      totalRows += rows.length;
      if (rows.length > 100000 || totalRows > 200000)
        throw new ValidationError(
          "Too many measurements; shorten the report window",
        );
      data[identity] = rows.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString(),
      }));
    }
    res.json({
      lineId: line.id,
      config,
      ...analyzeLine(config, data, start, end, Number(req.query.target)),
    });
  }),
);
export default router;
