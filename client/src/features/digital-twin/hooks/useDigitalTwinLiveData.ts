import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WEBSOCKET_ADDR } from '@/config/config';
import type { TwinNodeBinding } from './useDigitalTwinQueries';

interface LiveDataValue {
  value: number | string;
  timestamp: string;
}

/**
 *
 * @param bindings
 */
export function useDigitalTwinLiveData(bindings: TwinNodeBinding[]): Record<string, LiveDataValue> {
  const [liveData, setLiveData] = useState<Record<string, LiveDataValue>>({});
  const socketRef = useRef<Socket | null>(null);
  const bindingsRef = useRef(bindings);

  // Keep bindings ref in sync
  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    if (!bindings.length) return;

    const nodeKeys = new Set(bindings.map((b) => b.nodeKey));

    const socket = io(WEBSOCKET_ADDR, {
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on(
      'opcuaUpdate',
      (data: { nodeKey: string; value: number | string; timestamp: string }) => {
        if (!nodeKeys.has(data.nodeKey)) return;

        setLiveData((prev) => ({
          ...prev,
          [data.nodeKey]: {
            value: data.value,
            timestamp: data.timestamp,
          },
        }));
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [bindings]);

  return liveData;
}
