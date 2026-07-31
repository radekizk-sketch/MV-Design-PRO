import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../app-state/store';
import {
  ustawGotowoscMigawki,
  wyczyscGotowoscMigawki,
} from '../../../test/gotowoscTestUtils';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useShellStore } from '../../../ui2/shell/useShellStore';
import { renderWithQueryClient } from '../../../test/queryClientTestUtils';

// Faza 8: WorkspaceSurfaceRouter teraz uzywa hookow audit2 (React Query).
// Wszystkie testy wymagaja QueryClientProvider.
const render = renderWithQueryClient;
void rtlRender; // keep import for type compat
import { WorkspaceOperationalBar } from '../WorkspaceOperationalBar';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import {
  ANALYSIS_SURFACE_SCREEN_CODE,
  REPORT_SURFACE_SCREEN_CODE,
  SCREEN_MATRIX,
  SURFACE_REGISTRY,
} from '../types';

const fetchMock = vi.fn();

const mockAnalysisRunDetail = {
  id: 'run-1',
  analysis_type: 'PF',
  status: 'FINISHED',
  result_status: 'VALID',
  results_valid: true,
  created_at: '2026-04-20T08:00:00Z',
  finished_at: '2026-04-20T08:05:00Z',
  input_hash: 'hash-1',
  proof_pack_ref: 'proof-pack-1',
  export_artifact: {
    export_ref: 'export-1',
    export_kind: 'json',
    analysis_case_ref: 'case-1',
    proof_pack_ref: 'proof-pack-1',
    result_hash: 'result-hash-1',
    input_hash: 'hash-1',
    generated_at: '2026-04-20T08:05:00Z',
    generated_by_version: 'v12_5_export_artifact/1.0',
    completeness_status: 'complete',
  },
  export_policy: {
    export_kind: 'json',
    allows_partial: true,
    requires_confirmation: false,
    carries_analysis_case_context: true,
    carries_proof_pack_ref: true,
    carries_result_hash: true,
    carries_input_hash: true,
    carries_generated_at: true,
    carries_generated_by_version: true,
    null_rendering: 'null',
    not_applicable_rendering: 'label',
    partial_rendering: 'status_field',
  },
  summary_json: {
    converged: true,
    iterations: 5,
    summary: {
      total_losses_p_mw: 1.25,
    },
  },
  trace_summary: {
    count: 3,
    first_step: 'prepare_input',
    last_step: 'finalize',
    phases: ['prepare', 'solve', 'finalize'],
    duration_ms: 42,
    warnings: [],
  },
  analysis_case_context: {
    case_ref: 'case-1',
    case_kind: 'ROZPLYW_MAX_OBC',
    snapshot_ref: 'snapshot-001',
    variant_ref: 'variant-a',
    run_ref: 'run-1',
    proof_pack_ref: 'proof-pack-1',
    quality_gate: 'G4',
    applicability_scope: ['PF', 'REPORT'],
    completeness: 'complete',
    completeness_legacy: 'complete',
    missing_prerequisites: [],
    assumptions: {
      source_assumptions_ref: 'pf_source_nominal',
      load_assumptions_ref: 'pf_load_max',
      switching_state_ref: 'snapshot_switching_state',
      grounding_assumptions_ref: 'network_grounding_snapshot',
      temperature_assumptions_ref: 'temperature_operating',
      transformer_tap_assumptions_ref: 'oltc_active',
      ibg_assumptions_ref: 'ibg_model_snapshot',
    },
    lineage: {
      project_ref: 'project-1',
      run_ref: 'run-1',
      analysis_type: 'PF',
      snapshot_ref: 'snapshot-001',
    },
    reproducibility: {
      solver_family: 'NR',
      solver_version: '1.0.0',
      method_version: '2026.04',
      formula_set_version: '2026.04',
      standard_basis_ref: ['IEC-60909'],
      input_hash: 'hash-1',
      result_hash: 'result-hash-1',
      domain_model_version: 'dm-1',
      bay_contract_version: 'bay-1',
      results_contract_version: 'results-1',
      proof_renderer_version: 'proof-1',
      catalog_snapshot_ref: 'catalog-1',
      catalog_schema_version: 'schema-1',
      tolerance_policy_ref: 'tol-1',
      rounding_policy_ref: 'round-1',
      quality_gate_policy_version: 'gate-1',
    },
  },
};

function mockJsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    statusText: 'OK',
    json: async () => payload,
  });
}

vi.stubGlobal('fetch', fetchMock);

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: ({ onSelectRun }: { onSelectRun?: (runId: string) => void }) => (
    <button type="button" data-testid="run-history-panel" onClick={() => onSelectRun?.('run-1')}>
      Run history
    </button>
  ),
}));

vi.mock('../../results-inspector', () => ({
  ResultsInspectorPage: ({ forcedTab }: { forcedTab?: string }) => (
    <div data-testid="results-inspector-page">{forcedTab ? 'RESULTS' : 'BRAK_ZAKLADKI'}</div>
  ),
}));

vi.mock('../../power-flow-results', () => ({
  PowerFlowResultsInspectorPage: () => <div data-testid="power-flow-results-page">PF</div>,
}));

vi.mock('../../protection-results', () => ({
  ProtectionResultsInspectorPage: () => <div data-testid="protection-results-page">PROT</div>,
}));

vi.mock('../../comparison/ResultsComparisonPage', () => ({
  ResultsComparisonPage: () => <div data-testid="results-comparison-page">CMP</div>,
}));

vi.mock('../../../ui2/kreatory/zrodlo', () => ({
  KreatorZrodloZasilania: () => (
    <div data-testid="add-grid-source-form">Formularz dodania GPZ do modelu sieci</div>
  ),
}));

