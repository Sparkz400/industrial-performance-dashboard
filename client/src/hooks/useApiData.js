import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for fetching data from an API endpoint
 * @param {string} endpoint - The API endpoint URL
 * @param {Array|Object} initialData - Initial data before fetch completes
 * @param {Object} options - Hook configuration options
 * @returns {Object} - Data, loading state, error, and utility functions
 */
function useApiData(endpoint, initialData = [], options = {}) {
    const {
        fetchOnMount = true,
        autoRefreshInterval = null,
        transformResponse = data => data,
        onError = err => console.error(err)
    } = options;

    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(fetchOnMount);
    const [error, setError] = useState(null);
    const [lastFetched, setLastFetched] = useState(null);

    // Fetch data function
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(endpoint);

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const jsonData = await response.json();
            const transformedData = transformResponse(jsonData);

            setData(transformedData);
            setLastFetched(new Date());
            setError(null);

            return transformedData;
        } catch (err) {
            setError(err.message);
            onError(err);
            return null;
        } finally {
            setLoading(false);
        }
    }, [endpoint, transformResponse, onError]);

    // Fetch data on mount if enabled
    useEffect(() => {
        if (fetchOnMount) {
            fetchData();
        }
    }, [fetchOnMount, fetchData]);

    // Set up auto-refresh if interval is provided
    useEffect(() => {
        if (!autoRefreshInterval) return;

        const intervalId = setInterval(fetchData, autoRefreshInterval);

        return () => clearInterval(intervalId);
    }, [autoRefreshInterval, fetchData]);

    return {
        data,
        loading,
        error,
        fetchData,
        lastFetched,
        setData  // Expose setData for manual updates
    };
}

export default useApiData;