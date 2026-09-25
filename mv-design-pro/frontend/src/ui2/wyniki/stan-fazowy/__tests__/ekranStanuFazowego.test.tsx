/**
 * Testy ekranu „Stan fazowy SN" (E-31, karta P-2 + W5-D: drugie źródło).
 * Kliki natywne (userEvent) — Zero-Debt pkt 5. Realna ścieżka wejścia:
 * obszar „Rozpływ mocy i napięcia" → zakładka „Stan fazowy SN" warsztatu Wyników
 * (test warsztatu). Dane mockowane przez `fetch` 1:1 z kontraktami `api.ts`
 * (GET /api/analysis-runs/:id/results/phase-state oraz — W5-D —
 * GET /api/analysis-runs/:id/results/rozplyw-niesymetryczny) — ekran niczego
 * nie liczy; werdykty asymetrii pochodzą z flag solvera, VUF z solvera BFS.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { useSelectionStore } from '../../../../ui/selection/store';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type {
  WierszStanuFazowego,
  WynikiRozplywuNiesymetrycznego,
  WynikiStanuFazowego,
} from '../api';
import { EkranStanuFazowego } from '../EkranStanuFazowego';
import {
  naPodsumowanieNiesymetrii,
  naPozycjeAsymetrii,
  naWierszeGaleziNiesymetrycznych,
  naWierszeSzynNiesymetrycznych,
  RODZAJE_PRZEBIEGOW_FAZOWYCH,
  wybierzPrzebiegFazowy,
  zrodloPrzebiegu,
} from '../stanFazowyModel';
import { STAN_FAZOWY_STRINGS as T } from '../strings';

/** Przebieg rejestru TYPOWANY kontraktem (bez `as never` — bramka typów poza tsconfig). */
function przebieg(over: Partial<ExecutionRun> & Pick<ExecutionRun, 'id' | 'analysis_type'>): ExecutionRun {
  return {
    study_case_id: 'case-1',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: null,
    finished_at: null,
    error_message: null,
    ...over,
  };
}

const RUN_PS = przebieg({
  id: 'run-ps-1',
  analysis_type: 'PHASE_STATE_SN',
  finished_at: '2026-07-20T11:00:00Z',
  started_at: '2026-07-20T10:59:00Z',
});

const RUN_LF = przebieg({
  id: 'run-lf-1',
  analysis_type: 'LOAD_FLOW',
  finished_at: '2026-07-20T10:00:00Z',
  started_at: '2026-07-20T09:59:00Z',
});

/** W5-D: zakończony bieg rozpływu niesymetrycznego (nowszy niż stan fazowy). */
const RUN_RN = przebieg({
  id: 'run-rn-1',
  analysis_type: 'PF_UNBALANCED',
  finished_at: '2026-07-21T11:00:00Z',
  started_at: '2026-07-21T10:59:00Z',
});

