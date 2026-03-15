import { useCallback, useState } from 'react';

interface UseLoadingStateOptions {
  initialLoading?: boolean;
  captureErrors?: boolean;
}

interface UseLoadingStateReturn {
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  success: string | null;
  setSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  executeWithLoading: <T>(
    asyncOperation: () => Promise<T>,
    errorMessage?: string,
  ) => Promise<T | null>;
  setSuccessWithTimeout: (message: string, timeoutMs?: number) => void;
  resetMessages: () => void;
}

/**
 * Custom hook for managing loading and error states in async operations
 * @param options - Hook configuration
 * @param options.initialLoading - Initial loading state
 * @param options.captureErrors - Whether to automatically capture errors
 * @returns State and handlers for loading operations
 */
export const useLoadingState = ({
  initialLoading = false,
  captureErrors = true,
}: UseLoadingStateOptions = {}): UseLoadingStateReturn => {
  const [loading, setLoading] = useState<boolean>(initialLoading);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset any error or success messages
  const resetMessages = useCallback((): void => {
    setError(null);
    setSuccess(null);
  }, []);

  // Run an async operation with loading state management
  const executeWithLoading = useCallback(
    async <T>(
      asyncOperation: () => Promise<T>,
      errorMessage: string = 'Operation failed',
    ): Promise<T | null> => {
      if (loading) return null;

      try {
        setLoading(true);
        resetMessages();

        return await asyncOperation();
      } catch (err: unknown) {
        console.error('Error in executeWithLoading:', err);

        if (captureErrors) {
          setError(err instanceof Error ? err.message : errorMessage);
        }

        return null;
      } finally {
        setLoading(false);
      }
    },
    [loading, captureErrors, resetMessages],
  );

  // Set a success message with auto-clear option
  const setSuccessWithTimeout = useCallback((message: string, timeoutMs: number = 3000): void => {
    setSuccess(message);

    if (timeoutMs > 0) {
      setTimeout(() => {
        setSuccess(null);
      }, timeoutMs);
    }
  }, []);

  return {
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess,
    executeWithLoading,
    setSuccessWithTimeout,
    resetMessages,
  };
};

export default useLoadingState;
