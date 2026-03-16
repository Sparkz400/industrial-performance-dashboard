import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import type { OpcuaNodeData } from '@/types';

export interface OperationModeDataPoint {
  time: string;
  mode: number;
}

interface UseOperationModeDataOptions {
  maxPoints?: number;
  machineId?: number;
}

interface UseOperationModeDataReturn {
  data: OperationModeDataPoint[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

/**
 * Custom hook for fetching and managing operation mode data
 * @param options
 */
export function useOperationModeData(
  options: UseOperationModeDataOptions = {},
): UseOperationModeDataReturn {
  const { maxPoints = 120, machineId } = options;

  const [data, setData] = useState<OperationModeDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Get the shared socket instance from Zustand store
  const socket = useStatusStore((s) => s.socket);
  const socketConnected = useStatusStore((s) => s.socketConnected);

  // Add a new data point
  const addDataPoint = useCallback(
    (newPoint: OperationModeDataPoint) => {
      setData((prevData) => {
        const updated = [...prevData, newPoint];
        return updated.length > maxPoints ? updated.slice(updated.length - maxPoints) : updated;
      });
      setLastUpdated(new Date());
    },
    [maxPoints],
  );

  // Fetch historical data
  const fetchHistoricalData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.operationModeData);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const historicalData: OperationModeDataPoint[] = await response.json();

      if (historicalData.length !== 0) {
        setData(historicalData);
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching operation mode data:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effect for real-time updates via WebSocket
  useEffect(() => {
    // Fetch initial historical data
    void fetchHistoricalData();

    // --- Check if socket is available and connected ---
    if (!socket || !socketConnected) {
      return; // Exit effect if socket isn't ready
    }

    // Only proceed if socket is available and connected
    if (socket && socketConnected) {
      // Use machine-scoped room if machineId is provided, else legacy room
      const roomName = machineId ? `opcua-${machineId}-OperationMode` : 'opcua-OperationMode';

      // Handler for receiving updates for this specific node
      const handleOpcuaUpdate = (nodeData: OpcuaNodeData) => {
        // No need to check nodeData.key here, as the server sends to the correct room
        const now = new Date();
        const newPoint: OperationModeDataPoint = {
          time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mode: nodeData.value as number,
        };
        addDataPoint(newPoint);
      };

      // Join the room when the component mounts or socket connects
      socket.emit('joinRoom', roomName);
      console.warn(`[useOperationModeData] Joining room: ${roomName}`);

      // Listen for updates
      socket.on('opcuaUpdate', handleOpcuaUpdate);

      // Cleanup function: leave room and remove listener
      return () => {
        socket.emit('leaveRoom', roomName);
        console.warn(`[useOperationModeData] Leaving room: ${roomName}`);
        socket.off('opcuaUpdate', handleOpcuaUpdate);
      };
    }
    // Re-run effect if socket instance, connection status, or machineId changes
  }, [fetchHistoricalData, addDataPoint, socket, socketConnected, machineId]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchHistoricalData,
  };
}
