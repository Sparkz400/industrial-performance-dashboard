import type { Request, Response, NextFunction } from "express";
import { plantRepository } from "../repositories/plantRepository.js";
import logger from "../utils/logger.js";
import { ForbiddenError, ValidationError } from "../utils/errors.js";

/**
 * Middleware that reads the X-Plant-Id header and, if present,
 * validates that the current user has access to that plant.
 *
 * - If the header is absent, falls through with plantId = undefined (no filtering).
 * - Admin users bypass the membership check.
 * - Attaches the validated plantId to res.locals.plantId.
 */
export const plantContext = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const rawPlantId = req.headers["x-plant-id"];

  if (!rawPlantId) {
    res.locals.plantId = undefined;
    next();
    return;
  }

  const headerValue = Array.isArray(rawPlantId) ? rawPlantId[0] : rawPlantId;
  const plantId = Number.parseInt(headerValue, 10);

  if (!Number.isInteger(plantId) || plantId <= 0) {
    next(new ValidationError("Invalid X-Plant-Id header"));
    return;
  }

  // Admin users bypass plant membership check
  if (req.session?.userRole === "admin") {
    res.locals.plantId = plantId;
    next();
    return;
  }

  const userId = req.session?.userId;
  if (!userId) {
    next(
      new ForbiddenError("Authentication required to access plant resources."),
    );
    return;
  }

  try {
    const userPlants = await plantRepository.findUserPlants(userId);
    const hasAccess = userPlants.some(
      (plant: { id: number }) => plant.id === plantId,
    );

    if (!hasAccess) {
      logger.warn(
        `[PlantContext] User ${userId} denied access to plant ${plantId}`,
      );
      next(new ForbiddenError("You do not have access to this plant."));
      return;
    }

    res.locals.plantId = plantId;
    next();
  } catch (error) {
    next(error);
  }
};
