/**
 * Test ProofSurface (E-36) audit2 Power Flow button click flow (Phase 40).
 *
 * Pokrywa:
 *  - Button widoczny i renderowany.
 *  - Disabled gdy brak aktywnego runId / projectu / config'u.
 *  - Po kliknieciu wywoluje POST /api/cases/audit2-power-flow z prawidlowymi danymi.
 *  - Auto-inject snapshot_id z useSnapshotStore (Phase 39).
 *  - Snapshot status hint renderowany correctly.
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

describe('ProofSurface — audit2 Power Flow button (Phase 40)', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: PROOF_SURFACE } as never);
  });

  it('button widoczny w ProofSurface', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeRunId: 'run-1' });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    expect(screen.getByTestId('audit2-power-flow-run')).toBeDefined();
  });

  it('button disabled gdy brak activeRunId', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeRunId: null });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    const btn = screen.getByTestId('audit2-power-flow-run') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('status wersji układu nie pokazuje surowego snapshotu gdy snapshot null', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeRunId: 'run-1' });
    useSnapshotStore.setState({ snapshot: null });
    renderWithFetchStub(<WorkspaceSurfaceRouter region="main" />, basicFetchStub);
    const status = screen.getByTestId('audit2-pf-snapshot-status');
    expect(status.textContent).toContain('Nie wybrano aktywnej wersji układu');
    expect(status.textContent).not.toMatch(/snapshot/i);
  });

  it('status wersji układu ukrywa aktywny hash gdy snapshot loaded', () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeRunId: 'run-1' });
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

  it('po kliknieciu wywoluje POST z prawidlowymi danymi + snapshot_id', async () => {
    useAppStateStore.setState({ activeProjectId: 'proj-1', activeRunId: 'run-1' });
    useSnapshotStore.setState({
      snapshot: { header: { hash_sha256: 'snap-hash-1234' } } as never,
    });

    let powerFlowCallBody: Record<string, unknown> | null = null;
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
        if (urlStr.includes('audit2-power-flow')) {
          powerFlowCallBody = init?.body ? JSON.parse(init.body as string) : null;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              case_id: 'run-1', project_id: 'proj-1', station_id: 'station-A',
              audit2_applied: { tap_position_changes: {}, grounding_z0_z1_ratio: 50.0 },
              solver_attempted: true, solver_error: null,
              audit2_extensions_keys: ['power_flow_extensions'],
              graph_branch_count: 3, graph_node_count: 5, graph_inverter_source_count: 1,
              snapshot_id_loaded: 'snap-hash-1234',
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
      expect(powerFlowCallBody).not.toBeNull();
    });
    expect(powerFlowCallBody).toMatchObject({
      case_id: 'run-1',
      project_id: 'proj-1',
      station_id: 'station-A',
      snapshot_id: 'snap-hash-1234',
    });

    await waitFor(() => {
      expect(screen.getByTestId('audit2-power-flow-result')).toBeDefined();
    });
    const result = screen.getByTestId('audit2-power-flow-result');
    expect(result.textContent).toContain('TAK');
    expect(result.textContent).toContain('5 wezlow');
    expect(result.textContent).toContain('3 galezi');
  });
});
