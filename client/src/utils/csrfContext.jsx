import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredCsrfToken, fetchCsrfToken, clearCsrfToken } from './csrf.js';
import { API_ENDPOINTS } from '../config/config.js';

// Create the context
const CsrfContext = createContext({
    token: null,
    isInitialized: false,
    refreshToken: () => {},
    clearToken: () => {},
});

/**
 * Provider component for CSRF context
 */
export const CsrfProvider = ({ children }) => {
    const [token, setToken] = useState(getStoredCsrfToken());
    const [isInitialized, setIsInitialized] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Initialize CSRF token
    useEffect(() => {
        const initializeToken = async () => {
            if (isInitialized || isRefreshing) return;

            setIsRefreshing(true);
            try {
                // Check for existing token
                const existingToken = getStoredCsrfToken();
                if (existingToken) {
                    setToken(existingToken);
                    setIsInitialized(true);
                    setIsRefreshing(false);
                    return;
                }

                // Fetch a new token
                const newToken = await fetchCsrfToken(API_ENDPOINTS.csrfToken);
                setToken(newToken);
                setIsInitialized(true);
            } catch (error) {
                console.error('Failed to initialize CSRF token:', error);
            } finally {
                setIsRefreshing(false);
            }
        };

        void initializeToken();

        // Set up automatic token refresh
        const refreshInterval = setInterval(() => {
            void refreshToken();
        }, 30 * 60 * 1000); // 30 minutes

        // Clean up
        return () => {
            clearInterval(refreshInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Refresh token function
    const refreshToken = useCallback(async () => {
        if (isRefreshing) return;

        setIsRefreshing(true);
        try {
            const newToken = await fetchCsrfToken(API_ENDPOINTS.csrfToken);
            setToken(newToken);
            return newToken;
        } catch (error) {
            console.error('Failed to refresh CSRF token:', error);
            throw error;
        } finally {
            setIsRefreshing(false);
        }
    }, [isRefreshing]);

    // Clear token function
    const clearToken = useCallback(() => {
        clearCsrfToken();
        setToken(null);
    }, []);

    // Create the context value
    const contextValue = {
        token,
        isInitialized,
        refreshToken,
        clearToken,
    };

    return (
        <CsrfContext.Provider value={contextValue}>
            {children}
        </CsrfContext.Provider>
    );
};

/**
 * Hook to use the CSRF context
 */
export const useCsrf = () => {
    const context = useContext(CsrfContext);

    if (!context) {
        throw new Error('useCsrf must be used within a CsrfProvider');
    }

    return context;
};

export default CsrfProvider;