describe('workspace shell V12.5 surfaces', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => mockJsonResponse(mockAnalysisRunDetail));
    useNetworkBuildStore.getState().reset();
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useSnapshotStore.getState().reset();
    wyczyscGotowoscMigawki();
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
  });

  it('renderuje formularz operacji GPZ w regionie głównym (pełna szerokość) zamiast statycznego edytora E-10', () => {
    useNetworkBuildStore.getState().openOperationForm('add_grid_source_sn');

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Dodaj źródło zasilania GPZ' })).toBeInTheDocument();
    expect(screen.getByTestId('add-grid-source-form')).toBeInTheDocument();
    expect(screen.queryByText(/add_grid_source_sn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
  });

  it('renderuje przemyslowy surface E-30 w glownym shellu', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-30', {
      subjectKind: 'analysis_case',
      subjectRef: 'case-1',
      openMode: 'expand_workspace',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    // F-E5a → P-2: E-30 renderuje REALNY ekran ui2 `EkranZbieznosci`
    // (koniec zastępczego dostawcy kontraktu analizy). Zachowana intencja
    // testu: nagłówek kanoniczny (SurfaceHeader, h2 z titlePl) + nagłówek
    // obszaru ekranu (h3), bez surowych kodów E-\d+ ani placeholderów.
    // Bez aktywnego projektu ekran pokazuje UCZCIWY stan zerowy z akcją.
    expect(
      screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-30'].titlePl }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zbieznosc')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-mini-sld')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Zbieżność rozpływu/i })).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zbieznosc-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByText(/^E-\d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Powierzchnia pomocnicza/i)).not.toBeInTheDocument();
  });

  it('renderuje panelowy surface E-31 jako realny ekran stanu fazowego', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    useNetworkBuildStore.getState().openRouteSurface('E-31', {
      titlePl: SURFACE_REGISTRY['E-31'].titlePl,
      sizeClass: 'B',
      openMode: 'replace_right_panel',
      supportsMiniSld: false,
      tabId: 'fazy',
      subjectKind: 'analysis_run',
      subjectRef: 'case-1',
    });

    render(<WorkspaceSurfaceRouter region="panel" />);

    // F-E5a → P-2: E-31 renderuje REALNY ekran ui2 `EkranStanuFazowego`
    // (koniec zastępczego dostawcy kontraktu analizy). Intencja testu:
    // nagłówek kanoniczny (h2 z titlePl) + realny ekran; bez aktywnego
    // projektu — UCZCIWY stan zerowy z akcją naprawczą, bez surowych kodów.
    expect(screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-31'].titlePl })).toBeInTheDocument();
    expect(screen.getByTestId('mvd-stan-fazowy')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-fazowy-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByText('proof-pack-1')).not.toBeInTheDocument();
    expect(screen.queryByText(/^E-\d+/)).not.toBeInTheDocument();
  });

  it('renderuje surface E-37 z kontraktem eksportu dla aktywnego runu', async () => {
    useAppStateStore.getState().setActiveRun('run-1');
    useNetworkBuildStore.getState().openRouteSurface('E-37', {
      titlePl: SURFACE_REGISTRY['E-37'].titlePl,
      sizeClass: 'C',
      supportsMiniSld: true,
      subjectKind: 'report',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-37'].titlePl })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: /Kontrakt raportu i eksportu/i })).toBeInTheDocument();
    expect(screen.getAllByText('JSON').length).toBeGreaterThan(0);
    expect(screen.getByText('pole statusu')).toBeInTheDocument();
    expect(screen.queryByText('proof-pack-1')).not.toBeInTheDocument();
    expect(screen.getAllByText('Zapisane w śladzie audytu').length).toBeGreaterThan(0);
  });

  it('karta Stan obliczeń wariantu pokazuje stan inżynierski bez żargonu i akcje przejść', () => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useAppStateStore.getState().setActiveCase('case-1', 'Lato — szczyt obciążenia');

    useNetworkBuildStore.getState().openRouteSurface('variants_runs');

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Stan obliczeń wariantu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Stan obliczeń wariantu' })).toBeInTheDocument();

    expect(screen.queryByTestId('workspace-mini-sld')).not.toBeInTheDocument();
    expect(screen.queryByText(/case-manager/i)).not.toBeInTheDocument();

    expect(screen.getByText('Projekt')).toBeInTheDocument();
    expect(screen.getByText('Wariant pracy sieci')).toBeInTheDocument();
    expect(screen.getByText('Stan obliczeń')).toBeInTheDocument();
    expect(screen.getByText('Liczba wykonanych obliczeń')).toBeInTheDocument();
    expect(screen.getByText('Ostatnie obliczenie')).toBeInTheDocument();
    expect(screen.getByText('Następny krok')).toBeInTheDocument();
    expect(screen.getByText('GPZ Wschód')).toBeInTheDocument();
    expect(screen.getByText('Lato — szczyt obciążenia')).toBeInTheDocument();
    expect(screen.getByText('Nie wykonano obliczeń do prezentacji')).toBeInTheDocument();
    expect(screen.getByText('Nie wykonano obliczeń')).toBeInTheDocument();
    expect(
      screen.getByText(/Nie wykonano jeszcze obliczeń dla tego wariantu/i),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Przegląd techniczny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pokaż wyniki' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Porównaj wyniki' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raport techniczny' })).toBeInTheDocument();

    const visibleText = document.body.textContent ?? '';
    expect(visibleText).not.toMatch(/MINI-SLD|VARIANTS_RUNS|variants_runs|Status migracji|Wersja modelu|Brak aktywnego uruchomienia|proof-pack|snapshot-/i);
  });

  it('karta Stan obliczeń wariantu liczy wykonane obliczenia i pokazuje ostatnie bez identyfikatorów', () => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useAppStateStore.getState().setActiveCase('case-1', 'Wariant pracy A');
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-a',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'h-a',
          status: 'DONE',
          started_at: '2026-04-19T10:00:00Z',
          finished_at: '2026-04-19T10:01:00Z',
          error_message: null,
        },
        {
          id: 'run-b',
          study_case_id: 'case-1',
          analysis_type: 'SC_3F',
          solver_input_hash: 'h-b',
          status: 'DONE',
          started_at: '2026-04-20T10:00:00Z',
          finished_at: '2026-04-20T10:02:00Z',
          error_message: null,
        },
        {
          id: 'run-c',
          study_case_id: 'case-1',
          analysis_type: 'SC_1F',
          solver_input_hash: 'h-c',
          status: 'PENDING',
          started_at: '2026-04-20T11:00:00Z',
          finished_at: null,
          error_message: null,
        },
      ],
    });

    useNetworkBuildStore.getState().openRouteSurface('variants_runs');
    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByText('Wyniki dostępne (wykonano 2)')).toBeInTheDocument();
    expect(screen.getByText(/Zwarcie trójfazowe \(3F\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('variants-empty-state')).not.toBeInTheDocument();

    const visibleText = document.body.textContent ?? '';
    expect(visibleText).not.toMatch(/run-a|run-b|run-c|h-a|h-b|h-c/);
  });

  it('przyciski karty Stan obliczeń wariantu otwierają istniejące powierzchnie', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useAppStateStore.getState().setActiveCase('case-1', 'Wariant pracy A');
    useNetworkBuildStore.getState().openRouteSurface('variants_runs');

    render(<WorkspaceSurfaceRouter region="main" />);

    await user.click(screen.getByRole('button', { name: 'Przegląd techniczny' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-04');
  });

  it('otwiera dedykowany surface E-28 z launchera koordynacji', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Analizy techniczne',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await user.click(screen.getByRole('button', { name: 'Koordynacja zabezpieczeń' }));

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
    expect(
      screen.getByRole('heading', { level: 2, name: SURFACE_REGISTRY['E-28'].titlePl }),
    ).toBeInTheDocument();
  });

  it('otwiera zakladke Testy NC RfG w kontenerze analitycznym E-35', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Analizy techniczne',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await user.click(screen.getByRole('button', { name: 'Testy NC RfG' }));

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe(ANALYSIS_SURFACE_SCREEN_CODE);
    expect(activeSurface?.tabId).toBe('ncrfg-tests');
    expect(screen.getByTestId('ncrfg-tests-tab')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Pakiet symulacji/i })).toBeInTheDocument();
  });

  it('nie pokazuje wewnetrznego typu analysis_run w kontekscie analitycznym', () => {
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Analizy techniczne',
      entityType: 'analysis_run',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getAllByText('Aktywne obliczenie').length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toContain('analysis_run');
  });

  it('domyślny widok analiz pokazuje tabele inżynierskie zamiast pustych kafli', () => {
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Analizy techniczne',
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(screen.getByTestId('analysis-context-table')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-results-table')).toBeInTheDocument();
    expect(screen.getByText('Tabele wyników per obiekt')).toBeInTheDocument();
    expect(screen.getAllByText(/wynik zablokowany/).length).toBeGreaterThan(0);
    expect(document.body.textContent ?? '').not.toContain('0.00');
  });

  it('zakładka śladu pokazuje pełny wywód LaTeX z backendowego artefaktu', async () => {
    const latex = String.raw`\documentclass[11pt]{article}
\begin{document}
\[
I_{k}'' = \frac{c \cdot U_n}{\left|Z_k\right|}
\]
\end{document}`;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/analysis-runs/run-1/export/proof/latex')) {
        return Promise.resolve(new Response(latex, { status: 200 }));
      }
      return mockJsonResponse(mockAnalysisRunDetail);
    });
    useAppStateStore.getState().setActiveRun('run-1');
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Ślad obliczeń',
      tabId: 'trace',
      sizeClass: 'C',
      supportsMiniSld: true,
      subjectKind: 'analysis_run',
      subjectRef: 'run-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(await screen.findByTestId('proof-latex-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('proof-latex-source')).toHaveTextContent("I_{k}'' = \\frac");
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-runs/run-1/export/proof/latex', {
      method: 'GET',
      headers: { Accept: 'application/x-tex,text/plain,*/*' },
      signal: expect.any(AbortSignal),
    });
  });

  it('po wykonanym zwarciu pokazuje backendowe wyniki IEC 60909 zamiast pustych pól ENM', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/analysis-runs/run-sc/results/index')) {
        return mockJsonResponse({
          run_header: {
            run_id: 'run-sc',
            project_id: 'project-1',
            case_id: 'case-1',
            snapshot_id: 'snapshot-001',
            created_at: '2026-05-27T12:00:00Z',
            status: 'DONE',
            result_state: 'VALID',
            solver_kind: 'SC_3F',
            input_hash: 'hash-sc',
          },
          tables: [
            {
              table_id: 'short_circuit',
              label_pl: 'Zwarcia',
              row_count: 1,
              columns: [],
            },
          ],
        });
      }
      if (url.endsWith('/api/analysis-runs/run-sc/results/short-circuit')) {
        return mockJsonResponse({
          run_id: 'run-sc',
          rows: [
            {
              target_id: 'bp/ed7/zksn',
              element_id: 'bp/ed7/zksn',
              target_name: 'ZKSN SN',
              ikss_ka: 84.3767,
              ip_ka: 121.7723,
              ith_ka: 84.3767,
              sk_mva: 2192.171,
              fault_type: '3F',
              flags: [],
            },
          ],
        });
      }
      return mockJsonResponse({ ...mockAnalysisRunDetail, id: 'run-sc', analysis_type: 'SC_3F' });
    });

    useAppStateStore.getState().setActiveRun('run-sc');
    useExecutionRunsStore.setState({
      activeRunId: 'run-sc',
      runs: [
        {
          id: 'run-sc',
          study_case_id: 'case-1',
          analysis_type: 'SC_3F',
          solver_input_hash: 'hash-sc',
          status: 'DONE',
          started_at: '2026-05-27T12:00:00Z',
          finished_at: '2026-05-27T12:00:05Z',
          error_message: null,
        },
      ],
    });
    useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
      titlePl: 'Analizy techniczne',
      subjectKind: 'analysis_run',
      subjectRef: 'run-sc',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    expect(await screen.findByText('Wyniki zwarciowe per obiekt')).toBeInTheDocument();
    expect(screen.getByText('ZKSN SN')).toBeInTheDocument();
    expect(screen.getByText(/Ik'' 84,38 kA/)).toBeInTheDocument();
    expect(screen.getByText(/ip 121,77 kA/)).toBeInTheDocument();
    expect(document.body.textContent ?? '').toMatch(/Sk'' (2\s?192|2192),171 MVA/);
    expect(document.body.textContent ?? '').not.toContain('U: nie wyznaczono');
    expect(document.body.textContent ?? '').not.toContain('0.00');
  });

  it.each([
    ['Koordynacja zabezpieczeń', 'E-28'],
    ['Rozpływ mocy NR/GS/FD', 'E-30'],
    ['Stan fazowy SN', 'E-31'],
    ['Stabilność dynamiczna', 'E-32'],
  ] as const)(
    'launcher "%s" otwiera %s z kanonicznym title/class/tab',
    async (label, screenCode) => {
      const user = userEvent.setup();
      useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
        subjectKind: 'analysis_run',
        subjectRef: 'run-1',
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      await user.click(screen.getByRole('button', { name: label }));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe(screenCode);
      expect(activeSurface?.titlePl).toBe(SURFACE_REGISTRY[screenCode].titlePl);
      expect(activeSurface?.sizeClass).toBe(SURFACE_REGISTRY[screenCode].sizeClass);
      expect(activeSurface?.tabId).toBe(SCREEN_MATRIX[screenCode].defaultTabId);
    },
  );

  // P-1: zdolności E-33/E-34 prowadzą do realnego dostawcy — zakładki zwarć
  // warsztatu Wyników (deep-link setWynikiTab, wzorzec V12K-106) — zamiast
  // zastępczego kontraktu analizy na powierzchni trasowej.
  it.each([
    ['Wkłady źródeł rozszerzone'],
    ['Weryfikacja cieplna i dynamiczna'],
  ] as const)(
    'launcher "%s" prowadzi deep-linkiem do zakładki zwarć warsztatu Wyników (P-1)',
    async (label) => {
      const user = userEvent.setup();
      useShellStore.setState({ activeSpace: 'schemat' });
      useNetworkBuildStore.getState().openRouteSurface(ANALYSIS_SURFACE_SCREEN_CODE, {
        subjectKind: 'analysis_run',
        subjectRef: 'run-1',
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      await user.click(screen.getByRole('button', { name: label }));

      expect(useShellStore.getState().wynikiTab).toBe('zwarcia');
      expect(useShellStore.getState().activeSpace).toBe('wyniki');
      // Powierzchnia trasowa bez zmian — deep-link nie otwiera kontraktu E-33/E-34.
      expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
        ANALYSIS_SURFACE_SCREEN_CODE,
      );
    },
  );

  it.each([
    ['Uzasadnienie inżynierskie', 'E-36'],
  ] as const)(
    'launcher raportowy "%s" otwiera %s z kanonicznym title/class/tab',
    async (label, screenCode) => {
      const user = userEvent.setup();
      useNetworkBuildStore.getState().openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
        subjectKind: 'report',
        subjectRef: 'report-1',
      });

      render(<WorkspaceSurfaceRouter region="main" />);

      await user.click(screen.getByRole('button', { name: label }));

      const activeSurface = useNetworkBuildStore.getState().activeSurface;
      expect(activeSurface?.screenCode).toBe(screenCode);
      expect(activeSurface?.titlePl).toBe(SURFACE_REGISTRY[screenCode].titlePl);
      expect(activeSurface?.sizeClass).toBe(SURFACE_REGISTRY[screenCode].sizeClass);
      expect(activeSurface?.tabId).toBe(SCREEN_MATRIX[screenCode].defaultTabId);
    },
  );

  it('launcher raportowy "Wkłady źródeł" prowadzi deep-linkiem do zakładki zwarć warsztatu Wyników (P-1)', async () => {
    const user = userEvent.setup();
    useShellStore.setState({ activeSpace: 'dokumentacja' });
    useNetworkBuildStore.getState().openRouteSurface(REPORT_SURFACE_SCREEN_CODE, {
      subjectKind: 'report',
      subjectRef: 'report-1',
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    await user.click(screen.getByRole('button', { name: 'Wkłady źródeł' }));

    expect(useShellStore.getState().wynikiTab).toBe('zwarcia');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe(
      REPORT_SURFACE_SCREEN_CODE,
    );
  });
});