function wynikiRnFixture(
  over: Partial<WynikiRozplywuNiesymetrycznego> = {},
): WynikiRozplywuNiesymetrycznego {
  return {
    run_id: 'run-rn-1',
    analysis_type: 'load_flow_unbalanced',
    solver_version: 'power-flow-unbalanced-bfs-v1',
    converged: true,
    wyspy: [
      {
        slack_bus_id: 'b_gpz',
        zrodlo_ref: 'src',
        base_kv_ll: 15.0,
        converged: true,
        iterations: 4,
        max_voltage_mismatch_pu: 1e-9,
        bus_count: 3,
        branch_count: 2,
      },
    ],
    buses: [
      {
        bus_id: 'b_gpz',
        element_id: 'b_gpz',
        name: 'GPZ 15 kV',
        un_kv: 15.0,
        solved: true,
        zrodlo_ref: 'src',
        faza_a: { u_pu: 1.0, u_kv: 8.660254, angle_deg: 0.0 },
        faza_b: { u_pu: 1.0, u_kv: 8.660254, angle_deg: -120.0 },
        faza_c: { u_pu: 1.0, u_kv: 8.660254, angle_deg: 120.0 },
        voltage_unbalance_factor_pct: 0.0,
      },
      {
        bus_id: 'b_nn',
        element_id: 'b_nn',
        name: 'Szyna nN',
        un_kv: 0.4,
        solved: true,
        zrodlo_ref: 'src',
        faza_a: { u_pu: 0.951234, u_kv: 0.219656, angle_deg: -0.8 },
        faza_b: { u_pu: 0.998, u_kv: 0.230478, angle_deg: -120.1 },
        faza_c: { u_pu: 0.997, u_kv: 0.230247, angle_deg: 119.9 },
        voltage_unbalance_factor_pct: 1.6234,
      },
      {
        bus_id: 'b_wyspa',
        element_id: 'b_wyspa',
        name: 'Szyna odcięta',
        un_kv: 15.0,
        solved: false,
        zrodlo_ref: null,
        faza_a: null,
        faza_b: null,
        faza_c: null,
        voltage_unbalance_factor_pct: null,
      },
    ],
    branches: [
      {
        branch_id: 'cab1',
        element_id: 'cab1',
        name: 'Kabel 1',
        element_type: 'cable',
        from_bus_id: 'b_gpz',
        to_bus_id: 'b_sn',
        faza_a: { p_mw: 0.05, q_mvar: 0.015, i_a: 6.123 },
        faza_b: { p_mw: 0.0, q_mvar: 0.0, i_a: 0.0 },
        faza_c: { p_mw: 0.0, q_mvar: 0.0, i_a: 0.0 },
        losses_p_mw: 0.000019,
        losses_q_mvar: 0.000008,
        rated_current_a: 275.0,
      },
      {
        branch_id: 'tr1',
        element_id: 'tr1',
        name: 'TR 15/0,4',
        element_type: 'transformer',
        from_bus_id: 'b_sn',
        to_bus_id: 'b_nn',
        faza_a: { p_mw: 0.05, q_mvar: 0.015, i_a: 229.6 },
        faza_b: { p_mw: 0.0, q_mvar: 0.0, i_a: 0.0 },
        faza_c: { p_mw: 0.0, q_mvar: 0.0, i_a: 0.0 },
        losses_p_mw: 0.000544,
        losses_q_mvar: 0.003512,
        rated_current_a: null,
      },
    ],
    summary: {
      bus_count: 3,
      branch_count: 2,
      solved_bus_count: 2,
      total_losses_p_mw: 0.000563,
      total_losses_q_mvar: 0.00352,
      max_voltage_unbalance_factor_pct: 1.6234,
      max_voltage_unbalance_bus_id: 'b_nn',
      unsolved_bus_ids: ['b_wyspa'],
    },
    zalozenia: [
      {
        kod: 'power_flow.unbalanced_transformer_series_model',
        elementy: ['tr1'],
        opis: 'Transformator w modelu szeregowym (gałąź magnesująca pominięta).',
      },
    ],
    proof_ref: 'proof-rn-1',
    proof_status: 'complete',
    proof_status_pl: 'pelny',
    reporting_status: 'reportable',
    reporting_status_pl: 'raportowalny',
    quality_status: 'ok',
    dopuszczalnosc_raportowa: true,
    reporting_limitations: [],
    reporting_limitations_pl: [],
    ...over,
  };
}

