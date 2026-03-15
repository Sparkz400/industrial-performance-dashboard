import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useLoadingState } from '@/shared/components/loading';

interface UseSystemStatusDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  onError?: (error: Error) => void;
}

interface SystemStatusState {
  database: string;
  opcua: string;
  rawData?: Record<string, unknown>;
}

interface UseSystemStatusDataReturn {
  status: SystemStatusState;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  overallStatus: string;
  fetchStatus: () => Promise<void>;
  isConnected: boolean;
  hasError: boolean;
  isWarning: boolean;
  isAutoRefreshEnabled: boolean;
}

/**
 * Custom hook for fetching and managing system status data with reliable auto-refresh
 * @param root0
 * @param root0.autoRefresh
 * @param root0.refreshInterval
 * @param root0.onError
 */
export function useSystemStatusData({
  autoRefresh = true,
  refreshInterval = 20000,
  onError: _onError = () => {},
}: UseSystemStatusDataOptions): UseSystemStatusDataReturn {
  const { loading, error, executeWithLoading } = useLoadingState();

  const [status, setStatus] = useState<SystemStatusState>({
    database: 'unknown',
    opcua: 'unknown',
  });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [overallStatus, setOverallStatus] = useState<string>('unknown');
  const isPolling = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const autoRefreshRef = useRef<boolean>(autoRefresh);
  const refreshIntervalRef = useRef<number>(refreshInterval);

  // Update refs when props change to ensure latest values in callbacks
  useEffect(() => {
    autoRefreshRef.current = autoRefresh;
    refreshIntervalRef.current = refreshInterval;
  }, [autoRefresh, refreshInterval]);

  // Calculate overall status helper - memoized via useCallback
  const calculateOverallStatus = useCallback((data: Record<string, unknown>): string => {
    if (!data) return 'unknown';

    const overall = data.overall as string | { status?: string } | undefined;
    if (overall) {
      return typeof overall === 'string'
        ? overall.toLowerCase()
        : overall.status?.toLowerCase() || 'unknown';
    }

    const database = data.database as string | { status?: string } | undefined;
    const opcua = data.opcua as string | { status?: string } | undefined;

    const dbStatus =
      typeof database === 'string'
        ? database.toLowerCase()
        : database?.status?.toLowerCase() || 'unknown';

    const opcStatus =
      typeof opcua === 'string' ? opcua.toLowerCase() : opcua?.status?.toLowerCase() || 'unknown';

    if (dbStatus.includes('error') || opcStatus.includes('error')) {
      return 'error';
    } else if (dbStatus.includes('warning') || opcStatus.includes('warning')) {
      return 'warning';
    } else if (
      (dbStatus.includes('ok') || dbStatus.includes('connected')) &&
      (opcStatus.includes('ok') || opcStatus.includes('connected'))
    ) {
      return 'ok';
    }

    return 'warning';
  }, []);

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
        database:
          typeof result.database === 'string'
            ? result.database
            : result.database?.status || 'unknown',
        opcua: typeof result.opcua === 'string' ? result.opcua : result.opcua?.status || 'unknown',
        rawData: result,
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
  }, [executeWithLoading, calculateOverallStatus]);

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
    isAutoRefreshEnabled: autoRefresh,
  };
}

export default useSystemStatusData;
