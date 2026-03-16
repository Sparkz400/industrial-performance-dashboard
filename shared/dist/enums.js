// ===== Connection Status =====
export const ConnectionStatus = {
    CONNECTED: 'CONNECTED',
    CONNECTING: 'CONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    UNKNOWN: 'UNKNOWN',
};
// ===== Service Names =====
export const ServiceName = {
    DATABASE: 'DATABASE',
    OPCUA: 'OPCUA',
};
// ===== User Roles =====
export const UserRole = {
    ADMIN: 'admin',
    VIEWER: 'viewer',
};
// ===== OPC-UA Security =====
export const SecurityMode = {
    NONE: 'None',
    SIGN: 'Sign',
    SIGN_AND_ENCRYPT: 'SignAndEncrypt',
};
// ===== Health Check Status =====
export const HealthStatus = {
    OK: 'ok',
    DEGRADED: 'degraded',
    ERROR: 'error',
};
// ===== Export Formats =====
export const ExportFormat = {
    PNG: 'png',
    SVG: 'svg',
    CSV: 'csv',
};
// ===== Notification Types =====
export const NotificationType = {
    ALARM: 'alarm',
    STATUS: 'status',
    SYSTEM: 'system',
    INFO: 'info',
};
export const NotificationSeverity = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info',
};
// ===== Alarm Severity =====
export const AlarmSeverity = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info',
};
// ===== Alarm Status =====
export const AlarmStatus = {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    CLEARED: 'cleared',
};
// ===== Alarm Condition =====
export const AlarmCondition = {
    GT: 'gt',
    GTE: 'gte',
    LT: 'lt',
    LTE: 'lte',
    EQ: 'eq',
};
// ===== Aggregate Resolution =====
export const AggregateResolution = {
    RAW: 'raw',
    HOURLY: 'hourly',
    DAILY: 'daily',
    WEEKLY: 'weekly',
};
// ===== Time Range Presets =====
export const TimeRangePreset = {
    ONE_HOUR: '1h',
    SIX_HOURS: '6h',
    TWENTY_FOUR_HOURS: '24h',
    SEVEN_DAYS: '7d',
    THIRTY_DAYS: '30d',
    CUSTOM: 'custom',
};
// ===== Status Helper Functions =====
export function getStatusLabel(status) {
    switch (status) {
        case ConnectionStatus.CONNECTED:
            return 'Connected';
        case ConnectionStatus.CONNECTING:
            return 'Connecting...';
        case ConnectionStatus.DISCONNECTED:
            return 'Disconnected';
        case ConnectionStatus.ERROR:
            return 'Error';
        case ConnectionStatus.WARNING:
            return 'Warning';
        case ConnectionStatus.UNKNOWN:
        default:
            return 'Unknown';
    }
}
export function getStatusColor(status) {
    switch (status) {
        case ConnectionStatus.CONNECTED:
            return 'success';
        case ConnectionStatus.CONNECTING:
            return 'info';
        case ConnectionStatus.WARNING:
            return 'warning';
        case ConnectionStatus.ERROR:
        case ConnectionStatus.DISCONNECTED:
            return 'error';
        case ConnectionStatus.UNKNOWN:
        default:
            return 'default';
    }
}
//# sourceMappingURL=enums.js.map