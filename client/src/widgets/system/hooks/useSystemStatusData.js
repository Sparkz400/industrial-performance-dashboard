// File: src/widgets/system/hooks/useSystemStatusData.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../../../config/config';

/**
 * Custom hook for fetching and managing system status data
 *
 * @param {Object} options - Hook configuration options
 * @param {boolean} options.autoRefresh - Whether to automatically refresh data
 * @param {number} options.refreshInterval - Refresh interval in milliseconds
 * @param {Function} options.onError - Error callback function
 * @returns {Object} Status data and utility functions
 */
export function useSystemStatusData({
                                        autoRefresh = true,
                                        refreshInterval = 20000,
                                        onError = () => {}
                                    }) {
    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const isPolling = useRef(false);
    const intervalRef = useRef(null);

    // Compute overall status based on component statuses
    const getOverallStatus = useCallback(() => {
        if (!status) return 'unknown';

        const dbStatus = (status.database?.status || status.database || '').toLowerCase();
        const opcStatus = (status.opcua?.status || status.opcua || '').toLowerCase();

        if (dbStatus === 'error' || opcStatus === 'error') {
            return 'error';
        } else if (dbStatus === 'warning' || opcStatus === 'warning') {
            return 'warning';
        } else if (
            (dbStatus === 'ok' || dbStatus === 'connected') &&
            (opcStatus === 'ok' || opcStatus === 'connected')
        ) {
            return 'ok';
        } else {
            return 'unknown';
        }
    }, [status]);

    const normalizeStatus = (apiResponse) => {
        // If already in the right format, return as is
        if (typeof apiResponse === 'string') {
            return apiResponse;
        }

        // Handle standard status objects
        if (apiResponse && typeof apiResponse === 'object') {
            // Extract the status text based on your API structure
            if (apiResponse.statusText) return apiResponse.statusText;
            if (apiResponse.status) return apiResponse.status;
        }

        // Default fallback
        return 'unknown';
    };

    // Fetch status data from API
    const fetchStatus = useCallback(async () => {
        // Prevent concurrent requests
        if (isPolling.current) return;

        try {
            isPolling.current = true;
            setLoading(true);

            const res = await fetch(API_ENDPOINTS.status);
            if (!res.ok) {
                throw new Error(`Failed to fetch status: ${res.status}`);
            }

            const data = await res.json();
            const normalizedData = {
                database: normalizeStatus(data.database),
                opcua: normalizeStatus(data.opcua)
            };
            setStatus(normalizedData);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching system status:', error);
            onError(error);
            // Don't update status on error to keep the last known state
        } finally {
            setLoading(false);
            // Set a small delay before allowing another fetch
            setTimeout(() => {
                isPolling.current = false;
            }, 1000);
        }
    }, [onError]);

    // Set up auto-refresh interval
    useEffect(() => {
        // Initial fetch
        void fetchStatus();

        // Set up interval if auto-refresh is enabled
        if (autoRefresh) {
            intervalRef.current = setInterval(fetchStatus, refreshInterval);
        }

        // Cleanup function
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [fetchStatus, autoRefresh, refreshInterval]);

    return {
        status,
        loading,
        lastUpdated,
        overallStatus: getOverallStatus(),
        fetchStatus,
    };
}
