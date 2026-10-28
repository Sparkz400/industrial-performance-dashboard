import { usePlantStore } from './usePlantStore';
import { create } from 'zustand';
import io, { type Socket } from 'socket.io-client';
import type { SystemStatus, ServerToClientEvents, ClientToServerEvents } from '../types';
import { API_ENDPOINTS, WEBSOCKET_ADDR } from '../config/config';
import { getStoredCsrfToken } from '../utils/csrf';
import { useNotificationStore } from './useNotificationStore';
import { useSpcStore } from './useSpcStore';
import { useAuthStore } from './useAuthStore';

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
  let cleanupSpcListeners: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1000;
  let authenticationRejected = false;

  const stopRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const rejectAuthentication = () => {
    if (authenticationRejected) return;
    authenticationRejected = true;
    stopRetry();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  };
  const retry = () => {
    if (retryTimer || authenticationRejected || !socketInstance || socketInstance.active) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      socketInstance?.connect();
    }, retryDelay);
    retryDelay = Math.min(30000, retryDelay * 2);
  };

  const refreshStatus = async () => {
    if (useAuthStore.getState().user?.role !== 'admin') return;
    if (isPolling) return;
    isPolling = true;
    try {
      const res = await fetch(API_ENDPOINTS.status, { credentials: 'include' });
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
      authenticationRejected = false;
      retryDelay = 1000;

      const token = getStoredCsrfToken();
      try {
        socketInstance = io(WEBSOCKET_ADDR, {
          reconnectionDelay: 3000,
          reconnectionDelayMax: 30000,
          transports: ['websocket'],
          withCredentials: true,
          auth: { token: token || undefined },
        });

        socketInstance.on('connect', () => {
          stopRetry();
          retryDelay = 1000;
          set({ socketConnected: true, socket: socketInstance });
          setupPolling();

          // Wire up notification listeners on connect
          if (socketInstance && !cleanupNotificationListeners) {
            cleanupNotificationListeners = useNotificationStore
              .getState()
              .initSocketListeners(socketInstance);
          }
          // Wire up SPC alert count listeners on connect
          if (socketInstance && !cleanupSpcListeners) {
            cleanupSpcListeners = useSpcStore.getState().initSocketListeners(socketInstance);
          }
        });

        socketInstance.on('disconnect', (reason) => {
          set({
            socketConnected: false,
            isConnected: false,
            status: defaultStatus,
            statusText: 'Unknown',
          });
          if (reason === 'io server disconnect') retry();
          setupPolling();
          refreshStatus();
        });

        socketInstance.on('sessionStatus', (status) => {
          if (status === 'revoked') rejectAuthentication();
        });

        socketInstance.on('connect_error', (error) => {
          set({ socketConnected: false });
          if (error.data?.code === 'AUTH_REQUIRED' || /^Authentication/.test(error.message)) {
            rejectAuthentication();
            return;
          }
          retry();
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
      stopRetry();
      if (cleanupNotificationListeners) {
        cleanupNotificationListeners();
        cleanupNotificationListeners = null;
      }
      if (cleanupSpcListeners) {
        cleanupSpcListeners();
        cleanupSpcListeners = null;
      }
      if (socketInstance) {
        socketInstance.off('connect');
        socketInstance.off('disconnect');
        socketInstance.off('connect_error');
        socketInstance.off('statusUpdate');
        socketInstance.off('sessionStatus');
        socketInstance.disconnect();
        socketInstance = null;
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
      usePlantStore.setState({ plants: [], currentPlant: null });
      useSpcStore.getState().setAlertCount(0);
      useNotificationStore.getState().clearAll();
      set({
        socketConnected: false,
        socket: null,
        status: defaultStatus,
        lastChecked: null,
        isError: false,
        isConnected: false,
        statusText: 'Unknown',
      });
    },
  };
});
