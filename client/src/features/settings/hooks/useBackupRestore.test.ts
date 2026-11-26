import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
const snackbar = vi.hoisted(() => vi.fn());
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: snackbar }) }));
vi.mock('@/utils/api', () => ({
  default: { post: vi.fn(), endpoints: { getDashboards: vi.fn() } },
}));
import api from '@/utils/api';
import { useBackupRestore } from './useBackupRestore';

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

it('exports the dashboards stored on the server', async () => {
  vi.mocked(api.endpoints.getDashboards).mockResolvedValue([{ id: 'd1', name: 'Line 1' }]);
  const { result } = renderHook(() => useBackupRestore());
  await act(() => result.current.handleExportDashboards());
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  expect(JSON.parse(await blob.text())).toEqual({ dashboards: [{ id: 'd1', name: 'Line 1' }] });
  expect(snackbar).toHaveBeenCalledWith('Exported 1 dashboards', { variant: 'success' });
});

it('imports each dashboard as a new copy through the import endpoint', async () => {
  vi.mocked(api.post).mockResolvedValue({});
  const { result } = renderHook(() => useBackupRestore());
  const file = new File(
    [
      JSON.stringify({
        dashboards: [
          { id: 'd1', name: 'A', widgets: [], layout: [] },
          { id: 'd2', name: 'B' },
        ],
      }),
    ],
    'backup.json',
  );
  act(() => result.current.handleFileSelected({ target: { files: [file] } } as never));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(vi.mocked(api.post).mock.calls.map((c) => c[0])).toEqual([
    expect.stringMatching(/\/dashboards\/import$/),
    expect.stringMatching(/\/dashboards\/import$/),
  ]);
  expect(vi.mocked(api.post).mock.calls[1][1]).toEqual({ name: 'B', widgets: [], layout: [] });
  expect(snackbar).toHaveBeenCalledWith('Imported 2 dashboards as new copies', {
    variant: 'success',
  });
});
