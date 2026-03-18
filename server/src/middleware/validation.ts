import Joi from "joi";
import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/errors.js";
import type {
  SaveDashboardRequest,
  OpcuaConnectRequest,
} from "@performance-dashboard/shared";

// Dashboard validation schema — mirrors SaveDashboardRequest & Dashboard from shared types
const dashboardSchema: Joi.ObjectSchema<SaveDashboardRequest> = Joi.object({
  id: Joi.string().required().min(3).max(100),
  name: Joi.string().required().trim().min(1).max(100).messages({
    "string.empty": "Dashboard name cannot be empty",
    "string.min": "Dashboard name must be at least 1 character",
    "string.max": "Dashboard name must be at most 100 characters",
    "any.required": "Dashboard name is required",
  }),
  widgets: Joi.alternatives().try(
    Joi.array().items(Joi.object()).default([]),
    Joi.string()
      .custom((value: string, helpers: Joi.CustomHelpers) => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return helpers.error("string.jsonParseError");
        }
      })
      .default("[]"),
  ),
  layout: Joi.alternatives().try(
    Joi.array().items(Joi.object()).default([]),
    Joi.string()
      .custom((value: string, helpers: Joi.CustomHelpers) => {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          return helpers.error("string.jsonParseError");
        }
      })
      .default("[]"),
  ),
  serverLastModified: Joi.string().isoDate().optional(),
  localLastModified: Joi.string().isoDate().optional(),
}).unknown(true);

// OPC UA connection validation schema — mirrors OpcuaConnectRequest from shared types
const opcuaConnectionSchema: Joi.ObjectSchema<OpcuaConnectRequest> = Joi.object(
  {
    ip: Joi.string().required().hostname(),
    port: Joi.number().port().required(),
    resourcePath: Joi.string().allow("").default(""),
  },
);

// Database test validation schema
const dbTestSchema = Joi.object({
  host: Joi.string().hostname().optional(),
  port: Joi.number().port().optional(),
  user: Joi.string().optional(),
  database: Joi.string().optional(),
});

// Middleware function to validate request body
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const details = error.details.map((detail) => detail.message);
      next(
        new ValidationError(`Validation Error: ${details.join(", ")}`, details),
      );
      return;
    }
    req.body = value;
    next();
  };
};

// Middleware function to validate request params
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, { abortEarly: false });
    if (error) {
      const details = error.details.map((detail) => detail.message);
      next(
        new ValidationError(`Validation Error: ${details.join(", ")}`, details),
      );
      return;
    }
    req.params = value;
    next();
  };
};

// Validate request query parameters
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
    });
    if (error) {
      const details = error.details.map((detail) => detail.message);
      next(
        new ValidationError(`Validation Error: ${details.join(", ")}`, details),
      );
      return;
    }
    req.query = value;
    next();
  };
};
