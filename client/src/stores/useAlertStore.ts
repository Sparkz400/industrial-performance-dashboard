import { create } from 'zustand';
import type { AlertNotification } from '@performance-dashboard/shared';

interface AlertState {
  activeAlerts: AlertNotification[];
  unreadCount: number;
  addAlert: (alert: AlertNotification) => void;
  markAllRead: () => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  activeAlerts: [],
  unreadCount: 0,
  addAlert: (alert) =>
    set((state) => ({
      activeAlerts: [alert, ...state.activeAlerts].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    })),
  markAllRead: () => set({ unreadCount: 0 }),
  clearAlerts: () => set({ activeAlerts: [], unreadCount: 0 }),
}));
