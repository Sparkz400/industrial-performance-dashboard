import {API_ENDPOINTS} from '../config/config.js';
import {addCsrfHeader, clearCsrfToken, getCsrfToken, isCsrfError} from './csrf.js';
import {forceRefreshToken} from './csrfInit.js';

// Keep track of in-flight token refresh to prevent multiple refreshes
let refreshingTokenPromise = null;

/**
 * Get a fresh CSRF token, ensuring we only do one refresh at a time
 * @returns {Promise<string>} A valid CSRF token
 */
const refreshTokenSingleton = async () => {
    if (!refreshingTokenPromise) {
        // Create a new promise for token refresh
        refreshingTokenPromise = (async () => {
            try {
                // Clear the existing token first
                clearCsrfToken();

                // Force a new token from the server
                return await forceRefreshToken();
            } finally {
                // Clear the promise when done or on error
                refreshingTokenPromise = null;
            }
        })();
    }

    // Return the existing refresh promise
    return refreshingTokenPromise;
};

/**
 * Fetch wrapper that automatically includes CSRF tokens for state-changing requests
 * and handles token refresh if needed
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - The fetch options
 * @param {boolean} retry - Whether this is a retry attempt (to prevent infinite loops)
 * @returns {Promise<Response>} - The fetch response
 */
export const protectedFetch = async (url, options = {}, retry = false) => {
    // Set default method
    options.method = options.method || 'GET';

    const isStateChangingMethod =
        options.method === 'POST' ||
        options.method === 'PUT' ||
        options.method === 'DELETE' ||
        options.method === 'PATCH';

    // Always include credentials to send cookies
    options.credentials = 'include';

    // Only add CSRF tokens for state-changing requests
    if (isStateChangingMethod) {
        try {
            // Get a token (either from storage or fetch a new one)
            const token = await getCsrfToken(API_ENDPOINTS.csrfToken);

            // Initialize headers if they don't exist
            const headers = options.headers || {};

            // Add the CSRF token header
            options.headers = addCsrfHeader(headers, token);
        } catch (error) {
            console.error('Error adding CSRF token:', error);
            // Continue with the request even if token fails
        }
    }

    // Make the request
    try {
        const response = await fetch(url, options);

        // Check if the response is ok
        if (!response.ok) {
            // If this might be a CSRF error and not already a retry attempt
            if (!retry && await isCsrfError(response)) {
                console.warn('CSRF token validation failed, refreshing token and retrying request');

                try {
                    // Get a fresh token
                    const newToken = await refreshTokenSingleton();

                    // Update token in headers
                    options.headers = addCsrfHeader(options.headers || {}, newToken);

                    // Retry the request once with the new token
                    return protectedFetch(url, options, true);
                } catch (refreshError) {
                    console.error('Failed to refresh CSRF token:', refreshError);
                    // Return the original error response
                    return response;
                }
            }
        }

        return response;
    } catch (error) {
        // Network or other fetch error
        console.error('Fetch error:', error);
        throw error;
    }
};

export default protectedFetch;