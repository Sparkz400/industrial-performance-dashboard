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
export interface OpcuaNodeData {
    key: string;
    label: string;
    value: unknown;
    timestamp: string;
    dataType: string;
    statusCode: string;
    machineId?: number;
    delta?: number | null;
}
export interface AlarmEvent {
    id: number;
    ruleId: number;
    machineId: number;
    nodeKey: string;
    severity: string;
    status: string;
    message: string;
    source: string;
    value: number;
    threshold: number;
    triggeredAt: string;
    acknowledgedAt?: string | null;
    clearedAt?: string | null;
    acknowledgedBy?: number | null;
}
export interface MachineStatusUpdate {
    machineId: number;
    status: string;
}
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
export interface BatchStatusEvent {
    batchId: number;
    batchNumber: string;
    status: string;
    machineId: number | null;
}
export interface EdgeSyncStatusEvent {
    isEdgeMode: boolean;
    cloudReachable: boolean;
    syncQueueDepth: number;
    lastSuccessfulSync: string | null;
    lastSyncError: string | null;
    retryingCount: number;
}
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
    alertTriggered: (data: AlertNotification) => void;
    spcAlert: (data: SpcAlertEvent) => void;
    batchStatusUpdate: (data: BatchStatusEvent) => void;
    edgeSyncUpdate: (data: EdgeSyncStatusEvent) => void;
}
/** Events emitted from client to server */
export interface ClientToServerEvents {
    joinRoom: (roomName: string) => void;
    leaveRoom: (roomName: string) => void;
    acceptCertificate: (filename: string) => void;
    acknowledgeAlert: (alertId: number) => void;
}
/** Inter-server events (not used currently, placeholder for scaling) */
export interface InterServerEvents {
}
/** Custom data attached to each socket */
export interface SocketData {
    user: {
        authenticated: boolean;
        id: number;
        username: string;
        role: string;
    };
}
//# sourceMappingURL=socket-events.d.ts.map