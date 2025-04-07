// ===== ..\client\src\utils\protectedFetch.js =====
import {API_ENDPOINTS} from '../config/config.js';
import {addCsrfHeader, clearCsrfToken, getCsrfToken, isCsrfError} from './csrf.js';
import {forceRefreshToken} from './csrfInit.js'; // Assuming csrfInit is still relevant, otherwise remove

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
                // Use getCsrfToken which includes fetchCsrfToken internally
                console.log('[refreshTokenSingleton] Forcing token refresh...');
                const newToken = await getCsrfToken(API_ENDPOINTS.csrfToken, true); // Force refresh
                console.log('[refreshTokenSingleton] Token refreshed successfully.');
                return newToken;
            } catch (refreshError) {
                console.error('[refreshTokenSingleton] Failed to refresh token:', refreshError);
                throw refreshError; // Re-throw the error
            }
            finally {
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
            // Attempt to get token, force refresh only if retrying after CSRF error
            currentToken = await getCsrfToken(API_ENDPOINTS.csrfToken, false); // Don't force refresh initially
            // console.log(`[protectedFetch] Using CSRF Token for ${options.method} ${url}:`, currentToken ? 'present' : 'missing'); // Avoid logging token value
            const headers = options.headers || {};
            options.headers = addCsrfHeader(headers, currentToken);
            // console.log(`[protectedFetch] Headers for ${options.method} ${url}:`, options.headers);
        } catch (error) {
            console.error(`[protectedFetch] Failed to get/add CSRF token for ${options.method} ${url}:`, error);
            // Decide if you want to proceed without a token or throw an error
            // For now, let it proceed, the server will reject if needed
        }
    } else {
        // console.log(`[protectedFetch] Skipping CSRF token for ${options.method} ${url}`);
    }

    // console.log(`[protectedFetch] Making fetch call to ${url} with options:`, JSON.stringify(options));

    try {
        const response = await fetch(url, options);
        // console.log(`[protectedFetch] Response Status for ${url}: ${response.status}`);

        // Check if CSRF error occurred
        const csrfErrorDetected = await isCsrfError(response);

        if (!response.ok && csrfErrorDetected) {
            console.warn(`[protectedFetch] CSRF error detected for ${url} (Status: ${response.status}). Token used: ${currentToken ? 'present' : 'missing'}`);
            if (!retry) {
                console.warn('[protectedFetch] Attempting token refresh and retry...');
                try {
                    const newToken = await refreshTokenSingleton(); // This now forces refresh
                    console.log('[protectedFetch] Refreshed token obtained:', newToken ? 'present' : 'missing');
                    options.headers = addCsrfHeader(options.headers || {}, newToken); // Use refreshed token
                    // console.log('[protectedFetch] Retrying fetch with new token header:', options.headers['x-csrf-token']);
                    return protectedFetch(url, options, true); // Retry the request
                } catch (refreshError) {
                    console.error('[protectedFetch] Failed to refresh CSRF token during retry:', refreshError);
                    // Dispatch the CSRF error event even if refresh fails, so UI can react
                    window.dispatchEvent(new CustomEvent('csrf:error'));
                    // Return the original error response if refresh fails
                    return response;
                }
            } else {
                console.error(`[protectedFetch] CSRF error on retry for ${url}. Giving up.`);
                window.dispatchEvent(new CustomEvent('csrf:error')); // Dispatch error on final failure
            }
        }
        return response; // Return original response if not CSRF error or if retry failed
    } catch (error) {
        // Log network errors (like "Failed to fetch")
        console.error(`[protectedFetch] Network or fetch error for ${url}:`, error);
        // Optionally, re-throw or handle specific network errors differently
        // For example, you might want to show a specific "Server unavailable" message
        throw error; // Re-throw the original error
    }
};

export default protectedFetch;