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
  projectProofPack: (projectId: string) =>
    [...audit2QueryKeys.all, 'project-proof-pack', projectId] as const,
  // Karta UX-04/POLE-ZU: uziemienie sieci SN stacji z modelu — klucz niesie rewizję modelu,
  // więc każda zmiana modelu (np. nowy zespół uziemiający) odczytuje stan na nowo.
  uziemienieSn: (projectId: string, stationId: string, rewizja: number | null) =>
    [...audit2QueryKeys.all, 'uziemienie-sn', projectId, stationId, rewizja] as const,
};
