import type { AuthUser, UserInfo, Machine, NodeMapping, BrowsedNode, Dashboard, Widget, LayoutItem, Alarm, AlarmRule, Annotation, AggregateDataPoint, AuditLogEntry, Webhook, ShareToken, CustomWidgetRegistration, NLQueryResponse, ComplianceAuditEntry, DashboardVersion, VersionDiff, SpcProfile, SpcAlert, SpcChartData, RecipeParameter, Recipe, Batch, BatchDataSeries, TwinElementMapping, DigitalTwinTemplate, TwinNodeBinding, DigitalTwinInstance, TwinLiveData, EdgeSyncStatus, EdgeConfig, Plant, PlantMembership, OeeConfig, OeeManualEntry, OeeResult, AlertRule, AlertHistoryEntry, NotificationChannel, ReportTemplate, ReportSchedule, ReportHistoryEntry, TrendingSeries } from './domain-types.js';
import type { HealthStatus, UserRole, AlarmSeverity, AlarmStatus, AlarmCondition, AggregateResolution } from './enums.js';
export interface ApiMessageResponse {
    message: string;
}
export interface ApiErrorResponse {
    error: string;
    message?: string;
    statusCode?: number;
}
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
export type GetDashboardsResponse = Dashboard[];
export type GetDashboardResponse = Dashboard;
export interface ImportDashboardRequest {
    name: string;
    widgets?: Widget[];
    layout?: LayoutItem[];
}
export interface SaveDashboardRequest {
    name: string;
    widgets?: Widget[];
    layout?: LayoutItem[];
}
export type SaveDashboardResponse = Dashboard;
export interface DeleteDashboardResponse {
    message: string;
}
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
export interface DeleteMappingResponse {
    message: string;
    mapping: NodeMapping;
}
export interface BrowseNodesRequest {
    parentNodeId?: string;
}
export type BrowseNodesResponse = BrowsedNode[];
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
export interface CertificateInfo {
    filename: string;
    filepath: string;
    [key: string]: unknown;
}
export interface TrustCertificateRequest {
    certificate: string;
    name: string;
}
export interface TrustCertificateResponse {
    message: string;
    filepath: string;
}
export interface ClientCertificateResponse {
    certificate: string;
    certificatePath: string;
    privateKeyPath: string;
    hasPrivateKey: boolean;
}
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
export interface DbTestResponse {
    status: string;
    target: string;
    time: Record<string, unknown>;
    connections: Record<string, unknown>;
}
export interface DbMetricsResponse {
    connections: Record<string, unknown>;
    queryMetrics: Record<string, unknown>;
}
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
export interface NLQueryApiRequest {
    query: string;
    dashboardId?: string;
    machineId?: number;
}
export type NLQueryApiResponse = NLQueryResponse;
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
export type CreateWebhookResponse = Webhook;
export type UpdateWebhookResponse = Webhook;
export interface DeleteWebhookResponse {
    message: string;
}
export interface TestWebhookResponse {
    success: boolean;
    statusCode: number;
    message: string;
}
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
export interface RevokeShareResponse {
    message: string;
}
export interface PublicDashboardResponse {
    dashboard: Dashboard;
}
export interface RegisterWidgetRequest {
    manifestUrl: string;
}
export type GetCustomWidgetsResponse = CustomWidgetRegistration[];
export type RegisterWidgetResponse = CustomWidgetRegistration;
export interface UnregisterWidgetResponse {
    message: string;
}
export interface GetAlarmsRequest {
    severity?: AlarmSeverity;
    status?: AlarmStatus;
    machineId?: number;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
}
export type GetAlarmsResponse = Alarm[];
export interface AcknowledgeAlarmResponse {
    alarm: Alarm;
}
export interface ClearAlarmResponse {
    alarm: Alarm;
}
export interface CreateAlarmRuleRequest {
    machineId: number;
    nodeKey: string;
    name: string;
    severity: AlarmSeverity;
    condition: AlarmCondition;
    threshold: number;
    hysteresis?: number;
    cooldownSeconds?: number;
    isActive?: boolean;
}
export interface UpdateAlarmRuleRequest {
    name?: string;
    severity?: AlarmSeverity;
    condition?: AlarmCondition;
    threshold?: number;
    hysteresis?: number;
    cooldownSeconds?: number;
    isActive?: boolean;
}
export type GetAlarmRulesResponse = AlarmRule[];
export type CreateAlarmRuleResponse = AlarmRule;
export type UpdateAlarmRuleResponse = AlarmRule;
export interface DeleteAlarmRuleResponse {
    message: string;
}
export interface GetAnnotationsRequest {
    dashboardId: string;
}
export type GetAnnotationsResponse = Annotation[];
export interface CreateAnnotationRequest {
    widgetId: string;
    dashboardId: string;
    text: string;
    color?: string;
    timestamp: string;
}
export interface UpdateAnnotationRequest {
    text?: string;
    color?: string;
}
export type CreateAnnotationResponse = Annotation;
export type UpdateAnnotationResponse = Annotation;
export interface DeleteAnnotationResponse {
    message: string;
}
export interface GetNodeDataRequest {
    nodeKey: string;
    machineId?: number;
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
}
export interface NodeDataPoint {
    timestamp: string;
    time: string;
    value: number | null;
}
export type GetNodeDataResponse = NodeDataPoint[];
export interface GetAggregateDataRequest {
    nodeKey: string;
    machineId?: number;
    resolution: AggregateResolution;
    start: string;
    end: string;
}
export type GetAggregateDataResponse = AggregateDataPoint[];
export interface VerifySignatureRequest {
    password: string;
}
export interface VerifySignatureResponse {
    verified: boolean;
}
export interface ComplianceExportRequest {
    format: 'csv' | 'pdf';
    dateFrom?: string;
    dateTo?: string;
    entityType?: string;
}
export interface GetComplianceLogsRequest {
    action?: string;
    entityType?: string;
    search?: string;
    userId?: number;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}
