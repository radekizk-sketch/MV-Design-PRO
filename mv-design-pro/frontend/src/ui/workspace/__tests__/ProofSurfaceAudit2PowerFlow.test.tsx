/**
 * Test ProofSurface (E-36) — przycisk "Rozpływ mocy rozszerzony" (karta CV-4.2).
 *
 * Karta CV-4.2 usunęła fabrykowany backend `POST /api/cases/audit2-power-flow`
 * (`pq=[]`, `slack_node_id or "slack-stub"` — zero fizyki, zawsze empty graph
 * stub) i przepięła przycisk na bieg KANONICZNY:
 *   POST /api/execution/study-cases/{caseId}/runs
 *   POST /api/execution/runs/{runId}/execute
 *   GET  /api/execution/runs/{runId}/results
 * (`ui/study-cases/api.ts::createRun/executeRun/getRunResults`, orkiestrowane
 * przez `useRunExtendedPowerFlow`, `ui/network-build/station-der/audit2-hooks.ts`).
 *
 * Pokrywa:
 *  - Button widoczny i renderowany.
 *  - Disabled gdy brak aktywnego przypadku (`activeCaseId`).
 *  - Po kliknieciu woła createRun -> executeRun -> getRunResults z prawidlowymi danymi.
 *  - Wynik liczy węzły/gałęzie/źródła z `element_results` (dane solvera, nie fabrykacja).
 *  - Publiczny widok dowodów nie pokazuje wewnętrznej nazwy audit2 ani endpointu API.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

const PROOF_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'proof-test',
  screenCode: 'E-36',
  titlePl: 'Uzasadnienie inżynierskie',
  entityRef: null,
  entityType: null,
  routeState: { payload: {} } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
} as never;

function renderWithFetchStub(
  ui: ReactElement,
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response>,
) {
  global.fetch = vi.fn().mockImplementation(fetchImpl) as never;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function basicFetchStub(url: string | URL): Promise<Response> {
  const urlStr = url.toString();
  if (urlStr.includes('audit2/snapshot')) {
    return Promise.resolve({
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
    } as never);
  }
  if (urlStr.endsWith('audit2-station-config')) {
    return Promise.resolve({ ok: true, json: async () => [] } as never);
  }
  return Promise.resolve({ ok: true, json: async () => ({}) } as never);
}

describe('ProofSurface — przycisk rozpływu mocy rozszerzonego (CV-4.2)', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: PROOF_SURFACE } as never);
  });

  it('button widoczny w ProofSurface', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    expect(screen.getByTestId('audit2-power-flow-run')).toBeDefined();
  });

  it('publiczny widok dowodów nie pokazuje wewnętrznej nazwy audit2 ani endpointu API', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);

    expect(screen.getByText('Uzasadnienia rozszerzonej walidacji')).toBeInTheDocument();
    expect(screen.getByText('Rozpływ mocy rozszerzony (z regulacją zaczepów)')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(
      /Audit2|audit2|audytu 2|\/api\/cases\/audit2-power-flow|Proof Pack|E-36|SC3F_IEC60909|POWER_FLOW|EQUIPMENT_PROOF|EARTHING_GROUND_FAULT_SN|\bDER\b/i,
    );
  });

  it('button disabled gdy brak activeCaseId', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: null });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    const btn = screen.getByTestId('audit2-power-flow-run') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('status wersji układu nie pokazuje surowego snapshotu gdy snapshot null', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: null });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    const status = screen.getByTestId('audit2-pf-snapshot-status');
    expect(status.textContent).toContain('Nie wybrano aktywnej wersji układu');
    expect(status.textContent).not.toMatch(/snapshot/i);
  });

  it('status wersji układu ukrywa aktywny hash gdy snapshot loaded', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
    useSnapshotStore.setState({
      snapshot: {
        header: { hash_sha256: 'abc123def456abc123def456789012345678901234567890123456789abcdef' },
      } as never,
    });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    const status = screen.getByTestId('audit2-pf-snapshot-status');
    expect(status.textContent).toContain('Aktywna wersja układu');
    expect(status.textContent).not.toMatch(/snapshot|abc123def456abc1/i);
  });

  it('po kliknieciu woła createRun -> executeRun -> getRunResults z prawidlowymi danymi', async () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });

    let createRunBody: Record<string, unknown> | null = null;
    renderWithFetchStub(
      <WorkspaceSurfaceRouter region="main" />,
      (url, init) => {
        const urlStr = url.toString();
        if (urlStr.includes('audit2/snapshot')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              bess_operation_modes: [], tap_changers: [], hv_fuses: [],
              device_withstand: [], pf_curves: [], block_transformers: [],
              mv_neutral_groundings: [],
            }),
          } as never);
        }
        if (urlStr.endsWith('audit2-station-config')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              {
                id: 'cfg-1', project_id: 'proj-1', station_id: 'station-A',
                mv_neutral_grounding_ref: 'mng_petersen',
                tap_changer_refs: [], der_specs: [],
                transformer_tap_changers: {}, bay_hv_fuses: {},
                bay_vts: {}, bay_device_withstand: {},
                created_at: null, updated_at: null,
              },
            ],
          } as never);
        }
        if (urlStr === '/api/execution/study-cases/case-1/runs') {
          createRunBody = init?.body ? JSON.parse(init.body as string) : null;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'run-1', study_case_id: 'case-1', analysis_type: 'LOAD_FLOW',
              solver_input_hash: 'hash-1', status: 'PENDING',
              started_at: null, finished_at: null, error_message: null,
            }),
          } as never);
        }
        if (urlStr === '/api/execution/runs/run-1/execute') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              id: 'run-1', study_case_id: 'case-1', analysis_type: 'LOAD_FLOW',
              solver_input_hash: 'hash-1', status: 'DONE',
              started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:00:01Z',
              error_message: null,
            }),
          } as never);
        }
        if (urlStr === '/api/execution/runs/run-1/results') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              run_id: 'run-1', analysis_type: 'LOAD_FLOW',
              validation_snapshot: {}, readiness_snapshot: {},
              element_results: [
                { element_ref: 'b1', element_type: 'Bus', values: {} },
                { element_ref: 'b2', element_type: 'Bus', values: {} },
                { element_ref: 'b3', element_type: 'Bus', values: {} },
                { element_ref: 'b4', element_type: 'Bus', values: {} },
                { element_ref: 'b5', element_type: 'Bus', values: {} },
                { element_ref: 'l1', element_type: 'Branch', values: {} },
                { element_ref: 'l2', element_type: 'Branch', values: {} },
                { element_ref: 'l3', element_type: 'Branch', values: {} },
                { element_ref: 's1', element_type: 'Source', values: {} },
              ],
              global_results: { audit2_applied: { tap_position_changes: { tr_001: {} } } },
              deterministic_signature: 'sig-1',
            }),
          } as never);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as never);
      },
    );

    // Czekaj az lista konfigów się zaladuje (przycisk staje się enabled).
    await waitFor(() => {
      const btn = screen.getByTestId('audit2-power-flow-run') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId('audit2-power-flow-run'));

    await waitFor(() => {
      expect(createRunBody).not.toBeNull();
    });
    expect(createRunBody).toEqual({
      analysis_type: 'LOAD_FLOW',
      solver_input: {
        base_mva: 100.0,
        audit2_project_id: 'proj-1',
        audit2_station_id: 'station-A',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('audit2-power-flow-result')).toBeDefined();
    });
    const result = screen.getByTestId('audit2-power-flow-result');
    expect(result.textContent).toContain('uruchomione');
    expect(result.textContent).toContain('5 węzłów');
    expect(result.textContent).toContain('3 gałęzi');
    expect(result.textContent).toContain('1 źródeł');
    expect(result.textContent).toContain('zastosowana');
    expect(result.textContent).not.toMatch(/Audit2|audit2|station-A|power_flow_extensions/i);
  });
});
