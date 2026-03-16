import { create } from 'zustand';

interface SpcState {
  activeAlertCount: number;
  incrementAlertCount: () => void;
  decrementAlertCount: () => void;
  setAlertCount: (count: number) => void;
}

export const useSpcStore = create<SpcState>((set) => ({
  activeAlertCount: 0,
  incrementAlertCount: () => set((state) => ({ activeAlertCount: state.activeAlertCount + 1 })),
  decrementAlertCount: () =>
    set((state) => ({ activeAlertCount: Math.max(0, state.activeAlertCount - 1) })),
  setAlertCount: (count) => set({ activeAlertCount: count }),
}));
