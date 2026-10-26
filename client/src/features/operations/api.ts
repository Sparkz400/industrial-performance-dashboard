import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';
/**
 *
 * @param path
 * @param method
 * @param body
 */
export function operationRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<T> {
  return (
    method === 'GET'
      ? api.get(API_BASE_URL + path)
      : method === 'POST'
        ? api.post(API_BASE_URL + path, body)
        : api.put(API_BASE_URL + path, body)
  ) as Promise<T>;
}
export const localInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const toIso = (value: string) => new Date(value).toISOString();
