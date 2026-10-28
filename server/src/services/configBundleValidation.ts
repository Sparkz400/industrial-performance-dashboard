import Joi from "joi";
import { createHash } from "node:crypto";
import type { ConfigurationBundle } from "@performance-dashboard/shared";
import { ValidationError } from "../utils/errors.js";
import { validateAlarmRule } from "./alarmRuleValidation.js";

const text = (max: number) => Joi.string().trim().min(1).max(max);
const key = text(100).pattern(/^[A-Za-z][A-Za-z0-9_]*$/);
const number = Joi.number().allow(null).required();
// Keep the portable surface aligned with real-data widget callers and settings.
// Legacy synthetic charts and unscoped operation-mode listeners are excluded.
const widgetConfigs = new Map<string, Joi.ObjectSchema>([
  [
    "trendingExplorer",
    Joi.object({
      machineId: Joi.number().integer().positive().required(),
      defaultTags: Joi.array().items(key).max(32).unique(),
    }).unknown(false),
  ],
  [
    "systemStatus",
    Joi.object({
      autoRefresh: Joi.boolean(),
      showDetails: Joi.boolean(),
      refreshInterval: Joi.number().integer().min(5000).max(60000),
    }).unknown(false),
  ],
  [
    "alarmDashboard",
    Joi.object({
      rowsPerPage: Joi.number().integer().min(5).max(25),
    }).unknown(false),
  ],
  ["alertSummary", Joi.object({}).unknown(false)],
]);
const layout = Joi.object({
  i: text(100).required(),
  x: Joi.number().integer().min(0).max(1000).required(),
  y: Joi.number().integer().min(0).max(10000).required(),
  w: Joi.number().integer().min(1).max(1000).required(),
  h: Joi.number().integer().min(1).max(1000).required(),
  minW: Joi.number().integer().min(1),
  minH: Joi.number().integer().min(1),
  maxW: Joi.number().integer().min(1),
  maxH: Joi.number().integer().min(1),
});
const schema = Joi.object({
  format: Joi.string().valid("performance-dashboard-setup").required(),
  version: Joi.number().valid(1).required(),
  source: Joi.object({
    machineId: Joi.number().integer().positive().required(),
    name: text(255).required(),
    exportedAt: Joi.string().isoDate().required(),
  }).required(),
  mappings: Joi.array()
    .max(500)
    .items(
      Joi.object({
        nodeId: text(500)
          .pattern(/^(ns=\d+;)?[isgb]=.+/)
          .required(),
        nodeKey: key.required(),
        displayName: text(255).required(),
        dataType: Joi.string()
          .valid(
            "Boolean",
            "Byte",
            "SByte",
            "Int16",
            "UInt16",
            "Int32",
            "UInt32",
            "Int64",
            "UInt64",
            "Float",
            "Double",
            "String",
          )
          .required(),
        samplingInterval: Joi.number()
          .integer()
          .min(50)
          .max(3600000)
          .required(),
      }),
    )
    .required(),
  rules: Joi.array()
    .max(100)
    .items(
      Joi.object({
        name: text(255).required(),
        nodeKey: key.required(),
        condition: text(50).required(),
        threshold: number,
        thresholdHigh: number,
        rateWindowSeconds: Joi.number()
          .integer()
          .min(1)
          .max(86400)
          .allow(null)
          .required(),
        severity: Joi.string()
          .valid("low", "medium", "high", "critical")
          .required(),
        cooldownSeconds: Joi.number().integer().min(0).max(86400).required(),
        debounceSeconds: Joi.number().integer().min(0).max(86400).required(),
        clearDebounceSeconds: Joi.number()
          .integer()
          .min(0)
          .max(86400)
          .required(),
        hysteresis: Joi.number().min(0).required(),
      }),
    )
    .required(),
  dashboards: Joi.array()
    .max(20)
    .items(
      Joi.object({
        name: text(100).required(),
        sourceRevision: text(100).required(),
        widgets: Joi.array()
          .max(100)
          .items(
            Joi.object({
              id: text(100).required(),
              type: Joi.string()
                .valid(...widgetConfigs.keys())
                .required(),
              title: text(255),
              config: Joi.object().unknown(true).required(),
            }),
          )
          .required(),
        layout: Joi.array().max(100).items(layout).required(),
      }),
    )
    .required(),
});