function mockFetchRozplywuNiesymetrycznego(
  odpowiedz: WynikiRozplywuNiesymetrycznego | { detail: string },
) {
  const ok = !('detail' in odpowiedz);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/analysis-runs/run-rn-1/results/rozplyw-niesymetryczny') {
      return {
        ok,
        status: ok ? 200 : 422,
        statusText: ok ? 'OK' : 'Unprocessable Entity',
        json: async () => odpowiedz,
      } as Response;
    }
    throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function wierszFixture(over: Partial<WierszStanuFazowego> = {}): WierszStanuFazowego {
  return {
    target_id: 'bus-1',
    element_id: 'BUS-SN-01',
    target_name: 'BUS-SN-01',
    ua_kv: 8.66,
    ub_kv: 8.61,
    uc_kv: 8.6,
    ia_a: 101.5,
    ib_a: 99.8,
    ic_a: 100.2,
    phase_losses_kw: { A: 1.031, B: 0.996, C: 1.004 },
    voltage_unbalance_percent: 0.42,
    current_unbalance_percent: 12.7,
    losses_unbalance_percent: 2.1,
    flags: {
      has_fault: false,
      has_open_phase: false,
      faulted_phases: [],
      open_phases: [],
      voltage_unbalance_alert: false,
      current_unbalance_alert: true,
      losses_unbalance_alert: false,
    },
    proof_ref: 'proof-ps-1',
    proof_status: 'complete',
    proof_status_pl: 'pełny',
    reporting_status: 'reportable',
    reporting_status_pl: 'raportowalny',
    dopuszczalnosc_raportowa: true,
    reporting_limitations: [],
    reporting_limitations_pl: [],
    ...over,
  };
}

function mockFetchStanuFazowego(odpowiedz: WynikiStanuFazowego | { detail: string }) {
  const ok = !('detail' in odpowiedz);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/analysis-runs/run-ps-1/results/phase-state') {
      return {
        ok,
        status: ok ? 200 : 422,
        statusText: ok ? 'OK' : 'Unprocessable Entity',
        json: async () => odpowiedz,
      } as Response;
    }
    throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ustawKompletnyKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  useExecutionRunsStore.setState({ runs: [RUN_PS, RUN_LF] });
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Realna ścieżka wejścia (karta B-02 / W3-E): hub „Analizy techniczne" ZSZEDŁ z
// ekranu, a jego karta stanu fazowego (E-31) stała się zakładką „Stan fazowy SN"
// obszaru „Rozpływ mocy i napięcia" warsztatu Wyników — ścieżkę obszar → zakładka
// → ten ekran ćwiczy `spaces/wyniki/__tests__/wynikiWarsztat.test.tsx` (K3-A3).
// Druga kopia opisu ekranu (karta W2 pkt 4, KLASA NIE INSTANCJA: „asymetria
// U/I/strat" vs „odchylenie od średniej faz") zniknęła RAZEM z hubem — jedyny opis
// niesie `strings.ts` tego modułu.

