import { Router } from "express";
import Joi from "joi";
import { randomBytes, X509Certificate } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import db from "../database/db.js";
import { machines, mqttSources, nodeMappings } from "../database/schema.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { auditRequest } from "../services/auditLogService.js";
import { sealMachineSecret } from "../services/machineIdentity.js";
import {
  MQTT_DATA_TYPES,
  mqttIngestion,
  type MqttMapping,
} from "../services/mqttIngestion.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

// C06: read-only MQTT sources. Administrator-only (mounted with requireRole("admin")).
const router = Router();
const id = Joi.object({ id: Joi.number().integer().positive().required() });
const pointer = Joi.string()
  .max(200)
  .pattern(/^(?:\/[^/]*)*$/)
  .allow("");
const sourceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(160).required(),
  brokerUrl: Joi.string()
    .uri({ scheme: ["mqtts"] })
    .max(500)
    .required(),
  caCertificate: Joi.string()
    .max(16384)
    .pattern(/-----BEGIN CERTIFICATE-----/)
    .required(),
  username: Joi.string().max(200).allow(null).default(null),
  password: Joi.string().max(500).allow(null).default(null),
  clientId: Joi.string().pattern(/^[A-Za-z0-9_-]{1,23}$/),
  mappings: Joi.array()
    .items(
      Joi.object({
        // Exact topics only: wildcards and $-system topics would widen what is read.
        topic: Joi.string()
          .max(256)
          .pattern(/^[^#+$\u0000][^#+\u0000]*$/)
          .required(),
        nodeKey: Joi.string()
          .pattern(/^[A-Za-z][A-Za-z0-9_]{0,99}$/)
          .required(),
        valuePointer: pointer.required(),
        timestampPointer: pointer.required(),
        dataType: Joi.string()
          .valid(...MQTT_DATA_TYPES)
          .required(),
      }),
    )
    .min(1)
    .max(50)
    .unique((a, b) => a.nodeKey === b.nodeKey)
    .required(),
});
const publicColumns = {
  id: mqttSources.id,
  machineId: mqttSources.machineId,
  name: mqttSources.name,
  brokerUrl: mqttSources.brokerUrl,
  username: mqttSources.username,
  clientId: mqttSources.clientId,
  mappings: mqttSources.mappings,
  isActive: mqttSources.isActive,
  createdAt: mqttSources.createdAt,
  updatedAt: mqttSources.updatedAt,
};
const withStatus = <T extends { id: number }>(row: T) => ({
  ...row,
  status: mqttIngestion.running
    ? mqttIngestion.status(row.id)
    : { state: "collector not running in this process" },
});

router.get(
  "/machines/:id/sources",
  validateParams(id),
  asyncHandler(async (req, res) => {
    const rows = await db
      .select(publicColumns)
      .from(mqttSources)
      .where(eq(mqttSources.machineId, Number(req.params.id)))
      .orderBy(desc(mqttSources.id));
    res.json(rows.map(withStatus));
  }),
);

router.post(
  "/machines/:id/sources",
  validateParams(id),
  validateBody(sourceSchema),
  auditRequest(
    "mqtt_source.created",
    "machine",
    "Added a read-only MQTT source",
  ),
  asyncHandler(async (req, res) => {
    const machineId = Number(req.params.id);
    const body = req.body as {
      name: string;
      brokerUrl: string;
      caCertificate: string;
      username: string | null;
      password: string | null;
      clientId?: string;
      mappings: MqttMapping[];
    };
    const [machine] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(eq(machines.id, machineId));
    if (!machine) throw new NotFoundError("Machine");
    try {
      new X509Certificate(body.caCertificate);
    } catch {
      throw new ValidationError(
        "The CA certificate is not a readable PEM certificate",
      );
    }
    const keys = body.mappings.map((m) => m.nodeKey);
    const [opcua] = await db
      .select({ nodeKey: nodeMappings.nodeKey })
      .from(nodeMappings)
      .where(
        and(
          eq(nodeMappings.machineId, machineId),
          inArray(nodeMappings.nodeKey, keys),
        ),
      )
      .limit(1);
    const others = await db
      .select({ mappings: mqttSources.mappings })
      .from(mqttSources)
      .where(eq(mqttSources.machineId, machineId));
    const taken =
      opcua?.nodeKey ??
      others
        .flatMap((s) => (s.mappings as MqttMapping[]).map((m) => m.nodeKey))
        .find((k) => keys.includes(k));
    if (taken)
      throw new ValidationError(
        `Signal key ${taken} already has a source on this machine`,
      );
    const [saved] = await db
      .insert(mqttSources)
      .values({
        machineId,
        name: body.name,
        brokerUrl: body.brokerUrl,
        caCertificate: body.caCertificate,
        username: body.username,
        encryptedPassword: body.password
          ? await sealMachineSecret(machineId, { password: body.password })
          : null,
        clientId:
          body.clientId ?? `pd-m${machineId}-${randomBytes(4).toString("hex")}`,
        mappings: body.mappings,
        createdBy: req.session.userId!,
      })
      .returning(publicColumns);
    await mqttIngestion.reload(saved.id);
    res.status(201).json(withStatus(saved));
  }),
);

router.patch(
  "/sources/:id",
  validateParams(id),
  validateBody(Joi.object({ isActive: Joi.boolean().required() })),
  auditRequest(
    "mqtt_source.updated",
    "mqtt_source",
    "Enabled or disabled an MQTT source",
  ),
  asyncHandler(async (req, res) => {
    const [saved] = await db
      .update(mqttSources)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(eq(mqttSources.id, Number(req.params.id)))
      .returning(publicColumns);
    if (!saved) throw new NotFoundError("MQTT source");
    await mqttIngestion.reload(saved.id);
    res.json(withStatus(saved));
  }),
);

export default router;
