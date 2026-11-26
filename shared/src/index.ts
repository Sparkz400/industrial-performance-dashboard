// Enums & Constants
export {
  ConnectionStatus,
  ServiceName,
  UserRole,
  SecurityMode,
  HealthStatus,
  ExportFormat,
  NotificationType,
  NotificationSeverity,
  TimeRangePreset,
  AlarmSeverity,
  AlarmStatus,
  AlarmCondition,
  AggregateResolution,
  getStatusLabel,
  getStatusColor,
} from "./enums.js";

// Domain Types
export type {
  AuthUser,
  UserInfo,
  Machine,
  MachineFormData,
  SubscriptionLimits,
  MachineAuthentication,
  MachineAuthenticationInput,
  NodeMapping,
  BrowsedNode,
  Widget,
  WidgetConfig,
  LayoutItem,
  Dashboard,
  DashboardTemplate,
  KpiData,
  TimeRange,
  Notification,
  Alarm,
  AlarmRule,
  AggregateDataPoint,
  Annotation,
  AuditLogEntry,
  // Webhooks
  Webhook,
  WebhookEvent,
  // Dashboard Sharing
  ShareToken,
  ShareDashboardRequest,
  SharedDashboardResponse,
  // Custom Widget SDK
  CustomWidgetManifest,
  WidgetSettingsField,
  CustomWidgetRegistration,
  // Compliance
  ElectronicSignature,
  ComplianceAuditEntry,
  DashboardVersion,
  VersionDiff,
  // SPC
  SpcProfile,
  SpcAlert,
  SpcChartDataPoint,
  SpcChartData,
  // Recipe / Batch
  RecipeParameter,
  Recipe,
  Batch,
  BatchSummary,
  BatchDataSeries,
  // Digital Twin
  TwinElementMapping,
  DigitalTwinTemplate,
  TwinNodeBinding,
  DigitalTwinInstance,
  TwinLiveData,
  // Edge Gateway
  EdgeSyncStatus,
  EdgeConfig,
  EdgeIngestPayload,
  // Multi-plant
  Plant,
  PlantMembership,
  // OEE
  OeeConfig,
  OeeManualEntry,
  OeeResult,
  // Alert Engine
  AlertRule as AlertEngineRule,
  AlertHistoryEntry,
  NotificationChannel,
  // Reports
  ReportTemplate,
  ReportSchedule,
  ReportHistoryEntry,
  // Trending
  TrendingDataPoint,
  TrendingSeries,
} from "./domain-types.js";

export type {
  AlertSeverity,
  AlertStatus,
  AlertCondition,
  ReportType,
} from "./domain-types.js";

// Socket.io Event Types
export type {
  ServiceStatus,
  SystemStatus,
  OpcuaNodeData,
  SignalMetadata,
  MachineStatusUpdate,
  CertificateNotification,
  CertificateAcceptedResult,
  CertificateError,
  AlarmEvent,
  SpcAlertEvent,
  BatchStatusEvent,
  EdgeSyncStatusEvent,
  AlertNotification,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  AcknowledgeAlertPayload,
} from "./socket-events.js";

// API Request/Response Types
export type {
  ApiMessageResponse,
  ApiErrorResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  ChangePasswordRequest,
  UpdateUserRequest,
  UpdateUserResponse,
  GetMeResponse,
  GetUsersResponse,
  GetDashboardsResponse,
  GetDashboardResponse,
  SaveDashboardRequest,
  SaveDashboardResponse,
  DeleteDashboardResponse,
  MachineWithMappings,
  CreateMachineRequest,
  UpdateMachineRequest,
  GetMachinesResponse,
  GetMachineResponse,
  CreateMachineResponse,
  UpdateMachineResponse,
  DeleteMachineResponse,
  NodeMappingInput,
  SaveMappingsRequest,
  GetMappingsResponse,
  SaveMappingsResponse,
  BrowseNodesRequest,
  BrowseNodesResponse,
  OpcuaConnectRequest,
  OpcuaConnectResponse,
  OpcuaStatusResponse,
  SecurityOptionsResponse,
  TestConnectionResponse,
  CertificateInfo,
  StatusDetails,
  ServiceStatusInfo,
  FullStatusResponse,
  DependencyCheck,
  HealthCheckResponse,
  SystemStatsResponse,
  ConnectionHistoryEntry,
  SystemConnectionsResponse,
  GetAuditLogsRequest,
  GetAuditLogsResponse,
  // Webhook API
  CreateWebhookRequest,
  UpdateWebhookRequest,
  GetWebhooksResponse,
  // Share API
  CreateShareRequest,
  CreateShareResponse,
  GetSharesResponse,
  PublicDashboardResponse,
  // Custom Widget API
  RegisterWidgetRequest,
  GetCustomWidgetsResponse,
  // Alarm API
  // Annotation API
  // Node Data API
  NodeDataPoint,
  // Aggregate API
  // Compliance API
  VerifySignatureRequest,
  // SPC API
  CreateSpcProfileRequest,
  // Recipe API
  CreateRecipeRequest,
  UpdateRecipeRequest,
  // Batch API
  CreateBatchRequest,
  CompareBatchesRequest,
  // Digital Twin API
  CreateTwinTemplateRequest,
  CreateTwinInstanceRequest,
  UpdateTwinInstanceRequest,
  // Edge Gateway API
  // Plant API
  // OEE API
  // Alert Engine API
  // Notification Channel API
  // Trending API
  GetTrendingDataResponse,
  // Report API
} from "./api-types.js";
export type {
  ProductionState,
  OperatorEntry,
  MachineLiveSummary,
  ProductionSignal,
  ProductionProfile,
  EndpointBuild,
  EndpointSupport,
  ProductRun,
  ProductionInterval,
  DowntimeReason,
  ShiftReport,
  ReportRevisionCheck,
  ChangeoverTransition,
  ChangeoverAnalysis,
} from "./production.js";
export type {
  ScheduledReportConfig,
  ScheduledReportSection,
} from "./reports.js";
export type { ReplaySample, ReplayEvent, IncidentReplay } from "./replay.js";
export { replayObservation, replayPoints } from "./replay.js";
export type {
  ComparisonReason,
  ComparisonPeriod,
  PeriodComparison,
} from "./comparison.js";
export type * from "./configBundle.js";
export type {
  MonitoredSignalDiagnostic,
  CollectorConnectionDiagnostic,
  ConnectionDiagnostics,
  AlarmReview,
  AlarmReplayReview,
} from "./operationalDiagnostics.js";
export * from "./derivedSignals.js";
export type * from "./sharing.js";
