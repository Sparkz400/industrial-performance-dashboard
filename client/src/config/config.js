// The base URL for the API; this can be overridden by an environment variable.
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";
export const WEBSOCKET_ADDR = "http://localhost:3000";

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
        connections: `${API_BASE_URL}/system/connections`
    },
};

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
