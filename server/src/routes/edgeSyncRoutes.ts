import express from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { auditLogService } from "../services/auditLogService.js";
import {
  authenticateEdge,
  batchSchema,
  enroll,
  ingestBatch,
  type EdgeBatch,
} from "../services/edgeCentral.js";
import { UnauthorizedError, ValidationError } from "../utils/errors.js";

// H08: edges authenticate with their token (no session, no CSRF); mounted before requireAuth.
const router = express.Router();

router.post(
  "/enroll",
  express.json({ limit: "16kb" }),
  asyncHandler(async (req, res) => {
    const { token, edge } = await enroll(req.body?.code);
    await auditLogService.recordEvent({
      action: "edge.enrolled",
      entityType: "edge",
      entityId: edge.id,
      entityName: edge.name,
      message: `Edge "${edge.name}" enrolled; any earlier token is no longer valid`,
    });
    res.status(201).json({ token, edge });
  }),
);

router.post(
  "/batches",
  // Check the token before parsing up to 8 MB, so anonymous clients cannot make us parse it.
  asyncHandler(async (req, res, next) => {
    const edge = await authenticateEdge(req.headers.authorization);
    if (!edge) throw new UnauthorizedError("Edge token unknown or revoked");
    res.locals.edge = edge;
    next();
  }),
  express.json({ limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const edge = res.locals.edge as NonNullable<
      Awaited<ReturnType<typeof authenticateEdge>>
    >;
    const { value, error } = batchSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error)
      throw new ValidationError(
        "Invalid edge batch",
        error.details.slice(0, 10).map((d) => d.message),
      );
    res.json(await ingestBatch(edge, value as EdgeBatch));
  }),
);

export default router;