describe('EkranStanuFazowego — rama prowadząca i uczciwe stany zerowe', () => {
  it('nagłówek: eyebrow obszaru, tytuł i zdanie celu inżynierskiego', () => {
    render(<EkranStanuFazowego />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: T.tytul })).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('bez aktywnego projektu: stan zerowy z akcją do przestrzeni Projekt', async () => {
    const user = userEvent.setup();
    render(<EkranStanuFazowego />);
    expect(screen.getByTestId('mvd-fazowy-brak-projektu')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-fazowy-brak-projektu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('projekt bez przebiegu stanu fazowego (jest tylko rozpływ): akcja do Obliczeń', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useExecutionRunsStore.setState({ runs: [RUN_LF] });
    render(<EkranStanuFazowego />);
    expect(screen.getByTestId('mvd-fazowy-brak-przebiegu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-fazowy-tabela-faz')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-fazowy-brak-przebiegu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('błąd końcówki (detail 422) pokazywany wprost, bez udawania danych', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({ detail: 'Przebieg nie jest zakończony' });
    render(<EkranStanuFazowego />);
    const blad = await screen.findByTestId('mvd-fazowy-blad');
    expect(within(blad).getByText('Przebieg nie jest zakończony')).toBeInTheDocument();
  });
});

describe('EkranStanuFazowego — wartości fazowe i werdykty z flag solvera', () => {
  it('tabela faz A/B/C + asymetrie z werdyktem WYŁĄCZNIE z flag (bez progów w UI)', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [wierszFixture()] });
    render(<EkranStanuFazowego />);

    // Tabela faz: wartości 1:1 z kontraktu (przecinek dziesiętny PL).
    const tabela = await screen.findByTestId('mvd-fazowy-tabela-faz');
    expect(within(tabela).getByText('8,660')).toBeInTheDocument(); // UA [kV]
    expect(within(tabela).getByText('99,8')).toBeInTheDocument(); // IB [A]
    expect(within(tabela).getByText('1,004')).toBeInTheDocument(); // straty C [kW]

    // Założenia: cel analizy + statusy PL z kontraktu.
    expect(screen.getByText('BUS-SN-01')).toBeInTheDocument();
    expect(screen.getByText('pełny')).toBeInTheDocument();
    expect(screen.getByText('raportowalny')).toBeInTheDocument();

    // Asymetrie: werdykt z flag solvera (prądowa PRZEKROCZENIE, napięciowa w normie).
    const asymetrie = screen.getByTestId('mvd-fazowy-asymetrie');
    const pozycje = within(asymetrie).getAllByRole('definition');
    expect(pozycje.length).toBe(3);
    expect(within(asymetrie).getByText('12,70')).toBeInTheDocument();
    expect(within(asymetrie).getAllByText(T.werdyktPrzekroczenie).length).toBe(1);
    expect(within(asymetrie).getAllByText(T.werdyktWNormie).length).toBe(2);

    // Bez zdarzeń obwodu: uczciwa informacja zamiast pustej listy.
    expect(screen.getByTestId('mvd-fazowy-bez-zdarzen')).toBeInTheDocument();
  });

  it('etykieta wskaźnika = dokładnie definicja solvera (odchylenie od średniej faz), nie VUF (karta W2 pkt 4)', async () => {
    // `phase_state_sn.py::_compute_unbalance_percent` liczy odchylenie MAKSYMALNE
    // od ŚREDNIEJ TRZECH FAZ w % — nie współczynnik asymetrii wg składowych
    // symetrycznych (VUF). Etykieta i opis pomocy muszą mówić dokładnie to.
    // W5-D: VUF LICZY rozpływ niesymetryczny (drugie źródło ekranu) — opis
    // podaje stan faktyczny PER ŹRÓDŁO; zdanie „ten wskaźnik nie jest dziś
    // liczony" byłoby fałszem i jest przypięte jako zakazane.
    expect(T.asymetriaTytul).toBe('Odchylenie od średniej faz [%]');
    expect(T.asymetriaOpis).toContain(
      'nie jest współczynnikiem asymetrii wg składowych symetrycznych (VUF)',
    );
    expect(T.asymetriaOpis).not.toContain('nie jest dziś liczony');
    expect(T.asymetriaOpis).toContain('VUF liczy rozpływ niesymetryczny');
    for (const tekst of Object.values(T)) {
      if (typeof tekst === 'string') expect(tekst).not.toContain('nie jest dziś liczony');
    }
    // Żadna etykieta per-wielkość nie nazywa się „Asymetria …" (sugestia VUF) —
    // wszystkie trzy dzielą tę samą klasę solvera (`_compute_unbalance_percent`
    // wywoływane identycznie dla napięcia/prądu/strat), więc wszystkie trzy
    // dostają tę samą korektę nazewnictwa, nie tylko jedna z trzech.
    for (const etykieta of [T.asymetriaU, T.asymetriaI, T.asymetriaStrat]) {
      expect(etykieta).not.toMatch(/^Asymetria/);
      expect(etykieta).toContain('Odchylenie');
      expect(etykieta).toContain('od średniej faz');
    }

    ustawKompletnyKontekst();
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [wierszFixture()] });
    render(<EkranStanuFazowego />);

    const asymetrie = await screen.findByTestId('mvd-fazowy-asymetrie');
    // Nagłówek sekcji i opis renderują się DOKŁADNIE tym tekstem na ekranie —
    // nie tylko w stałej `strings.ts`, którą nikt nie musi importować poprawnie.
    expect(screen.getByText(T.asymetriaTytul)).toBeInTheDocument();
    expect(screen.getByText(T.asymetriaOpis)).toBeInTheDocument();
    expect(within(asymetrie).getByText(T.asymetriaU)).toBeInTheDocument();
    expect(within(asymetrie).getByText(T.asymetriaI)).toBeInTheDocument();
    expect(within(asymetrie).getByText(T.asymetriaStrat)).toBeInTheDocument();
    expect(screen.queryByText(/^Asymetria (napięcia|prądu|strat)$/)).not.toBeInTheDocument();
  });

  it('kontrakt bez wartości i bez flag → kreski i „bez werdyktu" (zero fabrykacji)', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({
      run_id: 'run-ps-1',
      rows: [
        wierszFixture({
          ua_kv: null,
          ia_a: null,
          phase_losses_kw: {},
          voltage_unbalance_percent: null,
          current_unbalance_percent: 5.0,
          losses_unbalance_percent: null,
          flags: {},
        }),
      ],
    });
    render(<EkranStanuFazowego />);

    const tabela = await screen.findByTestId('mvd-fazowy-tabela-faz');
    expect(within(tabela).getAllByText(T.kreska).length).toBeGreaterThan(0);
    const asymetrie = screen.getByTestId('mvd-fazowy-asymetrie');
    // Wartość bez flagi w kontrakcie → „bez werdyktu"; brak wartości → kreska.
    expect(within(asymetrie).getAllByText(T.werdyktBrak).length).toBe(3);
    expect(within(asymetrie).queryByText(T.werdyktPrzekroczenie)).not.toBeInTheDocument();
  });

  it('zwarcie i otwarta faza z flag solvera są pokazane z fazami', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({
      run_id: 'run-ps-1',
      rows: [
        wierszFixture({
          flags: {
            ...wierszFixture().flags,
            has_fault: true,
            faulted_phases: ['A'],
            has_open_phase: true,
            open_phases: ['C'],
          },
        }),
      ],
    });
    render(<EkranStanuFazowego />);

    const zdarzenia = await screen.findByTestId('mvd-fazowy-zdarzenia');
    expect(within(zdarzenia).getByText(`${T.stanZwarcie}:`)).toBeInTheDocument();
    expect(within(zdarzenia).getByText(`${T.stanOtwartaFaza}:`)).toBeInTheDocument();
  });

  it('przebieg bez wiersza wyników → uczciwy stan z akcją do Obliczeń', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [] });
    render(<EkranStanuFazowego />);
    expect(await screen.findByTestId('mvd-fazowy-brak-wierszy')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-fazowy-tabela-faz')).not.toBeInTheDocument();
  });

  it('następny krok: „Otwórz dowód obliczeń" prowadzi do zakładki dowodu z kontekstem przebiegu', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [wierszFixture()] });
    render(<EkranStanuFazowego />);
    await screen.findByTestId('mvd-fazowy-tabela-faz');

    await user.click(screen.getByTestId('mvd-fazowy-otworz-dowod'));
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-ps-1');
  });

  it('powrót do huba czyści powierzchnię trasową (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    render(<EkranStanuFazowego />);
    await user.click(screen.getByTestId('mvd-fazowy-powrot'));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranStanuFazowego — pętla decyzji (F-K4, znalezisko Z4)', () => {
  it('przekroczona asymetria prowadzi do SZYNY w modelu (realna ścieżka, bez mocka hooka)', async () => {
    ustawKompletnyKontekst();
    // Fixture ma flagę current_unbalance_alert = true, czyli REALNE przekroczenie
    // z solvera — nie wymuszony stan UI.
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [wierszFixture()] } as WynikiStanuFazowego);
    render(<EkranStanuFazowego />);

    const przycisk = await screen.findByTestId('mvd-fazowy-popraw');
    await userEvent.click(przycisk);

    const sel = useSelectionStore.getState();
    expect(sel.selectedElement).toEqual({ id: 'BUS-SN-01', type: 'Bus', name: 'BUS-SN-01' });
    expect(sel.sldCenterOnElement).toBe('BUS-SN-01');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });

  it('brak przekroczenia → brak przycisku decyzji (nie sugerujemy naprawy bez werdyktu)', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({
      run_id: 'run-ps-1',
      rows: [
        wierszFixture({
          flags: {
            has_fault: false,
            has_open_phase: false,
            faulted_phases: [],
            open_phases: [],
            voltage_unbalance_alert: false,
            current_unbalance_alert: false,
            losses_unbalance_alert: false,
          },
        }),
      ],
    } as WynikiStanuFazowego);
    render(<EkranStanuFazowego />);

    await screen.findByTestId('mvd-fazowy-asymetrie');
    expect(screen.queryByTestId('mvd-fazowy-popraw')).toBeNull();
  });

  it('brak flag (niesprawdzone) → brak przycisku decyzji, bo nie ma werdyktu', async () => {
    ustawKompletnyKontekst();
    mockFetchStanuFazowego({
      run_id: 'run-ps-1',
      rows: [wierszFixture({ flags: {} })],
    } as WynikiStanuFazowego);
    render(<EkranStanuFazowego />);

    await screen.findByTestId('mvd-fazowy-asymetrie');
    expect(screen.queryByTestId('mvd-fazowy-popraw')).toBeNull();
  });
});

