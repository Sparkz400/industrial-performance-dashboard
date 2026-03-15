// The base URL for the API; this can be overridden by an environment variable.
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
export const WEBSOCKET_ADDR: string =
  import.meta.env.VITE_WEBSOCKET_ADDR || 'http://localhost:3000';

// Centralized API endpoints.
export const API_ENDPOINTS = {
  status: `${API_BASE_URL}/status`,
  dashboards: `${API_BASE_URL}/dashboards`,
  opcua: {
    connect: `${API_BASE_URL}/opcua/connect`,
    disconnect: `${API_BASE_URL}/opcua/disconnect`,
    status: `${API_BASE_URL}/opcua/status`,
  },
  operationModeData: `${API_BASE_URL}/operation-mode-data`,
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
} as const;

// Other constants
export const POLLING_INTERVAL_MS = 20000;
export const DB_HEALTH_CHECK_INTERVAL = 60000;

export default {
  WEBSOCKET_ADDR,
  API_BASE_URL,
  API_ENDPOINTS,
  POLLING_INTERVAL_MS,
  DB_HEALTH_CHECK_INTERVAL,
};