export type GetComplianceLogsResponse = ComplianceAuditEntry[];
export interface IntegrityCheckResponse {
    valid: boolean;
    checkedRecords: number;
    firstBrokenId: number | null;
}
export type GetDashboardVersionsResponse = DashboardVersion[];
export interface DashboardDiffRequest {
    versionA: number;
    versionB: number;
}
export type GetDashboardDiffResponse = VersionDiff;
export interface RestoreDashboardVersionResponse {
    dashboard: Dashboard;
    message: string;
}
export interface CreateSpcProfileRequest {
    name: string;
    machineId?: number;
    nodeKey: string;
    method: 'zscore' | 'moving_avg' | 'std_bands' | 'cusum';
    windowSize?: number;
    sensitivity?: number;
}
export interface UpdateSpcProfileRequest {
    name?: string;
    method?: 'zscore' | 'moving_avg' | 'std_bands' | 'cusum';
    windowSize?: number;
    sensitivity?: number;
    isActive?: boolean;
}
export type GetSpcProfilesResponse = SpcProfile[];
export type CreateSpcProfileResponse = SpcProfile;
export type UpdateSpcProfileResponse = SpcProfile;
export interface DeleteSpcProfileResponse {
    message: string;
}
export type GetSpcChartDataResponse = SpcChartData;
export interface GetSpcAlertsRequest {
    profileId?: number;
    machineId?: number;
    acknowledged?: boolean;
    limit?: number;
}
export type GetSpcAlertsResponse = SpcAlert[];
export interface AcknowledgeSpcAlertResponse {
    alert: SpcAlert;
}
export interface CreateRecipeRequest {
    name: string;
    description?: string;
    machineId?: number;
    parameters: RecipeParameter[];
    setpoints?: Record<string, {
        value: number;
        min: number;
        max: number;
    }>;
}
export interface UpdateRecipeRequest {
    name?: string;
    description?: string;
    status?: 'draft' | 'active' | 'archived';
    parameters?: RecipeParameter[];
    setpoints?: Record<string, {
        value: number;
        min: number;
        max: number;
    }>;
}
export type GetRecipesResponse = Recipe[];
export type CreateRecipeResponse = Recipe;
export type UpdateRecipeResponse = Recipe;
export interface DeleteRecipeResponse {
    message: string;
}
export type NewRecipeVersionResponse = Recipe;
export interface CreateBatchRequest {
    batchNumber: string;
    recipeId: number;
    machineId: number;
    notes?: string;
    metadata?: Record<string, unknown>;
}
export interface UpdateBatchRequest {
    notes?: string;
    metadata?: Record<string, unknown>;
}
export type GetBatchesResponse = Batch[];
export type CreateBatchResponse = Batch;
export type UpdateBatchResponse = Batch;
export interface StartBatchResponse {
    batch: Batch;
}
export interface CompleteBatchResponse {
    batch: Batch;
}
export interface AbortBatchResponse {
    batch: Batch;
}
export interface GetBatchDataResponse {
    series: BatchDataSeries[];
}
export interface CompareBatchesRequest {
    batchIds: number[];
}
export interface CompareBatchesResponse {
    batches: Array<{
        batch: Batch;
        series: BatchDataSeries[];
    }>;
}
export interface CreateTwinTemplateRequest {
    name: string;
    description?: string;
    svgContent: string;
    elementMappings?: TwinElementMapping[];
    category?: string;
}
export interface UpdateTwinTemplateRequest {
    name?: string;
    description?: string;
    svgContent?: string;
    elementMappings?: TwinElementMapping[];
    category?: string;
}
export type GetTwinTemplatesResponse = Omit<DigitalTwinTemplate, 'svgContent'>[];
export type CreateTwinTemplateResponse = DigitalTwinTemplate;
export type UpdateTwinTemplateResponse = DigitalTwinTemplate;
export interface DeleteTwinTemplateResponse {
    message: string;
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
export type GetTwinInstancesResponse = DigitalTwinInstance[];
export type CreateTwinInstanceResponse = DigitalTwinInstance;
export type UpdateTwinInstanceResponse = DigitalTwinInstance;
export interface DeleteTwinInstanceResponse {
    message: string;
}
export type GetTwinLiveDataResponse = TwinLiveData;
export type GetEdgeStatusResponse = EdgeSyncStatus;
export type GetEdgeConfigResponse = EdgeConfig;
export interface UpdateEdgeConfigRequest {
    cloudUrl?: string;
    syncIntervalMs?: number;
    syncBatchSize?: number;
    dataRetentionDays?: number;
    lightweightMode?: boolean;
}
export type UpdateEdgeConfigResponse = EdgeConfig;
export interface TriggerEdgeSyncResponse {
    message: string;
    queued: number;
}
export interface EdgeIngestResponse {
    received: number;
    message: string;
}
export type GetPlantsResponse = Plant[];
export type GetPlantResponse = Plant;
export interface CreatePlantRequest {
    name: string;
    location?: string;
    timezone?: string;
    config?: Record<string, unknown>;
}
export type UpdatePlantRequest = Partial<CreatePlantRequest> & {
    isActive?: boolean;
};
export type CreatePlantResponse = Plant;
export type UpdatePlantResponse = Plant;
export interface DeletePlantResponse {
    message: string;
}
export interface AddPlantMemberRequest {
    userId: number;
    role?: string;
}
export interface UpdatePlantMemberRequest {
    role: string;
}
export type GetPlantMembersResponse = PlantMembership[];
export type GetOeeConfigResponse = OeeConfig;
export interface SaveOeeConfigRequest {
    runningModeValues: number[];
    idleModeValues?: number[];
    plannedStopModeValues?: number[];
    unplannedStopModeValues?: number[];
    idealCycleTimeMs?: number;
    productionCountNodeKey?: string;
    goodCountNodeKey?: string;
    rejectCountNodeKey?: string;
    manualEntryEnabled?: boolean;
    plannedProductionHoursPerDay?: number;
}
export type SaveOeeConfigResponse = OeeConfig;
export type GetOeeResponse = OeeResult;
export type GetOeeHistoryResponse = OeeResult[];
export interface SaveManualEntryRequest {
    date: string;
    productionCount?: number;
    goodCount?: number;
    rejectCount?: number;
    plannedDowntimeMinutes?: number;
    notes?: string;
}
export type GetManualEntriesResponse = OeeManualEntry[];
export interface CreateAlertEngineRuleRequest {
    name: string;
    description?: string;
    machineId?: number;
    nodeKey: string;
    condition: string;
    threshold?: number;
    thresholdHigh?: number;
    rateWindowSeconds?: number;
    severity?: string;
    channels?: number[];
    cooldownSeconds?: number;
}
export type UpdateAlertEngineRuleRequest = Partial<CreateAlertEngineRuleRequest> & {
    isActive?: boolean;
};
export type GetAlertEngineRulesResponse = AlertRule[];
export type CreateAlertEngineRuleResponse = AlertRule;
export type UpdateAlertEngineRuleResponse = AlertRule;
export interface DeleteAlertEngineRuleResponse {
    message: string;
}
export interface GetAlertHistoryRequest {
    ruleId?: number;
    severity?: string;
    status?: string;
    machineId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
}
export type GetAlertHistoryResponse = AlertHistoryEntry[];
export interface CreateNotificationChannelRequest {
    name: string;
    type: string;
    config: Record<string, unknown>;
}
export type UpdateNotificationChannelRequest = Partial<CreateNotificationChannelRequest> & {
    isActive?: boolean;
};
export type GetNotificationChannelsResponse = NotificationChannel[];
export type CreateNotificationChannelResponse = NotificationChannel;
export type UpdateNotificationChannelResponse = NotificationChannel;
export interface DeleteNotificationChannelResponse {
    message: string;
}
export interface GetTrendingDataRequest {
    nodeKeys: string;
    machineId?: number;
    startDate: string;
    endDate: string;
    downsampleBucketSeconds?: number;
    aggregation?: 'avg' | 'min' | 'max' | 'last';
}
export interface GetTrendingDataResponse {
    series: TrendingSeries[];
}
export type GetReportTemplatesResponse = ReportTemplate[];
export type CreateReportTemplateResponse = ReportTemplate;
export type UpdateReportTemplateResponse = ReportTemplate;
export interface DeleteReportTemplateResponse {
    message: string;
}
export interface CreateReportTemplateRequest {
    name: string;
    type: string;
    description?: string;
    templateConfig: Record<string, unknown>;
}
export type UpdateReportTemplateRequest = Partial<CreateReportTemplateRequest> & {
    isActive?: boolean;
};
export type GetReportSchedulesResponse = ReportSchedule[];
export type CreateReportScheduleResponse = ReportSchedule;
export type UpdateReportScheduleResponse = ReportSchedule;
export interface DeleteReportScheduleResponse {
    message: string;
}
export interface CreateReportScheduleRequest {
    templateId: number;
    name: string;
    cronExpression: string;
    timezone?: string;
    machineIds?: number[];
    recipients?: string[];
    deliveryChannels?: string[];
}
export type UpdateReportScheduleRequest = Partial<CreateReportScheduleRequest> & {
    isActive?: boolean;
};
export type GetReportHistoryResponse = ReportHistoryEntry[];
//# sourceMappingURL=api-types.d.ts.map