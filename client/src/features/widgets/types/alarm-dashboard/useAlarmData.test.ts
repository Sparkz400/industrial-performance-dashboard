import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
const snackbar = vi.hoisted(() => vi.fn());
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: snackbar }) }));
vi.mock('@/utils/protectedFetch', () => ({ protectedFetch: vi.fn() }));
import { protectedFetch } from '@/utils/protectedFetch';
import { useAlarmData } from './useAlarmData';

const alarm = { id: 4, status: 'active', severity: 'high', message: 'Hot' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [alarm] })),
  );
});

it('acknowledges through the CSRF-protected fetch and updates the row', async () => {
  vi.mocked(protectedFetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ alarm: { ...alarm, status: 'acknowledged' } }),
  } as Response);
  const { result } = renderHook(() => useAlarmData());
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  await act(async () => result.current.acknowledgeAlarm(4));
  expect(vi.mocked(protectedFetch).mock.calls[0][1]?.method).toBe('POST');
  expect(result.current.data[0].status).toBe('acknowledged');
  expect(snackbar).not.toHaveBeenCalled();
});

it('tells the operator when the acknowledgement is refused', async () => {
  vi.mocked(protectedFetch).mockResolvedValue({ ok: false, status: 403 } as Response);
  const { result } = renderHook(() => useAlarmData());
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  await act(async () => result.current.acknowledgeAlarm(4));
  expect(result.current.data[0].status).toBe('active');
  expect(snackbar).toHaveBeenCalledWith(expect.any(String), { variant: 'error' });
});
