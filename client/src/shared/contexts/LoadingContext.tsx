import React, { createContext, useContext, useState, useCallback } from 'react';
import { LoadingOverlay } from '../components/loading';

interface LoadingContextValue {
  setGlobalLoading: (isLoading: boolean, loadingMessage?: string | null) => void;
  setLoadingMessage: (loadingMessage: string | null) => void;
  isLoading: boolean;
}

// Create the loading context
const LoadingContext = createContext<LoadingContextValue>({
  setGlobalLoading: () => {},
  setLoadingMessage: () => {},
  isLoading: false,
});

interface LoadingProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component for global loading state management
 * @param root0
 * @param root0.children
 */
export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // Set loading state with optional message
  const setGlobalLoading = useCallback(
    (isLoading: boolean, loadingMessage: string | null = null): void => {
      setLoading(isLoading);
      setMessage(loadingMessage);
    },
    [],
  );

  // Update just the loading message
  const setLoadingMessage = useCallback((loadingMessage: string | null): void => {
    setMessage(loadingMessage);
  }, []);

  // Value to be provided to context consumers
  const contextValue: LoadingContextValue = {
    setGlobalLoading,
    setLoadingMessage,
    isLoading: loading,
  };

  return (
    <LoadingContext.Provider value={contextValue}>
      {children}
      <LoadingOverlay open={loading} message={message} fullPage />
    </LoadingContext.Provider>
  );
};

/**
 * Custom hook to use the loading context
 */
export const useLoading = (): LoadingContextValue => {
  const context = useContext(LoadingContext);

  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }

  return context;
};

export default LoadingProvider;
