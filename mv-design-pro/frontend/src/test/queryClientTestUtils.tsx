/**
 * Test utilities for React Query.
 *
 * Wraps tested components with QueryClientProvider so hooks like
 * useKatalogiStacjiSnapshot, useGeneratePakietRozszerzenProjektu work in vitest.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

/** Pusty pakiet dowodów projektu (`POST …/stations/_validate-all`). */
const PUSTY_PAKIET_ROZSZERZEN_PROJEKTU = {
  project_id: 'stub',
  all_pass: true,
  station_count: 0,
  per_station: [],
};

/** Pusty snapshot katalogów konfiguracji stacji (`GET …/konfiguracja-stacji/snapshot`). */
const PUSTY_SNAPSHOT_KATALOGOW_STACJI = {
  bess_operation_modes: [],
  tap_changers: [],
  hv_fuses: [],
  pf_curves: [],
  block_transformers: [],
};

/** Odpowiedź zaślepki dla adresów katalogów stacji i pakietu rozszerzeń; `null` — inny adres. */
function odpowiedzKatalogowStacji(urlStr: string): Promise<unknown> | null {
  if (urlStr.includes('konfiguracja-stacji/snapshot')) {
    return Promise.resolve({ ok: true, json: async () => PUSTY_SNAPSHOT_KATALOGOW_STACJI });
  }
  if (urlStr.endsWith('/stations/_validate-all')) {
    return Promise.resolve({ ok: true, json: async () => PUSTY_PAKIET_ROZSZERZEN_PROJEKTU });
  }
  if (urlStr.includes('/catalog/konfiguracja-stacji/')) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  }
  return null;
}

/** Zaślepka `global.fetch` dla katalogów stacji i pakietu rozszerzeń (pozostałe: 200 `{}`). */
export function stubKatalogiStacjiFetch(): void {
  const stub = vi.fn().mockImplementation((url: string | URL) => {
    return (
      odpowiedzKatalogowStacji(url.toString())
      ?? Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    );
  });
  global.fetch = stub as unknown as typeof fetch;
}

/**
 * Render z QueryClient. Jesli istnieje juz globalny fetch mock (np. test
 * uzywa vi.stubGlobal), augmentujemy go — przepuszczamy nieznane URL-e do
 * istniejacego mocka, adresy katalogow stacji obslugujemy lokalnie.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: RenderOptions,
): ReturnType<typeof rtlRender> {
  const existingFetch = global.fetch;
  global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const lokalna = odpowiedzKatalogowStacji(url.toString());
    if (lokalna) return lokalna;
    // Nieznane URL-e: deleguj do istniejacego fetch (jesli test go ustawil).
    if (typeof existingFetch === 'function') {
      return (existingFetch as typeof fetch)(url, init);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as unknown as typeof fetch;
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  // Dostawca jako `wrapper` RTL, nie ręczne opakowanie `ui`: tylko wtedy
  // `rerender(<Inny />)` zwrócony przez render trzyma ten sam QueryClient.
  // Ręczne `<Provider>{ui}</Provider>` gubiło dostawcę przy pierwszym
  // `rerender` (etap10-acceptance H: PV → BESS → FW na jednym korzeniu) —
  // komponent czytający snapshot katalogów stacji przez React Query padał z
  // „No QueryClient set”. Zewnętrzny `options.wrapper` jest zachowany
  // (składany wewnątrz dostawcy).
  const ZewnetrznyWrapper = options?.wrapper;
  const Wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={qc}>
      {ZewnetrznyWrapper ? <ZewnetrznyWrapper>{children}</ZewnetrznyWrapper> : children}
    </QueryClientProvider>
  );
  return rtlRender(ui, { ...options, wrapper: Wrapper });
}
