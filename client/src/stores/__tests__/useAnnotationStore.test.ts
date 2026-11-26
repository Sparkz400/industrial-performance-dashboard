import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/utils/protectedFetch', () => ({ protectedFetch: vi.fn() }));
import { protectedFetch } from '@/utils/protectedFetch';
import { useAnnotationStore } from '../useAnnotationStore';

const reply = (status: number, body: unknown = {}) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  vi.resetAllMocks();
  useAnnotationStore.setState({ annotations: [], loading: false, dashboardId: null });
});

it('loads a dashboard and saves new notes to it through the CSRF-protected fetch', async () => {
  vi.mocked(protectedFetch).mockResolvedValueOnce(
    reply(200, [
      {
        id: 'a1',
        widgetId: 'w1',
        text: 'Old',
        timestamp: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]),
  );
  await useAnnotationStore.getState().loadAnnotations('dash-1');
  expect(useAnnotationStore.getState().annotations.map((a) => a.id)).toEqual(['a1']);

  vi.mocked(protectedFetch).mockResolvedValueOnce(reply(201));
  expect(await useAnnotationStore.getState().addAnnotation('w1', 'New', new Date())).toBe(true);
  const [, init] = vi.mocked(protectedFetch).mock.calls[1];
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body)).dashboardId).toBe('dash-1');
  expect(useAnnotationStore.getState().annotations).toHaveLength(2);
});

it('rolls back and reports failure when the server refuses a change', async () => {
  useAnnotationStore.setState({ dashboardId: 'dash-1' });
  vi.mocked(protectedFetch).mockResolvedValueOnce(reply(403));
  expect(await useAnnotationStore.getState().addAnnotation('w1', 'New', new Date())).toBe(false);
  expect(useAnnotationStore.getState().annotations).toEqual([]);
});

it('ignores a slow load for a dashboard the user already left', async () => {
  let finish!: (r: Response) => void;
  vi.mocked(protectedFetch)
    .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    .mockResolvedValueOnce(reply(200, []));
  const slow = useAnnotationStore.getState().loadAnnotations('dash-1');
  await useAnnotationStore.getState().loadAnnotations('dash-2');
  finish(reply(200, [{ id: 'stale', widgetId: 'w', text: '', timestamp: '', createdAt: '' }]));
  await slow;
  expect(useAnnotationStore.getState().annotations).toEqual([]);
});
