import type {
  CollectorConnectionDiagnostic,
  MonitoredSignalDiagnostic,
} from "@performance-dashboard/shared";
import type { OpcuaMappingConfig } from "../opc-ua/config/opcuaMapping.js";

export class CollectorDiagnostics {
  private connections = new Map<number, CollectorConnectionDiagnostic>();
  private ingestion = new Map<
    number,
    {
      observedSince: string;
      rejected: number;
      lastCommittedAt: string | null;
      lastRejectedAt: string | null;
    }
  >();
  begin(
    machineId: number | undefined,
    mapping: OpcuaMappingConfig,
  ): CollectorConnectionDiagnostic {
    const now = new Date().toISOString();
    const record: CollectorConnectionDiagnostic = {
      observedSince: now,
      state: "connecting",
      attempts: 0,
      reconnects: 0,
      connectionLosses: 0,
      heartbeatFailures: 0,
      subscriptionErrors: 0,
      requestedPublishingMs: 500,
      revisedPublishingMs: null,
      lastConnectionEventAt: now,
      signals: Object.entries(mapping).map(([key, m]) => ({
        key,
        requestedSamplingMs: m.samplingInterval ?? 500,
        revisedSamplingMs: null,
        requestedQueueSize: 10,
        revisedQueueSize: null,
        state: "pending",
        statusCode: null,
        lastReceivedAt: null,
        lastSourceAt: null,
        observations: 0,
        unusableObservations: 0,
        overflowIndications: 0,
      })),
    };
    if (machineId != null) this.connections.set(machineId, record);
    return record;
  }
  connection(machineId: number) {
    return this.connections.get(machineId) ?? null;
  }
  ingestionState(machineId: number) {
    return this.ingestion.get(machineId) ?? null;
  }
  private ingestionRecord(machineId: number) {
    let record = this.ingestion.get(machineId);
    if (!record) {
      record = {
        observedSince: new Date().toISOString(),
        rejected: 0,
        lastCommittedAt: null,
        lastRejectedAt: null,
      };
      this.ingestion.set(machineId, record);
    }
    return record;
  }
  accepted(machineId: number | undefined) {
    if (machineId != null) this.ingestionRecord(machineId);
  }
  rejected(machineId: number | undefined) {
    if (machineId != null) {
      const record = this.ingestionRecord(machineId);
      record.rejected++;
      record.lastRejectedAt = new Date().toISOString();
    }
  }
  committed(machineId: number | undefined) {
    if (machineId != null)
      this.ingestionRecord(machineId).lastCommittedAt =
        new Date().toISOString();
  }
}
export function observeSignal(
  signal: MonitoredSignalDiagnostic,
  receivedAt: Date,
  sourceAt: Date | null | undefined,
  status: string,
) {
  signal.observations++;
  signal.lastReceivedAt = receivedAt.toISOString();
  signal.lastSourceAt =
    sourceAt && Number.isFinite(sourceAt.getTime())
      ? sourceAt.toISOString()
      : null;
  signal.statusCode = status;
  if (!status.startsWith("Good")) signal.unusableObservations++;
  if (status.includes("Overflow")) signal.overflowIndications++;
}
export const collectorDiagnostics = new CollectorDiagnostics();