describe('EkranStanuFazowego — drugie źródło: rozpływ niesymetryczny (W5-D)', () => {
  function ustawKontekstRn() {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useExecutionRunsStore.setState({ runs: [RUN_PS, RUN_RN, RUN_LF] });
  }

  it('najnowszy zakończony bieg jest rozpływem niesymetrycznym → ekran czyta końcówkę rozpływu, nazywa źródło', async () => {
    ustawKontekstRn();
    const fetchMock = mockFetchRozplywuNiesymetrycznego(wynikiRnFixture());
    render(<EkranStanuFazowego />);

    const blok = await screen.findByTestId('mvd-fazowy-rozplyw-niesymetryczny');
    expect(blok).toHaveAttribute('data-zrodlo', 'rozplyw_niesymetryczny');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/analysis-runs/run-rn-1/results/rozplyw-niesymetryczny',
    );
    // Źródło + solver + zbieżność + wyspy + statusy PL — w założeniach.
    expect(screen.getByText(T.zrodloRozplywNiesymetryczny)).toBeInTheDocument();
    expect(screen.getByText('power-flow-unbalanced-bfs-v1')).toBeInTheDocument();
    expect(screen.getByText(T.rnZbiezny)).toBeInTheDocument();
    expect(screen.getByText('raportowalny')).toBeInTheDocument();
    // Blok stanu fazowego SN NIE renderuje się równolegle (jedno źródło na raz).
    expect(screen.queryByTestId('mvd-fazowy-stan-fazowy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-fazowy-tabela-faz')).not.toBeInTheDocument();
  });

  it('tabela szyn: napięcia faza–N per faza i VUF z solvera (przecinek PL), szyna nierozwiązana nazwana', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego(wynikiRnFixture());
    render(<EkranStanuFazowego />);

    const szyny = await screen.findByTestId('mvd-fazowy-rn-szyny');
    const wiersze = within(szyny).getAllByTestId('mvd-fazowy-rn-szyna');
    expect(wiersze.length).toBe(3);
    expect(within(szyny).getByText('0,220')).toBeInTheDocument(); // U_A nN [kV]
    expect(within(szyny).getAllByText('0,230').length).toBe(2); // U_B i U_C nN [kV]
    expect(within(szyny).getByText('1,62')).toBeInTheDocument(); // VUF [%]
    expect(within(szyny).getByText(T.rnNierozwiazana)).toBeInTheDocument();
    // Szyna o największym VUF wskazana z PODSUMOWANIA solvera, nie z porównania w UI.
    const zMaxVuf = wiersze.filter((w) => w.getAttribute('data-max-vuf') === 'true');
    expect(zMaxVuf.length).toBe(1);
    expect(zMaxVuf[0]).toHaveTextContent('Szyna nN');
  });

  it('tabela gałęzi: prądy faz, prąd znamionowy (null → kreska) i straty w kW ze skalowania MW', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego(wynikiRnFixture());
    render(<EkranStanuFazowego />);

    const galezie = await screen.findByTestId('mvd-fazowy-rn-galezie');
    const wiersze = within(galezie).getAllByTestId('mvd-fazowy-rn-galaz');
    expect(wiersze.length).toBe(2);
    expect(within(wiersze[0]).getByText('6,1')).toBeInTheDocument(); // I_A kabla
    expect(within(wiersze[0]).getByText('275')).toBeInTheDocument(); // I_n z katalogu
    expect(within(wiersze[0]).getByText('0,019')).toBeInTheDocument(); // straty 0,000019 MW → kW
    expect(within(wiersze[1]).getByText('229,6')).toBeInTheDocument();
    expect(within(wiersze[1]).getAllByText(T.kreska).length).toBe(1); // I_n = null → kreska, nie „0"
    expect(within(wiersze[1]).getByText('0,544')).toBeInTheDocument();
  });

  it('podsumowanie i założenia biegu nazwane kodami kanonu z elementami', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego(wynikiRnFixture());
    render(<EkranStanuFazowego />);

    const podsumowanie = await screen.findByTestId('mvd-fazowy-rn-podsumowanie');
    expect(within(podsumowanie).getByText('0,563')).toBeInTheDocument(); // straty P [kW]
    expect(within(podsumowanie).getByText('1,62')).toBeInTheDocument(); // max VUF
    expect(within(podsumowanie).getByText('Szyna nN')).toBeInTheDocument();
    expect(within(podsumowanie).getByText('2 / 3')).toBeInTheDocument();

    const zalozenia = screen.getByTestId('mvd-fazowy-rn-zalozenia');
    const pozycja = within(zalozenia).getByText(
      'Transformator w modelu szeregowym (gałąź magnesująca pominięta).',
    );
    expect(pozycja.closest('li')).toHaveAttribute(
      'data-kod',
      'power_flow.unbalanced_transformer_series_model',
    );
    expect(zalozenia).toHaveTextContent('tr1');
  });

  it('bieg bez założeń → uczciwa informacja zamiast pustej listy', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego(wynikiRnFixture({ zalozenia: [] }));
    render(<EkranStanuFazowego />);
    expect(await screen.findByTestId('mvd-fazowy-rn-bez-zalozen')).toBeInTheDocument();
  });

  it('końcówka odpowiada pustymi wierszami (bieg innego rodzaju) → stan zerowy z akcją do Obliczeń', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego({ run_id: 'run-rn-1', buses: [], branches: [], summary: null });
    render(<EkranStanuFazowego />);
    expect(await screen.findByTestId('mvd-fazowy-brak-wierszy')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-fazowy-rn-szyny')).not.toBeInTheDocument();
  });

  it('błąd końcówki rozpływu niesymetrycznego pokazywany wprost', async () => {
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego({ detail: 'Przebieg nie jest zakończony' });
    render(<EkranStanuFazowego />);
    const blad = await screen.findByTestId('mvd-fazowy-blad');
    expect(within(blad).getByText('Przebieg nie jest zakończony')).toBeInTheDocument();
  });

  it('aktywny przebieg stanu fazowego wygrywa z nowszym rozpływem niesymetrycznym (wybór jawny operatora)', async () => {
    ustawKontekstRn();
    useAppStateStore.getState().setActiveRun('run-ps-1');
    mockFetchStanuFazowego({ run_id: 'run-ps-1', rows: [wierszFixture()] });
    render(<EkranStanuFazowego />);
    const blok = await screen.findByTestId('mvd-fazowy-stan-fazowy');
    expect(blok).toHaveAttribute('data-zrodlo', 'stan_fazowy');
    expect(screen.getByText(T.zrodloStanFazowy)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-fazowy-rozplyw-niesymetryczny')).not.toBeInTheDocument();
  });

  it('następny krok: dowód obliczeń z proof_ref biegu rozpływu niesymetrycznego', async () => {
    const user = userEvent.setup();
    ustawKontekstRn();
    mockFetchRozplywuNiesymetrycznego(wynikiRnFixture());
    render(<EkranStanuFazowego />);
    await screen.findByTestId('mvd-fazowy-rn-szyny');
    await user.click(screen.getByTestId('mvd-fazowy-otworz-dowod'));
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-rn-1');
  });
});

