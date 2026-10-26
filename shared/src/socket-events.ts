// ===== Status Types (shared between client & server) =====

export interface ServiceStatus {
  status: string;
  statusText: string;
  statusColor: string;
  details: Record<string, unknown>;
}

export interface SystemStatus {
  database: ServiceStatus;
  opcua: ServiceStatus;
  overall: ServiceStatus;
  lastUpdated?: string;
}

// ===== OPC UA Types =====

export interface SignalMetadata {
  signalId: string;
  endpointUrl: string;
  machineId: number | null;
  nodeId: string;
  namespaceUri: string;
  identifier: string;
  mappingRevision: string;
  unit: string | null;
}

export interface OpcuaNodeData {
  key: string;
  label: string;
  value: number | string | boolean | null;
  timestamp: Date | string;
  sourceTimestamp?: Date | string | null;
  receivedAt?: Date | string;
  signalMetadata?: SignalMetadata;
  dataType: string;
  statusCode: string;
  machineId?: number;
  delta?: number | null;
}

// ===== Alarm Socket Types =====

export interface AlarmEvent {
  conditionState?: "active" | "clear" | "unknown";
  id: number;
  ruleId: number;
  machineId: number | null;
  nodeKey: string;
  severity: string;
  status: string;
  message: string;
  source: string;
  value: number | null;
  threshold: number | null;
  triggeredAt: string;
  acknowledgedAt?: string | null;
  clearedAt?: string | null;
  acknowledgedBy?: number | null;
}

// ===== Machine Types =====

export interface MachineStatusUpdate {
  machineId: number;
  status: string;
}

// ===== Certificate Types =====

export interface CertificateNotification {
  filename: string;
  serverUri?: string;
  timestamp: string;
  certificateHash?: string;
}

export interface CertificateAcceptedResult {
  success: boolean;
  filename: string;
  error?: string;
  timestamp?: string;
}

export interface CertificateError {
  error?: string;
  serverUri?: string;
}

// ===== SPC Alert Socket Types =====

export interface SpcAlertEvent {
  id: number;
  profileId: number;
  machineId: number | null;
  nodeKey: string;
  alertType: string;
  value: number;
  threshold: number;
  message: string;
  severity: string;
  createdAt: string;
}

// ===== Batch Status Socket Types =====

export interface BatchStatusEvent {
  batchId: number;
  batchNumber: string;
  status: string;
  machineId: number | null;
}

// ===== Edge Sync Socket Types =====

export interface EdgeSyncStatusEvent {
  isEdgeMode: boolean;
  cloudReachable: boolean;
  syncQueueDepth: number;
  lastSuccessfulSync: string | null;
  lastSyncError: string | null;
  retryingCount: number;
}

// ===== Alert Socket Payloads =====

import type { AlertHistoryEntry } from "./domain-types.js";

export type { AlertHistoryEntry };

export interface AcknowledgeAlertPayload {
  id: number;
  userId?: number;
}

// ===== Socket.io Typed Event Maps =====

// ===== Alert Engine Notification (Tier 1) =====

export interface AlertNotification {
  alertId: number;
  ruleId: number;
  ruleName: string;
  severity: string;
  message: string;
  machineId: number | null;
  nodeKey: string;
  value: number;
  threshold: number | null;
  timestamp: string;
}

/** Events emitted from server to client */
export interface ServerToClientEvents {
  statusUpdate: (status: SystemStatus) => void;
  opcuaUpdate: (data: OpcuaNodeData) => void;
  machineStatusUpdate: (data: MachineStatusUpdate) => void;
  untrustedCertificate: (data: CertificateNotification) => void;
  certificateAccepted: (data: CertificateAcceptedResult) => void;
  certificateError: (data: CertificateError) => void;
  alarmTriggered: (data: AlarmEvent) => void;
  alarmAcknowledged: (data: AlarmEvent) => void;
  alarmCleared: (data: AlarmEvent) => void;
  alarmUpdated: (data: AlarmEvent) => void;
  alertTriggered: (data: AlertNotification) => void;
  activeAlerts: (data: AlertHistoryEntry[]) => void;
  alertAcknowledged: (data: AlertHistoryEntry) => void;
  alertUpdated: (data: AlertHistoryEntry) => void;
  spcAlert: (data: SpcAlertEvent) => void;
  batchStatusUpdate: (data: BatchStatusEvent) => void;
  edgeSyncUpdate: (data: EdgeSyncStatusEvent) => void;
}

/** Events emitted from client to server */
export interface ClientToServerEvents {
  joinRoom: (roomName: string) => void;
  leaveRoom: (roomName: string) => void;
  acceptCertificate: (filename: string) => void;
  acknowledgeAlert: (data: AcknowledgeAlertPayload) => void;
}

/** Inter-server events (not used currently, placeholder for scaling) */
export interface InterServerEvents {}

/** Custom data attached to each socket */
export interface SocketData {
  machineIds?: number[];
  user: {
    authenticated: boolean;
    id: number;
    username: string;
    role: string;
  };
}
