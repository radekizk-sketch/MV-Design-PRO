/*
 * Znacznik świeżości wyników w pasku aktywnego przypadku — ŚCIEŻKA REALNA
 * (karta K4/D1 + dług V12K-309 poz. 2).
 *
 * DEFEKT (pomiar audytu 2026-08-01): po edycji modelu następującej PO biegu
 * chip trwał na „Wyniki: aktualne" — model rew. 9, wynik z rew. 8. Serwerowy
 * `result_status` zmienia się dopiero, gdy KTOŚ unieważni przypadek, a edycja
 * modelu przez tę ścieżkę nie przechodzi. Kanon mówi wprost: zmiana modelu
 * unieważnia wyniki przypadku — chrom temu przeczył.
 *
 * DLACZEGO PRZEPISANY. Poprzednia wersja tego pliku wpisywała `activeCase`
 * wprost do store'u (`useStudyCasesStore.setState`) i sprawdzała, że chip
 * pokazuje etykietę odpowiadającą wpisanemu statusowi. Taki test przechodził
 * ZAWSZE — także z defektem — bo mierzył przepisanie pola, a nie werdykt
 * świeżości (CLAUDE.md Zero-Debt pkt 5: test maskujący defekt produktu).
 * Tutaj store'y zasilają PRODUKCYJNE hooki (`useLegacyOrchestrator` +
 * `useHydratacjaPowloki`) odpowiedziami serwera w kształcie backendu, chip jest
 * produkcyjny, a klik — natywny.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { CaseBar } from '../CaseBar';
import { SHELL_STRINGS } from '../strings';
import { useShellCaseInfo } from '../shellStatus';
import { useShellStore } from '../useShellStore';
import { useHydratacjaPowloki } from '../useHydratacjaPowloki';
import { useLegacyOrchestrator } from '../../legacy/useLegacyOrchestrator';
import { useAppStateStore } from '../../../ui/app-state';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { getProject } from '../../../ui/projects/api';
import { getStudyCase } from '../../../ui/study-cases/api';

vi.mock('../../../ui/projects/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/projects/api')>();
  return { ...actual, getProject: vi.fn() };
});

vi.mock('../../../ui/study-cases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/study-cases/api')>();
  return { ...actual, getStudyCase: vi.fn() };
});

const PROJECT_ID = 'proj-swiezosc';
const CASE_ID = 'case-swiezosc';
/*
 * Osobny identyfikator przebiegu na scenariusz. `useAnalysisRunContract` trzyma
 * pamięć podręczną kontraktów per przebieg NA POZIOMIE MODUŁU (rewizja biegu jest
 * niezmienna, więc w produkcji to poprawne) — wspólny identyfikator sprawiłby, że
 * drugi scenariusz czytałby kontrakt pierwszego zamiast własnej odpowiedzi serwera.
 */
const RUN_MODEL_NOWSZY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const RUN_ZGODNY = '1d7f4a52-0c33-4a1e-9a58-2b4c6d8e0f13';
const RUN_BEZ_REWIZJI = 'b2c4e6a8-1357-42d9-8e0b-3f5a7c9d1e24';
const MODEL_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809';

/** Migawka ENM o zadanej rewizji — kształt jak w odpowiedzi domain-ops. */
function enmSnapshot(revision: number) {
  return {
    header: {
      enm_version: '1.0',
      name: 'Sieć SN Przykładowa',
      revision,
      hash_sha256: MODEL_HASH,
    },
    sources: [{ ref_id: 'SRC-GPZ-1', name: 'GPZ 15 kV', bus_ref: 'BUS-SN-1' }],
    buses: [
      { ref_id: 'BUS-SN-1', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'BUS-SN-2', name: 'Szyna odpływowa', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'LIN-1', type: 'line_overhead', from_ref: 'BUS-SN-1', to_ref: 'BUS-SN-2' }],
    transformers: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    line_runs: [],
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
  };
}

function domainOpResponse(revision: number) {
  return {
    snapshot: enmSnapshot(revision),
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness: { ready: true, blockers: [], warnings: [] },
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: { lines_sn: {}, transformers_sn_nn: {} },
    layout: { layout_hash: MODEL_HASH, layout_version: 'v1' },
  };
}

/** Przypadek w kształcie `StudyCaseResponse` (api/study_cases.py) — serwer mówi FRESH. */
function studyCaseResponse() {
  return {
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    description: '',
    config: {},
    result_status: 'FRESH',
    results_valid: true,
    is_active: true,
    result_refs: [],
    revision: 3,
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-01T09:30:00Z',
  };
}

