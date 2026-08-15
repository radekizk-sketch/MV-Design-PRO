/*
 * JEDNA PRAWDA STANU WYNIKÓW (karta S9-11, znalezisko W-5 audytu
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`, waga 2: „trzy miejsca, trzy
 * odpowiedzi" — pasek zakresu mówił „Wyniki: nieustalone", widok wyników
 * „● aktualne", pasek stanu podawał przebieg z datą).
 *
 * ŹRÓDŁO SPRZECZNOŚCI (pomiar, nie lektura): chip paska przypadku i znacznik
 * nagłówka ekranów wyników liczyły „bieżącą rewizję modelu" z DWÓCH różnych
 * reguł na TEJ SAMEJ liczbie (`snapshot.header.revision`): chip odmawiał
 * werdyktu przy podglądzie przebiegu (→ „nieustalone"), nagłówek używał
 * rewizji podglądu jako bieżącej (→ „aktualne"). Po S9-11 OBA czytają jedno
 * pole `useSnapshotStore.rewizjaBiezacegoModelu` i rozstrzygają JEDNYM
 * predykatem `czyNieaktualne` — ten test przypina deklarację „dwa wskaźniki
 * nigdy nie mówią sprzecznie" (reguła KLASA, NIE INSTANCJA §4).
 *
 * ILOCZYN STANÓW (wymóg karty): {brak biegu × bieg świeży × bieg nieaktualny
 * po edycji modelu} × {migawka bieżąca w store × PODGLĄD PRZEBIEGU w store}.
 * Store migawki zasilany WYŁĄCZNIE akcjami produkcyjnymi (`setSnapshot`,
 * `setAnalysisRunSnapshot`, `reset`); kontrakt przebiegu przychodzi fetch'em
 * w kształcie backendu (`analysis_case_context.rewizja_modelu`), a czytelnicy
 * (chip: `useShellCaseInfo`; nagłówek: `useSwiezoscNaglowka` + predykat
 * `czyNieaktualne` — ten sam, którym renderuje `FreshnessBadge`) są produkcyjni.
 */
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSwiezoscNaglowka } from '../useSwiezoscNaglowka';
import { czyNieaktualne } from '../../inspector/inspectorModel';
import { useShellCaseInfo } from '../../shell/shellStatus';
import { useAppStateStore } from '../../../ui/app-state';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';

const PROJECT_ID = 'proj-jedna-prawda';
const CASE_ID = 'case-jedna-prawda';
const RUN_ID = '5a6b7c8d-1e2f-4a3b-8c4d-9e0f1a2b3c4d';
const MODEL_HASH = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

function enmSnapshot(revision: number) {
  return {
    header: { enm_version: '1.0', name: 'Sieć SN', revision, hash_sha256: MODEL_HASH },
    sources: [{ ref_id: 'SRC-1', name: 'GPZ', bus_ref: 'BUS-1' }],
    buses: [{ ref_id: 'BUS-1', name: 'Szyna SN', voltage_kv: 15 }],
    branches: [],
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

/** Przypadek w kształcie serwera (`StudyCaseResponse`). */
function studyCase(resultStatus: 'NONE' | 'FRESH', resultsValid: boolean) {
  return {
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    description: '',
    config: {},
    result_status: resultStatus,
    results_valid: resultsValid,
    is_active: true,
    result_refs: [],
    revision: 3,
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-01T09:30:00Z',
  } as never;
}

function runRecord(): ExecutionRun {
  return {
    id: RUN_ID,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'sha-in',
    status: 'DONE',
    started_at: '2026-08-01T09:20:00Z',
    finished_at: '2026-08-01T09:20:11Z',
    error_message: null,
  };
}

/** Kontrakt przebiegu w kształcie backendu — `rewizja_modelu` biegu = 8. */
function analysisRunContract() {
  return {
    id: RUN_ID,
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
      run_ref: RUN_ID,
      quality_gate: 'G4',
      applicability_scope: ['SC'],
      completeness: 'complete',
      missing_prerequisites: [],
      assumptions: {},
      lineage: {},
      rewizja_modelu: 8,
    },
  };
}

/** Werdykt znacznika nagłówka ekranów wyników — TEN SAM predykat co FreshnessBadge. */
function werdyktNaglowka(sw: ReturnType<typeof useSwiezoscNaglowka>): string {
  if (sw.rewizjaDanych === undefined || sw.rewizjaModelu === undefined) {
    return 'bez-znacznika';
  }
  return czyNieaktualne(sw.rewizjaDanych, sw.rewizjaModelu) ? 'nieaktualne' : 'aktualne';
}

function Probe({ runId }: { runId: string | null }) {
  const info = useShellCaseInfo();
  const sw = useSwiezoscNaglowka(runId);
  return (
    <>
      <output data-testid="werdykt-chip">{info.znacznikWynikow.status}</output>
      <output data-testid="werdykt-naglowka">{werdyktNaglowka(sw)}</output>
    </>
  );
}

/** Pary DOZWOLONE — każda inna kombinacja to sprzeczność dwóch wskaźników. */
const ZGODNOSC: Record<string, string> = {
  NONE: 'bez-znacznika',
  NIEUSTALONE: 'bez-znacznika',
  FRESH: 'aktualne',
  OUTDATED: 'nieaktualne',
};

async function oczekujZgodnosci(oczekiwanyChip: string): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('werdykt-chip').textContent).toBe(oczekiwanyChip);
  });
  const chip = screen.getByTestId('werdykt-chip').textContent ?? '';
  const naglowek = screen.getByTestId('werdykt-naglowka').textContent ?? '';
  expect(naglowek, `chip=${chip} vs nagłówek=${naglowek} — dwa wskaźniki mówią sprzecznie`).toBe(
    ZGODNOSC[chip],
  );
}

