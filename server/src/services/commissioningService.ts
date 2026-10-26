import {
  createMachineSession,
  machineAuthentication,
} from "./machineIdentity.js";
import { eq, and, desc } from "drizzle-orm";
import Joi from "joi";
import * as opcua from "node-opcua";
import type { ProductionProfile } from "@performance-dashboard/shared";
import db from "../database/db.js";
import {
  machines,
  nodeMappings,
  machineProfiles,
  dashboards,
} from "../database/schema.js";
import multiMachineManager from "../opc-ua/services/multiMachineManager.js";
import { certificateManager } from "../opc-ua/opcuaClient.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const signalSchema = Joi.object({
  nodeKey: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_]{0,99}$/)
    .required(),
  namespaceUri: Joi.string().max(500).required(),
  identifier: Joi.string()
    .pattern(/^[isgb]=.+/)
    .max(500)
    .required(),
  dataType: Joi.string()
    .valid(
      "Boolean",
      "Byte",
      "SByte",
      "Int16",
      "UInt16",
      "Int32",
      "UInt32",
      "Float",
      "Double",
    )
    .required(),
  unit: Joi.string().max(50).allow(null).required(),
  scale: Joi.number().positive().required(),
});
const values = Joi.array().items(Joi.number()).max(32).required();
export const profileSchema = Joi.object({
  version: Joi.number().valid(1).required(),
  name: Joi.string().trim().min(1).max(160).required(),
  endpointModel: Joi.string().trim().min(1).max(200).required(),
  signals: Joi.object({
    state: signalSchema.required(),
    total: signalSchema,
    good: signalSchema,
    reject: signalSchema,
  }).required(),
  states: Joi.object({
    running: values,
    idle: values,
    fault: values,
    planned: values,
  }).required(),
  idealCycleMs: Joi.number().positive().max(86400000).required(),
  maxGapSeconds: Joi.number().min(1).max(300).required(),
  counterPolicy: Joi.string()
    .valid("reset-to-zero", "reject-decrease")
    .required(),
});

export function validateProfile(input: unknown): ProductionProfile {
  const { value, error } = profileSchema.validate(input);
  if (error) throw new ValidationError(error.message);
  const profile = value as ProductionProfile;
  const states = Object.values(profile.states).flat();
  const signals = Object.values(profile.signals);
  if (states.length !== new Set(states).size)
    throw new ValidationError("State meanings must not overlap");
  if (!profile.states.running.length)
    throw new ValidationError("At least one running state is required");
  if (
    signals.length !== new Set(signals.map((s) => s.nodeKey)).size ||
    signals.length !==
      new Set(signals.map((s) => `${s.namespaceUri}:${s.identifier}`)).size
  )
    throw new ValidationError("Each signal needs a distinct key and source");
  return profile;
}

