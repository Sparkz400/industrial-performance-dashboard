import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@performance-dashboard/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SpcState {
  activeAlertCount: number;
  incrementAlertCount: () => void;
  decrementAlertCount: () => void;
  setAlertCount: (count: number) => void;
  initSocketListeners: (socket: TypedSocket) => () => void;
}

export const useSpcStore = create<SpcState>((set) => ({
  activeAlertCount: 0,
  incrementAlertCount: () => set((state) => ({ activeAlertCount: state.activeAlertCount + 1 })),
  decrementAlertCount: () =>
    set((state) => ({ activeAlertCount: Math.max(0, state.activeAlertCount - 1) })),
  setAlertCount: (count) => set({ activeAlertCount: count }),
  initSocketListeners: (socket: TypedSocket) => {
    const onSpcAlert = () => {
      set((state) => ({ activeAlertCount: state.activeAlertCount + 1 }));
    };
    socket.on('spcAlert', onSpcAlert);
    return () => {
      socket.off('spcAlert', onSpcAlert);
    };
  },
}));
