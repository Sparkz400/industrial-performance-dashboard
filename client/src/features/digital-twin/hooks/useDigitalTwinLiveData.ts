import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WEBSOCKET_ADDR } from '@/config/config';
import type { TwinNodeBinding } from './useDigitalTwinQueries';

export interface LiveDataValue {
  value: number | string;
  timestamp: string;
}

export function useDigitalTwinLiveData(bindings: TwinNodeBinding[]): Record<string, LiveDataValue> {
  const [liveData, setLiveData] = useState<Record<string, LiveDataValue>>({});
  const socketRef = useRef<Socket | null>(null);
  const pendingRef = useRef<Record<string, LiveDataValue>>({});
  const rafRef = useRef(0);

  useEffect(() => {
    if (!bindings.length) return;

    const nodeKeys = new Set(bindings.map((b) => b.nodeKey));

    const socket = io(WEBSOCKET_ADDR, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on(
      'opcuaUpdate',
      (data: { nodeKey: string; value: number | string; timestamp: string }) => {
        if (!nodeKeys.has(data.nodeKey)) return;

        pendingRef.current[data.nodeKey] = {
          value: data.value,
          timestamp: data.timestamp,
        };

        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            const batch = pendingRef.current;
            pendingRef.current = {};
            rafRef.current = 0;
            setLiveData((prev) => ({ ...prev, ...batch }));
          });
        }
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      pendingRef.current = {};
    };
  }, [bindings]);

  return liveData;
}
