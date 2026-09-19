/**
 * Test utilities for React Query (Phase 8 backend integration).
 *
 * Wraps tested components with QueryClientProvider so hooks like
 * useStationAudit2Config, useGenerateAudit2ProofPack work in vitest.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

const EMPTY_AUDIT2_SNAPSHOT = {
  bess_operation_modes: [],
  tap_changers: [],
  hv_fuses: [],
  device_withstand: [],
  pf_curves: [],
  block_transformers: [],
  mv_neutral_groundings: [],
};

/**
 * Stub global.fetch for audit2 endpoints. Returns 404 for station-config GET
 * (so hook returns null) and empty snapshot for catalog snapshot.
 */
export function stubAudit2Fetch(): void {
  const stub = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr.includes('audit2/snapshot')) {
      return Promise.resolve({
        ok: true,
        json: async () => EMPTY_AUDIT2_SNAPSHOT,
      });
    }
    // GET list /audit2-station-config (no station_id) -> empty array.
    // Pattern: /api/v1/projects/{pid}/audit2-station-config (no trailing /<sid>)
    const matchListEnd = urlStr.match(/\/audit2-station-config\/?$/);
    if (matchListEnd && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    // GET specific station -> 404 (hook returns null).
    if (urlStr.includes('audit2-station-config') && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    }
    // PUT/POST/DELETE -> success no-op.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });
  global.fetch = stub as unknown as typeof fetch;
}

/**
 * Render z QueryClient. Jesli istnieje juz globalny fetch mock (np. test
 * uzywa vi.stubGlobal), augmentujemy go — przepuszczamy nieznane URL-e do
 * istniejacego mocka, audit2-specific URL-e obslugujemy lokalnie.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: RenderOptions,
): ReturnType<typeof rtlRender> {
  const existingFetch = global.fetch;
  // Augment: dla audit2 URL-i zwroc empty/404, dla reszty deleguj do istniejacego.
  global.fetch = vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr.includes('audit2/snapshot')) {
      return Promise.resolve({ ok: true, json: async () => EMPTY_AUDIT2_SNAPSHOT });
    }
    const matchListEnd = urlStr.match(/\/audit2-station-config\/?$/);
    const isGet = !init || init.method === undefined || init.method === 'GET';
    if (matchListEnd && isGet) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (urlStr.includes('audit2-station-config') && isGet) {
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    }
    if (urlStr.includes('audit2/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }
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
  // komponent czytający snapshot audytu 2 przez React Query padał z
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
