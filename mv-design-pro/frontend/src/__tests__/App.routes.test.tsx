import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { useAppStateStore } from '../ui/app-state/store';
import { useReadinessLiveStore } from '../ui/engineering-readiness/readinessLiveStore';
import { useNetworkBuildStore } from '../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../ui/selection/store';
import { useExecutionRunsStore } from '../ui/study-cases/runStore';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

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
      <button type="button" data-testid="layout-menu-network-build" onClick={() => onMenuAction?.('network-build')}>
        Budowa sieci
      </button>
      <button type="button" data-testid="layout-menu-readiness" onClick={() => onMenuAction?.('readiness')}>
        Gotowosc
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
    window.location.hash = '#sld';
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useSnapshotStore.getState().reset();
    useReadinessLiveStore.getState().clear();
    useNetworkBuildStore.getState().reset();
    useSelectionStore.getState().clearSelection();
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

  it('otwiera E-04 po akcji gotowosci z glownego paska', async () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-readiness', 'Zakres gotowosci', 'ShortCircuitCase', 'OUTDATED');

    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-menu-readiness').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe('E-04');
    expect(activeSurface?.tabId).toBe('braki');
    expect(activeSurface?.subjectRef).toBe('case-readiness');
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
});
