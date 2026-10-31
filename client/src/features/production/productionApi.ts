import { API_BASE_URL } from '@/config/config';
import protectedFetch from '@/utils/protectedFetch';

/**
 *
 * @param path
 * @param body
 */
export async function productionRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await protectedFetch(
    `${API_BASE_URL}/production${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? 'Request failed');
  return data;
}
/**
 *
 * @param value
 * @param name
 */
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
