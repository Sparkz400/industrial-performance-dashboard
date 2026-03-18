import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '@/config/config';

interface MemoryUsage {
  total: number;
  used: number;
  percentUsed: number;
}

interface CpuInfo {
  cores: number;
}

interface ProcessMemory {
  heapUsed: number;
  heapTotal: number;
}

interface PlatformInfo {
  type: string;
  platform: string;
  release: string;
}

export interface SystemStats {
  uptime: number;
  memoryUsage: MemoryUsage;
  cpuUsage: number;
  cpuInfo?: CpuInfo;
  activeConnections: number;
  lastRestart: string | null;
  nodeVersion?: string;
  processMemory?: ProcessMemory;
  platform?: PlatformInfo;
}

interface SystemStatsReturn {
  loading: boolean;
  systemStats: SystemStats | null;
  lastStatsUpdate: Date | null;
  error: string | null;
  formatUptime: (seconds: number) => string;
  fetchSystemStats: () => Promise<void>;
}

export const useSystemStats = (): SystemStatsReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [lastStatsUpdate, setLastStatsUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Format uptime for display
  const formatUptime = (seconds: number): string => {
    if (!seconds && seconds !== 0) return 'Unknown';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    // Only show non-zero units
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
  };

  // Fetch system stats
  const fetchSystemStats = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.system.stats, { credentials: 'include' });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: SystemStats = await response.json();
      setSystemStats(data);
      setError(null);

      // Update last fetch time
      setLastStatsUpdate(new Date());
    } catch (err) {
      console.error('Error fetching system stats:', err);
      setError(`Failed to fetch system statistics: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up initial fetch and auto-refresh
  useEffect(() => {
    // Initial fetch
    fetchSystemStats();

    // Set up auto-refresh interval (every 30 seconds)
    const refreshInterval = setInterval(fetchSystemStats, 1000);

    // Clean up
    return () => clearInterval(refreshInterval);
  }, [fetchSystemStats]);

  return {
    loading,
    systemStats,
    lastStatsUpdate,
    error,
    formatUptime,
    fetchSystemStats,
  };
};