export const commissioningService = {
  async inspect(machineId: number, profile?: ProductionProfile) {
    const [machine] = await db
      .select()
      .from(machines)
      .where(eq(machines.id, machineId));
    if (!machine) throw new NotFoundError("Machine");
    let session =
      multiMachineManager.getMachineConnection(machineId)?.connection?.session;
    let client: opcua.OPCUAClient | undefined;
    try {
      if (!session) {
        client = opcua.OPCUAClient.create({
          ...(await certificateManager.getClientOptions(
            machine.securityMode ?? "None",
            machine.securityPolicy ?? "None",
          )),
          connectionStrategy: { maxRetry: 0 },
          transportTimeout: 10000,
        });
        await client.connect(machine.endpointUrl);
        session = await createMachineSession(
          client,
          machineId,
          machine.endpointUrl,
          machine.securityMode ?? "None",
        );
      }
      const namespaces = await session.readNamespaceArray();
      const mappings = profile
        ? Object.entries(profile.signals).map(([role, signal]) => {
            const namespace = namespaces.indexOf(signal.namespaceUri);
            if (namespace < 0)
              throw new ValidationError(
                `Namespace unavailable for ${role}: ${signal.namespaceUri}`,
              );
            return {
              role,
              ...signal,
              nodeId: `ns=${namespace};${signal.identifier}`,
            };
          })
        : [];
      const samples = mappings.length
        ? await session.read(
            mappings.map((mapping) => ({
              nodeId: mapping.nodeId,
              attributeId: opcua.AttributeIds.Value,
            })),
            0,
          )
        : [];
      const checkedAt = new Date().toISOString();
      const signals = mappings.map((mapping, i) => ({
        ...mapping,
        value: ["number", "boolean"].includes(typeof samples[i].value.value)
          ? samples[i].value.value
          : null,
        actualType: opcua.DataType[samples[i].value.dataType],
        quality: samples[i].statusCode.toString(),
        sourceTime: samples[i].sourceTimestamp?.toISOString() ?? null,
        checkedAt,
        good:
          samples[i].statusCode.isGood() &&
          opcua.DataType[samples[i].value.dataType] === mapping.dataType &&
          ["number", "boolean"].includes(typeof samples[i].value.value),
      }));
      const currentMappings = await db
        .select({ nodeKey: nodeMappings.nodeKey, nodeId: nodeMappings.nodeId })
        .from(nodeMappings)
        .where(eq(nodeMappings.machineId, machineId));
      return {
        checkedAt,
        machineId,
        connection: "connected",
        identity: (await machineAuthentication(machineId)).mode,
        securityMode: machine.securityMode,
        securityPolicy: machine.securityPolicy,
        trust:
          machine.securityMode === "None"
            ? "No encrypted channel; owned local simulator only"
            : "Trusted certificate, validity and endpoint hostname checked",
        namespaces,
        signals,
        currentMappings,
        ready: signals.length > 0 && signals.every((signal) => signal.good),
        limitations: [
          "Read-only value check; no machine writes",
          "Physical-machine qualification remains separate from this connection check",
          "Profile units and scale are operator declarations; verify against the source",
        ],
      };
    } finally {
      if (client) {
        try {
          await session?.close();
        } finally {
          await client.disconnect();
        }
      }
    }
  },

  async save(machineId: number, profile: ProductionProfile, userId: number) {
    const preview = await this.inspect(machineId, profile);
    if (!preview.ready)
      throw new ValidationError(
        "All mapped signals must pass the read and data-type checks before commissioning",
      );
    const saved = await db.transaction(async (tx) => {
      for (const signal of preview.signals) {
        const [conflict] = await tx
          .select()
          .from(nodeMappings)
          .where(
            and(
              eq(nodeMappings.machineId, machineId),
              eq(nodeMappings.nodeKey, signal.nodeKey),
            ),
          );
        if (conflict && conflict.nodeId !== signal.nodeId)
          throw new ValidationError(
            `Key ${signal.nodeKey} already maps to another node; review it in Machines first`,
          );
        await tx
          .insert(nodeMappings)
          .values({
            machineId,
            nodeId: signal.nodeId,
            nodeKey: signal.nodeKey,
            displayName: signal.nodeKey,
            dataType: signal.dataType,
            samplingInterval: 1000,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [nodeMappings.machineId, nodeMappings.nodeId],
            set: {
              nodeKey: signal.nodeKey,
              displayName: signal.nodeKey,
              dataType: signal.dataType,
              isActive: true,
              updatedAt: new Date(),
            },
          });
      }
      const [row] = await tx
        .insert(machineProfiles)
        .values({ machineId, profile, createdBy: userId })
        .returning();
      await tx
        .update(machines)
        .set({ isActive: true })
        .where(eq(machines.id, machineId));
      const id = `production-machine-${machineId}`;
      await tx
        .insert(dashboards)
        .values({
          id,
          name: profile.name,
          widgets: [
            {
              id: `trend-${machineId}`,
              type: "trendingExplorer",
              title: `${profile.name} signals`,
              config: {
                machineId,
                defaultTags: Object.values(profile.signals).map(
                  (signal) => signal.nodeKey,
                ),
              },
            },
          ],
          layout: [{ i: `trend-${machineId}`, x: 0, y: 0, w: 12, h: 8 }],
        })
        .onConflictDoNothing();
      return { ...row, dashboardId: id };
    });
    try {
      await multiMachineManager.refreshMachineConnection(machineId);
      return { ...saved, connection: "requested" };
    } catch {
      return {
        ...saved,
        connection: "failed; configuration saved, retry Connect in Machines",
      };
    }
  },

  async latest(machineId: number) {
    const [row] = await db
      .select()
      .from(machineProfiles)
      .where(eq(machineProfiles.machineId, machineId))
      .orderBy(desc(machineProfiles.id))
      .limit(1);
    if (!row) throw new NotFoundError("Commissioned machine profile");
    return row;
  },
};
