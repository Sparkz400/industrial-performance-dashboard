import { useState, useCallback, useEffect } from 'react';
import { API_ENDPOINTS } from '../../../config/config.js';

export const useConnectionStats = () => {
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [connectionStats, setConnectionStats] = useState(null);

    // Format duration for display
    const formatDuration = (ms) => {
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
    const formatDate = (date) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString();
    };

    // Fetch connection stats
    const fetchConnectionStats = useCallback(async () => {
        setLoadingConnections(true);
        try {
            const response = await fetch(API_ENDPOINTS.system.connections);

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            setConnectionStats(data);
        } catch (err) {
            console.error('Error fetching connection stats:', err);

            // Only set empty data if we don't have any stats yet
            setConnectionStats(prev => {
                if (!prev) {
                    return {
                        activeCount: 0,
                        activeConnections: [],
                        history: []
                    };
                }
                return prev;
            });
        } finally {
            setLoadingConnections(false);
        }
    }, []); // No dependencies here

    // Call the function on component mount and set up auto-refresh
    useEffect(() => {
        void fetchConnectionStats();

        const interval = setInterval(fetchConnectionStats, 30000); // Refresh every 30 seconds

        return () => clearInterval(interval);
    }, [fetchConnectionStats]);

    return {
        loadingConnections,
        connectionStats,
        formatDuration,
        formatDate,
        fetchConnectionStats
    };
};