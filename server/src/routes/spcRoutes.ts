import express, { type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { spcService, clearProfileBuffers } from "../services/spcService.js";
import {
  approveBaseline,
  baselineCapability,
} from "../services/spcBaseline.js";
import manager from "../database/dbConnection.js";

const router = express.Router();

// All SPC routes require authentication
router.use(requireAuth);
router.get(
  "/profiles/:id/baselines",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      (
        await manager.pool.query(
          "SELECT * FROM spc_baselines WHERE profile_id=$1 ORDER BY id DESC LIMIT 20",
          [Number(req.params.id)],
        )
      ).rows,
    );
  }),
);
router.post(
  "/baselines/:id/approve",
  requireRole("admin"),
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  validateBody(
    Joi.object({
      review: Joi.string().trim().min(20).max(2000).required(),
      stableProcess: Joi.boolean().valid(true).required(),
      independentNormalObservations: Joi.boolean().valid(true).required(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const saved = await approveBaseline(
      Number(req.params.id),
      req.session.userId!,
      req.body.review,
    );
    clearProfileBuffers(saved.profile_id);
    res.json(saved);
  }),
);
router.get(
  "/profiles/:id/capability",
  validateParams(
    Joi.object({ id: Joi.number().integer().positive().required() }),
  ),
  validateQuery(
    Joi.object({ lsl: Joi.number().required(), usl: Joi.number().required() }),
  ),
  asyncHandler(async (req, res) => {
    res.json(
      await baselineCapability(
        Number(req.params.id),
        Number(req.query.lsl),
        Number(req.query.usl),
      ),
    );
  }),
);

// ---- Param schemas ----

const idParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

// ---- Profile schemas ----

const createProfileSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  machineId: Joi.number().integer().positive().allow(null).default(null),
  nodeKey: Joi.string().min(1).max(255).required(),
  method: Joi.string()
    .valid("zscore", "moving_avg", "std_bands", "cusum")
    .required(),
  windowSize: Joi.number().integer().min(10).max(10000).default(100),
  ucl: Joi.number().allow(null).default(null),
  lcl: Joi.number().allow(null).default(null),
  mean: Joi.number().allow(null).default(null),
  stddev: Joi.number().allow(null).default(null),
  sensitivity: Joi.number().min(0.1).max(10).default(3.0),
  // Declared data assumption for the control chart; attribute charts need inspected-unit counts.
  chartType: Joi.string().valid("individuals", "xbar-r").allow(null),
  subgroupSize: Joi.when("chartType", {
    is: "xbar-r",
    then: Joi.number().integer().min(2).max(10).required(),
    otherwise: Joi.valid(null),
  }),
  isActive: Joi.boolean().default(true),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  machineId: Joi.number().integer().positive().allow(null),
  nodeKey: Joi.string().min(1).max(255),
  method: Joi.string().valid("zscore", "moving_avg", "std_bands", "cusum"),
  windowSize: Joi.number().integer().min(10).max(10000),
  ucl: Joi.number().allow(null),
  lcl: Joi.number().allow(null),
  mean: Joi.number().allow(null),
  stddev: Joi.number().allow(null),
  sensitivity: Joi.number().min(0.1).max(10),
  // Declared data assumption for the control chart; attribute charts need inspected-unit counts.
  chartType: Joi.string().valid("individuals", "xbar-r").allow(null),
  subgroupSize: Joi.when("chartType", {
    is: "xbar-r",
    then: Joi.number().integer().min(2).max(10).required(),
    otherwise: Joi.valid(null),
  }),
  isActive: Joi.boolean(),
}).min(1);

const listProfilesQuerySchema = Joi.object({
  machineId: Joi.number().integer().positive().optional(),
});

// ---- Chart data schema ----

const chartDataQuerySchema = Joi.object({
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
});

// ---- Alert schemas ----

const listAlertsQuerySchema = Joi.object({
  profileId: Joi.number().integer().positive().optional(),
  machineId: Joi.number().integer().positive().optional(),
  acknowledged: Joi.boolean().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
});

// ====== Profile Routes ======

// GET /profiles - list all profiles
router.get(
  "/profiles",
  validateQuery(listProfilesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const machineId = req.query.machineId
      ? Number(req.query.machineId)
      : undefined;
    res.json(await spcService.listProfiles(machineId));
  }),
);

// POST /profiles - create a new profile (admin only)
router.post(
  "/profiles",
  requireRole("admin"),
  validateBody(createProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const input = {
      ...req.body,
      createdBy: req.session.userId ?? null,
    };
    const profile = await spcService.createProfile(input);
    res.status(201).json(profile);
  }),
);

// GET /profiles/:id - get a single profile
router.get(
  "/profiles/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await spcService.getProfile(Number(req.params.id));
    res.json(profile);
  }),
);

// PUT /profiles/:id - update a profile (admin only)
router.put(
  "/profiles/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await spcService.updateProfile(
      Number(req.params.id),
      req.body,
    );
    res.json(profile);
  }),
);

// DELETE /profiles/:id - delete a profile (admin only)
router.delete(
  "/profiles/:id",
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await spcService.deleteProfile(Number(req.params.id));
    res.json({ message: "SPC profile deleted" });
  }),
);

// POST /profiles/:id/compute - trigger baseline computation (admin only)
router.post(
  "/profiles/:id/compute",
  requireRole("admin"),
  validateBody(
    Joi.object({
      start: Joi.string().isoDate(),
      end: Joi.string().isoDate(),
    }).and("start", "end"),
  ),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await spcService.computeBaseline(
      Number(req.params.id),
      req.body.start ? req.body : undefined,
    );
    res.json(result);
  }),
);

// GET /profiles/:id/chart-data - get chart data for a profile
router.get(
  "/profiles/:id/chart-data",
  validateParams(idParamSchema),
  validateQuery(chartDataQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const startDate = new Date(req.query.startDate as string);
    const endDate = new Date(req.query.endDate as string);
    const data = await spcService.getChartData(
      Number(req.params.id),
      startDate,
      endDate,
    );
    res.json(data);
  }),
);

router.get(
  "/profiles/:id/control-chart",
  validateParams(idParamSchema),
  validateQuery(chartDataQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await spcService.getControlChart(
        Number(req.params.id),
        new Date(req.query.startDate as string),
        new Date(req.query.endDate as string),
      ),
    );
  }),
);

// ====== Alert Routes ======

// GET /alerts - list alerts
router.get(
  "/alerts",
  validateQuery(listAlertsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const acknowledgedValue = Array.isArray(req.query.acknowledged)
      ? req.query.acknowledged[0]
      : req.query.acknowledged;
    const filters = {
      profileId: req.query.profileId ? Number(req.query.profileId) : undefined,
      machineId: req.query.machineId ? Number(req.query.machineId) : undefined,
      acknowledged:
        acknowledgedValue != null ? acknowledgedValue === "true" : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    res.json(await spcService.listAlerts(filters));
  }),
);

// POST /alerts/:id/acknowledge - acknowledge an alert
router.post(
  "/alerts/:id/acknowledge",
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "User ID required" });
      return;
    }
    const alert = await spcService.acknowledgeAlert(
      Number(req.params.id),
      userId,
    );
    res.json(alert);
  }),
);

export default router;
