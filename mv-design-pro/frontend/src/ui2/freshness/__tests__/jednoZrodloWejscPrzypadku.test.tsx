/*
 * JEDNO ŹRÓDŁO ŚWIEŻOŚCI NAGŁÓWKA I POWŁOKI (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).
 *
 * Defekt: nagłówek ekranu analizy porównywał wyłącznie rewizję modelu biegu z rewizją
 * bieżącą, a powłoka pokazywała werdykt serwera. Zmiana grupy nastaw albo nadpisania nastaw
 * przypadku (albo scenariusza nazwanego biegu) nie rusza rewizji modelu — powłoka mówiła
 * „nieaktualne", nagłówek „aktualne".
 *
 * Teraz oba (i lista biegów: panel dolny, wybór biegu, nakładka schematu) idą przez JEDEN
 * predykat `swiezoscBiegu`, zasilany werdyktem serwera wydanym na odcisku wejść przypadku
 * (`odcisk_wejsc_swiezosci`); nagłówek pobiera kontrakt biegu ponownie, gdy odcisk się zmieni.
 *
 * ILOCZYN CECH: zmiana {model, grupa, nadpisanie, scenariusz nazwany} × wskaźnik {nagłówek
 * (`EkranAnalizy` + `useSwiezoscNaglowka`), powłoka (`useShellCaseInfo`), bieg listy
 * (`useSwiezoscBiegu` na rekordzie z `loadRuns`)} × chwila {przed, po zmianie}. Odpowiedzi
 * HTTP w kształcie backendu (`tests/api/test_jedno_zrodlo_swiezosci.py` przypina ich treść);
 * zmiana wchodzi produkcyjną akcją odświeżenia werdyktu przypadku
 * (`odswiezWerdyktAktywnegoPrzypadku`, wołaną po zapisie wyboru zabezpieczeń i scenariusza),
 * a listę biegów odświeża produkcyjny adapter przypadku (`startCaseAdapter`).
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSwiezoscNaglowka } from '../useSwiezoscNaglowka';
import { EkranAnalizy } from '../../wyniki/wzorzec/EkranAnalizy';
import { useSwiezoscBiegu } from '../../wyniki/kontekst/kontekstWyniku';
import { useShellCaseInfo } from '../../shell/shellStatus';
import { startCaseAdapter } from '../../events/adapters/caseAdapter';
import { useAppStateStore } from '../../../ui/app-state';
import { odswiezWerdyktAktywnegoPrzypadku, useStudyCasesStore } from '../../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';

const PROJECT_ID = 'proj-jedno-zrodlo';
const CASE_ID = 'case-jedno-zrodlo';
const RUN_ID = '7b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const MODEL_HASH = 'abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';

type Zmiana = 'model' | 'grupa' | 'nadpisanie' | 'scenariusz_nazwany';

const PRZYCZYNA: Record<Zmiana, { kod: string; pl: string }> = {
  model: { kod: 'model-zmieniony', pl: 'Model zmieniono po obliczeniu (rewizja 8 → 9).' },
  grupa: {
    kod: 'zabezpieczenia-przypadku-zmienione',
    pl: 'Wybór grupy nastaw albo nadpisania nastaw zabezpieczeń w tym przypadku zmieniły się po obliczeniu — wynik opisuje poprzedni wybór zabezpieczeń przypadku.',
  },
  nadpisanie: {
    kod: 'zabezpieczenia-przypadku-zmienione',
    pl: 'Wybór grupy nastaw albo nadpisania nastaw zabezpieczeń w tym przypadku zmieniły się po obliczeniu — wynik opisuje poprzedni wybór zabezpieczeń przypadku.',
  },
  scenariusz_nazwany: {
    kod: 'scenariusz-zmieniony',
    pl: 'Scenariusz roboczy przebiegu ma nowszą rewizję — wynik opisuje poprzednią postać scenariusza.',
  },
};

/** Zdania przyczyn = `REASON_TEXTS_PL` backendu (`application/result_freshness.py`). */
/** Stan serwera: przed zmianą albo po niej (odpowiedzi HTTP czytają tę zmienną). */
let faza: 'przed' | 'po' = 'przed';
let zmiana: Zmiana = 'grupa';

function rewizjaBiezaca(): number {
  return faza === 'po' && zmiana === 'model' ? 9 : 8;
}

function odcisk(): string {
  return faza === 'przed' ? 'odcisk-przed' : `odcisk-po-${zmiana}`;
}

function werdykt() {
  return faza === 'przed'
    ? { status: 'FRESH' as const, kod: 'model-niezmieniony', pl: 'Wynik policzono na bieżącym modelu.' }
    : { status: 'OUTDATED' as const, ...PRZYCZYNA[zmiana] };
}

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

