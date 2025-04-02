import { fetchCsrfToken, storeCsrfToken, getStoredCsrfToken } from './csrf.js';
import { API_ENDPOINTS } from '../config/config.js';

/**
 * Initialize CSRF protection by fetching an initial token
 * This should be called when the application starts
 */
export const initializeCsrf = async () => {
    try {
        console.log('Initializing CSRF protection...');

        // Check if we already have a token
        const existingToken = getStoredCsrfToken();

        if (existingToken) {
            console.log('Using existing CSRF token');
            // We could validate the existing token here if needed
            return existingToken;
        }

        // No existing token, fetch a new one
        const token = await fetchCsrfToken(API_ENDPOINTS.csrfToken);
        console.log('CSRF token initialized successfully');

        // Set up automatic token refresh every 30 minutes
        setupTokenRefresh();

        return token;
    } catch (error) {
        console.error('Failed to initialize CSRF token:', error);
        // We don't want to block app initialization, so just log the error
        return null;
    }
};

/**
 * Set up a timer to refresh the CSRF token periodically
 * This helps prevent token expiration issues
 */
export const setupTokenRefresh = () => {
    // Refresh token every 30 minutes
    const REFRESH_INTERVAL = 30 * 60 * 1000;

    setInterval(async () => {
        try {
            console.log('Refreshing CSRF token...');
            await fetchCsrfToken(API_ENDPOINTS.csrfToken);
            console.log('CSRF token refreshed successfully');
        } catch (error) {
            console.error('Failed to refresh CSRF token:', error);
        }
    }, REFRESH_INTERVAL);
};

/**
 * Force refresh the CSRF token
 * Useful after session timeouts or when token validation fails
 */
export const forceRefreshToken = async () => {
    try {
        console.log('Force refreshing CSRF token...');
        const token = await fetchCsrfToken(API_ENDPOINTS.csrfToken);
        console.log('CSRF token refreshed successfully');
        return token;
    } catch (error) {
        console.error('Failed to refresh CSRF token:', error);
        throw error;
    }
};

export default initializeCsrf;