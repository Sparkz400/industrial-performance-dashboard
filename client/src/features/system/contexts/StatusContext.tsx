import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import io, { Socket } from 'socket.io-client'; // Import socket.io-client
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '@/config/config';
import { getStoredCsrfToken } from '@/utils/csrf'; // Import CSRF token utility
import type { SystemStatus } from '@/types';

interface StatusContextValue {
  status: SystemStatus;
  lastChecked: Date | null;
  socketConnected: boolean;
  socket: Socket | null;
  refreshStatus: () => Promise<void>;
  isError: boolean;
  isConnected: boolean;
  statusText: string;
}

const defaultStatus: SystemStatus = {
  database: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
  opcua: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
  overall: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
};

// Create a context for system status
export const StatusContext = createContext<StatusContextValue>({
  status: defaultStatus,
  lastChecked: null,
  socketConnected: false, // Add WebSocket connection status
  socket: null, // Add socket instance
  refreshStatus: async () => {},
  isError: false,
  isConnected: false,
  statusText: 'Unknown',
});

interface StatusProviderProps {
  children: React.ReactNode;
}

// Provider component
/**
 *
 * @param root0
 * @param root0.children
 */
export function StatusProvider({ children }: StatusProviderProps): React.ReactElement {
  // Initial state matching the standardized format
  const [status, setStatus] = useState<SystemStatus>(defaultStatus);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(false); // State for WS connection
  const socketRef = useRef<Socket | null>(null); // Ref to hold the socket instance

  // Function to fetch the system status via HTTP (Polling)
  const refreshStatus = useCallback(async (): Promise<void> => {
    if (isPolling) return;
    setIsPolling(true);
    // console.log('[StatusProvider] Refreshing status via HTTP GET...'); // Optional debug log
    try {
      const res = await fetch(API_ENDPOINTS.status); // Fetch standardized status
      if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
      const data: SystemStatus & { lastUpdated?: string } = await res.json();
      // Update state only if WS isn't connected or data is newer
      // (Simple approach: always update from poll for now)
      setStatus(data); // Update with the fetched standardized status
      setLastChecked(new Date(data.lastUpdated || Date.now()));
    } catch (err) {
      console.error('[StatusProvider] Error fetching status via HTTP:', err);
      // Optionally set an error state or revert to UNKNOWN
      // setStatus({ ...initial state ... });
    } finally {
      // Use setTimeout to prevent rapid polling if errors occur quickly
      setTimeout(() => setIsPolling(false), 2000);
    }
  }, [isPolling]); // Keep isPolling dependency

  // Setup WebSocket connection and listeners
  useEffect(() => {
    // Prevent multiple connections if ref already holds a socket
    if (socketRef.current) {
      console.warn('[StatusProvider] WebSocket connection already exists or is being established.');
      return;
    }

    console.warn('[StatusProvider] Attempting WebSocket connection to:', WEBSOCKET_ADDR);
    const token = getStoredCsrfToken(); // Get CSRF token for handshake
    if (!token) {
      // This is expected if the initial CSRF fetch failed, don't log as warning necessarily
      console.warn(
        '[StatusProvider] No CSRF token found for WebSocket handshake. Authentication might fail if required by server.',
      );
    }

    let socketInstance: Socket;
    try {
      socketInstance = io(WEBSOCKET_ADDR, {
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        transports: ['websocket'], // Prefer websocket
        auth: { token: token || undefined }, // Send CSRF token in auth object
        // Add query params if needed, e.g., for roles: query: { role: 'dashboard-viewer' }
      });
      socketRef.current = socketInstance; // Store instance immediately
    } catch (error) {
      console.error('[StatusProvider] Error creating WebSocket instance:', error);
      // Fallback to polling if WS instance creation fails
      refreshStatus();
      return; // Stop effect execution
    }

    socketInstance.on('connect', () => {
      console.warn('[StatusProvider] WebSocket connected:', socketInstance.id);
      setSocketConnected(true);
      // Optional: Fetch status immediately on connect if needed,
      // though server now sends it on connection.
      // refreshStatus();
    });

    socketInstance.on('disconnect', (reason: Socket.DisconnectReason) => {
      console.warn('[StatusProvider] WebSocket disconnected:', reason);
      setSocketConnected(false);
      // If disconnected unexpectedly, fallback to polling
      // Or trigger a single poll attempt.
      refreshStatus();
    });

    socketInstance.on('connect_error', (error: Error) => {
      console.error('[StatusProvider] WebSocket connection error:', error.message || error);
      setSocketConnected(false);
      // Fallback to polling if WS connection fails
      refreshStatus();
    });

    // Listen for status updates from the server
    socketInstance.on('statusUpdate', (updatedStatus: SystemStatus & { lastUpdated?: string }) => {
      // console.log('[StatusProvider] Received status update via WebSocket:', updatedStatus); // Optional debug log
      if (updatedStatus && updatedStatus.database && updatedStatus.opcua && updatedStatus.overall) {
        setStatus(updatedStatus); // Update state with the standardized status from WS
        setLastChecked(new Date(updatedStatus.lastUpdated || Date.now()));
      } else {
        console.warn(
          '[StatusProvider] Received malformed status update via WebSocket:',
          updatedStatus,
        );
      }
    });

    // Cleanup on component unmount
    return () => {
      console.warn('[StatusProvider] Cleaning up WebSocket connection.');
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.off('statusUpdate');
        socketRef.current.disconnect();
        socketRef.current = null; // Clear the ref
      }
      setSocketConnected(false);
    };
  }, [refreshStatus]); // refreshStatus is stable due to useCallback

  // Polling interval as a fallback
  useEffect(() => {
    // Poll less frequently if WebSocket is connected
    const interval = socketConnected ? 60000 : 20000; // e.g., 60s if WS connected, 20s otherwise
    const pollId = setInterval(() => {
      // Only poll if WebSocket is not connected
      if (!socketConnected) {
        // console.log(`[StatusProvider] Fallback polling... (WS Connected: ${socketConnected})`); // Optional debug log
        refreshStatus();
      }
    }, interval);

    return () => clearInterval(pollId);
  }, [socketConnected, refreshStatus]);

  const contextValue = useMemo<StatusContextValue>(
    () => ({
      status,
      lastChecked,
      socketConnected,
      socket: socketRef.current,
      refreshStatus,
      isError: status?.overall?.status === 'ERROR',
      isConnected: status?.overall?.status === 'CONNECTED',
      statusText: status?.overall?.statusText || 'Unknown',
    }),
    [status, lastChecked, socketConnected, refreshStatus],
  );

  return <StatusContext.Provider value={contextValue}>{children}</StatusContext.Provider>;
}

// Custom hook remains the same
/**
 *
 */
export function useSystemStatus(): StatusContextValue {
  const context = useContext(StatusContext);
  if (!context) {
    throw new Error('useSystemStatus must be used within a StatusProvider');
  }
  return context;
}
