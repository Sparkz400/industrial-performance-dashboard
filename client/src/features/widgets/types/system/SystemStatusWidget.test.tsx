import React from 'react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ user: { role: 'admin' } }) },
}));
import { useStatusStore } from '@/stores/useStatusStore';
import SystemStatusWidget from './SystemStatusWidget';
const healthy = {
  database: { status: 'CONNECTED' },
  opcua: { status: 'CONNECTED' },
  overall: { status: 'CONNECTED' },
};
beforeEach(() => {
  vi.useFakeTimers();
  useStatusStore.setState({
    status: healthy as never,
    isError: false,
    isConnected: true,
    lastChecked: new Date(),
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('expires an old healthy observation without claiming the system remains operational', () => {
  render(<SystemStatusWidget config={{ showDetails: false }} />);
  expect(screen.getByText('All systems operational')).toBeVisible();
  act(() => vi.advanceTimersByTime(95000));
  expect(screen.queryByText('All systems operational')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('unknown');
});
it('clears prior healthy status when a status request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await useStatusStore.getState().refreshStatus();
  expect(useStatusStore.getState().isConnected).toBe(false);
  expect(useStatusStore.getState().status.overall.status).toBe('UNKNOWN');
});
it('does not republish a pending administrator response after cleanup', async () => {
  let resolveResponse!: (response: unknown) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    ),
  );
  const pending = useStatusStore.getState().refreshStatus();
  useStatusStore.getState().cleanup();
  resolveResponse({
    ok: true,
    json: async () => ({ ...healthy, lastUpdated: new Date().toISOString() }),
  });
  await pending;
  expect(useStatusStore.getState().isConnected).toBe(false);
  expect(useStatusStore.getState().status.overall.status).toBe('UNKNOWN');
});

it('keeps a fresh known service failure distinct from missing observation', () => {
  useStatusStore.setState({
    status: { ...healthy, database: { status: 'ERROR' }, overall: { status: 'ERROR' } } as never,
    isError: true,
    isConnected: false,
  });
  render(<SystemStatusWidget config={{ showDetails: false }} />);
  expect(screen.getByText('System experiencing issues')).toBeVisible();
  expect(screen.queryByText(/Current system status unknown/)).toBeNull();
});
it('does not present an unobserved collector as a connected system', () => {
  useStatusStore.setState({
    status: { ...healthy, opcua: { status: 'UNKNOWN' } } as never,
    isConnected: false,
  });
  render(<SystemStatusWidget config={{ showDetails: false }} />);
  expect(screen.getByRole('status')).toHaveTextContent('unknown');
});
