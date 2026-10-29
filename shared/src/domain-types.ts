import type {
  UserRole,
  SecurityMode,
  NotificationType,
  NotificationSeverity,
  TimeRangePreset,
  ExportFormat,
  AlarmSeverity,
  AlarmStatus,
  AlarmCondition,
  AggregateResolution,
} from "./enums.js";

// ===== Auth / User Types =====

export interface AuthUser {
  recoveryMode?: boolean;
  id: number;
  username: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt?: Date | null;
}

// ===== Machine Types =====

export interface MachineAuthentication {
  mode: "anonymous" | "username" | "certificate";
  username?: string;
  certificateExpiresAt?: string;
}

export interface MachineAuthenticationInput extends MachineAuthentication {
  password?: string;
  certificatePem?: string;
  privateKeyPem?: string;
}

/** Per-endpoint OPC UA subscription limits; null means collector defaults. */
export interface SubscriptionLimits {
  publishingIntervalMs: number;
  queueSize: number;
  maxNotificationsPerPublish: number;
}

export interface Machine {
  id: number;
  name: string;
  endpointUrl: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  mappingCount?: number;
  authentication?: MachineAuthentication;
  subscription?: SubscriptionLimits | null;
}

export interface MachineFormData {
  name: string;
  ip: string;
  port: number;
  resourcePath: string;
  securityMode: string;
  securityPolicy: string;
  isActive: boolean;
  authentication?: MachineAuthenticationInput;
  subscription?: SubscriptionLimits | null;
}

export interface NodeMapping {
  id: number;
  machineId: number;
  nodeId: string;
  nodeKey: string;
  displayName: string;
  dataType: string;
  samplingInterval: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrowsedNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  isForward: boolean;
}

// ===== Dashboard Types =====

export interface Widget {
  id: string;
  type: string;
  config: WidgetConfig;
}

export interface WidgetConfig {
  [key: string]: unknown;
}

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
  layout: LayoutItem[];
  localLastModified?: string;
  serverLastModified?: string | null;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  widgets: Widget[];
  layout: LayoutItem[];
  category: string;
}

// ===== KPI Types =====

export interface KpiData {
  activeAlarms: number;
  uptimePercent: number;
  airConsumption: number;
  systemStatus: "healthy" | "degraded" | "error";
  dbStatus: string;
  opcuaStatus: string;
}

// ===== Time Range =====

export interface TimeRange {
  preset: TimeRangePreset;
  start: Date;
  end: Date;
  label: string;
}

// ===== Notification =====

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  source?: string;
}

// ===== Alarm Types =====

export interface AlarmRule {
  id: number;
  machineId: number;
  nodeKey: string;
  name: string;
  severity: AlarmSeverity;
  condition: AlarmCondition;
  threshold: number;
  hysteresis: number;
  cooldownSeconds: number;
  debounceSeconds: number;
  clearDebounceSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Alarm {
  id: number;
  ruleId: number;
  machineId: number;
  nodeKey: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  message: string;
  source: string;
  value: number;
  threshold: number;
  triggeredAt: string;
  acknowledgedAt: string | null;
  clearedAt: string | null;
  acknowledgedBy: number | null;
}

// ===== Aggregate Types =====

export interface AggregateDataPoint {
  bucket: string;
  nodeKey: string;
  machineId: number | null;
  avgValue: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
}

// ===== Annotation =====

export interface Annotation {
  id: string;
  widgetId: string;
  dashboardId?: string;
  userId?: number;
  text: string;
  timestamp: Date;
  color: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ===== Audit Log =====

export interface AuditLogEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  userId: number | null;
  username: string | null;
  userRole: UserRole | null;
  ipAddress: string | null;
  createdAt: string;
}

// ===== Webhook / Integration Types =====

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string | null;
  lastStatus?: number | null;
}

export interface WebhookEvent {
  /** Delivery ID; stable across retries and requeues. Absent on test events. */
  id?: number;
  schemaVersion?: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ===== Dashboard Sharing Types =====

export interface ShareToken {
  id: number;
  dashboardId: string;
  token: string;
  expiresAt: string | null;
  isActive: boolean;
  allowEmbed: boolean;
  createdBy: number;
  createdAt: string;
}

export interface ShareDashboardRequest {
  dashboardId: string;
  expiresInHours?: number | null;
  allowEmbed?: boolean;
}

export interface SharedDashboardResponse {
  dashboard: Dashboard;
  shareUrl: string;
  embedUrl: string;
}

// ===== Custom Widget SDK Types =====

export interface CustomWidgetManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  entryUrl: string;
  settingsSchema?: WidgetSettingsField[];
  defaultConfig: WidgetConfig;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
}

export interface WidgetSettingsField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  options?: string[];
  defaultValue?: unknown;
}

