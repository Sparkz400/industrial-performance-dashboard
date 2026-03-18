import { create } from 'zustand';
import type { Notification } from '../types';
import type { Socket } from 'socket.io-client';
import type {
  AlarmEvent,
  MachineStatusUpdate,
  SystemStatus,
  CertificateNotification,
  SpcAlertEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  NotificationSeverity,
} from '@performance-dashboard/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  setOpen: (open: boolean) => void;
  initSocketListeners: (socket: TypedSocket) => () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: 'notif-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      read: false,
    };
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    set((state) => {
      const wasUnread = state.notifications.find((n) => n.id === id && !n.read);
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: wasUnread ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  removeNotification: (id) => {
    set((state) => {
      const removed = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: removed && !removed.read ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  togglePanel: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  setOpen: (open) => {
    set({ isOpen: open });
  },

  initSocketListeners: (socket: TypedSocket) => {
    const addNotif = useNotificationStore.getState().addNotification;

    const onAlarmTriggered = (alarm: AlarmEvent) => {
      addNotif({
        type: 'alarm',
        severity: (alarm.severity as NotificationSeverity) ?? 'medium',
        title: `Alarm: ${alarm.source}`,
        message: alarm.message,
        timestamp: new Date(alarm.triggeredAt),
        source: alarm.nodeKey,
      });
    };

    const onMachineStatusUpdate = (data: MachineStatusUpdate) => {
      const isDown = data.status === 'disconnected' || data.status === 'error';
      if (isDown) {
        addNotif({
          type: 'status',
          severity: 'high',
          title: `Machine ${data.machineId} ${data.status}`,
          message: `Machine ${data.machineId} is now ${data.status}`,
          timestamp: new Date(),
          source: `Machine ${data.machineId}`,
        });
      }
    };

    let lastOverallStatus: string | undefined;
    const onStatusUpdate = (status: SystemStatus) => {
      const current = status.overall?.status;
      if (
        lastOverallStatus &&
        lastOverallStatus !== current &&
        (current === 'DISCONNECTED' || current === 'ERROR' || current === 'WARNING')
      ) {
        addNotif({
          type: 'system',
          severity: current === 'ERROR' ? 'critical' : 'medium',
          title: `System status: ${status.overall?.statusText ?? current}`,
          message: `System health changed to ${current}`,
          timestamp: new Date(),
          source: 'System',
        });
      }
      lastOverallStatus = current;
    };

    const onUntrustedCertificate = (data: CertificateNotification) => {
      addNotif({
        type: 'system',
        severity: 'high',
        title: 'Untrusted Certificate',
        message: `Untrusted certificate from ${data.serverUri ?? data.filename}`,
        timestamp: new Date(data.timestamp),
        source: 'Certificate Manager',
      });
    };

    const onSpcAlert = (data: SpcAlertEvent) => {
      addNotif({
        type: 'alarm',
        severity: (data.severity as NotificationSeverity) ?? 'medium',
        title: `SPC Alert: ${data.alertType}`,
        message: data.message,
        timestamp: new Date(data.createdAt),
        source: data.nodeKey,
      });
    };

    socket.on('alarmTriggered', onAlarmTriggered);
    socket.on('machineStatusUpdate', onMachineStatusUpdate);
    socket.on('statusUpdate', onStatusUpdate);
    socket.on('untrustedCertificate', onUntrustedCertificate);
    socket.on('spcAlert', onSpcAlert);

    return () => {
      socket.off('alarmTriggered', onAlarmTriggered);
      socket.off('machineStatusUpdate', onMachineStatusUpdate);
      socket.off('statusUpdate', onStatusUpdate);
      socket.off('untrustedCertificate', onUntrustedCertificate);
      socket.off('spcAlert', onSpcAlert);
    };
  },
}));
