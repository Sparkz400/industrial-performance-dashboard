import React, { createContext, useContext, useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../config/config';

// Create a context for system status
export const StatusContext = createContext({
    status: { database: 'unknown', opcua: 'unknown' },
    lastChecked: null,
    refreshStatus: () => {}
});

// Provider component
export function StatusProvider({ children }) {
    const [status, setStatus] = useState({ database: 'unknown', opcua: 'unknown' });
    const [lastChecked, setLastChecked] = useState(null);
    const [isPolling, setIsPolling] = useState(false);

    // Function to fetch the system status
    const refreshStatus = useCallback(async () => {
        // Prevent parallel requests
        if (isPolling) {
            return;
        }

        setIsPolling(true);

        try {
            const res = await fetch(API_ENDPOINTS.status);

            if (!res.ok) {
                if (res.status === 429) {
                    console.warn('Status API rate limited, will retry later');
                    // Don't update state on rate limit - keep previous values
                    return;
                }
                throw new Error('Failed to fetch status');
            }

            const data = await res.json();
            setStatus(data);
            setLastChecked(new Date());
        } catch (err) {
            console.error('Error fetching status:', err);
        } finally {
            // Set a short timeout before allowing another fetch
            setTimeout(() => {
                setIsPolling(false);
            }, 2000); // 2-second cooldown
        }
    }, [isPolling]);

    return (
        <StatusContext.Provider
            value={{
                status,
                lastChecked,
                refreshStatus,
                isError: status?.overall?.status === 'ERROR',
                isConnected: status?.overall?.status === 'CONNECTED',
                statusText: status?.overall?.statusText || 'Unknown'
            }}
        >
            {children}
        </StatusContext.Provider>
    );
}

// Custom hook to use the status context
export function useSystemStatus() {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useSystemStatus must be used within a StatusProvider');
    }
    return context;
}