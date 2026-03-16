import {
  plantRepository,
  type PlantInput,
} from "../repositories/plantRepository.js";
import logger from "../utils/logger.js";
import {
  NotFoundError,
  ValidationError,
  fromDatabaseError,
} from "../utils/errors.js";

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

export const plantService = {
  async listPlants() {
    return plantRepository.listPlants();
  },

  async getPlant(id: string) {
    const plantId = parseId(id, "plant ID");
    const plant = await plantRepository.findPlantById(plantId);

    if (!plant) {
      throw new NotFoundError("Plant");
    }

    return plant;
  },

  async createPlant(input: PlantInput) {
    try {
      return await plantRepository.createPlant(input);
    } catch (error) {
      if (isDatabaseError(error) && error.code === "23505") {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async updatePlant(id: string, input: PlantInput) {
    const plantId = parseId(id, "plant ID");

    try {
      const updated = await plantRepository.updatePlant(plantId, input);

      if (!updated) {
        throw new NotFoundError("Plant");
      }

      return updated;
    } catch (error) {
      if (isDatabaseError(error) && error.code === "23505") {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async deletePlant(id: string) {
    const plantId = parseId(id, "plant ID");
    const deleted = await plantRepository.deletePlant(plantId);

    if (!deleted) {
      throw new NotFoundError("Plant");
    }

    return deleted;
  },

  async listMembers(plantId: string) {
    const id = parseId(plantId, "plant ID");
    const plant = await plantRepository.findPlantById(id);

    if (!plant) {
      throw new NotFoundError("Plant");
    }

    return plantRepository.listMembersByPlantId(id);
  },

  async addMember(plantId: string, userId: number, role: string) {
    const id = parseId(plantId, "plant ID");
    const plant = await plantRepository.findPlantById(id);

    if (!plant) {
      throw new NotFoundError("Plant");
    }

    if (role !== "admin" && role !== "viewer") {
      throw new ValidationError("Role must be 'admin' or 'viewer'");
    }

    try {
      return await plantRepository.addMember(id, userId, role);
    } catch (error) {
      if (isDatabaseError(error) && error.code === "23505") {
        throw fromDatabaseError(error);
      }

      throw error;
    }
  },

  async updateMember(plantId: string, membershipId: string, role: string) {
    parseId(plantId, "plant ID");
    const parsedMembershipId = parseId(membershipId, "membership ID");

    if (role !== "admin" && role !== "viewer") {
      throw new ValidationError("Role must be 'admin' or 'viewer'");
    }

    const updated = await plantRepository.updateMember(
      parsedMembershipId,
      role,
    );

    if (!updated) {
      throw new NotFoundError("Plant membership");
    }

    return updated;
  },

  async removeMember(plantId: string, membershipId: string) {
    parseId(plantId, "plant ID");
    const parsedMembershipId = parseId(membershipId, "membership ID");

    const removed = await plantRepository.removeMember(parsedMembershipId);

    if (!removed) {
      throw new NotFoundError("Plant membership");
    }

    return removed;
  },

  async getUserPlants(userId: number) {
    return plantRepository.findUserPlants(userId);
  },
};
