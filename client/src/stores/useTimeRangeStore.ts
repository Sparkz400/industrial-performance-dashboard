import { create } from 'zustand';
import { subHours, subDays } from 'date-fns';
import type { TimeRange, TimeRangePreset } from '../types';

interface TimeRangeState {
  timeRange: TimeRange;
  autoRefresh: boolean;
  refreshInterval: number; // ms
  lastRefresh: Date;
  // Actions
  setPreset: (preset: TimeRangePreset) => void;
  setCustomRange: (start: Date, end: Date) => void;
  toggleAutoRefresh: () => void;
  setRefreshInterval: (ms: number) => void;
  triggerRefresh: () => void;
}

const getRange = (preset: TimeRangePreset): { start: Date; end: Date; label: string } => {
  const now = new Date();
  switch (preset) {
    case '1h':
      return { start: subHours(now, 1), end: now, label: 'Last 1 hour' };
    case '6h':
      return { start: subHours(now, 6), end: now, label: 'Last 6 hours' };
    case '24h':
      return { start: subHours(now, 24), end: now, label: 'Last 24 hours' };
    case '7d':
      return { start: subDays(now, 7), end: now, label: 'Last 7 days' };
    case '30d':
      return { start: subDays(now, 30), end: now, label: 'Last 30 days' };
    default:
      return { start: subHours(now, 24), end: now, label: 'Last 24 hours' };
  }
};

const defaultRange = getRange('24h');

export const useTimeRangeStore = create<TimeRangeState>((set, get) => ({
  timeRange: { preset: '24h', ...defaultRange },
  autoRefresh: true,
  refreshInterval: 30000,
  lastRefresh: new Date(),

  setPreset: (preset) => {
    const range = getRange(preset);
    set({
      timeRange: { preset, ...range },
      lastRefresh: new Date(),
    });
  },

  setCustomRange: (start, end) => {
    set({
      timeRange: {
        preset: 'custom',
        start,
        end,
        label: `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`,
      },
      lastRefresh: new Date(),
    });
  },

  toggleAutoRefresh: () => {
    set((state) => ({ autoRefresh: !state.autoRefresh }));
  },

  setRefreshInterval: (ms) => {
    set({ refreshInterval: ms });
  },

  triggerRefresh: () => {
    const { timeRange } = get();
    if (timeRange.preset !== 'custom') {
      const range = getRange(timeRange.preset);
      set({ timeRange: { ...timeRange, ...range }, lastRefresh: new Date() });
    } else {
      set({ lastRefresh: new Date() });
    }
  },
}));
