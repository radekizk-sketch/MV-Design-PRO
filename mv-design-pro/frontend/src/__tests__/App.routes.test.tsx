import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { useAppStateStore } from '../ui/app-state/store';
import { useReadinessLiveStore } from '../ui/engineering-readiness/readinessLiveStore';
import { useNetworkBuildStore } from '../ui/network-build/networkBuildStore';
import { useNotificationStore } from '../ui/notifications/store';
import { useSelectionStore } from '../ui/selection/store';
import { useExecutionRunsStore } from '../ui/study-cases/runStore';
import { useSnapshotStore } from '../ui/topology/snapshotStore';
import { SLD_RENDER_VERSION_STORAGE_KEY } from '../ui/sld/sldRenderVersion';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
} from '../ui/workspace/types';

const originalCreateAndExecuteRun = useExecutionRunsStore.getState().createAndExecuteRun;

vi.mock('../ui/layout', () => ({
  CanonicalLayout: ({
    children,
    onCalculate,
    onMenuAction,
    onViewResults,
  }: {
    children: ReactNode;
    onCalculate?: () => void;
    onMenuAction?: (actionId: string) => void;
    onViewResults?: () => void;
  }) => (
    <div data-testid="canonical-layout">
      <button type="button" data-testid="layout-calculate" onClick={onCalculate}>
        Oblicz
      </button>
      <button type="button" data-testid="layout-view-results" onClick={onViewResults}>
        Analizy
      </button>
      <button type="button" data-testid="layout-menu-compare" onClick={() => onMenuAction?.('compare')}>
        Porownaj
      </button>
      <button type="button" data-testid="layout-menu-sld-view" onClick={() => onMenuAction?.('sld-view')}>
        Podglad
      </button>
      <button type="button" data-testid="layout-menu-export" onClick={() => onMenuAction?.('export')}>
        Eksport
      </button>
      <button type="button" data-testid="layout-menu-network-build" onClick={() => onMenuAction?.('network-build')}>
        Budowa sieci
      </button>
      <button type="button" data-testid="layout-menu-readiness" onClick={() => onMenuAction?.('readiness')}>
        Kontrola
      </button>
      <button type="button" data-testid="layout-menu-overlay" onClick={() => onMenuAction?.('overlay')}>
        Nakladka
      </button>
      {(() => {
        const hash = window.location.hash;
        const queryIndex = hash.indexOf('?');
        const cleanHash = queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
        const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
        const tab = params.get('tab');
        const activeRunId = useAppStateStore.getState().activeRunId;

        if (
          cleanHash === '#analysis'
          || cleanHash === '#results'
          || cleanHash === '#proof'
          || cleanHash === '#protection-results'
          || cleanHash === '#power-flow-results'
          || cleanHash === '#compare'
        ) {
          if (cleanHash === '#compare' || tab === 'compare') {
            return <div data-testid="results-comparison-page" />;
          }
          return (
            <div data-testid="results-inspector-page">
              <span data-testid="results-inspector-run">{params.get('run') ?? activeRunId ?? 'brak'}</span>
              <span data-testid="results-inspector-tab">
                {cleanHash === '#proof' || tab === 'trace'
                  ? 'TRACE'
                  : cleanHash === '#protection-results' || tab === 'protection'
                    ? 'PROTECTION'
                    : cleanHash === '#power-flow-results' || tab === 'power-flow'
                      ? 'POWER_FLOW'
                      : 'RESULTS'}
              </span>
            </div>
          );
        }

        return children;
      })()}
    </div>
  ),
}));

vi.mock('../ui/sld', () => ({
  SldEditorPage: () => <div data-testid="sld-editor-page">SLD</div>,
  SLDViewPage: () => <div data-testid="sld-view-page">SLD View</div>,
}));

vi.mock('../ui/inspector-panel', () => ({
}));

vi.mock('../ui/topology/useNetworkStats', () => ({
  useNetworkStats: () => ({ nodeCount: 0, branchCount: 0 }),
}));

vi.mock('../ui/enm-inspector', () => ({
  EnmInspectorPage: () => <div data-testid="enm-inspector-page" />,
}));

