import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const socket = vi.hoisted(() => ({
  active: false,
  handlers: new Map<string, (...args: unknown[]) => void>(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock('socket.io-client', () => ({ default: vi.fn(() => socket) }));
vi.mock('../useAuthStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'supervisor' } }) },
}));
vi.mock('../usePlantStore', () => ({ usePlantStore: { setState: vi.fn() } }));
vi.mock('../useNotificationStore', () => ({
  useNotificationStore: {
    getState: () => ({ initSocketListeners: () => vi.fn(), clearAll: vi.fn() }),
  },
}));
vi.mock('../useSpcStore', () => ({
  useSpcStore: { getState: () => ({ initSocketListeners: () => vi.fn(), setAlertCount: vi.fn() }) },
}));
vi.mock('../../utils/csrf', () => ({ getStoredCsrfToken: () => null }));
import { useStatusStore } from '../useStatusStore';

const unauthorized = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  socket.handlers.clear();
  socket.active = false;
  socket.on.mockImplementation((name: string, callback: (...args: unknown[]) => void) =>
    socket.handlers.set(name, callback),
  );
  window.addEventListener('auth:unauthorized', unauthorized);
  useStatusStore.getState().initSocket();
});
afterEach(() => {
  useStatusStore.getState().cleanup();
  window.removeEventListener('auth:unauthorized', unauthorized);
  vi.useRealTimers();
});
it('keeps login through unavailable sessions and backs off reconnects to at most one per 30 seconds', () => {
  socket.handlers.get('sessionStatus')!('unavailable');
  socket.handlers.get('disconnect')!('io server disconnect');
  expect(unauthorized).not.toHaveBeenCalled();
  expect(useStatusStore.getState().socketConnected).toBe(false);
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const count = socket.connect.mock.calls.length;
    vi.advanceTimersByTime(delay - 1);
    expect(socket.connect).toHaveBeenCalledTimes(count);
    vi.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(count + 1);
    socket.handlers.get('connect_error')!(
      Object.assign(new Error('Session service unavailable'), {
        data: { code: 'SESSION_UNAVAILABLE' },
      }),
    );
  }
  expect(unauthorized).not.toHaveBeenCalled();
  socket.handlers.get('connect')!();
  const count = socket.connect.mock.calls.length;
  vi.advanceTimersByTime(60000);
  expect(socket.connect).toHaveBeenCalledTimes(count);
  expect(useStatusStore.getState().socketConnected).toBe(true);
});
it('immediately rejects explicit revoked sessions and never reconnects them', () => {
  socket.handlers.get('sessionStatus')!('revoked');
  socket.handlers.get('disconnect')!('io server disconnect');
  vi.advanceTimersByTime(60000);
  expect(unauthorized).toHaveBeenCalledTimes(1);
  expect(socket.connect).not.toHaveBeenCalled();
});
it('distinguishes authentication refusal from transport failures', () => {
  socket.active = true;
  socket.handlers.get('connect_error')!(new Error('transport error'));
  vi.advanceTimersByTime(60000);
  expect(socket.connect).not.toHaveBeenCalled();
  expect(unauthorized).not.toHaveBeenCalled();
  socket.active = false;
  socket.handlers.get('connect_error')!(
    Object.assign(new Error('Authentication required'), { data: { code: 'AUTH_REQUIRED' } }),
  );
  expect(unauthorized).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60000);
  expect(socket.connect).not.toHaveBeenCalled();
});
it('cancels a pending retry when the account is cleaned up', () => {
  socket.handlers.get('disconnect')!('io server disconnect');
  useStatusStore.getState().cleanup();
  vi.advanceTimersByTime(60000);
  expect(socket.connect).not.toHaveBeenCalled();
  expect(socket.off).toHaveBeenCalledWith('sessionStatus');
});
