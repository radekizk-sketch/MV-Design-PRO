/**
 * Gotowość a migawka przebiegu (defekt D5, audyt szczytu 2026-08-01).
 *
 * DEFEKT: `restoreAnalysisRunSnapshot` pakował migawkę przebiegu w kopertę
 * operacji domenowej z ZASZYTYM polem `readiness: {ready:true, blockers:[],
 * warnings:[]}` i `fix_actions: []`. Koperta szła do `useSnapshotStore`, który
 * po karcie KD-1 jest JEDYNĄ prawdą gotowości (chipy paska przypadku, panel
 * „Gotowość", liczniki blokad w drzewie, paski budowy sieci). Skutek: po każdym
 * zakończonym biegu i po każdym wejściu na głęboki link przebiegu chrom
 * deklarował „Model: zwalidowany" i „Gotowość: brak uwag" na modelu, którego
 * nikt nie zwalidował — a końcówka `GET /api/analysis-runs/{run}/snapshot`
 * nie niesie gotowości w ogóle (klucze: `run_id`, `snapshot_id`, `snapshot`).
 *
 * KANON PO NAPRAWIE: gotowość opisuje BIEŻĄCY model (jedna prawda K6/KD-1) —
 * zapis migawki przebiegu jej nie dotyka, a przy zimnym wejściu na link
 * przebiegu jest ODCZYTYWANA z backendu (nigdy zmyślana; nieudany odczyt
 * zostawia stan nieustalony `null`, czyli istniejący uczciwy stan zerowy).
 *
 * ŚCIEŻKA REALNA (wymóg karty): montujemy PRODUKCYJNY hook wraz z produkcyjnym
 * chipem `CaseBar` i prowadzimy go hashem oraz odpowiedziami backendu w
 * kształcie zgodnym z `api/analysis_runs.py` i `_build_readiness`. Bez
 * wymuszania stanu store'ów `setState` i bez opakowywania ładowania w `act(...)`
 * — to właśnie ten wzorzec ukrył defekt przed poprzednimi testami.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLegacyOrchestrator } from '../useLegacyOrchestrator';
import { CaseBar } from '../../shell/CaseBar';
import { useShellCaseInfo } from '../../shell/shellStatus';
import {
  podsumujGotowosc,
  polaczGotowosc,
} from '../../spaces/gotowosc/adapters/gotowoscAdapter';
import { useShellStore } from '../../shell/useShellStore';
import { useAppStateStore } from '../../../ui/app-state';
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

const PROJECT_ID = 'proj-d5';
const CASE_ID = 'case-d5';
// UUID v4 — wzorzec `isUuid` hooka (bez tego gałąź przywracania migawki nie ruszy).
const RUN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SNAPSHOT_ID = 'snap-d5-sc3f';
const MODEL_HASH = 'f4e289d4ab57a563b8c1d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f70819';

/** Migawka ENM „sam GPZ" — model bez odbiorów i generatorów (scenariusz audytu). */
function enmSnapshot() {
  return {
    header: {
      enm_version: '1.0',
      name: 'Nowa sieć SN',
      revision: 2,
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

// Wpisy gotowości w kształcie `_build_readiness` (severity: BLOKUJACE/OSTRZEZENIE).
const W002 = {
  code: 'W002',
  message_pl:
    "Źródło 'SRC-GPZ-1' nie ma składowej zerowej (Z₀) — zwarcia 1F/2F-Z niedostępne.",
  element_ref: 'SRC-GPZ-1',
  severity: 'OSTRZEZENIE',
};
const W003 = {
  code: 'W003',
  message_pl: 'Brak odbiorów i generatorów — rozpływ mocy będzie pusty.',
  element_ref: null,
  severity: 'OSTRZEZENIE',
};
const E005 = {
  code: 'E005',
  message_pl: "Gałąź 'LIN-1' ma zerową impedancję (R=0 i X=0 Ω/km).",
  element_ref: 'LIN-1',
  severity: 'BLOKUJACE',
};

/** Model z dwoma ostrzeżeniami — walidator nie ma blokad, więc `ready` = true. */
const GOTOWOSC_OSTRZEZENIA = { ready: true, blockers: [], warnings: [W002, W003] };
/** Model, który zdążył się zepsuć — jedna blokada + te same dwa ostrzeżenia. */
const GOTOWOSC_BLOKADA = { ready: false, blockers: [E005], warnings: [W002, W003] };

const FIX_ACTIONS = [
  {
    code: 'W002',
    action_type: 'OPEN_MODAL',
    element_ref: 'SRC-GPZ-1',
    panel: 'SourceModal',
    step: 'K2',
    focus: 'SRC-GPZ-1',
    message_pl: 'Wprowadź parametry R₀/X₀ lub Z₀/Z₁ źródła.',
  },
  {
    code: 'W003',
    action_type: 'ADD_MISSING_DEVICE',
    element_ref: null,
    panel: 'LoadModal',
    step: 'K6',
    focus: null,
    message_pl: 'Dodaj odbiory lub generatory w kroku K6.',
  },
];

type Gotowosc = typeof GOTOWOSC_OSTRZEZENIA | typeof GOTOWOSC_BLOKADA;

function domainOpResponse(readiness: Gotowosc) {
  return {
    snapshot: enmSnapshot(),
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
    readiness,
    fix_actions: FIX_ACTIONS,
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: { lines_sn: {}, transformers_sn_nn: {} },
    layout: { layout_hash: MODEL_HASH, layout_version: 'v1' },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

let domainOpCalls = 0;

function stubFetch(readiness: Gotowosc) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === `/api/analysis-runs/${RUN_ID}/snapshot`) {
        // Kształt kontraktu backendu: BEZ pola `readiness` i `fix_actions`
        // (api/analysis_runs.py — klucze run_id / snapshot_id / snapshot).
        return jsonResponse({ run_id: RUN_ID, snapshot_id: SNAPSHOT_ID, snapshot: enmSnapshot() });
      }
      if (url === `/api/analysis-runs/${RUN_ID}`) {
        return jsonResponse({ status: 'DONE', result_status: 'DONE', results_valid: true });
      }
      if (url === `/api/cases/${CASE_ID}/enm/domain-ops`) {
        domainOpCalls += 1;
        return jsonResponse(domainOpResponse(readiness));
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
}

function Probe() {
  useLegacyOrchestrator();
  const info = useShellCaseInfo();
  return <CaseBar info={info} />;
}

function gotowoscZeStoru() {
  return podsumujGotowosc(useSnapshotStore.getState().readiness);
}

function kodyGotowosci() {
  const { readiness, fixActions } = useSnapshotStore.getState();
  return polaczGotowosc(readiness, fixActions).map((issue) => issue.code);
}

function czyPrzywroconoMigawkePrzebiegu() {
  return useSnapshotStore.getState().layout?.layout_version === 'analysis-run-snapshot';
}

const initialAppState = useAppStateStore.getState();
const initialExecutionState = useExecutionRunsStore.getState();
const initialSnapshotState = useSnapshotStore.getState();
const initialNetworkBuildState = useNetworkBuildStore.getState();
const initialSelectionState = useSelectionStore.getState();

describe('useLegacyOrchestrator — migawka przebiegu nie fabrykuje gotowości (D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domainOpCalls = 0;
    localStorage.clear();
    window.location.hash = '';
    vi.mocked(getProject).mockResolvedValue({
      id: PROJECT_ID,
      name: 'Nowa sieć SN',
    } as Awaited<ReturnType<typeof getProject>>);
    vi.mocked(getStudyCase).mockResolvedValue({
      id: CASE_ID,
      project_id: PROJECT_ID,
      name: 'Zwarcia 3F',
      result_status: 'FRESH',
    } as Awaited<ReturnType<typeof getStudyCase>>);
    useShellStore.setState({ activeSpace: 'projekt' });
    useAppStateStore.setState(initialAppState, true);
    useExecutionRunsStore.setState(initialExecutionState, true);
    useSnapshotStore.setState(initialSnapshotState, true);
    useNetworkBuildStore.setState(initialNetworkBuildState, true);
    useSelectionStore.setState(initialSelectionState, true);
  });

  it('po zakończonym biegu ostrzeżenia bieżącego modelu zostają (2 ostrzeżenia, nie znikają)', async () => {
    stubFetch(GOTOWOSC_OSTRZEZENIA);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);

    // PRZED: model wczytany produkcyjną ścieżką (operacja `refresh_snapshot`).
    await waitFor(() => {
      expect(gotowoscZeStoru()).toEqual({ ready: true, ustalona: true, blokady: 0, ostrzezenia: 2 });
    });
    expect(kodyGotowosci()).toEqual(['W002', 'W003']);
    expect(screen.getByTestId('mvd-casebar-readiness').textContent).toContain(
      'Gotowość: 2 ostrzeżenia',
    );

    // Bieg zakończony → aplikacja ląduje na wyniku (ta sama zmiana hasha co w
    // produkcji: `navigateToResults` ustawia `#analysis?case=…&run=…`).
    window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;

    await waitFor(() => {
      expect(czyPrzywroconoMigawkePrzebiegu()).toBe(true);
    });
    expect(useAppStateStore.getState().activeSnapshotId).toBe(SNAPSHOT_ID);

    // PO: model NIEZMIENIONY (ta sama rewizja i odcisk), więc i gotowość ta sama.
    expect(useSnapshotStore.getState().snapshot?.header.hash_sha256).toBe(MODEL_HASH);
    expect(gotowoscZeStoru()).toEqual({ ready: true, ustalona: true, blokady: 0, ostrzezenia: 2 });
    expect(kodyGotowosci()).toEqual(['W002', 'W003']);
    expect(screen.getByTestId('mvd-casebar-readiness').textContent).toContain(
      'Gotowość: 2 ostrzeżenia',
    );
  });

  it('model z blokadą: po wejściu na wynik biegu chip NIE mówi „Model: zwalidowany"', async () => {
    stubFetch(GOTOWOSC_BLOKADA);
    window.location.hash = `#sld?project=${PROJECT_ID}&case=${CASE_ID}`;

    render(<Probe />);

    await waitFor(() => {
      expect(gotowoscZeStoru()).toEqual({ ready: false, ustalona: true, blokady: 1, ostrzezenia: 2 });
    });
    expect(screen.getByTestId('mvd-casebar-model').textContent).toContain('Model: w budowie');

    window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;

    await waitFor(() => {
      expect(czyPrzywroconoMigawkePrzebiegu()).toBe(true);
    });

    expect(gotowoscZeStoru()).toEqual({ ready: false, ustalona: true, blokady: 1, ostrzezenia: 2 });
    expect(kodyGotowosci()).toEqual(['E005', 'W002', 'W003']);
    expect(screen.getByTestId('mvd-casebar-model').textContent).toContain('Model: w budowie');
    expect(screen.getByTestId('mvd-casebar-model').textContent).not.toContain(
      'Model: zwalidowany',
    );
    expect(screen.getByTestId('mvd-casebar-readiness').textContent).toContain(
      'Gotowość: 1 blokada',
    );
  });

  it('zimne wejście na link przebiegu (przeładowanie): gotowość z backendu, nie z migawki', async () => {
    stubFetch(GOTOWOSC_BLOKADA);
    // Adres jak po przeładowaniu strony na wyniku biegu — store pusty,
    // migawka przebiegu jest jedyną rzeczą, która trafia do store'u.
    window.location.hash = `#analysis?case=${CASE_ID}&run=${RUN_ID}`;

    render(<Probe />);

    await waitFor(() => {
      expect(czyPrzywroconoMigawkePrzebiegu()).toBe(true);
    });

    await waitFor(() => {
      expect(gotowoscZeStoru()).toEqual({ ready: false, ustalona: true, blokady: 1, ostrzezenia: 2 });
    });
    // Liczby pochodzą z odpowiedzi backendu, nie z koperty migawki.
    expect(domainOpCalls).toBeGreaterThan(0);
    expect(kodyGotowosci()).toEqual(['E005', 'W002', 'W003']);
    expect(screen.getByTestId('mvd-casebar-model').textContent).toContain('Model: w budowie');
    expect(screen.getByTestId('mvd-casebar-readiness').textContent).toContain(
      'Gotowość: 1 blokada',
    );
  });
});
