/**
 * QueryClient — globalna konfiguracja React Query (Phase 3 Punkt 3).
 *
 * Cache strategy:
 *  - Catalogi (immutable, version-tagged): staleTime: Infinity, gcTime: 1h.
 *  - DER state (mutable): staleTime: 30s (stale-while-revalidate), gcTime: 5min.
 *  - Mutations: invalidate on success.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Domyslnie stale-while-revalidate przez 30s (pasuje do DER state).
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Klucze zapytan dla audytu 2 (deterministyczne, hierarchiczne). */
export const audit2QueryKeys = {
  all: ['audit2'] as const,
  catalogSnapshot: () => [...audit2QueryKeys.all, 'catalog-snapshot'] as const,
  stationConfig: (projectId: string, stationId: string) =>
    [...audit2QueryKeys.all, 'station-config', projectId, stationId] as const,
  stationConfigList: (projectId: string) =>
    [...audit2QueryKeys.all, 'station-config-list', projectId] as const,
};
