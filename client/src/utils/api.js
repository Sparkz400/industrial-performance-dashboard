import { protectedFetch } from './protectedFetch.js';
import { API_ENDPOINTS } from '../config/config.js';
import { isCsrfError } from './csrf.js';

/**
 * Handle response parsing and error handling
 * @param {Response} response - The fetch Response object
 * @returns {Promise<any>} The parsed response data
 */
const handleResponse = async (response) => {
    // Check for CSRF errors and dispatch custom event
    if (await isCsrfError(response)) {
        // Dispatch a custom event that the CsrfErrorHandler can listen for
        window.dispatchEvent(new CustomEvent('csrf:error'));
    }

    if (!response.ok) {
        // Try to extract more detailed error information
        try {
            const errorData = await response.json();
            throw new Error(errorData.message || errorData.error || `HTTP Error: ${response.status}`);
        } catch (e) {
            // If we can't parse the response as JSON, just throw a generic error
            throw new Error(`HTTP Error: ${response.status}`);
        }
    }

    // Try to parse as JSON, but don't fail if it's not
    try {
        return await response.json();
    } catch (e) {
        return await response.text();
    }
};

/**
 * API utility functions with CSRF protection
 */
export const api = {
    /**
     * Make a GET request
     * @param {string} url - The URL to fetch
     * @param {Object} options - Additional fetch options
     * @returns {Promise<any>} The parsed response data
     */
    get: async (url, options = {}) => {
        const response = await protectedFetch(url, {
            method: 'GET',
            ...options,
            headers: {
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        });

        return handleResponse(response);
    },

    /**
     * Make a POST request
     * @param {string} url - The URL to fetch
     * @param {Object} data - The data to send
     * @param {Object} options - Additional fetch options
     * @returns {Promise<any>} The parsed response data
     */
    post: async (url, data, options = {}) => {
        const response = await protectedFetch(url, {
            method: 'POST',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers || {})
            },
            body: JSON.stringify(data)
        });

        return handleResponse(response);
    },

    /**
     * Make a PUT request
     * @param {string} url - The URL to fetch
     * @param {Object} data - The data to send
     * @param {Object} options - Additional fetch options
     * @returns {Promise<any>} The parsed response data
     */
    put: async (url, data, options = {}) => {
        const response = await protectedFetch(url, {
            method: 'PUT',
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(options.headers || {})
            },
            body: JSON.stringify(data)
        });

        return handleResponse(response);
    },

    /**
     * Make a DELETE request
     * @param {string} url - The URL to fetch
     * @param {Object} options - Additional fetch options
     * @returns {Promise<any>} The parsed response data
     */
    delete: async (url, options = {}) => {
        const response = await protectedFetch(url, {
            method: 'DELETE',
            ...options,
            headers: {
                'Accept': 'application/json',
                ...(options.headers || {})
            }
        });

        return handleResponse(response);
    },

    /**
     * Check if the CSRF token is valid
     * @returns {Promise<boolean>} Whether the token is valid
     */
    validateCsrfToken: async () => {
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
        // CSRF operations
        getCsrfToken: () => api.get(API_ENDPOINTS.csrfToken),
        validateCsrfToken: () => api.validateCsrfToken(),

        // Get system status
        getStatus: () => api.get(API_ENDPOINTS.status),

        // Dashboard operations
        getDashboards: () => api.get(API_ENDPOINTS.dashboards),
        getDashboard: (id) => api.get(`${API_ENDPOINTS.dashboards}/${id}`),
        saveDashboard: (dashboard) => api.post(`${API_ENDPOINTS.dashboards}/${dashboard.id}`, dashboard),
        deleteDashboard: (id) => api.delete(`${API_ENDPOINTS.dashboards}/${id}`),

        // OPCUA operations
        connectOpcua: (config) => api.post(API_ENDPOINTS.opcua.connect, config),
        disconnectOpcua: () => api.post(API_ENDPOINTS.opcua.disconnect, {}),
        getOpcuaStatus: () => api.get(API_ENDPOINTS.opcua.status),

        // DB operations
        testDbConnection: () => api.get(API_ENDPOINTS.dbTest),

        // System operations
        getSystemStats: () => api.get(API_ENDPOINTS.system.stats),
        getSystemConnections: () => api.get(API_ENDPOINTS.system.connections),

        // Operation mode
        getOperationModeData: () => api.get(API_ENDPOINTS.operationModeData),
    }
};

export default api;