/** `StudyCaseResponse` z werdyktem i odciskiem wejść — jak `pola_statusu_przypadku`. */
function przypadekSerwera() {
  const w = werdykt();
  return {
    id: CASE_ID,
    project_id: PROJECT_ID,
    name: 'Zwarcia maks.',
    description: '',
    config: {},
    result_status: w.status,
    results_valid: w.status === 'FRESH',
    result_status_reason: w.kod,
    result_status_reason_pl: w.pl,
    rewizja_biegu: 8,
    rewizja_biezaca: rewizjaBiezaca(),
    odcisk_wejsc_swiezosci: odcisk(),
    zmiany_od_biegu: [],
    is_active: true,
    revision: 3,
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-01T09:30:00Z',
  };
}

/** Pola świeżości biegu — jak `pola_swiezosci_biegu` (ta sama funkcja co przypadek). */
function polaSwiezosciBiegu() {
  const w = werdykt();
  return {
    result_freshness: w.status,
    result_freshness_reason: w.kod,
    result_freshness_reason_pl: w.pl,
    odcisk_wejsc_swiezosci: odcisk(),
  };
}

function rekordBiegu() {
  return {
    id: RUN_ID,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'sha-in',
    status: 'DONE',
    started_at: '2026-11-01T09:20:00Z',
    finished_at: '2026-11-01T09:20:11Z',
    error_message: null,
    model_revision: 8,
    ...polaSwiezosciBiegu(),
  };
}

function kontraktBiegu() {
  return {
    id: RUN_ID,
    analysis_type: 'short_circuit_sn',
    status: 'FINISHED',
    result_status: 'VALID',
    created_at: '2026-11-01T09:20:00Z',
    finished_at: '2026-11-01T09:20:11Z',
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
    ...polaSwiezosciBiegu(),
    results_valid: werdykt().status === 'FRESH',
  };
}

function odpowiedz(tresc: unknown): Response {
  return { ok: true, status: 200, json: async () => tresc } as Response;
}

/** Trzy wskaźniki obok siebie — wszystkie produkcyjne. */
function Probe() {
  const info = useShellCaseInfo();
  const sw = useSwiezoscNaglowka(RUN_ID);
  const bieg = useExecutionRunsStore((s) => s.runs.find((r) => r.id === RUN_ID) ?? null);
  const swBiegu = useSwiezoscBiegu(bieg);
  return (
    <>
      <output data-testid="powloka">{info.znacznikWynikow.status}</output>
      <output data-testid="powloka-przyczyna">{info.znacznikWynikow.przyczynaPl ?? ''}</output>
      <output data-testid="bieg-listy">{swBiegu?.stan ?? 'brak'}</output>
      <output data-testid="bieg-listy-przyczyna">{swBiegu?.przyczynaPl ?? ''}</output>
      <EkranAnalizy
        naglowek={{ analizaPL: 'Zwarcia', runId: RUN_ID, ...sw }}
        szczegolyAudytowe={false}
        zalozenia={[]}
        kolumny={[]}
        wiersze={[]}
      />
    </>
  );
}

function znacznikNaglowka(): HTMLElement {
  return screen.getByTestId('mvd-wyn-naglowek').querySelector('[data-mvd-fresh]') as HTMLElement;
}

const initialSnapshotState = useSnapshotStore.getState();
const initialAppState = useAppStateStore.getState();
const initialStudyCasesState = useStudyCasesStore.getState();
const initialRunsState = useExecutionRunsStore.getState();
let zatrzymajAdapter: (() => void) | null = null;
const zapytaniaKontraktu: string[] = [];

beforeEach(() => {
  faza = 'przed';
  zapytaniaKontraktu.length = 0;
  useSnapshotStore.setState(initialSnapshotState, true);
  useAppStateStore.setState(initialAppState, true);
  useStudyCasesStore.setState(initialStudyCasesState, true);
  useExecutionRunsStore.setState(initialRunsState, true);
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
        zapytaniaKontraktu.push(faza);
        return odpowiedz(kontraktBiegu());
      }
      if (url === `/api/study-cases/project/${PROJECT_ID}/active`) {
        return odpowiedz(przypadekSerwera());
      }
      if (url === `/api/execution/study-cases/${CASE_ID}/runs`) {
        return odpowiedz({ runs: [rekordBiegu()], count: 1 });
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  zatrzymajAdapter?.();
  zatrzymajAdapter = null;
  cleanup();
  vi.unstubAllGlobals();
});

