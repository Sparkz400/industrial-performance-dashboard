import type {
  AuthUser,
  UserInfo,
  Machine,
  NodeMapping,
  BrowsedNode,
  Dashboard,
  Widget,
  LayoutItem,
  Alarm,
  AlarmRule,
  Annotation,
  AggregateDataPoint,
  AuditLogEntry,
  Webhook,
  ShareToken,
  CustomWidgetManifest,
  CustomWidgetRegistration,
  // Compliance
  ComplianceAuditEntry,
  DashboardVersion,
  VersionDiff,
  // SPC
  SpcProfile,
  SpcAlert,
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
  // Multi-plant
  Plant,
  PlantMembership,
  // OEE
  OeeConfig,
  OeeManualEntry,
  OeeResult,
  // Alerting Engine
  AlertRule,
  AlertHistoryEntry,
  NotificationChannel,
  // Reports
  ReportTemplate,
  ReportSchedule,
  ReportHistoryEntry,
  // Trending
  TrendingSeries,
} from "./domain-types.js";
import type {
  HealthStatus,
  UserRole,
  AlarmSeverity,
  AlarmStatus,
  AlarmCondition,
  AggregateResolution,
} from "./enums.js";

// ===== Generic API Response Wrappers =====

export interface ApiMessageResponse {
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  statusCode?: number;
}

