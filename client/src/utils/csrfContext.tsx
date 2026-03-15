import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredCsrfToken, fetchCsrfToken, clearCsrfToken } from './csrf';
import { API_ENDPOINTS } from '../config/config';

interface CsrfContextValue {
  token: string | null;
  isInitialized: boolean;
  refreshToken: () => Promise<string | undefined>;
  clearToken: () => void;
}

// Create the context
const CsrfContext = createContext<CsrfContextValue>({
  token: null,
  isInitialized: false,
  refreshToken: async () => undefined,
  clearToken: () => {},
});

interface CsrfProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component for CSRF context
 * @param root0
 * @param root0.children
 */
export const CsrfProvider = ({ children }: CsrfProviderProps) => {
  const [token, setToken] = useState<string | null>(getStoredCsrfToken());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh token function
  const refreshToken = useCallback(async (): Promise<string | undefined> => {
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

  // Initialize CSRF token
  useEffect(() => {
    const initializeToken = async () => {
      if (isInitialized || isRefreshing) return;

      setIsRefreshing(true);
      try {
        // Always fetch from server to ensure client and session are in sync
        const newToken = await fetchCsrfToken(API_ENDPOINTS.csrfToken);
        setToken(newToken);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize CSRF token:', error);
        // Fall back to stored token if server is unreachable
        const existingToken = getStoredCsrfToken();
        if (existingToken) {
          setToken(existingToken);
          setIsInitialized(true);
        }
      } finally {
        setIsRefreshing(false);
      }
    };

    void initializeToken();

    // Set up automatic token refresh
    const refreshInterval = setInterval(
      () => {
        void refreshToken();
      },
      30 * 60 * 1000,
    ); // 30 minutes

    // Clean up
    return () => {
      clearInterval(refreshInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear token function
  const clearToken = useCallback(() => {
    clearCsrfToken();
    setToken(null);
  }, []);

  // Create the context value
  const contextValue: CsrfContextValue = {
    token,
    isInitialized,
    refreshToken,
    clearToken,
  };

  return <CsrfContext.Provider value={contextValue}>{children}</CsrfContext.Provider>;
};

/**
 * Hook to use the CSRF context
 */
export const useCsrf = (): CsrfContextValue => {
  const context = useContext(CsrfContext);

  if (!context) {
    throw new Error('useCsrf must be used within a CsrfProvider');
  }

  return context;
};

export default CsrfProvider;
