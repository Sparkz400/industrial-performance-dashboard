/**
 * Utility functions for handling CSRF token retrieval, storage, and management
 */

// Constants
const CSRF_HEADER_NAME = 'x-csrf-token'; // Use lowercase standard
const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_TIMESTAMP_KEY = 'csrf_token_timestamp';
const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get the stored CSRF token from localStorage with validation
 * NOTE: This function is intended for the CLIENT-SIDE.
 *       Server-side doesn't typically use localStorage this way.
 * @returns {string|null} The stored CSRF token or null if none exists or expired
 */
const getStoredCsrfToken = () => {
    // This check prevents errors if run server-side during testing/build
    if (typeof localStorage === 'undefined') {
        return null;
    }
    const token = localStorage.getItem(CSRF_TOKEN_KEY);
    const timestamp = localStorage.getItem(CSRF_TOKEN_TIMESTAMP_KEY);

    // If no token or timestamp, return null
    if (!token || !timestamp) {
        return null;
    }

    // Check if the token is expired
    const now = Date.now();
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime) || now - tokenTime > TOKEN_MAX_AGE) {
        // Token is expired, clear it
        clearCsrfToken();
        return null;
    }

    return token;
};

/**
 * Store a CSRF token in localStorage with timestamp
 * NOTE: This function is intended for the CLIENT-SIDE.
 * @param {string} token - The CSRF token to store
 */
const storeCsrfToken = (token) => {
    // This check prevents errors if run server-side
    if (typeof localStorage === 'undefined') {
        return;
    }
    if (token) {
        localStorage.setItem(CSRF_TOKEN_KEY, token);
        localStorage.setItem(CSRF_TOKEN_TIMESTAMP_KEY, Date.now().toString());
    }
};

/**
 * Clear the stored CSRF token and its timestamp
 * NOTE: This function is intended for the CLIENT-SIDE.
 */
const clearCsrfToken = () => {
    // This check prevents errors if run server-side
    if (typeof localStorage === 'undefined') {
        return;
    }
    localStorage.removeItem(CSRF_TOKEN_KEY);
    localStorage.removeItem(CSRF_TOKEN_TIMESTAMP_KEY);
};

/**
 * Fetch a new CSRF token from the server
 * NOTE: This function is intended for the CLIENT-SIDE.
 * @param {string} csrfEndpoint - The endpoint to fetch the CSRF token from
 * @returns {Promise<string>} The new CSRF token
 */
const fetchCsrfToken = async (csrfEndpoint) => {
    // This check prevents errors if run server-side
    if (typeof fetch === 'undefined') {
        throw new Error('fetch is not available in this environment (likely server-side)');
    }
    try {
        const response = await fetch(csrfEndpoint, {
            method: 'GET',
            credentials: 'include', // Important: include cookies
            cache: 'no-store', // Prevent caching
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch CSRF token: ${response.status}`);
        }

        let data;
        try {
            // Try to parse as JSON
            data = await response.json();
        } catch (error) {
            // If JSON parsing fails, try to get token from header
            const headerToken = response.headers.get(CSRF_HEADER_NAME);
            if (headerToken) {
                storeCsrfToken(headerToken);
                return headerToken;
            }
            throw new Error('Failed to parse CSRF token response and no token header found');
        }

        // Look for token in the response body
        const token = data.csrf_token || data.csrfToken || data.token;

        if (!token) {
            throw new Error('No CSRF token in response');
        }

        // Store the token
        storeCsrfToken(token);
        return token;
    } catch (error) {
        console.error('Error fetching CSRF token:', error);
        throw error;
    }
};

/**
 * Get a CSRF token, fetching a new one if necessary
 * NOTE: This function is intended for the CLIENT-SIDE.
 * @param {string} csrfEndpoint - The endpoint to fetch the CSRF token from
 * @param {boolean} forceRefresh - Force fetching a new token
 * @returns {Promise<string>} A valid CSRF token
 */
const getCsrfToken = async (csrfEndpoint, forceRefresh = false) => {
    if (!forceRefresh) {
        const storedToken = getStoredCsrfToken();
        if (storedToken) {
            return storedToken;
        }
    }

    return fetchCsrfToken(csrfEndpoint);
};

/**
 * Add a CSRF token to request headers
 * @param {Object} headers - The headers object to add the token to
 * @param {string} token - The CSRF token
 * @returns {Object} The updated headers object
 */
const addCsrfHeader = (headers = {}, token) => {
    if (!token) {
        console.warn('Attempting to add empty CSRF token to headers');
    }

    return {
        ...headers,
        [CSRF_HEADER_NAME]: token,
    };
};

/**
 * Check if a response indicates a CSRF token error
 * NOTE: This function is intended for the CLIENT-SIDE.
 * @param {Response} response - The fetch Response object
 * @returns {Promise<boolean>} Whether the response indicates a CSRF error
 */
const isCsrfError = async (response) => {
    // This check prevents errors if run server-side
    if (typeof Response === 'undefined' || !(response instanceof Response)) {
        return false;
    }
    // Status codes that might indicate CSRF issues
    if (response.status === 403 || response.status === 419) {
        try {
            // Clone response to read body without consuming original
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            return data.error === 'invalid_csrf_token' ||
                data.message?.includes('CSRF') ||
                data.error?.includes('csrf') ||
                data.code === 'INVALID_CSRF_TOKEN'; // Check for specific code from app.js
        } catch (e) {
            // Not a JSON response, check response text
            try {
                const clonedResponse = response.clone();
                const text = await clonedResponse.text();
                return text.includes('CSRF') || text.includes('csrf') || text.includes('Invalid CSRF token');
            } catch (err) {
                // Can't check response content
                return false;
            }
        }
    }
    return false;
};

// Use CommonJS exports
module.exports = {
    getStoredCsrfToken,
    storeCsrfToken,
    clearCsrfToken,
    fetchCsrfToken,
    getCsrfToken,
    addCsrfHeader,
    isCsrfError,
    CSRF_HEADER_NAME,
};