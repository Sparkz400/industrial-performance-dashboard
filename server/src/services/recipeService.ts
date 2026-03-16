import {
  recipeRepository,
  type RecipeCreateInput,
  type RecipeUpdateInput,
  type RecipeListFilters,
} from "../repositories/recipeRepository.js";
import logger from "../utils/logger.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import {
  auditLogService,
  type AuditActor,
} from "../services/auditLogService.js";

export const recipeService = {
  async createRecipe(input: RecipeCreateInput, actor?: AuditActor) {
    const recipe = await recipeRepository.create(input);

    logger.info(
      `[Recipe] Created recipe "${recipe.name}" v${recipe.version} (id=${recipe.id})`,
    );

    await auditLogService.recordEvent(
      {
        action: "recipe.created",
        entityType: "recipe",
        entityId: recipe.id,
        entityName: recipe.name,
        message: `Created recipe "${recipe.name}" v${recipe.version}`,
        metadata: {
          version: recipe.version,
          machineId: recipe.machineId,
          status: recipe.status,
        },
      },
      actor,
    );

    return recipe;
  },

  async getRecipe(id: number) {
    const recipe = await recipeRepository.findById(id);
    if (!recipe) {
      throw new NotFoundError("Recipe");
    }
    return recipe;
  },

  async listRecipes(filters: RecipeListFilters = {}) {
    return recipeRepository.list(filters);
  },

  async updateRecipe(id: number, data: RecipeUpdateInput, actor?: AuditActor) {
    const existing = await recipeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Recipe");
    }

    const updated = await recipeRepository.update(id, data);

    logger.info(
      `[Recipe] Updated recipe "${updated!.name}" v${updated!.version} (id=${id})`,
    );

    await auditLogService.recordEvent(
      {
        action: "recipe.updated",
        entityType: "recipe",
        entityId: id,
        entityName: updated!.name,
        message: `Updated recipe "${updated!.name}" v${updated!.version}`,
        metadata: {
          changes: data,
        },
      },
      actor,
    );

    return updated;
  },

  async archiveRecipe(id: number, actor?: AuditActor) {
    const existing = await recipeRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Recipe");
    }

    const archived = await recipeRepository.archive(id);

    logger.info(
      `[Recipe] Archived recipe "${archived!.name}" v${archived!.version} (id=${id})`,
    );

    await auditLogService.recordEvent(
      {
        action: "recipe.archived",
        entityType: "recipe",
        entityId: id,
        entityName: archived!.name,
        message: `Archived recipe "${archived!.name}" v${archived!.version}`,
      },
      actor,
    );

    return archived;
  },

  async createNewVersion(recipeId: number, actor?: AuditActor) {
    const original = await recipeRepository.findById(recipeId);
    if (!original) {
      throw new NotFoundError("Recipe");
    }

    const maxVersion = await recipeRepository.getMaxVersion(original.name);
    const newVersion = maxVersion + 1;

    const newRecipe = await recipeRepository.create({
      name: original.name,
      version: newVersion,
      description: original.description,
      machineId: original.machineId,
      status: "draft",
      parameters: original.parameters as unknown[],
      setpoints: original.setpoints as Record<string, unknown>,
      parentId: original.id,
      createdBy: original.createdBy,
    });

    logger.info(
      `[Recipe] Created new version v${newVersion} of recipe "${original.name}" (id=${newRecipe.id}, parentId=${original.id})`,
    );

    await auditLogService.recordEvent(
      {
        action: "recipe.new_version",
        entityType: "recipe",
        entityId: newRecipe.id,
        entityName: newRecipe.name,
        message: `Created v${newVersion} of recipe "${original.name}" from v${original.version}`,
        metadata: {
          parentId: original.id,
          previousVersion: original.version,
          newVersion,
        },
      },
      actor,
    );

    return newRecipe;
  },
};
