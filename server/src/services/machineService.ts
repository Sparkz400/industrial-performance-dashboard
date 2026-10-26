import multiMachineManager from "../opc-ua/services/multiMachineManager.js";
import {
  machineRepository,
  type MachineRecordInput,
  type NodeMappingUpsertInput,
} from "../repositories/machineRepository.js";
import type { Machine } from "../database/schema.js";
import logger from "../utils/logger.js";
import type { MachineAuthenticationInput } from "@performance-dashboard/shared";
import { machineAuthentication } from "./machineIdentity.js";
import {
  NotFoundError,
  ValidationError,
  fromDatabaseError,
} from "../utils/errors.js";

export interface MachineDraftInput {
  name: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
  authentication?: MachineAuthenticationInput;
}

export interface BrowseNodesInput {
  id: string;
  parentNodeId?: string;
}

export interface MappingDraftInput extends NodeMappingUpsertInput {}

function normalizeResourcePath(resourcePath: unknown): string {
  if (typeof resourcePath !== "string") {
    return "";
  }

  const trimmed = resourcePath.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildMachineRecord(input: MachineDraftInput): MachineRecordInput {
  const normalizedPath = normalizeResourcePath(input.resourcePath);

  return {
    name: input.name,
    ip: input.ip,
    port: input.port,
    securityMode: input.securityMode,
    securityPolicy: input.securityPolicy,
    isActive: input.isActive,
    resourcePath: normalizedPath,
    endpointUrl: `opc.tcp://${input.ip}:${input.port}${normalizedPath}`,
  };
}

function parseId(value: string, label: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`Invalid ${label}`);
  }

  return parsed;
}

function isDatabaseError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function refreshMachineConnection(
  machineId: number,
  warningMessage: string,
) {
  try {
    await multiMachineManager.refreshMachineConnection(machineId);
  } catch (error) {
    logger.warn(`${warningMessage}: ${getErrorMessage(error)}`);
  }
}

export const machineService = {
  async listMachines() {
    const allMachines = await machineRepository.listMachines();

    return Promise.all(
      allMachines.map(async (machine: Machine) => ({
        ...machine,
        authentication: await machineAuthentication(machine.id),
        mappingCount: await machineRepository.countMappingsByMachineId(
          machine.id,
        ),
      })),
    );
  },

  async createMachine(input: MachineDraftInput) {
    try {
      const machine = await machineRepository.createMachine(
        buildMachineRecord(input),
        input.authentication,
      );
      return {
        ...machine,
        authentication: await machineAuthentication(machine.id),
      };
    } catch (error) {
      if (isDatabaseError(error) && error.code === "23505") {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async getMachineWithMappings(id: string) {
    const machineId = parseId(id, "machine ID");
    const machine = await machineRepository.findMachineById(machineId);

    if (!machine) {
      throw new NotFoundError("Machine");
    }

    const mappings = await machineRepository.findMappingsByMachineId(machineId);
    return {
      ...machine,
      mappings,
      authentication: await machineAuthentication(machine.id),
    };
  },

  async updateMachine(id: string, input: MachineDraftInput) {
    const machineId = parseId(id, "machine ID");

    try {
      const updated = await machineRepository.updateMachine(
        machineId,
        buildMachineRecord(input),
        input.authentication,
      );

      if (!updated) {
        throw new NotFoundError("Machine");
      }

      await refreshMachineConnection(
        machineId,
        `Machine ${machineId} config updated but reconnect failed`,
      );

      return {
        ...updated,
        authentication: await machineAuthentication(updated.id),
      };
    } catch (error) {
      if (isDatabaseError(error) && error.code === "23505") {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async deleteMachine(id: string) {
    const machineId = parseId(id, "machine ID");

    await multiMachineManager.disconnectMachine(machineId);

    const deleted = await machineRepository.deleteMachine(machineId);
    if (!deleted) {
      throw new NotFoundError("Machine");
    }

    return deleted;
  },

  async connectMachine(id: string) {
    await multiMachineManager.refreshMachineConnection(
      parseId(id, "machine ID"),
    );
  },

  async disconnectMachine(id: string) {
    await multiMachineManager.disconnectMachine(parseId(id, "machine ID"));
  },

  async browseNodes(input: BrowseNodesInput) {
    return multiMachineManager.browseNodes(
      parseId(input.id, "machine ID"),
      input.parentNodeId || undefined,
    );
  },

  async listMappings(id: string) {
    return machineRepository.findMappingsByMachineId(parseId(id, "machine ID"));
  },

  async saveMappings(id: string, mappings: MappingDraftInput[]) {
    const machineId = parseId(id, "machine ID");
    const machine = await machineRepository.findMachineById(machineId);

    if (!machine) {
      throw new NotFoundError("Machine");
    }

    const savedMappings = await machineRepository.saveMappings(
      machineId,
      mappings,
    );

    await refreshMachineConnection(
      machineId,
      `Mappings saved but reconnect failed for machine ${machineId}`,
    );

    return savedMappings;
  },

  async deleteMapping(id: string, mappingId: string) {
    const machineId = parseId(id, "machine ID");
    const parsedMappingId = parseId(mappingId, "mapping ID");
    const deletedMapping = await machineRepository.deleteMapping(
      machineId,
      parsedMappingId,
    );

    if (!deletedMapping) {
      throw new NotFoundError("Mapping");
    }

    await refreshMachineConnection(
      machineId,
      "Mapping deleted but reconnect failed",
    );

    return deletedMapping;
  },
};