export interface CustomWidgetRegistration {
  id: number;
  manifestUrl: string;
  manifest: CustomWidgetManifest;
  isActive: boolean;
  installedBy: number;
  createdAt: string;
  updatedAt: string;
}

// ===== Compliance Audit Trail (21 CFR Part 11) =====

export interface ElectronicSignature {
  userId: number;
  username: string;
  signedAt: string;
  passwordVerified: boolean;
}

export interface ComplianceAuditEntry extends AuditLogEntry {
  reasonForChange: string | null;
  electronicSignature: ElectronicSignature | null;
  snapshotBefore: unknown | null;
  snapshotAfter: unknown | null;
  checksum: string;
  previousChecksum: string | null;
}

export interface DashboardVersion {
  id: number;
  dashboardId: string;
  version: number;
  name: string;
  widgets: Widget[];
  layout: LayoutItem[];
  changeDescription: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface VersionDiff {
  versionA: number;
  versionB: number;
  widgetsAdded: Widget[];
  widgetsRemoved: Widget[];
  widgetsModified: Array<{
    id: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
  layoutChanges: Array<{
    widgetId: string;
    before: LayoutItem;
    after: LayoutItem;
  }>;
}

// ===== Predictive Maintenance (SPC) =====

export interface SpcProfile {
  id: number;
  name: string;
  machineId: number | null;
  nodeKey: string;
  method: "zscore" | "moving_avg" | "std_bands" | "cusum";
  windowSize: number;
  ucl: number | null;
  lcl: number | null;
  mean: number | null;
  stddev: number | null;
  sensitivity: number;
  isActive: boolean;
  lastComputedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpcAlert {
  id: number;
  profileId: number;
  profileName?: string;
  machineId: number | null;
  nodeKey: string;
  alertType: "ucl_breach" | "lcl_breach" | "trend" | "shift";
  value: number;
  threshold: number;
  message: string;
  severity: string;
  acknowledgedAt: string | null;
  acknowledgedBy: number | null;
  createdAt: string;
}

export interface SpcChartDataPoint {
  timestamp: string;
  value: number | null;
  rawValue?: unknown;
  statusCode?: string | null;
  receivedAt?: string | null;
  sourceTimestamp?: string | null;
  correctionRevision?: number;
  reportedStatusCode?: string | null;
  sourceClockState?: string;
  isAnomaly: boolean;
}

export interface SpcChartData {
  profile: SpcProfile;
  dataPoints: SpcChartDataPoint[];
  ucl: number;
  lcl: number;
  mean: number;
  truncated?: boolean;
  start?: string;
  end?: string;
}

// ===== Recipe / Batch Management =====

export interface RecipeParameter {
  nodeKey: string;
  displayName: string;
  targetValue: number;
  tolerance: number;
  unit: string;
}

export interface Recipe {
  id: number;
  name: string;
  version: number;
  description: string | null;
  machineId: number | null;
  status: "draft" | "active" | "archived";
  parameters: RecipeParameter[];
  setpoints: Record<string, { value: number; min: number; max: number }>;
  parentId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: number;
  batchNumber: string;
  recipeId: number | null;
  machineId: number | null;
  status: "planned" | "running" | "completed" | "aborted";
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  summary: BatchSummary | null;
  startedBy: number | null;
  completedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchSummary {
  duration: number;
  parameterResults: Array<{
    nodeKey: string;
    displayName: string;
    targetValue: number;
    actualAvg: number | null;
    actualMin: number | null;
    actualMax: number | null;
    withinTolerance: boolean | null;
    sampleCount: number;
    excludedCount: number;
  }>;
  overallCompliance: number | null;
}

export interface BatchDataSeries {
  nodeKey: string;
  displayName: string;
  dataPoints: Array<{
    timestamp: string;
    value: number | null;
    rawValue: unknown;
    statusCode: string | null;
  }>;
  setpoint?: number;
  targetValue: number;
  tolerance: number;
}

// ===== Digital Twin =====

export interface TwinElementMapping {
  svgElementId: string;
  label: string;
  dataType: "sensor" | "status" | "indicator";
}

export interface DigitalTwinTemplate {
  id: number;
  name: string;
  description: string | null;
  svgContent: string;
  elementMappings: TwinElementMapping[];
  thumbnail: string | null;
  category: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TwinNodeBinding {
  svgElementId: string;
  nodeKey: string;
  displayName: string;
  unit?: string;
  thresholds?: { warning?: number; critical?: number };
  colorMap?: Record<string, string>;
}

export interface DigitalTwinInstance {
  id: number;
  templateId: number;
  machineId: number;
  name: string;
  nodeBindings: TwinNodeBinding[];
  displayConfig: Record<string, unknown>;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TwinLiveData {
  instanceId: number;
  values: Record<string, { value: unknown; timestamp: string }>;
}

// ===== Edge Gateway =====

export interface EdgeSyncStatus {
  isEdgeMode: boolean;
  cloudReachable: boolean;
  syncQueueDepth: number;
  lastSuccessfulSync: string | null;
  lastSyncError: string | null;
  retryingCount: number;
}

export interface EdgeConfig {
  cloudUrl: string | null;
  syncIntervalMs: number;
  syncBatchSize: number;
  dataRetentionDays: number;
  lightweightMode: boolean;
}

export interface EdgeIngestPayload {
  edgeId: string;
  items: Array<{
    tableName: string;
    operation: string;
    recordId: string;
    payload: unknown;
    originalTimestamp: string;
  }>;
}

// ===== Plant / Multi-tenant Types =====

export interface Plant {
  id: number;
  name: string;
  location: string | null;
  timezone: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlantMembership {
  id: number;
  userId: number;
  plantId: number;
  role: string;
  createdAt: string;
}

// ===== OEE Types =====

export interface OeeConfig {
  id: number;
  machineId: number;
  runningModeValues: number[];
  idleModeValues: number[];
  plannedStopModeValues: number[];
  unplannedStopModeValues: number[];
  idealCycleTimeMs: number | null;
  productionCountNodeKey: string | null;
  goodCountNodeKey: string | null;
  rejectCountNodeKey: string | null;
  manualEntryEnabled: boolean;
  plannedProductionHoursPerDay: number;
  createdAt: string;
  updatedAt: string;
}

export interface OeeManualEntry {
  id: number;
  machineId: number;
  date: string;
  productionCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
  plannedDowntimeMinutes: number;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface OeeResult {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  runningTimeMinutes: number;
  plannedTimeMinutes: number;
  totalCount: number | null;
  goodCount: number | null;
  rejectCount: number | null;
  timestamp: string;
  machineId: number;
  machineName?: string;
}

// ===== Alert Types =====

export type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";
export type AlertStatus = "active" | "acknowledged" | "resolved" | "silenced";
export type AlertCondition =
  "gt" | "lt" | "eq" | "neq" | "range" | "rate_of_change" | "state_change";

export interface AlertRule {
  id: number;
  name: string;
  description: string | null;
  machineId: number | null;
  plantId: number | null;
  nodeKey: string;
  condition: AlertCondition;
  threshold: number | null;
  thresholdHigh: number | null;
  rateWindowSeconds: number | null;
  hysteresis: number;
  severity: AlertSeverity;
  channels: number[];
  cooldownSeconds: number;
  debounceSeconds: number;
  clearDebounceSeconds: number;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertHistoryEntry {
  id: number;
  ruleId: number | null;
  ruleName: string | null;
  machineId: number | null;
  nodeKey: string | null;
  triggerValue: number | null;
  threshold: number | null;
  severity: AlertSeverity | null;
  status: AlertStatus;
  message: string | null;
  acknowledgedBy: number | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationChannel {
  id: number;
  name: string;
  type: "email" | "slack" | "teams" | "sms" | "in_app";
  config: Record<string, unknown>;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

// ===== Report Types =====

export type ReportType = "shift" | "daily" | "weekly";

export interface ReportTemplate {
  id: number;
  name: string;
  type: ReportType;
  description: string | null;
  templateConfig: Record<string, unknown>;
  plantId: number | null;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSchedule {
  id: number;
  templateId: number;
  name: string;
  cronExpression: string;
  timezone: string;
  machineIds: number[];
  recipients: string[];
  deliveryChannels: string[];
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  nextRunAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportHistoryEntry {
  id: number;
  scheduleId: number | null;
  templateId: number | null;
  scheduleName: string | null;
  status: "generating" | "completed" | "failed";
  filePath: string | null;
  fileSize: number | null;
  error: string | null;
  generatedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown>;
}

// ===== Trending Types =====

export interface TrendingDataPoint {
  correctionRevision?: number;
  reportedStatusCode?: string | null;
  sourceClockState?: string;
  rawValue?: unknown;
  timestamp: string;
  value: number | null;
  statusCode?: string | null;
  sourceTimestamp?: string | null;
  receivedAt?: string | null;
  sampleCount?: number;
  goodSampleCount?: number;
}

export interface TrendingSeries {
  correctedSampleCount?: number;
  nodeKey: string;
  displayName: string;
  data: TrendingDataPoint[];
  machineId?: number;
  resolutionMs?: number | null;
  aggregation?: "avg" | "min" | "max" | "last";
  truncated?: boolean;
  sampleCount?: number;
  goodSampleCount?: number;
  legacySampleCount?: number;
  requestedStart?: string;
  requestedEnd?: string;
  observedStart?: string | null;
  observedEnd?: string | null;
  continuity?: "unverified";
  statistics?: {
    min: number | null;
    max: number | null;
    average: number | null;
  };
}
