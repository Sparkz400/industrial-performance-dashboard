import express, { type Request, type Response } from "express";
import Joi from "joi";
import type { MachineAuthenticationInput } from "@performance-dashboard/shared";
import { validateBody, validateParams } from "../middleware/validation.js";
import { optionalComplianceFields } from "../middleware/complianceMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { machineService } from "../services/machineService.js";
import { auditLogService, getAuditActor } from "../services/auditLogService.js";
import {
  complianceService,
  getComplianceActor,
} from "../services/complianceService.js";

const router = express.Router();
type MachineIdParams = { id: string };
type MachineMappingParams = { id: string; mappingId: string };
type MachineBody = {
  name: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
  authentication?: MachineAuthenticationInput;
  reasonForChange?: string | null;
  electronicSignature?: Record<string, unknown> | null;
};
type BrowseNodesBody = {
  parentNodeId?: string;
};
type NodeMappingBody = {
  mappings: Array<{
    nodeId: string;
    nodeKey: string;
    displayName: string;
    dataType: string;
    samplingInterval: number;
    isActive: boolean;
  }>;
};

const machineIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

const machineMappingParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
  mappingId: Joi.string().pattern(/^\d+$/).required(),
});

const machineSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  ip: Joi.string().required(),
  port: Joi.number().port().required(),
  resourcePath: Joi.string().allow("").default(""),
  securityMode: Joi.string()
    .valid("None", "Sign", "SignAndEncrypt")
    .default("None"),
  securityPolicy: Joi.string()
    .valid(
      "None",
      "Basic256Sha256",
      "Aes128_Sha256_RsaOaep",
      "Aes256_Sha256_RsaPss",
    )
    .default("None"),
  authentication: Joi.object({
    mode: Joi.string().valid("anonymous", "username", "certificate").required(),
    username: Joi.string().max(255),
    password: Joi.string().max(4096).allow(""),
    certificatePem: Joi.string().max(32768).allow(""),
    privateKeyPem: Joi.string().max(32768).allow(""),
    certificateExpiresAt: Joi.string().isoDate(),
  }),
  // Bounds keep one endpoint from requesting server-straining or meaningless limits.
  subscription: Joi.object({
    publishingIntervalMs: Joi.number().integer().min(50).max(60000).required(),
    queueSize: Joi.number().integer().min(1).max(1000).required(),
    maxNotificationsPerPublish: Joi.number()
      .integer()
      .min(0)
      .max(10000)
      .required(),
  }).allow(null),
  isActive: Joi.boolean().default(true),
});

const nodeMappingSchema = Joi.object({
  mappings: Joi.array()
    .items(
      Joi.object({
        nodeId: Joi.string().required(),
        nodeKey: Joi.string().required(),
        displayName: Joi.string().required(),
        dataType: Joi.string().default("Double"),
        samplingInterval: Joi.number().integer().min(100).default(500),
        isActive: Joi.boolean().default(true),
      }),
    )
    .min(1)
    .required(),
});

const browseSchema = Joi.object({
  parentNodeId: Joi.string().allow("").default(""),
});

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await machineService.listMachines());
  }),
);

router.post(
  "/",
  validateBody(machineSchema),
  optionalComplianceFields,
  asyncHandler(
    async (req: Request<unknown, unknown, MachineBody>, res: Response) => {
      const machine = await machineService.createMachine(req.body);
      const actor = getAuditActor(req);
      await auditLogService.recordEvent(
        {
          action: "machine.created",
          entityType: "machine",
          entityId: machine.id,
          entityName: machine.name,
          message: `Created machine "${machine.name}"`,
          metadata: {
            endpointUrl: machine.endpointUrl,
            securityMode: machine.securityMode,
            securityPolicy: machine.securityPolicy,
          },
        },
        actor,
      );
      await complianceService.recordComplianceEvent(
        {
          action: "machine.created",
          entityType: "machine",
          entityId: machine.id,
          entityName: machine.name,
          message: `Created machine "${machine.name}"`,
          reasonForChange: req.body.reasonForChange ?? null,
          electronicSignature: req.body.electronicSignature ?? null,
          snapshotAfter: {
            name: machine.name,
            endpointUrl: machine.endpointUrl,
            securityMode: machine.securityMode,
          },
        },
        getComplianceActor(req),
      );
      res.status(201).json(machine);
    },
  ),
);

router.get(
  "/:id",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    res.json(await machineService.getMachineWithMappings(req.params.id));
  }),
);

