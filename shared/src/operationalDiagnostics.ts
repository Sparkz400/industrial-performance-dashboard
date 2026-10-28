export interface MonitoredSignalDiagnostic {
  key: string;
  requestedSamplingMs: number;
  revisedSamplingMs: number | null;
  requestedQueueSize: number;
  revisedQueueSize: number | null;
  state: "pending" | "monitoring" | "rejected" | "terminated";
  statusCode: string | null;
  lastReceivedAt: string | null;
  lastSourceAt: string | null;
  observations: number;
  unusableObservations: number;
  overflowIndications: number;
}
export interface CollectorConnectionDiagnostic {
  observedSince: string;
  state:
    "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
  attempts: number;
  reconnects: number;
  connectionLosses: number;
  heartbeatFailures: number;
  subscriptionErrors: number;
  requestedPublishingMs: number;
  revisedPublishingMs: number | null;
  lastConnectionEventAt: string;
  signals: MonitoredSignalDiagnostic[];
}
export interface ConnectionDiagnostics {
  machineId: number;
  name: string;
  capturedAt: string;
  runtime: CollectorConnectionDiagnostic | null;
  queue: {
    pending: number;
    oldestReceivedAt: string | null;
    unknownReceiveTimes: number;
  } | null;
  ingestion: {
    observedSince: string;
    rejected: number;
    lastCommittedAt: string | null;
    lastRejectedAt: string | null;
  } | null;
  signals: {
    key: string;
    requestedSamplingMs: number;
    lastPersistedAt: string | null;
    statusCode: string | null;
    receivedAt: string | null;
    receiveAgeSeconds: number | null;
    freshness: "fresh" | "stale" | "unknown";
  }[];
  staleAfterSeconds: number;
  signalsTruncated: boolean;
}
export interface AlarmReview {
  machineId: number;
  start: string;
  end: string;
  capturedAt: string;
  truncated: boolean;
  alarmCount: number;
  peakTenMinuteStarts: number;
  rules: {
    key: string;
    ruleId: number | null;
    name: string;
    starts: number;
    resolved: number;
    openAtEnd: number;
    repeatsWithinMinute: number;
    acknowledged: number;
    acknowledgementP50Seconds: number | null;
    acknowledgementP95Seconds: number | null;
    deliveryCount: number;
    delivered: number;
    failedPending: number;
    deferredNow: number;
    deliveryP50Seconds: number | null;
    deliveryP95Seconds: number | null;
  }[];
}
export interface AlarmReplayReview {
  machineId: number;
  ruleId: number;
  ruleUpdatedAt: string | null;
  start: string;
  end: string;
  samples: number;
  unusable: number;
  missingClocks: number;
  missingIdentity: number;
  identityChanges: number;
  gaps: number;
  truncated: boolean;
  initialCondition: "unknown";
  actualStarts: number;
  proposedStarts: number;
  proposedClears: number;
  proposals: {
    debounceSeconds: number;
    clearDebounceSeconds: number;
    hysteresis: number;
  };
  transitions: { at: string; condition: "active" | "clear" }[];
  transitionsTruncated: boolean;
}
