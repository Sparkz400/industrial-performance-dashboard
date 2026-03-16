import { eq, and } from "drizzle-orm";
import db from "../database/db.js";
import {
  plants,
  plantMemberships,
  users,
  type NewPlant,
  type NewPlantMembership,
} from "../database/schema.js";

export interface PlantInput {
  name: string;
  location?: string;
  timezone?: string;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

export const plantRepository = {
  async listPlants() {
    return db.select().from(plants).orderBy(plants.name);
  },

  async findPlantById(plantId: number) {
    const result = await db.select().from(plants).where(eq(plants.id, plantId));

    return result[0] ?? null;
  },

  async createPlant(input: PlantInput) {
    const [created] = await db
      .insert(plants)
      .values(input satisfies NewPlant)
      .returning();

    return created;
  },

  async updatePlant(plantId: number, input: PlantInput) {
    const result = await db
      .update(plants)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(plants.id, plantId))
      .returning();

    return result[0] ?? null;
  },

  async deletePlant(plantId: number) {
    const result = await db
      .delete(plants)
      .where(eq(plants.id, plantId))
      .returning();

    return result[0] ?? null;
  },

  async listMembersByPlantId(plantId: number) {
    return db
      .select({
        id: plantMemberships.id,
        userId: plantMemberships.userId,
        plantId: plantMemberships.plantId,
        role: plantMemberships.role,
        createdAt: plantMemberships.createdAt,
        username: users.username,
        email: users.email,
      })
      .from(plantMemberships)
      .innerJoin(users, eq(plantMemberships.userId, users.id))
      .where(eq(plantMemberships.plantId, plantId))
      .orderBy(users.username);
  },

  async addMember(plantId: number, userId: number, role: "admin" | "viewer") {
    const [created] = await db
      .insert(plantMemberships)
      .values({
        plantId,
        userId,
        role,
      } satisfies NewPlantMembership)
      .returning();

    return created;
  },

  async updateMember(membershipId: number, role: "admin" | "viewer") {
    const result = await db
      .update(plantMemberships)
      .set({ role })
      .where(eq(plantMemberships.id, membershipId))
      .returning();

    return result[0] ?? null;
  },

  async removeMember(membershipId: number) {
    const result = await db
      .delete(plantMemberships)
      .where(eq(plantMemberships.id, membershipId))
      .returning();

    return result[0] ?? null;
  },

  async findUserPlants(userId: number) {
    return db
      .select({
        id: plants.id,
        name: plants.name,
        location: plants.location,
        timezone: plants.timezone,
        config: plants.config,
        isActive: plants.isActive,
        createdAt: plants.createdAt,
        updatedAt: plants.updatedAt,
        role: plantMemberships.role,
      })
      .from(plantMemberships)
      .innerJoin(plants, eq(plantMemberships.plantId, plants.id))
      .where(eq(plantMemberships.userId, userId))
      .orderBy(plants.name);
  },
};
