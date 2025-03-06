import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';

export const useSystemStats = () => {
    const [loading, setLoading] = useState(false);
    const [systemStats, setSystemStats] = useState(null);
    const [lastStatsUpdate, setLastStatsUpdate] = useState(null);
    const [error, setError] = useState(null);

    // Format uptime for display
    const formatUptime = (seconds) => {
        if (!seconds && seconds !== 0) return 'Unknown';

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        // Only show non-zero units
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

        return parts.join(' ');
    };

    // Fetch system stats
    const fetchSystemStats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(API_ENDPOINTS.system.stats);

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            setSystemStats(data);
            setError(null); // Clear any previous errors

            // Update last fetch time
            setLastStatsUpdate(new Date());
        } catch (err) {
            console.error('Error fetching system stats:', err);
            setError(`Failed to fetch system statistics: ${err.message}`);

            // Only set mock data if we don't have any stats yet
            setSystemStats(prev => {
                if (!prev) {
                    return {
                        uptime: 0,
                        memoryUsage: {
                            total: 0,
                            used: 0,
                            percentUsed: 0
                        },
                        cpuUsage: 0,
                        activeConnections: 0,
                        lastRestart: null,
                    };
                }
                return prev;
            });
        } finally {
            setLoading(false);
        }
    }, []); // No dependencies here

    // Set up initial fetch and auto-refresh
    useEffect(() => {
        // Initial fetch
        fetchSystemStats();

        // Set up auto-refresh interval (every 30 seconds)
        const refreshInterval = setInterval(fetchSystemStats, 30000);

        // Clean up
        return () => clearInterval(refreshInterval);
    }, [fetchSystemStats]);

    return {
        loading,
        systemStats,
        lastStatsUpdate,
        error,
        formatUptime,
        fetchSystemStats
    };
};