describe('WorkspaceOperationalBar', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => mockJsonResponse(mockAnalysisRunDetail));
    useNetworkBuildStore.getState().reset();
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
    useSnapshotStore.getState().reset();
    wyczyscGotowoscMigawki();
  });

  it('otwiera surface E-09 po kliknieciu segmentu aktywnej migawki', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveCase('case-1', 'Wariant A', 'PowerFlowCase', 'OUTDATED');
    useAppStateStore.getState().setActiveSnapshot('snapshot-001');
    useExecutionRunsStore.setState({
      runs: [
        {
          id: 'run-1',
          study_case_id: 'case-1',
          analysis_type: 'LOAD_FLOW',
          solver_input_hash: 'hash-1',
          status: 'DONE',
          started_at: '2026-04-19T10:00:00Z',
          finished_at: '2026-04-19T10:01:00Z',
          error_message: null,
        },
      ],
    });
    useAppStateStore.getState().setActiveRun('run-1');
    ustawGotowoscMigawki({ ready: true });

    render(<WorkspaceOperationalBar validationStatus="valid" />);

    await user.click(screen.getByTestId('workspace-operational-snapshot'));

    const activeSurface = useNetworkBuildStore.getState().activeSurface;
    expect(activeSurface?.screenCode).toBe('E-09');
    expect(activeSurface?.titlePl).toBe('Historia i audyt');
  });

  it('nie pokazuje technicznego jezyka runtime w pasku operacyjnym', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-09', {
      titlePl: 'Historia i audyt',
      sizeClass: 'B',
      subjectKind: 'analysis_run',
      subjectRef: 'case-1',
    });

    render(<WorkspaceOperationalBar validationStatus="valid" />);

    expect(screen.getByText(/Aktywny widok:/)).toBeInTheDocument();
    expect(screen.queryByText(/Aktywny surface:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/surface/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Rama aplikacji pozostaje wspolna dla edycji, analityki i raportu/i),
    ).toBeInTheDocument();
  });

  it('ukrywa techniczny sufiks wariantu w pasku operacyjnym', () => {
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 50 szablonow mp9g6fu5', 'ShortCircuitCase', 'OUTDATED');

    render(<WorkspaceOperationalBar validationStatus="valid" />);

    const text = screen.getByTestId('workspace-operational-variant').textContent ?? '';
    expect(text).toContain('Zakres 50 szablonow');
    expect(text).not.toMatch(/mp9g6fu5|Przypadek/);
  });
});
