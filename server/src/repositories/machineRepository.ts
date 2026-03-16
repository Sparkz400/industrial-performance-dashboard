import { and, eq, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  machines,
  nodeMappings,
  type NewMachine,
  type NewNodeMapping,
} from "../database/schema.js";

export interface MachineRecordInput {
  name: string;
  endpointUrl: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
}

export interface NodeMappingUpsertInput {
  nodeId: string;
  nodeKey: string;
  displayName: string;
  dataType: string;
  samplingInterval: number;
  isActive: boolean;
}

export const machineRepository = {
  async listMachines() {
    return db.select().from(machines).orderBy(machines.name);
  },

  async countMappingsByMachineId(machineId: number) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(nodeMappings)
      .where(eq(nodeMappings.machineId, machineId));

    return countRow?.count ?? 0;
  },

  async createMachine(input: MachineRecordInput) {
    const [created] = await db
      .insert(machines)
      .values(input satisfies NewMachine)
      .returning();

    return created;
  },

  async findMachineById(machineId: number) {
    const result = await db
      .select()
      .from(machines)
      .where(eq(machines.id, machineId));

    return result[0] ?? null;
  },

  async updateMachine(machineId: number, input: MachineRecordInput) {
    const result = await db
      .update(machines)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(machines.id, machineId))
      .returning();

    return result[0] ?? null;
  },

  async deleteMachine(machineId: number) {
    const result = await db
      .delete(machines)
      .where(eq(machines.id, machineId))
      .returning();

    return result[0] ?? null;
  },

  async findMappingsByMachineId(machineId: number) {
    return db
      .select()
      .from(nodeMappings)
      .where(eq(nodeMappings.machineId, machineId))
      .orderBy(nodeMappings.nodeKey);
  },

  async saveMappings(machineId: number, mappings: NodeMappingUpsertInput[]) {
    const results = [];

    for (const mapping of mappings) {
      const [saved] = await db
        .insert(nodeMappings)
        .values({
          machineId,
          ...mapping,
        } satisfies NewNodeMapping)
        .onConflictDoUpdate({
          target: [nodeMappings.machineId, nodeMappings.nodeId],
          set: {
            nodeKey: mapping.nodeKey,
            displayName: mapping.displayName,
            dataType: mapping.dataType,
            samplingInterval: mapping.samplingInterval,
            isActive: mapping.isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      results.push(saved);
    }

    return results;
  },

  async deleteMapping(machineId: number, mappingId: number) {
    const result = await db
      .delete(nodeMappings)
      .where(
        and(
          eq(nodeMappings.id, mappingId),
          eq(nodeMappings.machineId, machineId),
        ),
      )
      .returning();

    return result[0] ?? null;
  },
};
