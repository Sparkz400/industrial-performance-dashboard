export type ProductionState =
  "running" | "idle" | "fault" | "planned" | "unknown";

export interface OperatorEntry {
  id: number;
  requestId: string;
  machineId: number;
  shiftId: number | null;
  kind: "note" | "action" | "quantity";
  text: string;
  priority: "normal" | "high";
  status: "open" | "resolved";
  ownerId: number | null;
  dueAt: string | null;
  intervalStart: string | null;
  intervalEnd: string | null;
  quantity: { total: number; good: number; reject: number } | null;
  version: number;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface MachineLiveSummary {
  id: number;
  name: string;
  connection: string;
  state: ProductionState;
  freshness:
    | "fresh"
    | "stale"
    | "missing"
    | "bad-quality"
    | "disconnected"
    | "clock-skew";
  lastMeasurement: string | null;
  receivedAt: string | null;
  shift: {
    id: number;
    name: string;
    start: string;
    end: string;
    job: { reference: string; product: string; target: number | null };
  } | null;
  production: {
    observed: number | null;
    complete: boolean;
    asOf: string | null;
    truncated: boolean;
  };
  issues: {
    id: number;
    text: string;
    priority: string;
    dueAt: string | null;
    kind: string;
  }[];
}
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
  counterPolicy: "reset-to-zero" | "reject-decrease" | "rollover";
  /** Exclusive upper bound in the unscaled PLC counter domain. */
  counterModulus?: number;
}
export interface ProductRun {
  start: string;
  end: string;
  reference: string;
  product: string;
  target: number | null;
  idealCycleMs: number;
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
  category: "planned" | "unplanned" | "changeover";
  reason: string;
  actorId: number;
  createdAt: string;
  supersedesId: number | null;
}
/** Result of regenerating a saved report revision from today's retained data. */
export interface ReportRevisionCheck {
  revisionId: number;
  reproducible: boolean;
  changedSections: string[];
  causes: {
    laterCorrections: number;
    lateArrivals: number;
    laterDeclarations: number;
    planChanged: boolean;
    removedSamplesInOverlappingHours: number;
  };
  checkedAt: string;
}
export interface ShiftReport {
  measurementEvidence?: {
    digest: string;
    samples: number;
    correctedSamples: number;
    lateSamples: number;
    latestReceivedAt: string | null;
  };
  runs?: { plan: ProductRun; report: ShiftReport }[];
  planVersion?: number;
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
  /** Absent in revisions saved before reviewed declarations were applied. */
  quantitySource?: "measured" | "declaration";
  /** Latest reviewed operator quantity declaration for the shift, if any. */
  declaration?: {
    entryId: number;
    total: number;
    good: number;
    reject: number;
    reviewedAt: string;
  } | null;
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
