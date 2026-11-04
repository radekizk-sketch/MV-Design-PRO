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

/**
 * Klucze zapytań katalogów konfiguracji stacji i odczytów stacji z modelu (deterministyczne,
 * hierarchiczne). Karta JEDNA-SCIEZKA-EDYCJI: bez kluczy zapisanej konfiguracji stacji —
 * dane stacji żyją w modelu, a jego zmiany niesie rewizja migawki.
 */
export const katalogiStacjiQueryKeys = {
  all: ['katalogi-stacji'] as const,
  catalogSnapshot: () => [...katalogiStacjiQueryKeys.all, 'catalog-snapshot'] as const,
  projectProofPack: (projectId: string) =>
    [...katalogiStacjiQueryKeys.all, 'project-proof-pack', projectId] as const,
  // Karta UX-04/POLE-ZU: uziemienie sieci SN stacji z modelu — klucz niesie rewizję modelu,
  // więc każda zmiana modelu (np. nowy zespół uziemiający) odczytuje stan na nowo.
  uziemienieSn: (projectId: string, stationId: string, rewizja: number | null) =>
    [...katalogiStacjiQueryKeys.all, 'uziemienie-sn', projectId, stationId, rewizja] as const,
};
