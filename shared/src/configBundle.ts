export interface ConfigurationBundle {
  format: "performance-dashboard-setup";
  version: 1;
  source: { machineId: number; name: string; exportedAt: string };
  mappings: {
    nodeId: string;
    nodeKey: string;
    displayName: string;
    dataType: string;
    samplingInterval: number;
  }[];
  rules: {
    name: string;
    nodeKey: string;
    condition: string;
    threshold: number | null;
    thresholdHigh: number | null;
    rateWindowSeconds: number | null;
    severity: "low" | "medium" | "high" | "critical";
    cooldownSeconds: number;
    debounceSeconds: number;
    clearDebounceSeconds: number;
    hysteresis: number;
  }[];
  dashboards: {
    name: string;
    sourceRevision: string;
    widgets: {
      id: string;
      type: string;
      title?: string;
      config: Record<string, unknown>;
    }[];
    layout: {
      i: string;
      x: number;
      y: number;
      w: number;
      h: number;
      minW?: number;
      minH?: number;
      maxW?: number;
      maxH?: number;
    }[];
  }[];
}
export interface BundlePreview {
  fingerprint: string;
  conflicts: string[];
  counts: { mappings: number; rules: number; dashboards: number };
}
