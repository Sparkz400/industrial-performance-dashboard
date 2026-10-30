import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOpcUaConnection } from './useOpcUaConnection';

vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: notify }) }));
const notify = vi.fn();
afterEach(() => vi.unstubAllGlobals());

it('keeps an unobserved or failed gateway check unknown instead of disconnected', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ connected: false })));
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => useOpcUaConnection());
  expect(result.current.opcuaConnected).toBeNull();
  await waitFor(() => expect(result.current.opcuaConnected).toBe(false));
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 }),
  );
  await act(() => result.current.fetchConnectionStatus());
  expect(result.current.opcuaConnected).toBeNull();
});
