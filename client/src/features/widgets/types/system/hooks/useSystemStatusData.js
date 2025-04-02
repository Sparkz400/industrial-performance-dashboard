import {useCallback, useEffect, useRef, useState} from 'react';
import {API_ENDPOINTS} from '../../../../../config/config.js';
import {useLoadingState} from '../../../../../shared/components/loading';

/**
 * Custom hook for fetching and managing system status data with reliable auto-refresh
 */
export function useSystemStatusData({
                                        autoRefresh = true,
                                        refreshInterval = 20000,
                                        onError = () => {}
                                    }) {
    const {
        loading,
        setLoading,
        error,
        setError,
        executeWithLoading
    } = useLoadingState();

    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [lastUpdated, setLastUpdated] = useState(null);
    const [overallStatus, setOverallStatus] = useState('unknown');
    const isPolling = useRef(false);
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);
    const autoRefreshRef = useRef(autoRefresh);
    const refreshIntervalRef = useRef(refreshInterval);

    // Update refs when props change to ensure latest values in callbacks
    useEffect(() => {
        autoRefreshRef.current = autoRefresh;
        refreshIntervalRef.current = refreshInterval;
    }, [autoRefresh, refreshInterval]);

    // Fetch status implementation - with logging
    const fetchStatus = useCallback(async () => {
        // Prevent concurrent requests
        if (isPolling.current || !mountedRef.current) return;

        isPolling.current = true;

        const result = await executeWithLoading(async () => {
            const response = await fetch(API_ENDPOINTS.status);

            if (!mountedRef.current) return null;

            if (!response.ok) {
                throw new Error(`Status request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        }, 'Failed to fetch system status');

        if (result) {
            // Process and update state with data
            setStatus({
                database: typeof result.database === 'string' ? result.database :
                    (result.database?.status || 'unknown'),
                opcua: typeof result.opcua === 'string' ? result.opcua :
                    (result.opcua?.status || 'unknown'),
                rawData: result
            });

            setLastUpdated(new Date());

            // Update overall status
            const newOverallStatus = calculateOverallStatus(result);
            setOverallStatus(newOverallStatus);
        }

        // Set a small delay before allowing another fetch
        setTimeout(() => {
            isPolling.current = false;
        }, 1000);

    }, [executeWithLoading]);

    // Calculate overall status helper
    const calculateOverallStatus = (data) => {
        if (!data) return 'unknown';

        // Check for overall status in the data
        if (data.overall) {
            return typeof data.overall === 'string' ?
                data.overall.toLowerCase() :
                (data.overall.status?.toLowerCase() || 'unknown');
        }

        // Derive from components if no overall provided
        const dbStatus = typeof data.database === 'string' ?
            data.database.toLowerCase() :
            (data.database?.status?.toLowerCase() || 'unknown');

        const opcStatus = typeof data.opcua === 'string' ?
            data.opcua.toLowerCase() :
            (data.opcua?.status?.toLowerCase() || 'unknown');

        if (dbStatus.includes('error') || opcStatus.includes('error')) {
            return 'error';
        } else if (dbStatus.includes('warning') || opcStatus.includes('warning')) {
            return 'warning';
        } else if ((dbStatus.includes('ok') || dbStatus.includes('connected')) &&
            (opcStatus.includes('ok') || opcStatus.includes('connected'))) {
            return 'ok';
        }

        return 'warning'; // Default to warning for mixed status
    };

    useEffect(() => {

        // Clear any existing interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Only set up interval if auto-refresh is enabled
        if (autoRefresh && refreshInterval > 0) {
            // Create a scheduled refresh function that checks current ref values
            const scheduledRefresh = () => {
                if (autoRefreshRef.current && !isPolling.current && mountedRef.current) {
                    void fetchStatus();
                }
            };

            // Set up the interval
            intervalRef.current = setInterval(scheduledRefresh, refreshInterval);
        }

        // Clean up function to remove interval
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [autoRefresh, refreshInterval, fetchStatus]);

    // Set up mounted ref for cleanup
    useEffect(() => {
        mountedRef.current = true;

        // Initial fetch on mount
        void fetchStatus();

        return () => {
            mountedRef.current = false;

            // Clear interval on unmount
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [fetchStatus]);

    return {
        status,
        loading,
        error,
        lastUpdated,
        overallStatus,
        fetchStatus,
        isConnected: overallStatus === 'ok' || overallStatus === 'connected',
        hasError: overallStatus === 'error',
        isWarning: overallStatus === 'warning',
        isAutoRefreshEnabled: autoRefresh
    };
}

export default useSystemStatusData;