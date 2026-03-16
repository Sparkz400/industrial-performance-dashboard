import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../server/src/trpc/index.js';
import { API_BASE_URL } from '@/config/config';

export const trpc = createTRPCReact<AppRouter>();

/**
 *
 */
export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL.replace('/api/v1', '')}/api/trpc`,
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
  });
}
