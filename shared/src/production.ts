export type ProductionState =
  "running" | "idle" | "fault" | "planned" | "unknown";
export interface ProductionSignal {
  nodeKey: string;
  namespaceUri: string;
  identifier: string;
  dataType: string;
  unit: string | null;
  scale: number;
}
export interface ProductionProfile {
  version: 1;
  name: string;
  endpointModel: string;
  signals: {
    state: ProductionSignal;
    total?: ProductionSignal;
    good?: ProductionSignal;
    reject?: ProductionSignal;
  };
  states: {
    running: number[];
    idle: number[];
    fault: number[];
    planned: number[];
  };
  idealCycleMs: number;
  maxGapSeconds: number;
  counterPolicy: "reset-to-zero" | "reject-decrease";
}
export interface ProductionInterval {
  start: string;
  end: string;
  state: ProductionState;
}
export interface DowntimeReason {
  id: number;
  start: string;
  end: string;
  category: "planned" | "unplanned";
  reason: string;
  actorId: number;
  createdAt: string;
  supersedesId: number | null;
}
export interface ShiftReport {
  revision: "shift-v1";
  id: number;
  name: string;
  machineId: number;
  timezone: string;
  start: string;
  end: string;
  generatedAt: string;
  profile: ProductionProfile;
  job: { reference: string; product: string; target: number | null };
  intervals: ProductionInterval[];
  reasons: DowntimeReason[];
  seconds: Record<ProductionState, number>;
  scheduledSeconds: number;
  plannedSeconds: number;
  observedSeconds: number;
  quantities: {
    total: number | null;
    good: number | null;
    reject: number | null;
  };
  oee: {
    availability: number | null;
    performance: number | null;
    quality: number | null;
    overall: number | null;
  };
  losses: { reason: string; seconds: number }[];
  issues: string[];
  evidence: {
    total: number;
    good: number;
    reject: number;
    reference: string;
    actorId: number;
  } | null;
  verified: boolean;
}
