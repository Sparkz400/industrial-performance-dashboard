import { create } from 'zustand';
import type { Notification } from '../types';

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
}

// Generate initial demo notifications
const demoNotifications: Notification[] = [
  {
    id: 'notif-1',
    type: 'alarm',
    severity: 'high',
    title: 'High Air Pressure',
    message: 'Air pressure exceeded threshold at Line A',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    read: false,
    source: 'Compressor Unit 1',
  },
  {
    id: 'notif-2',
    type: 'status',
    severity: 'info',
    title: 'System Connected',
    message: 'OPC UA server connection established successfully',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    read: true,
    source: 'System',
  },
  {
    id: 'notif-3',
    type: 'system',
    severity: 'medium',
    title: 'Database Latency',
    message: 'Database response time above 200ms',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    read: false,
    source: 'Database Monitor',
  },
];

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: demoNotifications,
  unreadCount: demoNotifications.filter((n) => !n.read).length,
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
}));