router.put(
  "/:id",
  validateParams(machineIdParamSchema),
  validateBody(machineSchema),
  optionalComplianceFields,
  asyncHandler(
    async (
      req: Request<MachineIdParams, unknown, MachineBody>,
      res: Response,
    ) => {
      const existing = await machineService
        .getMachineWithMappings(req.params.id)
        .catch(() => null);
      const machine = await machineService.updateMachine(
        req.params.id,
        req.body,
      );
      const actor = getAuditActor(req);
      await auditLogService.recordEvent(
        {
          action: "machine.updated",
          entityType: "machine",
          entityId: machine.id,
          entityName: machine.name,
          message: `Updated machine "${machine.name}"`,
          metadata: {
            endpointUrl: machine.endpointUrl,
            securityMode: machine.securityMode,
            securityPolicy: machine.securityPolicy,
            isActive: machine.isActive,
          },
        },
        actor,
      );
      await complianceService.recordComplianceEvent(
        {
          action: "machine.updated",
          entityType: "machine",
          entityId: machine.id,
          entityName: machine.name,
          message: `Updated machine "${machine.name}"`,
          reasonForChange: req.body.reasonForChange ?? null,
          electronicSignature: req.body.electronicSignature ?? null,
          snapshotBefore: existing
            ? {
                name: existing.name,
                endpointUrl: existing.endpointUrl,
                securityMode: existing.securityMode,
              }
            : null,
          snapshotAfter: {
            name: machine.name,
            endpointUrl: machine.endpointUrl,
            securityMode: machine.securityMode,
          },
        },
        getComplianceActor(req),
      );
      res.json(machine);
    },
  ),
);

router.delete(
  "/:id",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const existing = await machineService
      .getMachineWithMappings(req.params.id)
      .catch(() => null);
    const machine = await machineService.deleteMachine(req.params.id);
    const actor = getAuditActor(req);
    await auditLogService.recordEvent(
      {
        action: "machine.deleted",
        entityType: "machine",
        entityId: machine.id,
        entityName: machine.name,
        message: `Deleted machine "${machine.name}"`,
      },
      actor,
    );
    await complianceService.recordComplianceEvent(
      {
        action: "machine.deleted",
        entityType: "machine",
        entityId: machine.id,
        entityName: machine.name,
        message: `Deleted machine "${machine.name}"`,
        snapshotBefore: existing
          ? {
              name: existing.name,
              endpointUrl: existing.endpointUrl,
              securityMode: existing.securityMode,
            }
          : null,
      },
      getComplianceActor(req),
    );
    res.json({ message: "Machine deleted", machine });
  }),
);

router.post(
  "/:id/connect",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machine = await machineService.getMachineWithMappings(req.params.id);
    await machineService.connectMachine(req.params.id);
    await auditLogService.recordEvent(
      {
        action: "machine.connect_requested",
        entityType: "machine",
        entityId: machine.id,
        entityName: machine.name,
        message: `Requested connection for machine "${machine.name}"`,
      },
      getAuditActor(req),
    );
    res.json({ message: "Machine connection initiated" });
  }),
);

router.post(
  "/:id/disconnect",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    const machine = await machineService.getMachineWithMappings(req.params.id);
    await machineService.disconnectMachine(req.params.id);
    await auditLogService.recordEvent(
      {
        action: "machine.disconnect_requested",
        entityType: "machine",
        entityId: machine.id,
        entityName: machine.name,
        message: `Requested disconnect for machine "${machine.name}"`,
      },
      getAuditActor(req),
    );
    res.json({ message: "Machine disconnected" });
  }),
);

router.post(
  "/:id/browse-nodes",
  validateParams(machineIdParamSchema),
  validateBody(browseSchema),
  asyncHandler(
    async (
      req: Request<MachineIdParams, unknown, BrowseNodesBody>,
      res: Response,
    ) => {
      res.json(
        await machineService.browseNodes({
          id: req.params.id,
          parentNodeId: req.body.parentNodeId,
        }),
      );
    },
  ),
);

router.get(
  "/:id/mappings",
  validateParams(machineIdParamSchema),
  asyncHandler(async (req: Request<MachineIdParams>, res: Response) => {
    res.json(await machineService.listMappings(req.params.id));
  }),
);

router.post(
  "/:id/mappings",
  validateParams(machineIdParamSchema),
  validateBody(nodeMappingSchema),
  asyncHandler(
    async (
      req: Request<MachineIdParams, unknown, NodeMappingBody>,
      res: Response,
    ) => {
      const machine = await machineService.getMachineWithMappings(
        req.params.id,
      );
      const mappings = await machineService.saveMappings(
        req.params.id,
        req.body.mappings,
      );
      await auditLogService.recordEvent(
        {
          action: "machine.mappings_saved",
          entityType: "machine",
          entityId: machine.id,
          entityName: machine.name,
          message: `Saved ${mappings.length} node mappings for "${machine.name}"`,
          metadata: {
            mappingCount: mappings.length,
          },
        },
        getAuditActor(req),
      );
      res.json(mappings);
    },
  ),
);

router.delete(
  "/:id/mappings/:mappingId",
  validateParams(machineMappingParamSchema),
  asyncHandler(async (req: Request<MachineMappingParams>, res: Response) => {
    const machine = await machineService.getMachineWithMappings(req.params.id);
    const mapping = await machineService.deleteMapping(
      req.params.id,
      req.params.mappingId,
    );
    await auditLogService.recordEvent(
      {
        action: "machine.mapping_deleted",
        entityType: "machine",
        entityId: machine.id,
        entityName: machine.name,
        message: `Deleted mapping "${mapping.displayName}" from "${machine.name}"`,
        metadata: {
          mappingId: mapping.id,
          nodeKey: mapping.nodeKey,
        },
      },
      getAuditActor(req),
    );
    res.json({ message: "Mapping deleted", mapping });
  }),
);

export default router;
