import { create } from 'zustand';
import io, { type Socket } from 'socket.io-client';
import type { SystemStatus, ServerToClientEvents, ClientToServerEvents } from '../types';
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../config/config';
import { getStoredCsrfToken } from '../utils/csrf';
import { useNotificationStore } from './useNotificationStore';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface StatusState {
  status: SystemStatus;
  lastChecked: Date | null;
  socketConnected: boolean;
  socket: TypedSocket | null;
  isError: boolean;
  isConnected: boolean;
  statusText: string;
  // Actions
  refreshStatus: () => Promise<void>;
  initSocket: () => void;
  cleanup: () => void;
}

const defaultStatus: SystemStatus = {
  database: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
  opcua: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
  overall: { status: 'UNKNOWN', statusText: 'Unknown', statusColor: 'default', details: {} },
};

export const useStatusStore = create<StatusState>((set, get) => {
  let socketInstance: TypedSocket | null = null;
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let isPolling = false;
  let cleanupNotificationListeners: (() => void) | null = null;

  const refreshStatus = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      const res = await fetch(API_ENDPOINTS.status);
      if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
      const data = await res.json();
      set({
        status: data,
        lastChecked: new Date(data.lastUpdated || Date.now()),
        isError: data?.overall?.status === 'ERROR',
        isConnected: data?.overall?.status === 'CONNECTED',
        statusText: data?.overall?.statusText || 'Unknown',
      });
    } catch (err) {
      console.error('[StatusStore] Error fetching status:', err);
    } finally {
      setTimeout(() => {
        isPolling = false;
      }, 2000);
    }
  };

  const setupPolling = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    const interval = get().socketConnected ? 60000 : 20000;
    pollingInterval = setInterval(() => {
      if (!get().socketConnected) {
        refreshStatus();
      }
    }, interval);
  };

  return {
    status: defaultStatus,
    lastChecked: null,
    socketConnected: false,
    socket: null,
    isError: false,
    isConnected: false,
    statusText: 'Unknown',

    refreshStatus,

    initSocket: () => {
      if (socketInstance) return;

      const token = getStoredCsrfToken();
      try {
        socketInstance = io(WEBSOCKET_ADDR, {
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
          transports: ['websocket'],
          auth: { token: token || undefined },
        });

        socketInstance.on('connect', () => {
          set({ socketConnected: true, socket: socketInstance });
          setupPolling();

          // Wire up notification listeners on connect
          if (socketInstance && !cleanupNotificationListeners) {
            cleanupNotificationListeners = useNotificationStore
              .getState()
              .initSocketListeners(socketInstance);
          }
        });

        socketInstance.on('disconnect', () => {
          set({ socketConnected: false });
          setupPolling();
          refreshStatus();
        });

        socketInstance.on('connect_error', () => {
          set({ socketConnected: false });
          setupPolling();
          refreshStatus();
        });

        socketInstance.on('statusUpdate', (updatedStatus: SystemStatus) => {
          if (updatedStatus?.database && updatedStatus?.opcua && updatedStatus?.overall) {
            set({
              status: updatedStatus,
              lastChecked: new Date(updatedStatus.lastUpdated || Date.now()),
              isError: updatedStatus.overall.status === 'ERROR',
              isConnected: updatedStatus.overall.status === 'CONNECTED',
              statusText: updatedStatus.overall.statusText || 'Unknown',
            });
          }
        });

        set({ socket: socketInstance });
        setupPolling();
      } catch (error) {
        console.error('[StatusStore] Error creating WebSocket:', error);
        refreshStatus();
        setupPolling();
      }
    },

    cleanup: () => {
      if (cleanupNotificationListeners) {
        cleanupNotificationListeners();
        cleanupNotificationListeners = null;
      }
      if (socketInstance) {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('connect_error');
        socketInstance.off('statusUpdate');
        socketInstance.disconnect();
        socketInstance = null;
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      set({ socketConnected: false, socket: null });
    },
  };
});
