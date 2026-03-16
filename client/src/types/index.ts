// ===== Re-export all shared types =====
export type {
  // Auth
  AuthUser,
  UserInfo,
  // Machine
  Machine,
  MachineFormData,
  NodeMapping,
  BrowsedNode,
  // Dashboard
  Widget,
  WidgetConfig,
  LayoutItem,
  Dashboard,
  DashboardTemplate,
  // Data
  KpiData,
  TimeRange,
  Notification,
  Annotation,
  AuditLogEntry,
  // Status / Socket
  ServiceStatus,
  SystemStatus,
  OpcuaNodeData,
  MachineStatusUpdate,
  CertificateNotification,
  CertificateAcceptedResult,
  CertificateError,
  AlarmEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  // API types
  LoginRequest,
  LoginResponse,
  GetMeResponse,
  RegisterRequest,
  RegisterResponse,
  ChangePasswordRequest,
  UpdateUserRequest,
  UpdateUserResponse,
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
  FullStatusResponse,
  StatusDetails,
  ServiceStatusInfo,
  HealthCheckResponse,
  SystemStatsResponse,
  SystemConnectionsResponse,
  ApiMessageResponse,
  ApiErrorResponse,
  GetAuditLogsRequest,
  GetAuditLogsResponse,
  // Tier 3 types
  NLQueryRequest,
  NLQueryResponse,
  NLChartConfig,
  Webhook,
  WebhookEvent,
  ShareToken,
  ShareDashboardRequest,
  SharedDashboardResponse,
  CustomWidgetManifest,
  WidgetSettingsField,
  CustomWidgetRegistration,
  NLQueryApiRequest,
  NLQueryApiResponse,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  GetWebhooksResponse,
  CreateShareRequest,
  CreateShareResponse,
  GetSharesResponse,
  PublicDashboardResponse,
  GetCustomWidgetsResponse,
  RegisterWidgetRequest,
} from '@performance-dashboard/shared';

export {
  ConnectionStatus,
  UserRole,
  SecurityMode,
  HealthStatus,
  ExportFormat,
  NotificationType,
  NotificationSeverity,
  TimeRangePreset,
} from '@performance-dashboard/shared';

// ===== Client-Only Widget Types (depend on React) =====

export interface WidgetComponentProps {
  config: import('@performance-dashboard/shared').WidgetConfig;
  commonData?: Record<string, unknown>;
  onError?: (error: Error) => void;
}

export interface WidgetSettingsProps {
  config: import('@performance-dashboard/shared').WidgetConfig;
  onConfigChange: (newConfig: import('@performance-dashboard/shared').WidgetConfig) => void;
}

export interface WidgetMeta {
  component: React.LazyExoticComponent<React.ComponentType<WidgetComponentProps>>;
  settingsComponent: React.LazyExoticComponent<React.ComponentType<WidgetSettingsProps>> | null;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  title: string;
  description: string;
  category: string;
  icon: string;
  defaultConfig: import('@performance-dashboard/shared').WidgetConfig;
}

export interface WidgetRegistry {
  [key: string]: WidgetMeta;
}