export function bundleDigest(value: unknown): string {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

// Never transport executable widgets, external destinations, credentials or cross-machine bindings.
function checkConfig(value: unknown, sourceMachine: number, depth = 0): void {
  if (depth > 12)
    throw new ValidationError("Widget configuration is too deeply nested");
  if (
    typeof value === "string" &&
    (/-----BEGIN|(?:https?|opc\.tcp):\/\/|bearer\s/i.test(value) ||
      value.length > 2000)
  )
    throw new ValidationError(
      "External destinations or secret material are not portable",
    );
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) {
      if (
        /password|secret|token|credential|privatekey|certificate|authorization|cookie|url|uri|html|script|svg|code|^__proto__$|^constructor$|^prototype$/i.test(
          key,
        )
      )
        throw new ValidationError(`Nonportable configuration field: ${key}`);
      if (key === "machineId" && item !== sourceMachine)
        throw new ValidationError("Dashboard contains another machine binding");
      if (/machineIds|plantId|templateId|instanceId|dashboardId/i.test(key))
        throw new ValidationError(`Unresolved resource binding: ${key}`);
      checkConfig(item, sourceMachine, depth + 1);
    }
}

export function validateConfigurationBundle(
  input: unknown,
): ConfigurationBundle {
  if (Buffer.byteLength(JSON.stringify(input) ?? "") > 1024 * 1024)
    throw new ValidationError("Setup bundle exceeds 1 MiB");
  const { value, error } = schema.validate(input, {
    convert: false,
    abortEarly: true,
  });
  if (error) throw new ValidationError(error.message);
  const bundle = value as ConfigurationBundle;
  if (
    !bundle.mappings.length &&
    !bundle.rules.length &&
    !bundle.dashboards.length
  )
    throw new ValidationError("Setup bundle contains no configuration");
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new ValidationError(`Duplicate ${label}`);
  };
  unique(
    bundle.mappings.map((m) => m.nodeId),
    "source node",
  );
  unique(
    bundle.mappings.map((m) => m.nodeKey),
    "signal key",
  );
  unique(
    bundle.rules.map((r) => r.name),
    "rule name",
  );
  unique(
    bundle.dashboards.map((d) => d.name),
    "dashboard name",
  );
  const keys = new Set(bundle.mappings.map((m) => m.nodeKey));
  for (const rule of bundle.rules) {
    validateAlarmRule({ ...rule, isActive: false });
    if (!keys.has(rule.nodeKey))
      throw new ValidationError(`Rule signal missing: ${rule.nodeKey}`);
  }
  for (const dashboard of bundle.dashboards) {
    unique(
      dashboard.widgets.map((w) => w.id),
      "widget id",
    );
    unique(
      dashboard.layout.map((l) => l.i),
      "layout id",
    );
    if (
      dashboard.layout.some((l) => !dashboard.widgets.some((w) => w.id === l.i))
    )
      throw new ValidationError("Layout refers to an unknown widget");
    for (const widget of dashboard.widgets) {
      checkConfig(widget.config, bundle.source.machineId);
      const { error: configError } = widgetConfigs
        .get(widget.type)!
        .validate(widget.config, { convert: false });
      if (configError)
        throw new ValidationError(
          `Invalid ${widget.type} settings: ${configError.message}`,
        );
      if (widget.type === "trendingExplorer") {
        for (const tag of (widget.config.defaultTags ?? []) as string[])
          if (!keys.has(tag))
            throw new ValidationError(`Widget signal missing: ${tag}`);
      }
    }
  }
  return bundle;
}

export function remapBundleWidgets(
  widgets: ConfigurationBundle["dashboards"][number]["widgets"],
  target: number,
) {
  const remap = (value: any): any =>
    Array.isArray(value)
      ? value.map(remap)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
              k,
              k === "machineId" ? target : remap(v),
            ]),
          )
        : value;
  return remap(widgets) as typeof widgets;
}
