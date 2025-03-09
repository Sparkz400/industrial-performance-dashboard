import {useCallback, useState} from 'react';

/**
 * Custom hook for managing loading and error states in async operations
 *
 * @param {Object} options - Hook configuration
 * @param {boolean} options.initialLoading - Initial loading state
 * @param {boolean} options.captureErrors - Whether to automatically capture errors
 * @returns {Object} State and handlers for loading operations
 */
export const useLoadingState = ({
                                    initialLoading = false,
                                    captureErrors = true
                                } = {}) => {
    const [loading, setLoading] = useState(initialLoading);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Reset any error or success messages
    const resetMessages = useCallback(() => {
        setError(null);
        setSuccess(null);
    }, []);

    // Run an async operation with loading state management
    const executeWithLoading = useCallback(async (asyncOperation, errorMessage = 'Operation failed') => {
        if (loading) return null;

        try {
            setLoading(true);
            resetMessages();

            return await asyncOperation();
        } catch (err) {
            console.error('Error in executeWithLoading:', err);

            if (captureErrors) {
                setError(err.message || errorMessage);
            }

            return null;
        } finally {
            setLoading(false);
        }
    }, [loading, captureErrors, resetMessages]);

    // Set a success message with auto-clear option
    const setSuccessWithTimeout = useCallback((message, timeoutMs = 3000) => {
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
        resetMessages
    };
};

export default useLoadingState;