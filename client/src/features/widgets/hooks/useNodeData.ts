import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '@/config/config';
import { useStatusStore } from '@/stores/useStatusStore';
import type { OpcuaNodeData } from '@/types';

export interface NodeDataPoint {
  timestamp: string;
  time: string;
  value: number | null;
}

interface UseNodeDataOptions {
  nodeKey: string;
  machineId?: number;
  maxPoints?: number;
  enabled?: boolean;
}

interface UseNodeDataReturn {
  data: NodeDataPoint[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

/**
 *
 * @param options
 */
export function useNodeData(options: UseNodeDataOptions): UseNodeDataReturn {
  const { nodeKey, machineId, maxPoints = 120, enabled = true } = options;

  const [data, setData] = useState<NodeDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const socket = useStatusStore((s) => s.socket);
  const socketConnected = useStatusStore((s) => s.socketConnected);

  const addDataPoint = useCallback(
    (newPoint: NodeDataPoint) => {
      setData((prev) => {
        const updated = [...prev, newPoint];
        return updated.length > maxPoints ? updated.slice(updated.length - maxPoints) : updated;
      });
      setLastUpdated(new Date());
    },
    [maxPoints],
  );

  const fetchHistoricalData = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ nodeKey, limit: String(maxPoints) });
      if (machineId != null) params.set('machineId', String(machineId));

      const response = await fetch(`${API_ENDPOINTS.nodeData}?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const historicalData: NodeDataPoint[] = await response.json();
      if (historicalData.length > 0) {
        setData(historicalData);
      }
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error(`Error fetching node data for ${nodeKey}:`, err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [nodeKey, machineId, maxPoints, enabled]);

  useEffect(() => {
    if (!enabled) return;

    void fetchHistoricalData();

    if (!socket || !socketConnected) return;

    const roomName = machineId ? `opcua-${machineId}-${nodeKey}` : `opcua-${nodeKey}`;

    const handleOpcuaUpdate = (nodeData: OpcuaNodeData) => {
      const now = new Date();
      const newPoint: NodeDataPoint = {
        timestamp: typeof nodeData.timestamp === 'string' ? nodeData.timestamp : nodeData.timestamp.toISOString(),
        time: now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: nodeData.value as number,
      };
      addDataPoint(newPoint);
    };

    socket.emit('joinRoom', roomName);
    socket.on('opcuaUpdate', handleOpcuaUpdate);

    return () => {
      socket.emit('leaveRoom', roomName);
      socket.off('opcuaUpdate', handleOpcuaUpdate);
    };
  }, [fetchHistoricalData, addDataPoint, socket, socketConnected, nodeKey, machineId, enabled]);

  return { data, loading, error, lastUpdated, refresh: fetchHistoricalData };
}