const initialSnapshotState = useSnapshotStore.getState();
const initialAppState = useAppStateStore.getState();
const initialStudyCasesState = useStudyCasesStore.getState();
const initialRunsState = useExecutionRunsStore.getState();

beforeEach(() => {
  useSnapshotStore.setState(initialSnapshotState, true);
  useAppStateStore.setState(initialAppState, true);
  useStudyCasesStore.setState(initialStudyCasesState, true);
  useExecutionRunsStore.setState(initialRunsState, true);
  act(() => {
    useSnapshotStore.getState().reset();
  });
  useAppStateStore.setState({
    activeProjectId: PROJECT_ID,
    activeProjectName: 'Sieć SN',
    activeCaseId: CASE_ID,
  } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/analysis-runs/${RUN_ID}`) {
        return { ok: true, status: 200, json: async () => analysisRunContract() } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('S9-11 / W-5 — dwa wskaźniki stanu wyników nigdy nie mówią sprzecznie', () => {
  it('BRAK BIEGU: chip „brak", nagłówek bez znacznika — zgodna odmowa', async () => {
    useStudyCasesStore.setState({ activeCase: studyCase('NONE', false) } as never);
    useExecutionRunsStore.setState({ runs: [] } as never);
    act(() => {
      useSnapshotStore.getState().setSnapshot(domainOpResponse(8) as never);
    });

    render(<Probe runId={null} />);
    await oczekujZgodnosci('NONE');
  });

  it('BIEG ŚWIEŻY (model 8 = wynik 8): oba „aktualne" — także przy PODGLĄDZIE przebiegu w store', async () => {
    useStudyCasesStore.setState({ activeCase: studyCase('FRESH', true) } as never);
    useExecutionRunsStore.setState({ runs: [runRecord()] } as never);
    act(() => {
      useSnapshotStore.getState().setSnapshot(domainOpResponse(8) as never);
    });

    render(<Probe runId={RUN_ID} />);
    await oczekujZgodnosci('FRESH');

    // Podgląd przebiegu (akcja produkcyjna wejścia na link biegu) nie zmienia
    // ŻADNEGO z dwóch werdyktów — rewizja bieżącego modelu żyje osobno.
    act(() => {
      useSnapshotStore.getState().setAnalysisRunSnapshot(enmSnapshot(8) as never, 'snap-1');
    });
    await oczekujZgodnosci('FRESH');
  });

  it('BIEG NIEAKTUALNY po edycji modelu (model 9 > wynik 8): oba „nieaktualne" — także przy PODGLĄDZIE', async () => {
    useStudyCasesStore.setState({ activeCase: studyCase('FRESH', true) } as never);
    useExecutionRunsStore.setState({ runs: [runRecord()] } as never);
    act(() => {
      useSnapshotStore.getState().setSnapshot(domainOpResponse(9) as never);
    });

    render(<Probe runId={RUN_ID} />);
    await oczekujZgodnosci('OUTDATED');

    // PUŁAPKA z pomiaru audytu: podgląd przebiegu ma rewizję 8 (= rewizja
    // wyniku) — naiwny czytelnik rewizji migawki ogłosiłby „aktualne".
    act(() => {
      useSnapshotStore.getState().setAnalysisRunSnapshot(enmSnapshot(8) as never, 'snap-2');
    });
    await oczekujZgodnosci('OUTDATED');
  });

  it('REWIZJA NIEZNANA (zimne wejście na podgląd, zero odpowiedzi o bieżącym modelu): zgodna odmowa', async () => {
    useStudyCasesStore.setState({ activeCase: studyCase('FRESH', true) } as never);
    useExecutionRunsStore.setState({ runs: [runRecord()] } as never);
    act(() => {
      // Wyłącznie podgląd przebiegu w store — bieżącej rewizji nikt nie poznał.
      useSnapshotStore.getState().setAnalysisRunSnapshot(enmSnapshot(8) as never, 'snap-3');
    });

    render(<Probe runId={RUN_ID} />);
    await oczekujZgodnosci('NIEUSTALONE');
  });
});
