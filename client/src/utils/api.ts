import { protectedFetch } from './protectedFetch';
import { API_ENDPOINTS } from '../config/config';
import { isCsrfError } from './csrf';
import type { Dashboard, GetAuditLogsRequest } from '@/types';
import type {
  CreateSharedLinkRequest,
  CreateSharedLinkResponse,
  SharedLink,
} from '@performance-dashboard/shared';

/**
 *
 * @param params
 */
function buildQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Handle response parsing and error handling
 * @param response
 */
const handleResponse = async (response: Response): Promise<unknown> => {
  if (await isCsrfError(response)) {
    window.dispatchEvent(new CustomEvent('csrf:error'));
  }

  if (!response.ok) {
    let message = `HTTP Error: ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.message || errorData.error || message;
    } catch (_e) {
      // ignore JSON parse error, keep generic message
    }
    throw Object.assign(new Error(message), { status: response.status });
  }

  try {
    return await response.json();
  } catch (_e) {
    return await response.text();
  }
};

/**
 * API utility functions with CSRF protection
 */
export const api = {
  /**
   * Make a GET request
   * @param url
   * @param options
   */
  get: async (url: string, options: RequestInit = {}): Promise<unknown> => {
    const response = await protectedFetch(url, {
      method: 'GET',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    return handleResponse(response);
  },

  /**
   * Make a POST request
   * @param url
   * @param data
   * @param options
   */
  post: async (url: string, data?: unknown, options: RequestInit = {}): Promise<unknown> => {
    const response = await protectedFetch(url, {
      method: 'POST',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(data),
    });

    return handleResponse(response);
  },

  /**
   * Make a PUT request
   * @param url
   * @param data
   * @param options
   */
  put: async (url: string, data?: unknown, options: RequestInit = {}): Promise<unknown> => {
    const response = await protectedFetch(url, {
      method: 'PUT',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(data),
    });

    return handleResponse(response);
  },

  /**
   * Make a PATCH request
   * @param url
   * @param data
   * @param options
   */
  patch: async (url: string, data?: unknown, options: RequestInit = {}): Promise<unknown> => {
    const response = await protectedFetch(url, {
      method: 'PATCH',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: JSON.stringify(data),
    });

    return handleResponse(response);
  },

  /**
   * Make a DELETE request
   * @param url
   * @param options
   */
  delete: async (url: string, options: RequestInit = {}): Promise<unknown> => {
    const response = await protectedFetch(url, {
      method: 'DELETE',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    return handleResponse(response);
  },

  /**
   * Check if the CSRF token is valid
   */
  validateCsrfToken: async (): Promise<boolean> => {
    try {
      const response = await protectedFetch(API_ENDPOINTS.csrfToken + '/validate', {
        method: 'POST',
      });
      return response.ok;
    } catch (error) {
      console.error('Error validating CSRF token:', error);
      return false;
    }
  },

  // Convenience methods for API endpoints
  endpoints: {
    // Auth operations
    login: (username: string, password: string) =>
      api.post(API_ENDPOINTS.auth.login, { username, password }),
    logout: () => api.post(API_ENDPOINTS.auth.logout),
    getMe: () => api.get(API_ENDPOINTS.auth.me),
    register: (data: { username: string; email: string; password: string; role?: string }) =>
      api.post(API_ENDPOINTS.auth.register, data),
    changePassword: (currentPassword: string, newPassword: string) =>
      api.post(API_ENDPOINTS.auth.changePassword, { currentPassword, newPassword }),
    getUsers: () => api.get(API_ENDPOINTS.auth.users),
    updateUser: (id: number, data: Record<string, unknown>) =>
      api.put(API_ENDPOINTS.auth.userById(id), data),

    // CSRF operations
    getCsrfToken: () => api.get(API_ENDPOINTS.csrfToken),
    validateCsrfToken: () => api.validateCsrfToken(),

    // Get system status
    getStatus: () => api.get(API_ENDPOINTS.status),

    // Dashboard operations
    getDashboards: () => api.get(API_ENDPOINTS.dashboards),
    getDashboard: (id: string) => api.get(`${API_ENDPOINTS.dashboards}/${id}`),
    saveDashboard: (dashboard: Dashboard) =>
      api.post(`${API_ENDPOINTS.dashboards}/${dashboard.id}`, dashboard),
    deleteDashboard: (id: string) => api.delete(`${API_ENDPOINTS.dashboards}/${id}`),

    // OPCUA operations
    connectOpcua: (config: Record<string, unknown>) =>
      api.post(API_ENDPOINTS.opcua.connect, config),
    disconnectOpcua: () => api.post(API_ENDPOINTS.opcua.disconnect, {}),
    getOpcuaStatus: () => api.get(API_ENDPOINTS.opcua.status),

    // DB operations
    testDbConnection: () => api.get(API_ENDPOINTS.dbTest),

    // System operations
    getSystemStats: () => api.get(API_ENDPOINTS.system.stats),
    getSystemConnections: () => api.get(API_ENDPOINTS.system.connections),

    // Operation mode
    getOperationModeData: () => api.get(API_ENDPOINTS.operationModeData),

    // Audit logs
    getAuditLogs: (filters: GetAuditLogsRequest = {}) =>
      api.get(
        `${API_ENDPOINTS.auditLogs}${buildQueryString({
          action: filters.action,
          entityType: filters.entityType,
          search: filters.search,
          userId: filters.userId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: filters.limit,
        })}`,
      ),

    // Machine operations
    getMachines: () => api.get(API_ENDPOINTS.machines.base),
    getMachine: (id: number) => api.get(API_ENDPOINTS.machines.byId(id)),
    createMachine: (data: Record<string, unknown>) => api.post(API_ENDPOINTS.machines.base, data),
    updateMachine: (id: number, data: Record<string, unknown>) =>
      api.put(API_ENDPOINTS.machines.byId(id), data),
    deleteMachine: (id: number) => api.delete(API_ENDPOINTS.machines.byId(id)),
    connectMachine: (id: number) => api.post(API_ENDPOINTS.machines.connect(id)),
    disconnectMachine: (id: number) => api.post(API_ENDPOINTS.machines.disconnect(id)),
    browseNodes: (id: number, parentNodeId?: string) =>
      api.post(API_ENDPOINTS.machines.browseNodes(id), { parentNodeId: parentNodeId || '' }),
    getMappings: (machineId: number) => api.get(API_ENDPOINTS.machines.mappings(machineId)),
    saveMappings: (machineId: number, mappings: unknown[]) =>
      api.post(API_ENDPOINTS.machines.mappings(machineId), { mappings }),
    deleteMapping: (machineId: number, mappingId: number) =>
      api.delete(API_ENDPOINTS.machines.deleteMapping(machineId, mappingId)),

    // Webhooks
    getWebhooks: () => api.get(API_ENDPOINTS.webhooks.base),
    createWebhook: (data: { name: string; url: string; events: string[] }) =>
      api.post(API_ENDPOINTS.webhooks.base, data),
    updateWebhook: (id: number, data: Record<string, unknown>) =>
      api.put(API_ENDPOINTS.webhooks.byId(id), data),
    deleteWebhook: (id: number) => api.delete(API_ENDPOINTS.webhooks.byId(id)),
    testWebhook: (id: number) => api.post(API_ENDPOINTS.webhooks.test(id)),

    // Dashboard Sharing
    createShare: (dashboardId: string, data: CreateSharedLinkRequest) =>
      api.post(API_ENDPOINTS.share.create(dashboardId), data) as Promise<CreateSharedLinkResponse>,
    getShares: (dashboardId: string) =>
      api.get(API_ENDPOINTS.share.list(dashboardId)) as Promise<SharedLink[]>,
    revokeShare: (id: number) => api.delete(API_ENDPOINTS.share.revoke(id)) as Promise<SharedLink>,

    // Custom Widgets
    getCustomWidgets: () => api.get(API_ENDPOINTS.customWidgets.base),
    registerCustomWidget: (manifestUrl: string) =>
      api.post(API_ENDPOINTS.customWidgets.base, { manifestUrl }),
    unregisterCustomWidget: (id: number) => api.delete(API_ENDPOINTS.customWidgets.byId(id)),
  },
};

export default api;
