import { describe, it, expect } from "vitest";
import {
  bundleDigest,
  remapBundleWidgets,
  validateConfigurationBundle,
} from "../services/configBundleValidation.js";

const bundle = () => ({
  format: "performance-dashboard-setup",
  version: 1,
  source: {
    machineId: 1,
    name: "Synthetic press",
    exportedAt: "2026-10-28T12:00:00Z",
  },
  mappings: [
    {
      nodeId: "ns=2;s=Count",
      nodeKey: "Count",
      displayName: "Count",
      dataType: "Double",
      samplingInterval: 1000,
    },
  ],
  rules: [
    {
      name: "Count alarm",
      nodeKey: "Count",
      condition: "gt",
      threshold: 10,
      thresholdHigh: null,
      rateWindowSeconds: null,
      severity: "medium",
      cooldownSeconds: 30,
      debounceSeconds: 1,
      clearDebounceSeconds: 1,
      hysteresis: 0,
    },
  ],
  dashboards: [
    {
      name: "Synthetic trend",
      sourceRevision: "v1",
      widgets: [
        {
          id: "w1",
          type: "trendingExplorer",
          config: { machineId: 1, defaultTags: ["Count"] },
        },
      ],
      layout: [{ i: "w1", x: 0, y: 0, w: 12, h: 8 }],
    },
  ],
});
describe("portable setup validation", () => {
  it("remaps machine identity without altering the source and retains configuration", () => {
    const source = validateConfigurationBundle(bundle());
    const result = remapBundleWidgets(source.dashboards[0].widgets, 8);
    expect(result[0].config.machineId).toBe(8);
    expect(source.dashboards[0].widgets[0].config.machineId).toBe(1);
    expect(result[0].config.defaultTags).toEqual(["Count"]);
  });
  it("rejects unsupported versions, unknown fields and duplicate source identities", () => {
    expect(() =>
      validateConfigurationBundle({ ...bundle(), version: 2 }),
    ).toThrow();
    expect(() =>
      validateConfigurationBundle({ ...bundle(), password: "secret" }),
    ).toThrow();
    const b = bundle();
    b.mappings.push({ ...b.mappings[0], nodeKey: "Other" });
    expect(() => validateConfigurationBundle(b)).toThrow(/Duplicate/);
  });
  it("rejects nested credentials, executable widgets and cross-machine bindings", () => {
    for (const config of [
      { password: "secret" },
      { nested: { token: "secret" } },
      { url: "https://example.invalid" },
      { machineId: 2 },
    ]) {
      const b = bundle();
      b.dashboards[0].widgets[0].config = config as any;
      expect(() => validateConfigurationBundle(b)).toThrow();
    }
    const b = bundle();
    b.dashboards[0].widgets[0].type = "custom";
    expect(() => validateConfigurationBundle(b)).toThrow();
  });
  it("rejects invalid alarm semantics, unresolved signals and orphan layout items", () => {
    const b = bundle();
    b.rules[0].threshold = NaN;
    expect(() => validateConfigurationBundle(b)).toThrow();
    b.rules[0].threshold = 10;
    b.rules[0].nodeKey = "Missing";
    expect(() => validateConfigurationBundle(b)).toThrow(/missing/i);
    b.rules = [];
    b.dashboards[0].layout[0].i = "missing";
    expect(() => validateConfigurationBundle(b)).toThrow(/unknown widget/i);
  });
  it("uses a stable content digest independent of object insertion order", () => {
    expect(bundleDigest({ a: 1, b: [{ d: 2, c: 3 }] })).toBe(
      bundleDigest({ b: [{ c: 3, d: 2 }], a: 1 }),
    );
    expect(bundleDigest([1, 2])).not.toBe(bundleDigest([2, 1]));
  });
  it("accepts only bounded settings consumed by the supported real-data widgets", () => {
    for (const [type, config] of [
      ["trendingExplorer", { machineId: 1, defaultTags: ["Count"] }],
      ["trendingExplorer", { machineId: 1, defaultTags: [] }],
      [
        "systemStatus",
        { autoRefresh: false, showDetails: true, refreshInterval: 20000 },
      ],
      ["alarmDashboard", { rowsPerPage: 25 }],
      ["alertSummary", {}],
    ] as const) {
      const b = bundle();
      b.dashboards[0].widgets[0] = { id: "w1", type, config: config as any };
      expect(
        validateConfigurationBundle(b).dashboards[0].widgets[0].config,
      ).toEqual(config);
    }
  });
  it("rejects malformed, excessive, duplicate and unresolved trend tags before import", () => {
    for (const config of [
      { machineId: 1, defaultTags: 42 },
      { machineId: 1, defaultTags: "Count" },
      { machineId: 1, defaultTags: [{}] },
      { machineId: 1, defaultTags: ["Count", "Count"] },
      {
        machineId: 1,
        defaultTags: Array.from({ length: 33 }, (_, i) => `Signal${i}`),
      },
      { machineId: 1, defaultTags: ["Missing"] },
      { machineId: "1", defaultTags: ["Count"] },
      { defaultTags: ["Count"] },
      { machineId: 1, unexpected: true },
    ]) {
      const b = bundle();
      b.dashboards[0].widgets[0].config = config as any;
      expect(() => validateConfigurationBundle(b)).toThrow();
    }
  });
  it("rejects wrong setting types and bounds, ignored machine bindings and legacy charts", () => {
    for (const [type, config] of [
      ["systemStatus", { showDetails: "true" }],
      ["systemStatus", { autoRefresh: 1 }],
      ["systemStatus", { refreshInterval: 1 }],
      ["systemStatus", { refreshInterval: 60001 }],
      ["systemStatus", { machineId: 1 }],
      ["alarmDashboard", { rowsPerPage: 0 }],
      ["alarmDashboard", { rowsPerPage: 26 }],
      ["alarmDashboard", { rowsPerPage: "5" }],
      ["alertSummary", { machineId: 1 }],
      ["upTimeRate", {}],
      ["operationModePie", {}],
      ["currentAirConsumptionWidget", { machineId: 1, nodeKey: "Count" }],
      ["operationMode", { machineId: 1, maxPoints: 120, showBrush: true }],
    ] as const) {
      const b = bundle();
      b.dashboards[0].widgets[0] = { id: "w1", type, config: config as any };
      expect(() => validateConfigurationBundle(b)).toThrow();
    }
  });
});