// ===== Auth API =====

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface RegisterResponse {
  user: UserInfo;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateUserRequest {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdateUserResponse {
  user: UserInfo;
}

export type GetMeResponse = LoginResponse;
export type GetUsersResponse = UserInfo[];

// ===== Dashboard API =====

export type GetDashboardsResponse = Dashboard[];
export type GetDashboardResponse = Dashboard;

export interface SaveDashboardRequest {
  name: string;
  widgets?: Widget[];
  layout?: LayoutItem[];
}

export type SaveDashboardResponse = Dashboard;

export interface DeleteDashboardResponse {
  message: string;
}

// ===== Machine API =====

export interface MachineWithMappings extends Machine {
  mappings: NodeMapping[];
}

export interface CreateMachineRequest {
  name: string;
  ip: string;
  port: number;
  resourcePath?: string;
  securityMode?: string;
  securityPolicy?: string;
  isActive?: boolean;
}

export type UpdateMachineRequest = CreateMachineRequest;

export type GetMachinesResponse = Machine[];
export type GetMachineResponse = MachineWithMappings;
export type CreateMachineResponse = Machine;
export type UpdateMachineResponse = Machine;

export interface DeleteMachineResponse {
  message: string;
  machine: Machine;
}

// ===== Node Mapping API =====

export interface NodeMappingInput {
  nodeId: string;
  nodeKey: string;
  displayName: string;
  dataType?: string;
  samplingInterval?: number;
  isActive?: boolean;
}

export interface SaveMappingsRequest {
  mappings: NodeMappingInput[];
}

export type GetMappingsResponse = NodeMapping[];
export type SaveMappingsResponse = NodeMapping[];

export interface BrowseNodesRequest {
  parentNodeId?: string;
}

export type BrowseNodesResponse = BrowsedNode[];

// ===== OPC-UA API =====

export interface OpcuaConnectRequest {
  ip: string;
  port: number;
  resourcePath?: string;
  securityMode?: string;
  securityPolicy?: string;
}

export interface OpcuaConnectResponse {
  message: string;
  config: OpcuaConnectRequest;
  securityMode: string;
  securityPolicy: string;
}

export interface OpcuaStatusResponse {
  connected: boolean;
  status: string;
  statusText: string;
  config: {
    ip: string;
    port: number;
    resourcePath: string;
    securityMode: string;
    securityPolicy: string;
  };
  details: Record<string, unknown>;
  lastUpdated: string;
}

export interface SecurityOptionsResponse {
  securityModes: string[];
  securityPolicies: string[];
  current: {
    securityMode: string;
    securityPolicy: string;
    ip?: string;
    port?: number;
    resourcePath?: string;
  };
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  securityMode: string;
  securityPolicy: string;
}

// ===== Certificate API =====

export interface CertificateInfo {
  filename: string;
  filepath: string;
  [key: string]: unknown;
}

// ===== Status API =====

export interface StatusDetails {
  message?: string;
  error?: string;
  timestamp?: string;
  attempt?: number;
  attempts?: number;
  endpoint?: string;
  connected?: boolean;
  config?: Record<string, unknown>;
  securityMode?: string;
  securityPolicy?: string;
  lastDataTimestamp?: unknown;
  [key: string]: unknown;
}

export interface ServiceStatusInfo {
  status: string;
  statusText: string;
  statusColor: string;
  details: StatusDetails;
}

export interface FullStatusResponse {
  database: ServiceStatusInfo;
  opcua: ServiceStatusInfo;
  overall: {
    status: string;
    statusText: string;
    statusColor: string;
  };
  lastUpdated: string;
}

// ===== Health Check API =====

export interface DependencyCheck {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
    opcua: DependencyCheck;
  };
}

// ===== System API =====

export interface SystemStatsResponse {
  uptime: number;
  memoryUsage: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  cpuUsage: number;
  cpuInfo: {
    cores: number;
    model: string;
    speed: number;
  };
  platform: {
    type: string;
    platform: string;
    release: string;
    architecture: string;
  };
  processMemory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  activeConnections: number;
  lastRestart: string;
}

export interface ConnectionHistoryEntry {
  id: string;
  ip: string;
  connectedAt: string;
  disconnectedAt?: string;
}

export interface SystemConnectionsResponse {
  activeCount: number;
  activeConnections: unknown[];
  history: ConnectionHistoryEntry[];
}

// ===== Audit Logs API =====

export interface GetAuditLogsRequest {
  action?: string;
  entityType?: string;
  search?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export type GetAuditLogsResponse = AuditLogEntry[];

// ===== Webhook API =====

export interface CreateWebhookRequest {
  name: string;
  url: string;
  events: string[];
}

export interface UpdateWebhookRequest {
  name?: string;
  url?: string;
  events?: string[];
  isActive?: boolean;
}

export type GetWebhooksResponse = Webhook[];

// ===== Dashboard Sharing API =====

export interface CreateShareRequest {
  expiresInHours?: number | null;
  allowEmbed?: boolean;
}

export interface CreateShareResponse {
  token: ShareToken;
  shareUrl: string;
  embedUrl: string;
}

export type GetSharesResponse = ShareToken[];

export interface PublicDashboardResponse {
  dashboard: Dashboard;
}

// ===== Custom Widget API =====

export interface RegisterWidgetRequest {
  manifestUrl: string;
}

export type GetCustomWidgetsResponse = CustomWidgetRegistration[];

export interface NodeDataPoint {
  timestamp: string;
  time: string;
  value: number | null;
}

// ===== Compliance API =====

export interface VerifySignatureRequest {
  password: string;
}

// ===== SPC API =====

export interface CreateSpcProfileRequest {
  name: string;
  machineId?: number;
  nodeKey: string;
  method: "zscore" | "moving_avg" | "std_bands" | "cusum";
  windowSize?: number;
  sensitivity?: number;
}

// ===== Recipe API =====

export interface CreateRecipeRequest {
  name: string;
  description?: string;
  machineId?: number;
  parameters: RecipeParameter[];
  setpoints?: Record<string, { value: number; min: number; max: number }>;
}

export interface UpdateRecipeRequest {
  name?: string;
  description?: string;
  status?: "draft" | "active" | "archived";
  parameters?: RecipeParameter[];
  setpoints?: Record<string, { value: number; min: number; max: number }>;
}

// ===== Batch API =====

export interface CreateBatchRequest {
  batchNumber: string;
  recipeId: number;
  machineId: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}
export interface CompareBatchesRequest {
  batchIds: number[];
}

// ===== Digital Twin API =====

export interface CreateTwinTemplateRequest {
  name: string;
  description?: string;
  svgContent: string;
  elementMappings?: TwinElementMapping[];
  category?: string;
}

export interface CreateTwinInstanceRequest {
  templateId: number;
  machineId: number;
  name: string;
  nodeBindings?: TwinNodeBinding[];
  displayConfig?: Record<string, unknown>;
}

export interface UpdateTwinInstanceRequest {
  name?: string;
  nodeBindings?: TwinNodeBinding[];
  displayConfig?: Record<string, unknown>;
  isActive?: boolean;
}

export interface GetTrendingDataResponse {
  series: TrendingSeries[];
}
