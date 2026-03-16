import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { nlQueryService } from "../services/nlQueryService.js";

const router = express.Router();

const querySchema = Joi.object({
  query: Joi.string().required().trim().min(1).max(2000),
  dashboardId: Joi.string().optional(),
  machineId: Joi.number().integer().optional(),
});

router.post(
  "/",
  validateBody(querySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { query, machineId } = req.body;
    const result = await nlQueryService.processQuery(query, machineId);
    res.json(result);
  }),
);

export default router;