describe('stanFazowyModel — czyste projekcje kontraktu', () => {
  it('wybierzPrzebiegFazowy preferuje aktywny zakończony stan fazowy, inaczej najnowszy', () => {
    const starszy = przebieg({ ...RUN_PS, id: 'run-ps-0', finished_at: '2026-07-19T11:00:00Z' });
    expect(wybierzPrzebiegFazowy([RUN_LF], null)).toBeNull();
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], null)?.id).toBe('run-ps-1');
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], 'run-ps-0')?.id).toBe('run-ps-0');
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], 'run-lf-1')?.id).toBe('run-ps-1');
  });

  it('W5-D: oba rodzaje przebiegów fazowych są źródłem; najnowszy z OBU wygrywa bez aktywnego', () => {
    expect(RODZAJE_PRZEBIEGOW_FAZOWYCH).toEqual({
      stan_fazowy: 'PHASE_STATE_SN',
      rozplyw_niesymetryczny: 'PF_UNBALANCED',
    });
    expect(zrodloPrzebiegu(RUN_PS)).toBe('stan_fazowy');
    expect(zrodloPrzebiegu(RUN_RN)).toBe('rozplyw_niesymetryczny');
    expect(zrodloPrzebiegu(RUN_LF)).toBeNull();
    expect(wybierzPrzebiegFazowy([RUN_PS, RUN_RN, RUN_LF], null)?.id).toBe('run-rn-1');
    expect(wybierzPrzebiegFazowy([RUN_PS, RUN_RN, RUN_LF], 'run-ps-1')?.id).toBe('run-ps-1');
    expect(wybierzPrzebiegFazowy([RUN_RN], null)?.id).toBe('run-rn-1');
    const niezakonczony = przebieg({ ...RUN_RN, id: 'run-rn-2', status: 'FAILED' });
    expect(wybierzPrzebiegFazowy([niezakonczony], null)).toBeNull();
  });

  it('projekcje rozpływu niesymetrycznego: kreska za brak, nigdy zgadywanie', () => {
    const szyny = naWierszeSzynNiesymetrycznych(wynikiRnFixture());
    expect(szyny[2].fazy).toBeNull();
    expect(szyny[1].najwiekszyVuf).toBe(true);
    expect(szyny[0].najwiekszyVuf).toBe(false);
    const galezie = naWierszeGaleziNiesymetrycznych(wynikiRnFixture());
    expect(galezie[1].iN).toBe(T.kreska);
    expect(galezie[0].iN).toBe('275');
    const bezPodsumowania = naPodsumowanieNiesymetrii(wynikiRnFixture({ summary: null }));
    expect(bezPodsumowania).toEqual([]);
    const bezMax = naPodsumowanieNiesymetrii(
      wynikiRnFixture({
        summary: {
          ...wynikiRnFixture().summary!,
          max_voltage_unbalance_factor_pct: null,
          max_voltage_unbalance_bus_id: null,
        },
      }),
    );
    expect(bezMax.find((p) => p.etykieta === T.rnMaxVuf)?.wartosc).toBe(T.kreska);
    expect(bezMax.find((p) => p.etykieta === T.rnMaxVufSzyna)?.wartosc).toBe(T.kreska);
  });

  it('naPozycjeAsymetrii: wartość bez flagi → „brak"; flaga true → „przekroczenie"', () => {
    const pozycje = naPozycjeAsymetrii(
      wierszFixture({
        flags: { current_unbalance_alert: true },
      }),
    );
    expect(pozycje[0].werdykt).toBe('brak'); // U: wartość jest, flagi brak
    expect(pozycje[1].werdykt).toBe('przekroczenie'); // I: flaga true
    const bezWartosci = naPozycjeAsymetrii(wierszFixture({ voltage_unbalance_percent: null }));
    expect(bezWartosci[0].werdykt).toBe('brak');
    expect(bezWartosci[0].wartosc).toBe(T.kreska);
  });
});
