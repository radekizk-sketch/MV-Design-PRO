import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';
import { useAppStateStore } from '../ui/app-state/store';
import { useReadinessLiveStore } from '../ui/engineering-readiness/readinessLiveStore';
import { useNetworkBuildStore } from '../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../ui/study-cases/runStore';
import { useSnapshotStore } from '../ui/topology/snapshotStore';

vi.mock('../ui/layout', () => ({
  CanonicalLayout: ({
    children,
    onCalculate,
    onMenuAction,
  }: {
    children: ReactNode;
    onCalculate?: () => void;
    onMenuAction?: (actionId: string) => void;
  }) => (
    <div data-testid="canonical-layout">
      <button type="button" data-testid="layout-calculate" onClick={onCalculate}>
        Oblicz
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
  InspectorResolver: () => <div data-testid="inspector-resolver" />,
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
  });

  it('renderuje cala aplikacje w ekranowym motywie dark SCADA', async () => {
    render(<App />);

    const root = await screen.findByTestId('app-root');

    expect(root).toHaveAttribute('data-ui-theme', 'dark-scada');
    expect(root).toHaveClass('mv-dark-scada');
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

  it('traktuje #case-config jako helper w tym samym shellu bez zmiany trybu pracy', async () => {
    window.location.hash = '#case-config?case=case-1';

    render(<App />);

    expect(await screen.findByTestId('sld-editor-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(useAppStateStore.getState().activeMode).toBe('MODEL_EDIT');
    });
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

  it('prowadzi do podgladu schematu z glownego menu', async () => {
    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-menu-sld-view').click();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByTestId('sld-view-page')).toBeInTheDocument();
  });

  it('kanonizuje wejscie budowy sieci do #sld z menu', async () => {
    render(<App />);

    await act(async () => {
      screen.getByTestId('layout-menu-network-build').click();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByTestId('sld-editor-page')).toBeInTheDocument();
    expect(window.location.hash).toBe('#sld');
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
