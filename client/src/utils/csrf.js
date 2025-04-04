/**
 * Utility functions for handling CSRF token retrieval, storage, and management
 */

// Constants
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_TOKEN_TIMESTAMP_KEY = 'csrf_token_timestamp';
const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get the stored CSRF token from localStorage with validation
 * @returns {string|null} The stored CSRF token or null if none exists or expired
 */
export const getStoredCsrfToken = () => {
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
 * @param {string} token - The CSRF token to store
 */
export const storeCsrfToken = (token) => {
    if (token) {
        localStorage.setItem(CSRF_TOKEN_KEY, token);
        localStorage.setItem(CSRF_TOKEN_TIMESTAMP_KEY, Date.now().toString());
    }
};

/**
 * Clear the stored CSRF token and its timestamp
 */
export const clearCsrfToken = () => {
    localStorage.removeItem(CSRF_TOKEN_KEY);
    localStorage.removeItem(CSRF_TOKEN_TIMESTAMP_KEY);
};

/**
 * Fetch a new CSRF token from the server
 * @param {string} csrfEndpoint - The endpoint to fetch the CSRF token from
 * @returns {Promise<string>} The new CSRF token
 */
export const fetchCsrfToken = async (csrfEndpoint) => {
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
 * @param {string} csrfEndpoint - The endpoint to fetch the CSRF token from
 * @param {boolean} forceRefresh - Force fetching a new token
 * @returns {Promise<string>} A valid CSRF token
 */
export const getCsrfToken = async (csrfEndpoint, forceRefresh = false) => {
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
export const addCsrfHeader = (headers = {}, token) => {
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
 * @param {Response} response - The fetch Response object
 * @returns {Promise<boolean>} Whether the response indicates a CSRF error
 */
export const isCsrfError = async (response) => {
    // Status codes that might indicate CSRF issues
    if (response.status === 403 || response.status === 419) {
        try {
            const data = await response.clone().json();
            return data.error === 'invalid_csrf_token' ||
                data.message?.includes('CSRF') ||
                data.error?.includes('csrf');
        } catch (e) {
            // Not a JSON response, check response text
            try {
                const text = await response.clone().text();
                return text.includes('CSRF') || text.includes('csrf');
            } catch (err) {
                // Can't check response content
                return false;
            }
        }
    }
    return false;
};

export default {
    getStoredCsrfToken,
    storeCsrfToken,
    clearCsrfToken,
    fetchCsrfToken,
    getCsrfToken,
    addCsrfHeader,
    isCsrfError,
    CSRF_HEADER_NAME,
};