/**
 * Hooki React Query katalogów stacji i odczytów stacji z modelu.
 *
 * Pokrywają: snapshot katalogów (pamięć bez wygasania), pakiet rozszerzeń projektu
 * (odczyt z modelu przy każdym wejściu, wynik przycisku w tej samej pamięci), uziemienie SN
 * z rewizją modelu w kluczu (zmiana modelu = nowy odczyt) i nieobecność dawnych hooków
 * zapisanej konfiguracji stacji (karta JEDNA-SCIEZKA-EDYCJI).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { katalogiStacjiQueryKeys } from '../../../../query-client';
import * as hooki from '../katalogi-stacji-hooks';
import {
  useGeneratePakietRozszerzenProjektu,
  useKatalogiStacjiSnapshot,
  useUziemienieSnStacji,
} from '../katalogi-stacji-hooks';

const originalFetch = global.fetch;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function ok(json: unknown) {
  return { ok: true, json: async () => json };
}

describe('hooki katalogów stacji i odczytów stacji z modelu', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('useKatalogiStacjiSnapshot pobiera snapshot z backendu raz na sesję', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok({ bess_operation_modes: [], tap_changers: [], hv_fuses: [], pf_curves: [], block_transformers: [] }),
    );
    const { wrapper } = makeWrapper();
    const pierwszy = renderHook(() => useKatalogiStacjiSnapshot(), { wrapper });
    await waitFor(() => expect(pierwszy.result.current.isSuccess).toBe(true));
    const drugi = renderHook(() => useKatalogiStacjiSnapshot(), { wrapper });
    await waitFor(() => expect(drugi.result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/catalog/konfiguracja-stacji/snapshot');
  });

  it('pakiet rozszerzeń z przycisku trafia do pamięci zapytania pakietu projektu', async () => {
    const pakiet = { project_id: 'p-1', all_pass: true, station_count: 0, per_station: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(ok(pakiet));
    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useGeneratePakietRozszerzenProjektu(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p-1');
    });
    expect(qc.getQueryData(katalogiStacjiQueryKeys.projectProofPack('p-1'))).toEqual(pakiet);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/projects/p-1/stations/_validate-all',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uziemienie SN: nowa rewizja modelu = nowy odczyt; bez projektu — brak zapytania', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok({ station_id: 'st', sekcje: [], przyczyna_braku: null, pola: [] }),
    );
    const { wrapper } = makeWrapper();
    const { rerender, result } = renderHook(
      ({ rewizja, projekt }: { rewizja: number; projekt: string | null }) =>
        useUziemienieSnStacji(projekt, 'st', rewizja),
      { wrapper, initialProps: { rewizja: 1, projekt: null as string | null } },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(global.fetch).not.toHaveBeenCalled();
    rerender({ rewizja: 1, projekt: 'p-1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ rewizja: 2, projekt: 'p-1' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('dawne hooki zapisanej konfiguracji stacji i rozpływu „rozszerzonego" nie istnieją', () => {
    const nazwy = Object.keys(hooki);
    for (const skasowany of [
      'useRunExtendedPowerFlow',
    ]) {
      expect(nazwy).not.toContain(skasowany);
    }
  });
});
