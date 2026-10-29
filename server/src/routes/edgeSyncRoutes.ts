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
router.use(express.json({ limit: "8mb" }));

router.post(
  "/enroll",
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
  asyncHandler(async (req, res) => {
    const edge = await authenticateEdge(req.headers.authorization);
    if (!edge) throw new UnauthorizedError("Edge token unknown or revoked");
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
