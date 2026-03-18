import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '@/config/config';

interface ActiveConnection {
  id: string;
  connectedAt: string;
  ip: string;
  userAgent?: string;
}

interface ConnectionHistoryEntry {
  id: string;
  type: 'connect' | 'disconnect';
  timestamp: string;
  duration?: number;
}

interface ConnectionStats {
  activeCount: number;
  activeConnections: ActiveConnection[];
  history: ConnectionHistoryEntry[];
}

interface ConnectionStatsReturn {
  loadingConnections: boolean;
  connectionStats: ConnectionStats | null;
  formatDuration: (ms: number | null | undefined) => string;
  formatDate: (date: string | Date | null | undefined) => string;
  fetchConnectionStats: () => Promise<void>;
}

export const useConnectionStats = (
  autoRefresh: boolean = true,
  refreshIntervalMs: number = 30000,
): ConnectionStatsReturn => {
  const [loadingConnections, setLoadingConnections] = useState<boolean>(false);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null);

  // Format duration for display
  const formatDuration = (ms: number | null | undefined): string => {
    if (!ms) return 'Unknown';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format date for display
  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  // Fetch connection stats
  const fetchConnectionStats = useCallback(async (): Promise<void> => {
    setLoadingConnections(true);
    try {
      const response = await fetch(API_ENDPOINTS.system.connections, { credentials: 'include' });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: ConnectionStats = await response.json();
      setConnectionStats(data);
    } catch (err) {
      console.error('Error fetching connection stats:', err);

      // Only set empty data if we don't have any stats yet
      setConnectionStats((prev: ConnectionStats | null) => {
        if (!prev) {
          return {
            activeCount: 0,
            activeConnections: [],
            history: [],
          };
        }
        return prev;
      });
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  // Call the function on component mount and set up auto-refresh
  useEffect(() => {
    void fetchConnectionStats();

    if (!autoRefresh) return;

    const interval = setInterval(fetchConnectionStats, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [fetchConnectionStats, autoRefresh, refreshIntervalMs]);

  return {
    loadingConnections,
    connectionStats,
    formatDuration,
    formatDate,
    fetchConnectionStats,
  };
};
