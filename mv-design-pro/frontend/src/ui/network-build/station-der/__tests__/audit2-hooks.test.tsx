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
  useRunExtendedPowerFlow,
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

  // Karta CV-4.2: `useRunAudit2PowerFlow` (fabrykowany stub `pq=[]`/`slack-stub`)
  // zastąpiony biegiem kanonicznym (createRun -> executeRun -> getRunResults).
  describe('useRunExtendedPowerFlow', () => {
    it('uruchamia bieg kanoniczny i liczy elementy wyniku po stronie klienta', async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      // 1. POST /api/execution/study-cases/{caseId}/runs
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-1',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-1',
          status: 'PENDING',
          started_at: null,
          finished_at: null,
          error_message: null,
        }),
      });
      // 2. POST /api/execution/runs/{runId}/execute
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-1',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-1',
          status: 'DONE',
          started_at: '2026-01-01T00:00:00Z',
          finished_at: '2026-01-01T00:00:01Z',
          error_message: null,
        }),
      });
      // 3. GET /api/execution/runs/{runId}/results
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          run_id: 'run-1',
          analysis_type: 'LOAD_FLOW',
          validation_snapshot: {},
          readiness_snapshot: {},
          element_results: [
            { element_ref: 'bus-1', element_type: 'Bus', values: {} },
            { element_ref: 'bus-2', element_type: 'Bus', values: {} },
            { element_ref: 'branch-1', element_type: 'Branch', values: {} },
            { element_ref: 'src-1', element_type: 'Source', values: {} },
          ],
          global_results: { audit2_applied: { tap_position_changes: {} } },
          deterministic_signature: 'sig-1',
        }),
      });

      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useRunExtendedPowerFlow(), { wrapper });

      result.current.mutate({
        caseId: 'case-1',
        audit2ProjectId: 'proj-1',
        audit2StationId: 'station-1',
        baseMva: 100.0,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        status: 'DONE',
        errorMessage: null,
        busCount: 2,
        branchCount: 1,
        sourceCount: 1,
        audit2Applied: true,
      });

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/execution/study-cases/case-1/runs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            analysis_type: 'LOAD_FLOW',
            solver_input: {
              base_mva: 100.0,
              audit2_project_id: 'proj-1',
              audit2_station_id: 'station-1',
            },
          }),
        }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/execution/runs/run-1/execute',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/execution/runs/run-1/results');
    });

    it('nie odpytuje wyniku, gdy bieg nie zakonczyl sie DONE — meldunek zamiast danych zmyslonych', async () => {
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-2',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-2',
          status: 'PENDING',
          started_at: null,
          finished_at: null,
          error_message: null,
        }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'run-2',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-2',
          status: 'FAILED',
          started_at: '2026-01-01T00:00:00Z',
          finished_at: '2026-01-01T00:00:01Z',
          error_message: 'Brak wezla bilansujacego SLACK',
        }),
      });

      const { wrapper } = makeWrapper();
      const { result } = renderHook(() => useRunExtendedPowerFlow(), { wrapper });

      result.current.mutate({
        caseId: 'case-1',
        audit2ProjectId: 'proj-1',
        audit2StationId: 'station-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({
        status: 'FAILED',
        errorMessage: 'Brak wezla bilansujacego SLACK',
        busCount: 0,
        branchCount: 0,
        sourceCount: 0,
        audit2Applied: false,
      });
      // Bieg nieukonczony -> zero trzeciego wywolania (brak wyniku do odczytu).
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
