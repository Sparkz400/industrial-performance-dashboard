export declare const ConnectionStatus: {
    readonly CONNECTED: "CONNECTED";
    readonly CONNECTING: "CONNECTING";
    readonly DISCONNECTED: "DISCONNECTED";
    readonly ERROR: "ERROR";
    readonly WARNING: "WARNING";
    readonly UNKNOWN: "UNKNOWN";
};
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];
export declare const ServiceName: {
    readonly DATABASE: "DATABASE";
    readonly OPCUA: "OPCUA";
};
export type ServiceName = (typeof ServiceName)[keyof typeof ServiceName];
export declare const UserRole: {
    readonly ADMIN: "admin";
    readonly VIEWER: "viewer";
};
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export declare const SecurityMode: {
    readonly NONE: "None";
    readonly SIGN: "Sign";
    readonly SIGN_AND_ENCRYPT: "SignAndEncrypt";
};
export type SecurityMode = (typeof SecurityMode)[keyof typeof SecurityMode];
export declare const HealthStatus: {
    readonly OK: "ok";
    readonly DEGRADED: "degraded";
    readonly ERROR: "error";
};
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];
export declare const ExportFormat: {
    readonly PNG: "png";
    readonly SVG: "svg";
    readonly CSV: "csv";
};
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];
export declare const NotificationType: {
    readonly ALARM: "alarm";
    readonly STATUS: "status";
    readonly SYSTEM: "system";
    readonly INFO: "info";
};
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export declare const NotificationSeverity: {
    readonly CRITICAL: "critical";
    readonly HIGH: "high";
    readonly MEDIUM: "medium";
    readonly LOW: "low";
    readonly INFO: "info";
};
export type NotificationSeverity = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];
export declare const AlarmSeverity: {
    readonly CRITICAL: "critical";
    readonly HIGH: "high";
    readonly MEDIUM: "medium";
    readonly LOW: "low";
    readonly INFO: "info";
};
export type AlarmSeverity = (typeof AlarmSeverity)[keyof typeof AlarmSeverity];
export declare const AlarmStatus: {
    readonly ACTIVE: "active";
    readonly ACKNOWLEDGED: "acknowledged";
    readonly CLEARED: "cleared";
};
export type AlarmStatus = (typeof AlarmStatus)[keyof typeof AlarmStatus];
export declare const AlarmCondition: {
    readonly GT: "gt";
    readonly GTE: "gte";
    readonly LT: "lt";
    readonly LTE: "lte";
    readonly EQ: "eq";
};
export type AlarmCondition = (typeof AlarmCondition)[keyof typeof AlarmCondition];
export declare const AggregateResolution: {
    readonly RAW: "raw";
    readonly HOURLY: "hourly";
    readonly DAILY: "daily";
    readonly WEEKLY: "weekly";
};
export type AggregateResolution = (typeof AggregateResolution)[keyof typeof AggregateResolution];
export declare const TimeRangePreset: {
    readonly ONE_HOUR: "1h";
    readonly SIX_HOURS: "6h";
    readonly TWENTY_FOUR_HOURS: "24h";
    readonly SEVEN_DAYS: "7d";
    readonly THIRTY_DAYS: "30d";
    readonly CUSTOM: "custom";
};
export type TimeRangePreset = (typeof TimeRangePreset)[keyof typeof TimeRangePreset];
export declare function getStatusLabel(status: string): string;
export declare function getStatusColor(status: string): string;
//# sourceMappingURL=enums.d.ts.map