describe('nagłówek ekranu analizy, powłoka i lista biegów — jedno źródło świeżości', () => {
  it.each<Zmiana>(['model', 'grupa', 'nadpisanie', 'scenariusz_nazwany'])(
    'zmiana „%s": przed — wszystkie aktualne, po — wszystkie nieaktualne z tą samą przyczyną',
    async (rodzaj) => {
      zmiana = rodzaj;
      act(() => {
        useSnapshotStore.getState().setSnapshot(domainOpResponse(8) as never);
        useStudyCasesStore.setState({ projectId: PROJECT_ID } as never);
        useExecutionRunsStore.setState({ activeStudyCaseId: CASE_ID } as never);
      });
      zatrzymajAdapter = startCaseAdapter();
      await act(async () => {
        odswiezWerdyktAktywnegoPrzypadku();
        await useExecutionRunsStore.getState().loadRuns(CASE_ID);
      });

      render(<Probe />);
      await waitFor(() => expect(znacznikNaglowka()?.dataset.mvdFresh).toBe('ok'));
      expect(screen.getByTestId('powloka').textContent).toBe('FRESH');
      expect(screen.getByTestId('bieg-listy').textContent).toBe('aktualny');

      // Zmiana po stronie serwera; dla „model" przegląd dostaje nową migawkę (rew. 9).
      faza = 'po';
      await act(async () => {
        if (rodzaj === 'model') {
          useSnapshotStore.getState().setSnapshot(domainOpResponse(9) as never);
        }
        odswiezWerdyktAktywnegoPrzypadku();
      });

      const przyczyna = PRZYCZYNA[rodzaj].pl;
      await waitFor(() => expect(screen.getByTestId('powloka').textContent).toBe('OUTDATED'));
      expect(screen.getByTestId('powloka-przyczyna').textContent).toBe(przyczyna);
      await waitFor(() => expect(znacznikNaglowka()?.dataset.mvdFresh).toBe('stale'));
      await waitFor(() => expect(screen.getByTestId('bieg-listy').textContent).toBe('nieaktualny'));
      // Lista biegów pobrana ponownie przez adapter przypadku: rekord niesie werdykt TEGO
      // biegu na nowym odcisku (nie tylko werdykt przypadku przez regułę zapasową).
      await waitFor(() => {
        const rekord = useExecutionRunsStore.getState().runs[0];
        expect(rekord?.result_freshness).toBe('OUTDATED');
        expect(rekord?.odcisk_wejsc_swiezosci).toBe(`odcisk-po-${rodzaj}`);
      });
      if (rodzaj === 'model') {
        // Rozjazd rewizji rozstrzyga lokalnie (bez czekania na serwer) — etykieta z parą rewizji.
        expect(znacznikNaglowka().dataset.mvdFreshZrodlo).toBe('rewizja');
        expect(znacznikNaglowka().textContent).toContain('rew. 8 → 9');
      } else {
        // Rewizja modelu stoi w miejscu — nagłówek mówi zdaniem serwera, tym samym co powłoka.
        expect(znacznikNaglowka().dataset.mvdFreshZrodlo).toBe('werdykt-serwera');
        await waitFor(() => expect(znacznikNaglowka().textContent).toContain(przyczyna));
        await waitFor(() =>
          expect(screen.getByTestId('bieg-listy-przyczyna').textContent).toBe(przyczyna),
        );
        // Kontrakt biegu pobrano ponownie PO zmianie (odcisk wejść przypadku się zmienił).
        expect(zapytaniaKontraktu).toContain('po');
      }
    },
  );

  it('werdykt biegu wydany na INNYM odcisku niż przypadek nie rozstrzyga — wraca werdykt przypadku', async () => {
    zmiana = 'grupa';
    act(() => {
      useSnapshotStore.getState().setSnapshot(domainOpResponse(8) as never);
      useStudyCasesStore.setState({ projectId: PROJECT_ID } as never);
    });
    await act(async () => {
      odswiezWerdyktAktywnegoPrzypadku();
      await useExecutionRunsStore.getState().loadRuns(CASE_ID);
    });
    // Lista biegów zostaje „przed" (bez adaptera — nikt jej nie odświeża), przypadek jest „po".
    faza = 'po';
    await act(async () => {
      odswiezWerdyktAktywnegoPrzypadku();
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('powloka').textContent).toBe('OUTDATED'));
    // Rekord listy mówi FRESH na starym odcisku — predykat mu nie ufa i bierze werdykt przypadku.
    expect(useExecutionRunsStore.getState().runs[0]?.result_freshness).toBe('FRESH');
    expect(screen.getByTestId('bieg-listy').textContent).toBe('nieaktualny');
    expect(screen.getByTestId('bieg-listy-przyczyna').textContent).toBe(PRZYCZYNA.grupa.pl);
  });
});
