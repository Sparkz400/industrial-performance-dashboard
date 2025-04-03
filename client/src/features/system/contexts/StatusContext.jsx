// ===== ..\client\src\features\system\contexts\StatusContext.jsx =====
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import io from 'socket.io-client'; // Import socket.io-client
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../../../config/config.js';

// Create a context for system status
export const StatusContext = createContext({
    status: { // Initial structure matching the standardized server response
        database: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
        opcua: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
        overall: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default' }
    },
    lastChecked: null,
    socketConnected: false, // Add WebSocket connection status
    refreshStatus: () => {}
});

// Provider component
export function StatusProvider({ children }) {
    // Initial state matching the standardized format
    const [status, setStatus] = useState({
        database: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
        opcua: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
        overall: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default' }
    });
    const [lastChecked, setLastChecked] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false); // State for WS connection
    const socketRef = useRef(null); // Ref to hold the socket instance

    // Function to fetch the system status via HTTP (Polling)
    const refreshStatus = useCallback(async () => {
        if (isPolling) return;
        setIsPolling(true);
        // console.log('[StatusProvider] Refreshing status via HTTP GET...'); // Optional debug log
        try {
            const res = await fetch(API_ENDPOINTS.status); // Fetch standardized status
            if (!res.ok) throw new Error('Failed to fetch status');
            const data = await res.json();
            // Update state only if WS isn't connected or data is newer
            // (Simple approach: always update from poll for now)
            setStatus(data); // Update with the fetched standardized status
            setLastChecked(new Date(data.lastUpdated || Date.now()));
        } catch (err) {
            console.error('[StatusProvider] Error fetching status via HTTP:', err);
            // Optionally set an error state or revert to UNKNOWN
            // setStatus({ ...initial state ... });
        } finally {
            setTimeout(() => setIsPolling(false), 2000);
        }
    }, [isPolling]); // Keep isPolling dependency

    // Setup WebSocket connection and listeners
    useEffect(() => {
        // Prevent multiple connections
        if (socketRef.current) return;

        console.log('[StatusProvider] Attempting WebSocket connection to:', WEBSOCKET_ADDR);
        const socketInstance = io(WEBSOCKET_ADDR, {
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
            transports: ['websocket'], // Prefer websocket
            // Add query params if needed, e.g., for roles: query: { role: 'dashboard-viewer' }
        });
        socketRef.current = socketInstance;

        socketInstance.on('connect', () => {
            console.log('[StatusProvider] WebSocket connected:', socketInstance.id);
            setSocketConnected(true);
            // Optional: Fetch status immediately on connect if needed,
            // though server now sends it on connection.
            // refreshStatus();
        });

        socketInstance.on('disconnect', (reason) => {
            console.warn('[StatusProvider] WebSocket disconnected:', reason);
            setSocketConnected(false);
            // If disconnected unexpectedly, fallback to polling more frequently?
            // Or trigger a single poll attempt.
            refreshStatus();
        });

        socketInstance.on('connect_error', (error) => {
            console.error('[StatusProvider] WebSocket connection error:', error);
            setSocketConnected(false);
            // Fallback to polling if WS connection fails initially
            refreshStatus();
        });

        // Listen for status updates from the server
        socketInstance.on('statusUpdate', (updatedStatus) => {
            // console.log('[StatusProvider] Received status update via WebSocket:', updatedStatus); // Optional debug log
            if (updatedStatus && updatedStatus.database && updatedStatus.opcua && updatedStatus.overall) {
                setStatus(updatedStatus); // Update state with the standardized status from WS
                setLastChecked(new Date(updatedStatus.lastUpdated || Date.now()));
            } else {
                console.warn('[StatusProvider] Received malformed status update via WebSocket:', updatedStatus);
            }
        });

        // Cleanup on component unmount
        return () => {
            console.log('[StatusProvider] Cleaning up WebSocket connection.');
            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('disconnect');
                socketRef.current.off('connect_error');
                socketRef.current.off('statusUpdate');
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setSocketConnected(false);
        };
    }, [refreshStatus]); // Include refreshStatus dependency

    // Polling interval as a fallback
    useEffect(() => {
        // Poll less frequently if WebSocket is connected
        const interval = socketConnected ? 60000 : 20000; // e.g., 60s if WS connected, 20s otherwise
        const pollId = setInterval(() => {
            // console.log(`[StatusProvider] Fallback polling... (WS Connected: ${socketConnected})`); // Optional debug log
            refreshStatus();
        }, interval);

        return () => clearInterval(pollId);
    }, [socketConnected, refreshStatus]); // Re-run if socket connection status or refresh function changes

    return (
        <StatusContext.Provider
            value={{
                status,
                lastChecked,
                socketConnected, // Expose socket connection status
                refreshStatus,
                // Simplified derived states based on the overall status string
                isError: status?.overall?.status === 'ERROR',
                isConnected: status?.overall?.status === 'CONNECTED',
                statusText: status?.overall?.statusText || 'Unknown'
            }}
        >
            {children}
        </StatusContext.Provider>
    );
}

// Custom hook remains the same
export function useSystemStatus() {
    const context = useContext(StatusContext);
    if (!context) {
        throw new Error('useSystemStatus must be used within a StatusProvider');
    }
    return context;
}