/** Rekord przebiegu w kształcie `/api/execution/study-cases/{id}/runs`. */
function runRecord(runId: string) {
  return {
    id: runId,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'sha-in',
    status: 'DONE',
    started_at: '2026-08-01T09:20:00Z',
    finished_at: '2026-08-01T09:20:11Z',
    error_message: null,
  };
}

/**
 * Kontrakt przebiegu (`/api/analysis-runs/{id}`) — pole `rewizja_modelu` w
 * `analysis_case_context` (backend: api/analysis_case_context.py, V12K-264).
 * `null` odwzorowuje bieg zapisany przed wprowadzeniem tej liczby.
 */
function analysisRunContract(runId: string, rewizjaModelu: number | null) {
  return {
    id: runId,
    analysis_type: 'short_circuit_sn',
    status: 'FINISHED',
    result_status: 'VALID',
    results_valid: true,
    created_at: '2026-08-01T09:20:00Z',
    finished_at: '2026-08-01T09:20:11Z',
    input_hash: 'sha-in',
    summary_json: {},
    analysis_case_context: {
      case_ref: CASE_ID,
      case_kind: 'ZWARCIOWY_MAKS',
      snapshot_ref: MODEL_HASH,
      run_ref: runId,
      quality_gate: 'G4',
      applicability_scope: ['SC', 'REPORT'],
      completeness: 'complete',
      missing_prerequisites: [],
      assumptions: {},
      lineage: {},
      rewizja_modelu: rewizjaModelu,
    },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * Zaślepka sieci w kształcie realnego backendu.
 * @param runId identyfikator przebiegu tego scenariusza
 * @param rewizjaModelu rewizja BIEŻĄCEGO modelu (odpowiedź domain-ops)
 * @param rewizjaWyniku rewizja, na której policzono bieg (kontrakt przebiegu)
 */
function stubFetch(runId: string, rewizjaModelu: number, rewizjaWyniku: number | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/projects/${PROJECT_ID}`) {
        return jsonResponse({ id: PROJECT_ID, name: 'Sieć SN Przykładowa' });
      }
      if (url === `/api/study-cases/project/${PROJECT_ID}/active`) {
        return jsonResponse(studyCaseResponse());
      }
      if (url === `/api/study-cases/project/${PROJECT_ID}`) {
        return jsonResponse([
          {
            id: CASE_ID,
            name: 'Zwarcia maks.',
            description: '',
            result_status: 'FRESH',
            results_valid: true,
            is_active: true,
            updated_at: '2026-08-01T09:30:00Z',
          },
        ]);
      }
      if (url === `/api/study-cases/${CASE_ID}`) {
        return jsonResponse(studyCaseResponse());
      }
      if (url === `/api/execution/study-cases/${CASE_ID}/runs`) {
        return jsonResponse({ runs: [runRecord(runId)] });
      }
      if (url === `/api/analysis-runs/${runId}`) {
        return jsonResponse(analysisRunContract(runId, rewizjaWyniku));
      }
      if (url === `/api/cases/${CASE_ID}/enm/domain-ops`) {
        return jsonResponse(domainOpResponse(rewizjaModelu));
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

function Probe() {
  useLegacyOrchestrator();
  useHydratacjaPowloki('connected');
  const info = useShellCaseInfo();
  return (
    <CaseBar
      info={info}
      onPrzejdzDoObliczen={() => useShellStore.getState().setActiveSpace('obliczenia')}
    />
  );
}

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();
const initialStudyCasesState = useStudyCasesStore.getState();

/** Czeka, aż chrom pozna OBIE rewizje (model z migawki, wynik z kontraktu). */
async function poczekajNaZnacznik(): Promise<void> {
  await waitFor(() => {
    expect(useSnapshotStore.getState().snapshot?.header.revision).toBeDefined();
    expect(useStudyCasesStore.getState().activeCase?.result_status).toBe('FRESH');
    expect(useExecutionRunsStore.getState().runs).toHaveLength(1);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.location.hash = '';
  vi.mocked(getProject).mockResolvedValue({
    id: PROJECT_ID,
    name: 'Sieć SN Przykładowa',
  } as Awaited<ReturnType<typeof getProject>>);
  vi.mocked(getStudyCase).mockResolvedValue({
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    result_status: 'FRESH',
  } as Awaited<ReturnType<typeof getStudyCase>>);
  useShellStore.setState({ activeSpace: 'projekt' });
  useAppStateStore.setState(initialAppState, true);
  useExecutionRunsStore.setState(initialExecutionState, true);
  useSnapshotStore.setState(initialSnapshotState, true);
  useNetworkBuildStore.setState(initialNetworkBuildState, true);
  useSelectionStore.setState(initialSelectionState, true);
  useStudyCasesStore.setState(initialStudyCasesState, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Znacznik świeżości wyników w pasku aktywnego przypadku (K4/D1 + V12K-309 poz. 2)', () => {
  it('POMIAR AUDYTU: model rew. 9, wynik z rew. 8 → „Wyniki: nieaktualne" i natywny klik prowadzi do obliczeń', async () => {
    stubFetch(RUN_MODEL_NOWSZY, 9, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik();

    const chip = await screen.findByText(SHELL_STRINGS.resultsOutdated);
    const przycisk = screen.getByTestId('mvd-casebar-results');
    expect(przycisk).toContainElement(chip);
    // Serwer nadal melduje FRESH — werdykt bierze się z porównania rewizji.
    expect(useStudyCasesStore.getState().activeCase?.result_status).toBe('FRESH');
    expect(przycisk.tagName).toBe('BUTTON');

    fireEvent.click(przycisk);
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('rewizje zgodne (model 8, wynik 8) → „Wyniki: aktualne", znacznik statyczny', async () => {
    stubFetch(RUN_ZGODNY, 8, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik();

    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });
    const chip = screen.getByTestId('mvd-casebar-results');
    expect(chip.tagName).toBe('SPAN');

    fireEvent.click(chip);
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('PODGLĄD PRZEBIEGU w store nie oślepia chipu: werdykt trwa przy rewizji BIEŻĄCEGO modelu (S9-11 / W-5)', async () => {
    // Wejście na link przebiegu wpisuje do `useSnapshotStore` migawkę SPRZED
    // biegu (`setAnalysisRunSnapshot`). Jej `header.revision` równa się rewizji
    // wyniku ZAWSZE — naiwne porównanie z nią wychodziłoby „aktualne"
    // niezależnie od tego, jak daleko pojechał żywy model. Do karty S9-11 chip
    // odpowiadał na to „nieustalone" (ślepota zamiast fałszu — dług
    // S9-3-DLUG-W5); teraz rewizja bieżącego modelu żyje w OSOBNYM polu
    // (`rewizjaBiezacegoModelu`), którego podgląd nie dotyka — chip mówi
    // PRAWDĘ w obu kierunkach. Obie akcje store'u są PRODUKCYJNE.
    stubFetch(RUN_ZGODNY, 8, 8);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik();

    // Model żywy: rewizje zgodne ⇒ uczciwe „aktualne".
    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });

    // Kierunek 1: model NIE zmienił się od biegu — podgląd przebiegu w store
    // nie zmienia werdyktu („aktualne" zostaje, bez ślepego „nieustalone").
    const migawka = useSnapshotStore.getState().snapshot;
    expect(migawka).not.toBeNull();
    act(() => {
      useSnapshotStore.getState().setAnalysisRunSnapshot(migawka!, 'snap-podglad');
    });
    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsFresh,
      );
    });

    // Kierunek 2 (PUŁAPKA z pomiaru audytu): model jedzie dalej (rew. 9,
    // odpowiedź domain-ops — akcja produkcyjna `setSnapshot`)…
    act(() => {
      useSnapshotStore.getState().setSnapshot(
        domainOpResponse(9) as never,
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsOutdated,
      );
    });

    // …a potem wraca PODGLĄD przebiegu z rew. 8 (= rewizja wyniku). Naiwne
    // porównanie z rewizją migawki dałoby „aktualne" — chip MUSI trwać na
    // „nieaktualne", bo bieżący model to wciąż rew. 9.
    act(() => {
      useSnapshotStore.getState().setAnalysisRunSnapshot(migawka!, 'snap-podglad-2');
    });
    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsOutdated,
      );
    });
    expect(screen.getByTestId('mvd-casebar-results')).not.toHaveTextContent(
      SHELL_STRINGS.resultsFresh,
    );
  });

  it('kontrakt przebiegu bez rewizji → „Wyniki: nieustalone", nigdy „aktualne"', async () => {
    stubFetch(RUN_BEZ_REWIZJI, 9, null);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);
    await poczekajNaZnacznik();

    await waitFor(() => {
      expect(screen.getByTestId('mvd-casebar-results')).toHaveTextContent(
        SHELL_STRINGS.resultsUnknown,
      );
    });
    expect(screen.getByTestId('mvd-casebar-results')).not.toHaveTextContent(
      SHELL_STRINGS.resultsFresh,
    );
  });
});
