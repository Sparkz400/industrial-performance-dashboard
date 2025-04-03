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

    const isStateChangingMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method);
    options.credentials = 'include';

    let currentToken = null;

    // Only add CSRF tokens for state-changing requests
    if (isStateChangingMethod) {
        try {
            currentToken = await getCsrfToken(API_ENDPOINTS.csrfToken); // Store the token used
            console.log(`[protectedFetch] Using CSRF Token for ${options.method} ${url}:`, currentToken);
            const headers = options.headers || {};
            options.headers = addCsrfHeader(headers, currentToken);
            console.log(`[protectedFetch] Headers for ${options.method} ${url}:`, options.headers);
        } catch (error) {
            console.error(`[protectedFetch] Failed to get/add CSRF token for ${options.method} ${url}:`, error);
            // Decide if you want to proceed without a token or throw an error
            // For now, let it proceed, the server will reject if needed
        }
    } else {
        console.log(`[protectedFetch] Skipping CSRF token for ${options.method} ${url}`);
    }

    console.log(`[protectedFetch] Making fetch call to ${url} with options:`, JSON.stringify(options));

    try {
        const response = await fetch(url, options);
        console.log(`[protectedFetch] Response Status for ${url}: ${response.status}`);

        // Check if CSRF error occurred
        if (!response.ok && await isCsrfError(response)) {
            console.warn(`[protectedFetch] CSRF error detected for ${url} (Status: ${response.status}). Token used: ${currentToken}`);
            if (!retry) {
                console.warn('[protectedFetch] Attempting token refresh and retry...');
                try {
                    const newToken = await refreshTokenSingleton();
                    console.log('[protectedFetch] Refreshed token:', newToken);
                    options.headers = addCsrfHeader(options.headers || {}, newToken); // Use refreshed token
                    console.log('[protectedFetch] Retrying fetch with new token header:', options.headers['X-CSRF-Token']);
                    return protectedFetch(url, options, true); // Retry the request
                } catch (refreshError) {
                    console.error('[protectedFetch] Failed to refresh CSRF token during retry:', refreshError);
                    // Return the original error response if refresh fails
                    return response;
                }
            } else {
                console.error(`[protectedFetch] CSRF error on retry for ${url}. Giving up.`);
            }
        }
        return response; // Return original response if not CSRF error or if retry failed
    } catch (error) {
        console.error(`[protectedFetch] Network or fetch error for ${url}:`, error);
        throw error;
    }
};

export default protectedFetch;