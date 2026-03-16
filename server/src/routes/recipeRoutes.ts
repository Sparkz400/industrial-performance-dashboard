import express, { type Request, type Response } from "express";
import Joi from "joi";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { recipeService } from "../services/recipeService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";

const router = express.Router();

// --- Param schemas ---

const idParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

// --- Query schemas ---

const listQuerySchema = Joi.object({
  machineId: Joi.number().integer().positive().optional(),
  status: Joi.string().valid("draft", "active", "archived").optional(),
});

// --- Body schemas ---

const recipeParameterSchema = Joi.object({
  nodeKey: Joi.string().required(),
  displayName: Joi.string().required(),
  targetValue: Joi.number().required(),
  tolerance: Joi.number().min(0).required(),
  unit: Joi.string().allow("").optional(),
});

const createRecipeSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().allow("", null).optional(),
  machineId: Joi.number().integer().positive().allow(null).optional(),
  status: Joi.string().valid("draft", "active", "archived").default("draft"),
  parameters: Joi.array().items(recipeParameterSchema).default([]),
  setpoints: Joi.object().pattern(Joi.string(), Joi.number()).default({}),
});

const updateRecipeSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  description: Joi.string().allow("", null).optional(),
  machineId: Joi.number().integer().positive().allow(null).optional(),
  status: Joi.string().valid("draft", "active", "archived").optional(),
  parameters: Joi.array().items(recipeParameterSchema).optional(),
  setpoints: Joi.object().pattern(Joi.string(), Joi.number()).optional(),
}).min(1);

// --- Routes ---

// GET / - List recipes
router.get(
  "/",
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      machineId: req.query.machineId ? Number(req.query.machineId) : undefined,
      status: req.query.status as "draft" | "active" | "archived" | undefined,
    };
    res.json(await recipeService.listRecipes(filters));
  }),
);

// POST / - Create recipe
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  validateBody(createRecipeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const recipe = await recipeService.createRecipe(
      {
        ...req.body,
        createdBy: req.session.userId,
      },
      getAuditActor(req),
    );
    res.status(201).json(recipe);
  }),
);

// GET /:id - Get recipe
router.get(
  "/:id",
  requireAuth,
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    res.json(await recipeService.getRecipe(Number(req.params.id)));
  }),
);

// PUT /:id - Update recipe
router.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  validateBody(updateRecipeSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const recipe = await recipeService.updateRecipe(
      Number(req.params.id),
      req.body,
      getAuditActor(req),
    );
    res.json(recipe);
  }),
);

// DELETE /:id - Archive recipe
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const recipe = await recipeService.archiveRecipe(
      Number(req.params.id),
      getAuditActor(req),
    );
    res.json({ message: "Recipe archived", recipe });
  }),
);

// POST /:id/new-version - Create new version
router.post(
  "/:id/new-version",
  requireAuth,
  requireRole("admin"),
  validateParams(idParamSchema),
  asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const recipe = await recipeService.createNewVersion(
      Number(req.params.id),
      getAuditActor(req),
    );
    res.status(201).json(recipe);
  }),
);

export default router;
