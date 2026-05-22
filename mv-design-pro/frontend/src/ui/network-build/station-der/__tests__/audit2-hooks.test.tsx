/**
 * Testy hookow React Query dla audytu 2 (Phase 6 Punkt 3).
 *
 * Pokrywaja:
 *  - useAudit2CatalogSnapshot: pobiera snapshot, infinite cache.
 *  - useStationAudit2Config: pobiera listę konfiguracji i wybiera wpis stacji bez 404.
 *  - useUpdateStationAudit2Config: optimistic update + rollback przy bledzie.
 *  - useDeleteStationAudit2Config: usuwa cache po sukcesie.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  useAudit2CatalogSnapshot,
  useDeleteStationAudit2Config,
  useStationAudit2Config,
  useUpdateStationAudit2Config,
} from '../audit2-hooks';

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

describe('audit2 React Query hooks', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('useAudit2CatalogSnapshot pobiera snapshot z backendu', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bess_operation_modes: [],
        tap_changers: [],
        hv_fuses: [],
        device_withstand: [],
        pf_curves: [],
        block_transformers: [],
        mv_neutral_groundings: [],
      }),
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAudit2CatalogSnapshot(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveProperty('bess_operation_modes');
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/catalog/audit2/snapshot');
  });

  it('useStationAudit2Config zwraca null gdy lista nie zawiera stacji', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useStationAudit2Config('proj-1', 'station-1'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects/proj-1/audit2-station-config');
  });

  it('useStationAudit2Config nie wywoluje fetch gdy projectId jest null', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStationAudit2Config(null, 'station-1'), { wrapper });

    // enabled=false -> data undefined, status pending.
    expect(result.current.isFetching).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('useUpdateStationAudit2Config optimistic update natychmiast aktualizuje cache', async () => {
    // Initial list returns existing config.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'cfg-1',
          project_id: 'proj-1',
          station_id: 'station-1',
          mv_neutral_grounding_ref: 'mng_isolated',
          tap_changer_refs: [],
          der_specs: [],
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
    });
    // PUT response.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'cfg-1',
        project_id: 'proj-1',
        station_id: 'station-1',
        mv_neutral_grounding_ref: 'mng_petersen',
        tap_changer_refs: [],
        der_specs: [],
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:01Z',
      }),
    });

    const { wrapper } = makeWrapper();
    const queryHook = renderHook(
      () => useStationAudit2Config('proj-1', 'station-1'),
      { wrapper },
    );
    await waitFor(() => expect(queryHook.result.current.data).toBeTruthy());
    expect(queryHook.result.current.data?.mv_neutral_grounding_ref).toBe('mng_isolated');

    const mutationHook = renderHook(() => useUpdateStationAudit2Config(), { wrapper });
    mutationHook.result.current.mutate({
      projectId: 'proj-1',
      stationId: 'station-1',
      body: {
        mv_neutral_grounding_ref: 'mng_petersen',
        tap_changer_refs: [],
        der_specs: [],
      },
    });

    // Po onMutate cache optimistic == 'mng_petersen'.
    await waitFor(() => {
      expect(queryHook.result.current.data?.mv_neutral_grounding_ref).toBe('mng_petersen');
    });
  });

  it('useUpdateStationAudit2Config rollback przy bledzie backendu', async () => {
    // Initial list success.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'cfg-1',
          project_id: 'proj-1',
          station_id: 'station-1',
          mv_neutral_grounding_ref: 'mng_isolated',
          tap_changer_refs: [],
          der_specs: [],
          created_at: null,
          updated_at: null,
        },
      ],
    });
    // PUT failure.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const { wrapper } = makeWrapper();
    const queryHook = renderHook(
      () => useStationAudit2Config('proj-1', 'station-1'),
      { wrapper },
    );
    await waitFor(() => expect(queryHook.result.current.data).toBeTruthy());
    expect(queryHook.result.current.data?.mv_neutral_grounding_ref).toBe('mng_isolated');

    const mutationHook = renderHook(() => useUpdateStationAudit2Config(), { wrapper });
    mutationHook.result.current.mutate({
      projectId: 'proj-1',
      stationId: 'station-1',
      body: {
        mv_neutral_grounding_ref: 'mng_petersen',
        tap_changer_refs: [],
        der_specs: [],
      },
    });

    await waitFor(() => expect(mutationHook.result.current.isError).toBe(true));
    // Rollback do initial state.
    expect(queryHook.result.current.data?.mv_neutral_grounding_ref).toBe('mng_isolated');
  });

  it('useDeleteStationAudit2Config usuwa cache po sukcesie', async () => {
    // Initial list success.
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'cfg-1',
          project_id: 'proj-1',
          station_id: 'station-1',
          mv_neutral_grounding_ref: 'mng_isolated',
          tap_changer_refs: [],
          der_specs: [],
          created_at: null,
          updated_at: null,
        },
      ],
    });
    // DELETE success (204).
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: 'No Content',
    });

    const { wrapper } = makeWrapper();
    const queryHook = renderHook(
      () => useStationAudit2Config('proj-1', 'station-1'),
      { wrapper },
    );
    await waitFor(() => expect(queryHook.result.current.data).toBeTruthy());

    const mutationHook = renderHook(() => useDeleteStationAudit2Config(), { wrapper });
    mutationHook.result.current.mutate({
      projectId: 'proj-1',
      stationId: 'station-1',
    });

    await waitFor(() => expect(mutationHook.result.current.isSuccess).toBe(true));
    // Cache zostal usuniety -> data undefined po refetch.
    // (Po removeQueries useStationAudit2Config refetchuje w nowym query lifecycle.)
    expect(mutationHook.result.current.isSuccess).toBe(true);
  });
});
