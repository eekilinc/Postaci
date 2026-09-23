// src/query/client.ts — TanStack Query istemcisi (tekil)
// Masaüstü uygulaması için ayarlı: pencere odağı yenilemesi kapalı,
// yerel IPC okumaları hızlı olduğu için kısa staleTime.
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
