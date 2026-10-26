import React, { useState, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTrpcClient } from '../utils/trpc';
import { useAuthStore } from '../stores/useAuthStore';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  });

export const QueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const identity = useAuthStore((state) =>
    state.user ? `${state.user.id}:${state.user.role}` : 'signed-out',
  );
  // Account changes must replace the cache even when query keys are identical.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryClient = useMemo(() => createQueryClient(), [identity]);
  useEffect(() => () => queryClient.clear(), [queryClient]);
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
};

export default QueryProvider;
