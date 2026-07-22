/**
 * Testy ekranu „Stan fazowy SN" (E-31, karta P-2).
 * Kliki natywne (userEvent) — Zero-Debt pkt 5. Realna ścieżka wejścia:
 * karta huba analiz → powierzchnia E-31. Dane mockowane przez `fetch`
 * 1:1 z kontraktem `api.ts` (GET /api/analysis-runs/:id/results/phase-state)
 * — ekran niczego nie liczy; werdykty asymetrii pochodzą z flag solvera.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranAnalizTechnicznych } from '../../analizy/EkranAnalizTechnicznych';
import type { WierszStanuFazowego, WynikiStanuFazowego } from '../api';
import { EkranStanuFazowego } from '../EkranStanuFazowego';
import { naPozycjeAsymetrii, wybierzPrzebiegFazowy } from '../stanFazowyModel';
import { STAN_FAZOWY_STRINGS as T } from '../strings';

const RUN_PS = {
  id: 'run-ps-1',
  analysis_type: 'PHASE_STATE_SN',
  status: 'DONE',
  finished_at: '2026-07-20T11:00:00Z',
  started_at: '2026-07-20T10:59:00Z',
} as never;

const RUN_LF = {
  id: 'run-lf-1',
  analysis_type: 'LOAD_FLOW',
  status: 'DONE',
  finished_at: '2026-07-20T10:00:00Z',
  started_at: '2026-07-20T09:59:00Z',
} as never;

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

describe('EkranStanuFazowego — realna ścieżka wejścia (karta huba → powierzchnia E-31)', () => {
  it('klik „Otwórz" na karcie stanu fazowego otwiera powierzchnię E-31 (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-fazowy');
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-31');
  });

  it('karta huba uczciwie zapowiada wymóg przebiegu stanu fazowego (chip)', () => {
    useExecutionRunsStore.setState({ runs: [RUN_LF] });
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-fazowy');
    expect(within(karta).getByText('wymaga przebiegu stanu fazowego')).toBeInTheDocument();
  });
});

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

describe('stanFazowyModel — czyste projekcje kontraktu', () => {
  it('wybierzPrzebiegFazowy preferuje aktywny zakończony stan fazowy, inaczej najnowszy', () => {
    const starszy = { ...RUN_PS, id: 'run-ps-0', finished_at: '2026-07-19T11:00:00Z' } as never;
    expect(wybierzPrzebiegFazowy([RUN_LF], null)).toBeNull();
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], null)?.id).toBe('run-ps-1');
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], 'run-ps-0')?.id).toBe('run-ps-0');
    expect(wybierzPrzebiegFazowy([starszy, RUN_PS], 'run-lf-1')?.id).toBe('run-ps-1');
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
