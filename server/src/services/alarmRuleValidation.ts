import type { NewAlertRule } from "../database/schema.js";
import { ValidationError } from "../utils/errors.js";

export function validateAlarmRule(rule: NewAlertRule): void {
  if (rule.isActive !== false && rule.plantId != null)
    throw new ValidationError(
      "Plant-scoped rules are unavailable; select a machine or all machines",
    );
  const conditions = [
    "gt",
    "gte",
    "lt",
    "lte",
    "eq",
    "neq",
    "between",
    "outside",
    "range",
    "rate_of_change",
    "state_change",
  ];
  if (!conditions.includes(rule.condition))
    throw new ValidationError("Unsupported alarm condition");
  if (
    rule.condition !== "state_change" &&
    (rule.threshold == null || !Number.isFinite(rule.threshold))
  )
    throw new ValidationError("A finite threshold is required");
  if (
    ["between", "outside", "range"].includes(rule.condition) &&
    (rule.thresholdHigh == null ||
      !Number.isFinite(rule.thresholdHigh) ||
      rule.thresholdHigh < rule.threshold!)
  )
    throw new ValidationError(
      "High threshold must be at least the low threshold",
    );
  if (
    rule.rateWindowSeconds != null &&
    (rule.rateWindowSeconds <= 0 || rule.rateWindowSeconds > 86400)
  )
    throw new ValidationError("Maximum sample gap must be 1 to 86400 seconds");
  if (
    rule.isActive !== false &&
    Array.isArray(rule.channels) &&
    rule.channels.length
  )
    throw new ValidationError(
      "Legacy channels do not deliver. Use Settings > Webhooks for alarm.triggered and alarm.cleared",
    );
}
