import Joi from "joi";
import type { ProductionProfile } from "@performance-dashboard/shared";
import { ValidationError } from "../utils/errors.js";

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
  // Without a state signal, state comes only from reviewed manual declarations.
  signals: Joi.object({
    state: signalSchema,
    total: signalSchema,
    good: signalSchema,
    reject: signalSchema,
  }).required(),
  states: Joi.object({
    running: values,
    idle: values,
    fault: values,
    planned: values,
  }).when("signals.state", {
    is: Joi.exist(),
    then: Joi.required(),
    otherwise: Joi.optional().default({
      running: [],
      idle: [],
      fault: [],
      planned: [],
    }),
  }),
  idealCycleMs: Joi.number().positive().max(86400000).required(),
  maxGapSeconds: Joi.number().min(1).max(300).required(),
  counterPolicy: Joi.string()
    .valid("reset-to-zero", "reject-decrease", "rollover")
    .required(),
  counterModulus: Joi.number()
    .integer()
    .min(2)
    .max(Number.MAX_SAFE_INTEGER)
    .when("counterPolicy", {
      is: "rollover",
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
});

export function validateProfile(input: unknown): ProductionProfile {
  const { value, error } = profileSchema.validate(input);
  if (error) throw new ValidationError(error.message);
  const profile = value as ProductionProfile;
  const states = Object.values(profile.states).flat();
  const signals = Object.values(profile.signals);
  if (states.length !== new Set(states).size)
    throw new ValidationError("State meanings must not overlap");
  if (profile.signals.state && !profile.states.running.length)
    throw new ValidationError("At least one running state is required");
  if (
    signals.length !== new Set(signals.map((s) => s.nodeKey)).size ||
    signals.length !==
      new Set(signals.map((s) => `${s.namespaceUri}:${s.identifier}`)).size
  )
    throw new ValidationError("Each signal needs a distinct key and source");
  return profile;
}
