// The base URL for the API; this can be overridden by an environment variable.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? `${window.location.origin}/api/v1` : 'http://localhost:3001/api/v1');
export const WEBSOCKET_ADDR: string =
  import.meta.env.VITE_WEBSOCKET_ADDR ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');

// Centralized API endpoints.
export const API_ENDPOINTS = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
    logout: `${API_BASE_URL}/auth/logout`,
    me: `${API_BASE_URL}/auth/me`,
    register: `${API_BASE_URL}/auth/register`,
    changePassword: `${API_BASE_URL}/auth/change-password`,
    users: `${API_BASE_URL}/auth/users`,
    userById: (id: number) => `${API_BASE_URL}/auth/users/${id}`,
  },
  status: `${API_BASE_URL}/status`,
  dashboards: `${API_BASE_URL}/dashboards`,
  opcua: {
    connect: `${API_BASE_URL}/opcua/connect`,
    disconnect: `${API_BASE_URL}/opcua/disconnect`,
    status: `${API_BASE_URL}/opcua/status`,
  },
  operationModeData: `${API_BASE_URL}/operation-mode-data`,
  auditLogs: `${API_BASE_URL}/audit-logs`,
  dbTest: `${API_BASE_URL}/db/test`,
  system: {
    stats: `${API_BASE_URL}/system/stats`,
    connections: `${API_BASE_URL}/system/connections`,
  },
  csrfToken: `${API_BASE_URL}/csrf-token`,
  machines: {
    base: `${API_BASE_URL}/machines`,
    byId: (id: number) => `${API_BASE_URL}/machines/${id}`,
    connect: (id: number) => `${API_BASE_URL}/machines/${id}/connect`,
    disconnect: (id: number) => `${API_BASE_URL}/machines/${id}/disconnect`,
    browseNodes: (id: number) => `${API_BASE_URL}/machines/${id}/browse-nodes`,
    mappings: (id: number) => `${API_BASE_URL}/machines/${id}/mappings`,
    deleteMapping: (machineId: number, mappingId: number) =>
      `${API_BASE_URL}/machines/${machineId}/mappings/${mappingId}`,
  },
  certificates: {
    base: `${API_BASE_URL}/certificates`, // Base path
    trusted: `${API_BASE_URL}/certificates/trusted`,
    rejected: `${API_BASE_URL}/certificates/rejected`,
    client: `${API_BASE_URL}/certificates/client`,
    securityOptions: `${API_BASE_URL}/certificates/security-options`,
    regenerate: `${API_BASE_URL}/certificates/regenerate`,
    trust: `${API_BASE_URL}/certificates/trust`,
    acceptRejected: (filename: string) =>
      `${API_BASE_URL}/certificates/accept-rejected/${filename}`, // Function for dynamic paths
  },
  // Tier 3 features
  nlQuery: `${API_BASE_URL}/nl-query`,
  webhooks: {
    base: `${API_BASE_URL}/webhooks`,
    byId: (id: number) => `${API_BASE_URL}/webhooks/${id}`,
    test: (id: number) => `${API_BASE_URL}/webhooks/${id}/test`,
  },
  share: {
    create: (dashboardId: string) => `${API_BASE_URL}/share/dashboards/${dashboardId}`,
    list: (dashboardId: string) => `${API_BASE_URL}/share/dashboards/${dashboardId}`,
    revoke: (id: number) => `${API_BASE_URL}/share/${id}`,
    public: (token: string) => `${API_BASE_URL}/share/public/${token}`,
    embed: (token: string) => `${API_BASE_URL}/share/embed/${token}`,
  },
  customWidgets: {
    base: `${API_BASE_URL}/custom-widgets`,
    byId: (id: number) => `${API_BASE_URL}/custom-widgets/${id}`,
  },
  plants: {
    base: `${API_BASE_URL}/plants`,
    byId: (id: number) => `${API_BASE_URL}/plants/${id}`,
    members: (id: number) => `${API_BASE_URL}/plants/${id}/members`,
    memberById: (plantId: number, memberId: number) =>
      `${API_BASE_URL}/plants/${plantId}/members/${memberId}`,
  },
  oee: {
    config: (machineId: number) => `${API_BASE_URL}/oee/config/${machineId}`,
    current: (machineId: number) => `${API_BASE_URL}/oee/${machineId}`,
    history: (machineId: number) => `${API_BASE_URL}/oee/${machineId}/history`,
    manualEntry: (machineId: number) => `${API_BASE_URL}/oee/${machineId}/manual-entry`,
    manualEntries: (machineId: number) => `${API_BASE_URL}/oee/${machineId}/manual-entries`,
  },
  alerts: {
    rules: `${API_BASE_URL}/alerts/rules`,
    ruleById: (id: number) => `${API_BASE_URL}/alerts/rules/${id}`,
    history: `${API_BASE_URL}/alerts/history`,
    historyById: (id: number) => `${API_BASE_URL}/alerts/history/${id}`,
    acknowledge: (id: number) => `${API_BASE_URL}/alerts/history/${id}/acknowledge`,
    resolve: (id: number) => `${API_BASE_URL}/alerts/history/${id}/resolve`,
    channels: `${API_BASE_URL}/alerts/channels`,
    channelById: (id: number) => `${API_BASE_URL}/alerts/channels/${id}`,
  },
  alarms: {
    base: `${API_BASE_URL}/alarms`,
    acknowledge: (id: number) => `${API_BASE_URL}/alarms/${id}/acknowledge`,
    clear: (id: number) => `${API_BASE_URL}/alarms/${id}/clear`,
    rules: `${API_BASE_URL}/alarms/rules`,
    ruleById: (id: number) => `${API_BASE_URL}/alarms/rules/${id}`,
  },
  annotations: `${API_BASE_URL}/annotations`,
  nodeData: `${API_BASE_URL}/node-data`,
  aggregates: `${API_BASE_URL}/aggregates`,
  trending: {
    data: `${API_BASE_URL}/trending/data`,
    exportCsv: `${API_BASE_URL}/trending/export-csv`,
    availableTags: (machineId: number) => `${API_BASE_URL}/trending/available-tags/${machineId}`,
  },
  reports: {
    templates: `${API_BASE_URL}/reports/templates`,
    templateById: (id: number) => `${API_BASE_URL}/reports/templates/${id}`,
    schedules: `${API_BASE_URL}/reports/schedules`,
    scheduleById: (id: number) => `${API_BASE_URL}/reports/schedules/${id}`,
    runNow: (id: number) => `${API_BASE_URL}/reports/schedules/${id}/run-now`,
    history: `${API_BASE_URL}/reports/history`,
    download: (id: number) => `${API_BASE_URL}/reports/history/${id}/download`,
  },
  // Tier 2: Premium Features
  compliance: {
    logs: `${API_BASE_URL}/compliance`,
    verifySignature: `${API_BASE_URL}/compliance/verify-signature`,
    integrityCheck: `${API_BASE_URL}/compliance/integrity-check`,
    export: `${API_BASE_URL}/compliance/export`,
    stats: `${API_BASE_URL}/compliance/stats`,
    config: `${API_BASE_URL}/compliance/config`,
    generateReport: `${API_BASE_URL}/compliance/reports/generate`,
    dashboardVersions: (dashboardId: string) =>
      `${API_BASE_URL}/compliance/dashboards/${dashboardId}/versions`,
    dashboardVersion: (dashboardId: string, version: number) =>
      `${API_BASE_URL}/compliance/dashboards/${dashboardId}/versions/${version}`,
    dashboardDiff: (dashboardId: string) =>
      `${API_BASE_URL}/compliance/dashboards/${dashboardId}/diff`,
    restoreVersion: (dashboardId: string, version: number) =>
      `${API_BASE_URL}/compliance/dashboards/${dashboardId}/restore/${version}`,
  },
  spc: {
    profiles: `${API_BASE_URL}/spc/profiles`,
    profileById: (id: number) => `${API_BASE_URL}/spc/profiles/${id}`,
    computeBaseline: (id: number) => `${API_BASE_URL}/spc/profiles/${id}/compute`,
    chartData: (id: number) => `${API_BASE_URL}/spc/profiles/${id}/chart-data`,
    alerts: `${API_BASE_URL}/spc/alerts`,
    acknowledgeAlert: (id: number) => `${API_BASE_URL}/spc/alerts/${id}/acknowledge`,
  },
  recipes: {
    base: `${API_BASE_URL}/recipes`,
    byId: (id: number) => `${API_BASE_URL}/recipes/${id}`,
    newVersion: (id: number) => `${API_BASE_URL}/recipes/${id}/new-version`,
  },
  batches: {
    base: `${API_BASE_URL}/batches`,
    byId: (id: number) => `${API_BASE_URL}/batches/${id}`,
    start: (id: number) => `${API_BASE_URL}/batches/${id}/start`,
    complete: (id: number) => `${API_BASE_URL}/batches/${id}/complete`,
    abort: (id: number) => `${API_BASE_URL}/batches/${id}/abort`,
    data: (id: number) => `${API_BASE_URL}/batches/${id}/data`,
    compare: `${API_BASE_URL}/batches/compare`,
    active: `${API_BASE_URL}/batches/active`,
  },
  digitalTwins: {
    templates: `${API_BASE_URL}/digital-twins/templates`,
    templateById: (id: number) => `${API_BASE_URL}/digital-twins/templates/${id}`,
    instances: `${API_BASE_URL}/digital-twins/instances`,
    instanceById: (id: number) => `${API_BASE_URL}/digital-twins/instances/${id}`,
    elementHistory: (id: number) => `${API_BASE_URL}/digital-twins/instances/${id}/element-history`,
  },
  edge: {
    status: `${API_BASE_URL}/edge/status`,
    config: `${API_BASE_URL}/edge/config`,
    triggerSync: `${API_BASE_URL}/edge/sync/trigger`,
    ingest: `${API_BASE_URL}/edge/ingest`,
  },
} as const;

export default {
  WEBSOCKET_ADDR,
  API_BASE_URL,
  API_ENDPOINTS,
};