vi.mock('../ui/fault-scenarios', () => ({
  FaultScenariosPanel: () => <div data-testid="fault-scenarios-panel" />,
  FaultScenarioModal: () => <div data-testid="fault-scenarios-modal" />,
}));

describe('App hash routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '#sld';
    // F8a (SLD_CAD_REBUILD_PLAN_V3 §F8): domyślny render SLD to teraz v3
    // (`SldRenderHost`/`SldCanvasV3Workspace`), ale ten plik testuje ROUTING
    // aplikacji przez asercje na v2-specyficznym drzewie (drawer, context
    // menu, `sld-workspace-container` itd.) — pinujemy jawnie na v2, żeby
    // istniejące pokrycie routingu zostało nietknięte; v3 ma WŁASNE testy
    // cutoveru w `ui/sld/__tests__/SldRenderHost.test.tsx`.
    localStorage.setItem(SLD_RENDER_VERSION_STORAGE_KEY, 'v2');
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useExecutionRunsStore.setState({ createAndExecuteRun: originalCreateAndExecuteRun });
    useSnapshotStore.getState().reset();
    useReadinessLiveStore.getState().clear();
    useNetworkBuildStore.getState().reset();
    useNotificationStore.getState().clearAll();
    useSelectionStore.getState().clearSelection();
  });

  afterEach(() => {
    localStorage.removeItem(SLD_RENDER_VERSION_STORAGE_KEY);
  });

  it('renderuje cala aplikacje w ekranowym motywie dark SCADA', async () => {
    render(<App />);

    const root = await screen.findByTestId('app-root');

    expect(root).toHaveAttribute('data-ui-theme', 'dark-scada');
    expect(root).toHaveClass('mv-dark-scada');
  });

  it('odtwarza migawkę ENM po odświeżeniu aktywnego zakresu obliczeń', async () => {
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Zakres E2E', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });

    render(<App />);

    await waitFor(() => {
      expect(refreshFromBackend).toHaveBeenCalledWith('case-1');
    });
  });

  it('aktywuje zakres obliczeń z adresu schematu i odtwarza model ENM po odświeżeniu', async () => {
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = '#sld?case=case-from-route';

    render(<App />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeCaseId).toBe('case-from-route');
      expect(refreshFromBackend).toHaveBeenCalledWith('case-from-route');
    });
  });

  it('odtwarza aktywne obliczenie z adresu schematu po odświeżeniu', async () => {
    const runId = '11111111-2222-4333-8444-555555555555';
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ snapshot_id: 'snapshot-from-run' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Zakres E2E', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({
      snapshot: {
        header: { hash_sha256: 'snapshot-current' },
        sources: [],
        buses: [],
        branches: [],
      } as never,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = `#sld?case=case-1&run=${runId}`;

    render(<App />);

    expect(await screen.findByTestId('sld-workspace-container')).toBeInTheDocument();
    await waitFor(() => {
      const appState = useAppStateStore.getState();
      expect(appState.activeRunId).toBe(runId);
      expect(appState.activeSnapshotId).toBe('snapshot-from-run');
      expect(appState.activeCaseResultStatus).toBe('FRESH');
      expect(useExecutionRunsStore.getState().activeRunId).toBe(runId);
      expect(fetchMock).toHaveBeenCalledWith(`/api/analysis-runs/${runId}/snapshot`);
      expect(refreshFromBackend).toHaveBeenCalledWith('case-1');
    });
  });

  it('zasila schemat migawka ENM z aktywnego obliczenia zamiast pustego zakresu', async () => {
    const runId = '11111111-2222-4333-8444-555555555555';
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({
        run_id: runId,
        snapshot_id: 'snapshot-from-run',
        snapshot: {
          header: {
            enm_version: '1.0',
            name: 'Model z obliczenia',
            created_at: '2026-05-17T00:00:00Z',
            updated_at: '2026-05-17T00:00:00Z',
            revision: 1,
            hash_sha256: 'snapshot-from-run',
            defaults: { frequency_hz: 50, unit_system: 'SI' },
          },
          buses: [
            {
              id: 'bus-1',
              ref_id: 'bus-1',
              name: 'Szyna GPZ',
              tags: [],
              meta: {},
              voltage_kv: 15,
              phase_system: '3ph',
            },
          ],
          branches: [],
          transformers: [],
          sources: [],
          loads: [],
          generators: [],
          substations: [],
          bays: [],
          junctions: [],
          branch_points: [],
          corridors: [],
          measurements: [],
          protection_assignments: [],
          line_runs: [],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Zakres E2E', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = `#sld?case=case-1&run=${runId}`;

    render(<App />);

    await waitFor(() => {
      expect(useSnapshotStore.getState().snapshot?.buses).toHaveLength(1);
      expect(useSnapshotStore.getState().snapshot?.header.hash_sha256).toBe('snapshot-from-run');
      expect(useAppStateStore.getState().activeSnapshotId).toBe('snapshot-from-run');
      expect(fetchMock).toHaveBeenCalledWith(`/api/analysis-runs/${runId}/snapshot`);
    });
  });

  it('wraca do aktualnego ENM zakresu, gdy migawka obliczenia nie zawiera topologii', async () => {
    const runId = '11111111-2222-4333-8444-555555555555';
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith(`/api/analysis-runs/${runId}/snapshot`)) {
        return new Response(JSON.stringify({ run_id: runId, snapshot_id: 'snapshot-from-run' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith(`/api/analysis-runs/${runId}`)) {
        return new Response(JSON.stringify({ id: runId, status: 'FINISHED', result_status: 'FRESH' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Zakres E2E', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = `#sld?case=case-1&run=${runId}`;

    render(<App />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeSnapshotId).toBe('snapshot-from-run');
      expect(refreshFromBackend).toHaveBeenCalledWith('case-1');
      expect(fetchMock).toHaveBeenCalledWith(`/api/analysis-runs/${runId}/snapshot`);
    });
  });

  it('usuwa z adresu nieistniejące obliczenie i nie pokazuje fałszywie aktywnych wyników', async () => {
    const runId = '11111111-2222-4333-8444-555555555555';
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (
        url.endsWith(`/api/analysis-runs/${runId}/snapshot`)
        || url.endsWith(`/api/analysis-runs/${runId}`)
      ) {
        return new Response(JSON.stringify({ detail: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/study-cases/case-1')) {
        return new Response(JSON.stringify({
          id: 'case-1',
          project_id: 'project-1',
          name: 'Zakres E2E',
          description: '',
          config: {},
          result_status: 'NONE',
          results_valid: false,
          is_active: true,
          result_refs: [],
          revision: 1,
          created_at: '2026-05-17T00:00:00Z',
          updated_at: '2026-05-17T00:00:00Z',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/projects/project-1')) {
        return new Response(JSON.stringify({
          id: 'project-1',
          name: 'Projekt E2E',
          description: '',
          created_at: '2026-05-17T00:00:00Z',
          updated_at: '2026-05-17T00:00:00Z',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Zakres E2E', 'ShortCircuitCase', 'FRESH');
    useExecutionRunsStore.setState({ activeRunId: runId });
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = `#sld?case=case-1&run=${runId}`;

    render(<App />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeRunId).toBeNull();
      expect(useExecutionRunsStore.getState().activeRunId).toBeNull();
      expect(useAppStateStore.getState().activeCaseResultStatus).toBe('NONE');
      expect(window.location.hash).toBe('#sld?case=case-1');
      expect(refreshFromBackend).toHaveBeenCalledWith('case-1');
      expect(fetchMock).toHaveBeenCalledWith(`/api/analysis-runs/${runId}/snapshot`);
      expect(fetchMock).toHaveBeenCalledWith(`/api/analysis-runs/${runId}`);
    });
  });

  it('przełącza projekt i zakres z adresu oraz usuwa stary snapshot ENM', async () => {
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    useAppStateStore.getState().setActiveProject('old-project', 'Stary projekt');
    useAppStateStore.getState().setActiveCase('old-case', 'Stary zakres', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({
      snapshot: {
        header: { hash_sha256: 'old-snapshot' },
        sources: [{ ref_id: 'old-source', name: 'Stary GPZ' }],
        buses: [],
        branches: [],
      } as never,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = '#sld?project=new-project&case=new-case';

    render(<App />);

    await waitFor(() => {
      const appState = useAppStateStore.getState();
      expect(appState.activeProjectId).toBe('new-project');
      expect(appState.activeProjectName).toBe('new-project');
      expect(appState.activeCaseId).toBe('new-case');
      expect(useSnapshotStore.getState().snapshot).toBeNull();
      expect(refreshFromBackend).toHaveBeenCalledWith('new-case');
    });
  });

  it('odtwarza projekt techniczny z przypadku, gdy adres nie zawiera project', async () => {
    const refreshFromBackend = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/study-cases/case-from-route')) {
        return new Response(
          JSON.stringify({
            id: 'case-from-route',
            project_id: 'project-from-case',
            name: 'Zakres z trasy',
            description: '',
            config: {},
            result_status: 'FRESH',
            results_valid: true,
            is_active: true,
            result_refs: [],
            revision: 1,
            created_at: '2026-05-17T00:00:00Z',
            updated_at: '2026-05-17T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          id: 'project-from-case',
          name: 'Projekt techniczny z adresu',
          description: '',
          created_at: '2026-05-17T00:00:00Z',
          updated_at: '2026-05-17T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    useAppStateStore.getState().setActiveProject('wrong-project', 'Poprzedni projekt');
    useAppStateStore.getState().setActiveCase('case-from-route', 'Poprzedni zakres', 'ShortCircuitCase', 'NONE');
    useSnapshotStore.setState({
      snapshot: null,
      error: null,
      refreshFromBackend,
    });
    window.location.hash = '#sld?case=case-from-route';

    render(<App />);

    await waitFor(() => {
      const appState = useAppStateStore.getState();
      expect(fetchMock).toHaveBeenCalledWith('/api/study-cases/case-from-route');
      expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-from-case');
      expect(appState.activeProjectId).toBe('project-from-case');
      expect(appState.activeProjectName).toBe('Projekt techniczny z adresu');
      expect(appState.activeCaseId).toBe('case-from-route');
      expect(appState.activeCaseName).toBe('Zakres z trasy');
      expect(appState.activeCaseResultStatus).toBe('FRESH');
      expect(refreshFromBackend).toHaveBeenCalledWith('case-from-route');
    });
  });

  it('przełącza się na #results bez pustego ekranu i przekazuje run do widoku wyników', async () => {
    useExecutionRunsStore.setState({ activeRunId: 'run-42' });
    render(<App />);

    await act(async () => {
      window.location.hash = '#results?run=run-42';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByTestId('results-inspector-page')).toBeInTheDocument();
    expect(screen.getByTestId('results-inspector-run')).toHaveTextContent('run-42');
    expect(screen.getByTestId('results-inspector-tab')).toHaveTextContent('RESULTS');
    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
      expect(useAppStateStore.getState().activeRunId).toBe('run-42');
      expect(useExecutionRunsStore.getState().activeRunId).toBe('run-42');
    });
  });

  it('przełącza się na #proof i wymusza zakładkę wywodu dla aktywnego runu', async () => {
    useExecutionRunsStore.setState({ activeRunId: 'run-77' });
    render(<App />);

    await act(async () => {
      window.location.hash = '#proof?run=run-77';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByTestId('results-inspector-page')).toBeInTheDocument();
    expect(screen.getByTestId('results-inspector-run')).toHaveTextContent('run-77');
    expect(screen.getByTestId('results-inspector-tab')).toHaveTextContent('TRACE');
    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('RESULT_VIEW');
      expect(useAppStateStore.getState().activeRunId).toBe('run-77');
      expect(useExecutionRunsStore.getState().activeRunId).toBe('run-77');
    });
  });

  it('zachowuje trase katalogu i otwiera launcher analiz bez cichego fallbacku', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'source-1', name: 'GPZ 1' }],
        substations: [{ ref_id: 'st-1', name: 'Stacja 1' }],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1', name: 'Szyna 1' }],
        branches: [{ ref_id: 'line-1', type: 'cable' }],
      } as never,
    });
    useReadinessLiveStore.setState({
      issues: [],
      status: 'OK',
      ready: true,
      bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });
    window.location.hash = '#catalog';

    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-calculate').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(window.location.hash).toBe('#catalog');
  });

  it('pozostaje na kanonicznej trasie schematu i otwiera launcher analiz', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'OUTDATED');
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'source-1', name: 'GPZ 1' }],
        substations: [{ ref_id: 'st-1', name: 'Stacja 1' }],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1', name: 'Szyna 1' }],
        branches: [{ ref_id: 'line-1', type: 'cable' }],
      } as never,
    });
    useReadinessLiveStore.setState({
      issues: [],
      status: 'OK',
      ready: true,
      bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
      loading: false,
      error: null,
      lastRevision: 1,
    });
    window.location.hash = '#sld';

    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-calculate').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(window.location.hash).toBe('#sld');
  });

  it('nie pokazuje aktualnych wynikow, gdy backend zwraca przerwane obliczenia', async () => {
    const caseId = '11111111-2222-4333-8444-555555555555';
    const createAndExecuteRun = vi.fn().mockResolvedValue({
      id: 'run-failed',
      study_case_id: caseId,
      analysis_type: 'SC_3F',
      solver_input_hash: 'hash-run',
      status: 'FAILED',
      started_at: '2026-05-18T08:00:00Z',
      finished_at: '2026-05-18T08:00:01Z',
      error_message: null,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'run-failed',
          status: 'FAILED',
          result_status: 'VALID',
          results_valid: true,
          error_message: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    useAppStateStore
      .getState()
      .setActiveCase(caseId, 'Zakres obliczen', 'ShortCircuitCase', 'OUTDATED');
    useExecutionRunsStore.setState({ createAndExecuteRun });
    window.location.hash = `#sld?case=${caseId}`;

    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-calculate').click();
    });

    await waitFor(() => {
      const appState = useAppStateStore.getState();
      const notification = useNotificationStore.getState().notifications.at(-1);
      expect(createAndExecuteRun).toHaveBeenCalledWith(caseId, { analysis_type: 'SC_3F' });
      expect(fetchMock).toHaveBeenCalledWith('/api/analysis-runs/run-failed');
      expect(appState.activeCaseResultStatus).toBe('NONE');
      expect(notification?.type).toBe('error');
      expect(notification?.message).toContain('Obliczenia nie zakończyły się wynikiem');
      expect(window.location.hash).toBe(`#sld?case=${caseId}`);
    });
  });

  it('przechodzi do widoku analitycznego po akcji kontroli konfiguracji z glownego paska', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-readiness', 'Zakres kontroli', 'ShortCircuitCase', 'OUTDATED');

    render(<App />);

    await screen.findByTestId('sld-workspace-container');
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      screen.getByTestId('layout-menu-readiness').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe('E-35');
    expect(window.location.hash).toContain('#analysis');
    expect(window.location.hash).toContain('case=case-readiness');
  });

  it('odtwarza nazwę projektu po wejściu w SLD z adresem przypadku', async () => {
    window.location.hash = '#sld?case=case-z-adresu';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/study-cases/case-z-adresu')) {
        return new Response(
          JSON.stringify({
            id: 'case-z-adresu',
            project_id: 'project-z-adresu',
            name: 'Wariant K30',
            description: '',
            config: {},
            result_status: 'NONE',
            results_valid: false,
            is_active: true,
            result_refs: [],
            revision: 1,
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/projects/project-z-adresu')) {
        return new Response(
          JSON.stringify({
            id: 'project-z-adresu',
            name: 'Sieć przemysłowa K30',
            description: 'Wariant referencyjny',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectName).toBe('Sieć przemysłowa K30');
      expect(useAppStateStore.getState().activeCaseName).toBe('Wariant K30');
    });

    fetchMock.mockRestore();
  });

  it('odtwarza projekt na raporcie, gdy zakres jest już aktywny, ale projekt nie jest otwarty', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-z-adresu', 'Zakres z adresu', 'ShortCircuitCase', 'FRESH');
    window.location.hash = '#report?case=case-z-adresu&run=run-raport';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/study-cases/case-z-adresu')) {
        return new Response(
          JSON.stringify({
            id: 'case-z-adresu',
            project_id: 'project-z-adresu',
            name: 'Wariant K30',
            description: '',
            config: {},
            result_status: 'FRESH',
            results_valid: true,
            is_active: true,
            result_refs: [],
            revision: 1,
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/projects/project-z-adresu')) {
        return new Response(
          JSON.stringify({
            id: 'project-z-adresu',
            name: 'Sieć przemysłowa K30',
            description: 'Wariant referencyjny',
            created_at: '2026-05-18T00:00:00Z',
            updated_at: '2026-05-18T00:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/analysis-runs/run-raport')) {
        return new Response(JSON.stringify({ detail: 'not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(useAppStateStore.getState().activeProjectName).toBe('Sieć przemysłowa K30');
      expect(screen.getByTestId('canonical-layout')).toBeInTheDocument();
    });

    fetchMock.mockRestore();
  });

  it('odtwarza E-21 po odswiezeniu adresu SLD z wybranym falownikiem PV', async () => {
    const selectedRef = 'stn/st-001/nn_source/pv_inverter';
    window.location.hash = [
      '#sld',
      '?sel=stn%2Fst-001%2Fnn_source%2Fpv_inverter',
      '&type=PVInverter',
      '&name=Falownik+PV+0.5+MW+%2F+0.4+kV+nN',
      '&kind=SOURCE',
      '&role=PV_INVERTER',
      '&sh=source%3Apv',
    ].join('');

    render(<App />);

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe('E-21');
      expect(activeSurface?.entityRef).toBe(selectedRef);
      expect(activeSurface?.entityType).toBe('pv_source');
      expect(activeSurface?.titlePl).toBe('Falownik PV 0.5 MW / 0.4 kV nN');
      expect(activeSurface?.routeState.route).toBe('sld');
      expect(activeSurface?.routeState.payload?.derKind).toBe('PV');
    });
  });

  it('przestawia prawy panel ze starej operacji na E-21 po zaznaczeniu falownika PV w SLD', async () => {
    const selectedRef = 'pv/625d6d8c5fb3e987ac13b2d4ffda1320/converter';
    window.location.hash = '#sld?project=project-1&case=case-1';

    render(<App />);

    act(() => {
      useNetworkBuildStore.getState().openOperationForm('add_transformer_sn_nn', {
        station_ref: 'stn-1',
      });
    });

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-18');

    await act(async () => {
      useSelectionStore.getState().selectElement({
        id: selectedRef,
        type: 'PVInverter',
        name: 'Blok PV',
        semanticElementKind: 'SOURCE',
        semanticEngineeringRole: 'PV_INVERTER',
        semanticHash: 'source:pv',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe('E-21');
      expect(activeSurface?.entityRef).toBe(selectedRef);
      expect(activeSurface?.entityType).toBe('pv_source');
      expect(activeSurface?.titlePl).toBe('Blok PV');
      expect(activeSurface?.routeState.payload?.derKind).toBe('PV');
    });
  });

  it('gorny przycisk Analizy wraca do glownej powierzchni analitycznej z podpowierzchni', async () => {
    useAppStateStore.getState().setActiveRun('run-active');
    window.location.hash = '#analysis?run=run-active&sel=stn-1';

    render(<App />);

    await waitFor(() => {
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-35');
    });

    useNetworkBuildStore.getState().openRouteSurface('E-26', {
      titlePl: 'Charakterystyki FRT/LVRT/HVRT',
      subjectKind: 'analysis_run',
      subjectRef: 'run-active',
    });
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-26');

    await act(async () => {
      screen.getByTestId('layout-view-results').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe('E-35');
      expect(activeSurface?.tabId).toBe('results');
      expect(activeSurface?.subjectRef).toBe('run-active');
      expect(activeSurface?.entityRef).toBe('stn-1');
    });
  });

  it('renderuje aktywny surface porownania wynikow dla #compare', async () => {
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-a',
          study_case_id: 'case-a',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-a',
          status: 'DONE',
          started_at: '2026-04-18T10:00:00Z',
          finished_at: '2026-04-18T10:01:00Z',
          error_message: null,
        },
      ],
    });
    window.location.hash = '#compare';

    render(<App />);

    expect(await screen.findByTestId('results-comparison-page')).toBeInTheDocument();
  });

  it('prowadzi do porownania wynikow z glownego menu', async () => {
    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-menu-compare').click();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByTestId('results-comparison-page')).toBeInTheDocument();
    expect(window.location.hash).toBe('#compare');
  });

  it('wymusza obszar Wyniki i analizy dla tras wynikowych', async () => {
    useAppStateStore.getState().setActiveArea('MODEL_SIECI');
    window.location.hash = '#analysis?run=run-1';

    render(<App />);

    expect(await screen.findByTestId('results-inspector-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(useAppStateStore.getState().activeArea).toBe('WYNIKI_ANALIZY');
    });
  });

  it('dla #sld z aktywnym wynikiem utrzymuje kontekst schematu i nakładkę bez panelu wyników', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    useAppStateStore.getState().setActiveArea('WYNIKI_ANALIZY');
    window.location.hash = '#sld?run=run-route';

    render(<App />);

    expect(await screen.findByTestId('sld-workspace-container')).toBeInTheDocument();

    await waitFor(() => {
      expect(useAppStateStore.getState().activeArea).toBe('SCHEMAT_TOPOLOGIA');
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
      expect(useAppStateStore.getState().activeRunId).toBe('run-route');
    });

    act(() => {
      useAppStateStore.getState().setActiveArea('WYNIKI_ANALIZY');
    });

    await waitFor(() => {
      expect(useAppStateStore.getState().activeArea).toBe('SCHEMAT_TOPOLOGIA');
    });
    expect(screen.queryByTestId('results-inspector-page')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-runs/run-route');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/execution/runs/run-route/results/v1');
  });

  it('otwiera powierzchnie raportu z aktywnym runem, gdy #report nie ma parametru run', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
    useAppStateStore.getState().setActiveRun('run-active');
    useExecutionRunsStore.setState({ activeRunId: 'run-active' });
    useSnapshotStore.setState({
      snapshot: {
        header: { hash_sha256: 'snapshot-active' },
        sources: [],
        buses: [],
        branches: [],
      } as never,
    });
    window.location.hash = '#report?case=case-1&sel=source-1&type=Source&name=GPZ';

    render(<App />);

    await waitFor(() => {
      const appState = useAppStateStore.getState();
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(appState.activeArea).toBe('RAPORTY_UZASADNIENIA');
      expect(appState.activeRunId).toBe('run-active');
      expect(appState.activeSnapshotId).toBe('snapshot-active');
      expect(activeSurface?.screenCode).toBe(REPORT_SURFACE_SCREEN_CODE);
      expect(activeSurface?.routeState.route).toBe('report');
      expect(activeSurface?.entityRef).toBe('source-1');
      expect(activeSurface?.subjectRef).toBe('run-active');
      expect(activeSurface?.routeState.payload?.runId).toBe('run-active');
    });
  });

  it('nie podstawia zaznaczonego obiektu jako subjectRef raportu bez aktywnego runu', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'NONE');
    window.location.hash = '#report?case=case-1&sel=source-1&type=Source&name=GPZ';

    render(<App />);

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe(REPORT_SURFACE_SCREEN_CODE);
      expect(activeSurface?.entityRef).toBe('source-1');
      expect(activeSurface?.subjectRef).toBeNull();
      expect(activeSurface?.routeState.payload?.runId).toBeNull();
    });
  });

  it('gorny przycisk Eksport odtwarza powierzchnie raportu, gdy hash juz jest #report', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'NONE');
    window.location.hash = '#report?case=case-1&sel=source-1&type=Source&name=GPZ';

    render(<App />);

    await waitFor(() => {
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
        REPORT_SURFACE_SCREEN_CODE,
      );
    });

    act(() => {
      useNetworkBuildStore.getState().openRouteSurface('E-04', {
        titlePl: 'Konfiguracja techniczna układu',
        route: 'analysis',
        subjectKind: 'analysis_case',
        subjectRef: 'case-1',
      });
    });

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-04');

    await act(async () => {
      screen.getByTestId('layout-menu-export').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(window.location.hash).toContain('#report');
      expect(activeSurface?.screenCode).toBe(REPORT_SURFACE_SCREEN_CODE);
      expect(activeSurface?.routeState.route).toBe('report');
      expect(activeSurface?.entityRef).toBe('source-1');
      expect(activeSurface?.subjectRef).toBeNull();
    });
  });

  it('gorny przycisk Eksport uzywa aktywnego runu z execution store po powrocie do edycji', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
    useAppStateStore.getState().setActiveRun(null);
    useExecutionRunsStore.setState({ activeRunId: 'run-exec' });
    window.location.hash = '#sld?case=case-1';

    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-menu-export').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(window.location.hash).toContain('#report');
      expect(window.location.hash).toContain('run=run-exec');
      expect(activeSurface?.screenCode).toBe(REPORT_SURFACE_SCREEN_CODE);
      expect(activeSurface?.subjectRef).toBe('run-exec');
      expect(activeSurface?.routeState.payload?.runId).toBe('run-exec');
    });
  });

  it('dosynchronizowuje powierzchnie robocza, gdy hash zmieniono przez replaceState bez hashchange', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
    useAppStateStore.getState().setActiveRun('run-active');
    window.location.hash = '#analysis?case=case-1&run=run-active';

    render(<App />);

    await waitFor(() => {
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
        ANALYSIS_SURFACE_SCREEN_CODE,
      );
    });

    await act(async () => {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}#report?case=case-1&sel=source-1&type=Source&name=GPZ`,
      );
      useSelectionStore.getState().selectElement({
        id: 'source-1',
        type: 'Source',
        name: 'GPZ',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(window.location.hash).toContain('#report');
      expect(useAppStateStore.getState().activeArea).toBe('RAPORTY_UZASADNIENIA');
      expect(activeSurface?.screenCode).toBe(REPORT_SURFACE_SCREEN_CODE);
      expect(activeSurface?.routeState.route).toBe('report');
      expect(activeSurface?.subjectRef).toBe('run-active');
    });
  });

  it('pokazuje jawny blad dla nieznanej trasy zamiast cichego fallbacku', async () => {
    window.location.hash = '#nieznana-trasa';

    render(<App />);

    expect(await screen.findByText('Nieznana trasa interfejsu')).toBeInTheDocument();
  });

  it.each(['#case-manager', '#network-build'])(
    'odrzuca legacy public route %s i pokazuje blad kanoniczny',
    async (legacyRoute) => {
      window.location.hash = legacyRoute;

      render(<App />);

      expect(await screen.findByText('Nieznana trasa interfejsu')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(legacyRoute.replace('#', '\\#')))).toBeInTheDocument();
    },
  );

  it('otwiera kreator rozdzielnicy na trasie kanonicznej #switchgear', async () => {
    window.location.hash = '#switchgear';

    render(<App />);

    await waitFor(() => {
      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe('switchgear_wizard');
      expect(activeSurface?.routeState.route).toBe('switchgear');
      expect(activeSurface?.openMode).toBe('expand_workspace');
    });
  });

  it('otwiera nakladke wynikowa na schemacie bez utraty kontekstu projektu', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-overlay', 'Zakres nakladki', 'ShortCircuitCase', 'FRESH');
    window.location.hash = '#analysis?case=case-overlay&run=run-overlay&sel=sub%2F1%2Fsubstation&type=Station&name=Stacja+S01';

    render(<App />);

    await screen.findByTestId('results-inspector-page');
    await act(async () => {
      screen.getByTestId('layout-menu-overlay').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(window.location.hash).toContain('#sld');
    expect(window.location.hash).toContain('case=case-overlay');
    expect(window.location.hash).toContain('run=run-overlay');
    expect(window.location.hash).toContain('sel=sub%2F1%2Fsubstation');
    expect(window.location.hash).toContain('overlay=1');
    expect(window.location.hash).toContain('legend=1');
  });
});
