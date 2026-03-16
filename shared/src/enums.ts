// ===== Connection Status =====

export const ConnectionStatus = {
  CONNECTED: 'CONNECTED',
  CONNECTING: 'CONNECTING',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ConnectionStatus =
  (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

// ===== Service Names =====

export const ServiceName = {
  DATABASE: 'DATABASE',
  OPCUA: 'OPCUA',
} as const;

export type ServiceName = (typeof ServiceName)[keyof typeof ServiceName];

// ===== User Roles =====

export const UserRole = {
  ADMIN: 'admin',
  VIEWER: 'viewer',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ===== OPC-UA Security =====

export const SecurityMode = {
  NONE: 'None',
  SIGN: 'Sign',
  SIGN_AND_ENCRYPT: 'SignAndEncrypt',
} as const;

export type SecurityMode = (typeof SecurityMode)[keyof typeof SecurityMode];

// ===== Health Check Status =====

export const HealthStatus = {
  OK: 'ok',
  DEGRADED: 'degraded',
  ERROR: 'error',
} as const;

export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

// ===== Export Formats =====

export const ExportFormat = {
  PNG: 'png',
  SVG: 'svg',
  CSV: 'csv',
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// ===== Notification Types =====

export const NotificationType = {
  ALARM: 'alarm',
  STATUS: 'status',
  SYSTEM: 'system',
  INFO: 'info',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;

export type NotificationSeverity =
  (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

// ===== Alarm Severity =====

export const AlarmSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
} as const;

export type AlarmSeverity = (typeof AlarmSeverity)[keyof typeof AlarmSeverity];

// ===== Alarm Status =====

export const AlarmStatus = {
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  CLEARED: 'cleared',
} as const;

export type AlarmStatus = (typeof AlarmStatus)[keyof typeof AlarmStatus];

// ===== Alarm Condition =====

export const AlarmCondition = {
  GT: 'gt',
  GTE: 'gte',
  LT: 'lt',
  LTE: 'lte',
  EQ: 'eq',
} as const;

export type AlarmCondition =
  (typeof AlarmCondition)[keyof typeof AlarmCondition];

// ===== Aggregate Resolution =====

export const AggregateResolution = {
  RAW: 'raw',
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
} as const;

export type AggregateResolution =
  (typeof AggregateResolution)[keyof typeof AggregateResolution];

// ===== Time Range Presets =====

export const TimeRangePreset = {
  ONE_HOUR: '1h',
  SIX_HOURS: '6h',
  TWENTY_FOUR_HOURS: '24h',
  SEVEN_DAYS: '7d',
  THIRTY_DAYS: '30d',
  CUSTOM: 'custom',
} as const;

export type TimeRangePreset =
  (typeof TimeRangePreset)[keyof typeof TimeRangePreset];

// ===== Status Helper Functions =====

export function getStatusLabel(status: string): string {
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

export function getStatusColor(status: string): string {
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
