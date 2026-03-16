import express, { type Request, type Response } from "express";
import Joi from "joi";
import { validateBody, validateParams } from "../middleware/validation.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { plantService } from "../services/plantService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";

const router = express.Router();
type PlantIdParams = { id: string };
type MemberIdParams = { id: string; memberId: string };
type PlantBody = {
  name: string;
  location?: string;
  timezone?: string;
  config?: Record<string, unknown>;
  isActive?: boolean;
};
type MemberBody = {
  userId: number;
  role: string;
};
type MemberRoleBody = {
  role: string;
};

const plantIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

const memberIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
  memberId: Joi.string().pattern(/^\d+$/).required(),
});

const plantSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  location: Joi.string().max(255).allow("").optional(),
  timezone: Joi.string().max(50).default("UTC"),
  config: Joi.object().default({}),
  isActive: Joi.boolean().default(true),
});

const addMemberSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
  role: Joi.string().valid("admin", "viewer").default("viewer"),
});

const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid("admin", "viewer").required(),
});

// --- Plant CRUD ---

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await plantService.listPlants());
  }),
);

router.post(
  "/",
  validateBody(plantSchema),
  asyncHandler(
    async (req: Request<unknown, unknown, PlantBody>, res: Response) => {
      const plant = await plantService.createPlant(req.body);
      await auditLogService.recordEvent(
        {
          action: "plant.created",
          entityType: "plant",
          entityId: plant.id,
          entityName: plant.name,
          message: `Created plant "${plant.name}"`,
          metadata: {
            location: plant.location,
            timezone: plant.timezone,
          },
        },
        getAuditActor(req),
      );
      res.status(201).json(plant);
    },
  ),
);

router.get(
  "/:id",
  validateParams(plantIdParamSchema),
  asyncHandler(async (req: Request<PlantIdParams>, res: Response) => {
    res.json(await plantService.getPlant(req.params.id));
  }),
);

router.put(
  "/:id",
  validateParams(plantIdParamSchema),
  validateBody(plantSchema),
  asyncHandler(
    async (req: Request<PlantIdParams, unknown, PlantBody>, res: Response) => {
      const plant = await plantService.updatePlant(req.params.id, req.body);
      await auditLogService.recordEvent(
        {
          action: "plant.updated",
          entityType: "plant",
          entityId: plant.id,
          entityName: plant.name,
          message: `Updated plant "${plant.name}"`,
          metadata: {
            location: plant.location,
            timezone: plant.timezone,
            isActive: plant.isActive,
          },
        },
        getAuditActor(req),
      );
      res.json(plant);
    },
  ),
);

router.delete(
  "/:id",
  validateParams(plantIdParamSchema),
  asyncHandler(async (req: Request<PlantIdParams>, res: Response) => {
    const plant = await plantService.deletePlant(req.params.id);
    await auditLogService.recordEvent(
      {
        action: "plant.deleted",
        entityType: "plant",
        entityId: plant.id,
        entityName: plant.name,
        message: `Deleted plant "${plant.name}"`,
      },
      getAuditActor(req),
    );
    res.json({ message: "Plant deleted", plant });
  }),
);

// --- Plant Membership ---

router.get(
  "/:id/members",
  validateParams(plantIdParamSchema),
  asyncHandler(async (req: Request<PlantIdParams>, res: Response) => {
    res.json(await plantService.listMembers(req.params.id));
  }),
);

router.post(
  "/:id/members",
  validateParams(plantIdParamSchema),
  validateBody(addMemberSchema),
  asyncHandler(
    async (req: Request<PlantIdParams, unknown, MemberBody>, res: Response) => {
      const membership = await plantService.addMember(
        req.params.id,
        req.body.userId,
        req.body.role,
      );
      await auditLogService.recordEvent(
        {
          action: "plant.member_added",
          entityType: "plant",
          entityId: membership.plantId,
          message: `Added user ${membership.userId} to plant ${membership.plantId} with role "${membership.role}"`,
          metadata: {
            userId: membership.userId,
            role: membership.role,
          },
        },
        getAuditActor(req),
      );
      res.status(201).json(membership);
    },
  ),
);

router.put(
  "/:id/members/:memberId",
  validateParams(memberIdParamSchema),
  validateBody(updateMemberRoleSchema),
  asyncHandler(
    async (
      req: Request<MemberIdParams, unknown, MemberRoleBody>,
      res: Response,
    ) => {
      const membership = await plantService.updateMember(
        req.params.id,
        req.params.memberId,
        req.body.role,
      );
      await auditLogService.recordEvent(
        {
          action: "plant.member_updated",
          entityType: "plant",
          entityId: membership.plantId,
          message: `Updated membership ${membership.id} role to "${membership.role}"`,
          metadata: {
            membershipId: membership.id,
            userId: membership.userId,
            role: membership.role,
          },
        },
        getAuditActor(req),
      );
      res.json(membership);
    },
  ),
);

router.delete(
  "/:id/members/:memberId",
  validateParams(memberIdParamSchema),
  asyncHandler(async (req: Request<MemberIdParams>, res: Response) => {
    const membership = await plantService.removeMember(
      req.params.id,
      req.params.memberId,
    );
    await auditLogService.recordEvent(
      {
        action: "plant.member_removed",
        entityType: "plant",
        entityId: membership.plantId,
        message: `Removed membership ${membership.id} from plant ${membership.plantId}`,
        metadata: {
          membershipId: membership.id,
          userId: membership.userId,
        },
      },
      getAuditActor(req),
    );
    res.json({ message: "Member removed", membership });
  }),
);

export default router;
