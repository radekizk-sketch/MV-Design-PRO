/*
 * Testy sekcji inspektora „Pętla zwarcia u źródła (nN)" (G-STK-4). Ćwiczą realną
 * ścieżkę: mount → fetch endpointu z modelu → render policzonych Z_s/Ik / uczciwe
 * stany (odmowa nazwana kodem dla TT/IT bez danych, pętla doziemna TT/IT policzona, brak
 * danych, nie dotyczy poza pasmem nN). ZERO fizyki w UI — liczby z backendu.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
vi.mock('../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

import { SekcjaPetlaZwarcia } from '../SekcjaPetlaZwarcia';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(dane: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(dane) } as Response)),
  );
}

describe('SekcjaPetlaZwarcia', () => {
  it('OK → pokazuje Z_s, Ik i impedancję transformatora z backendu', async () => {
    mockFetch({
      status: 'OK',
      network_system: 'TN-C-S',
      transformer_impedance_ohm: { r: 0.0026, x: 0.0098 },
      fault_loop: {
        z_loop_ohm: { magnitude: 0.01016 },
        ik_min_a: 21596.5,
        ik_max_a: 23869.8,
        components: [],
      },
      note_pl: 'Impedancja pętli u źródła.',
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('TN-C-S');
    // Ik prezentowane w kA (przecinek PL) — wartości z solvera, nie liczone w UI.
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('23,87 kA');
    expect(screen.getByTestId('mvd-insp-petla')).toHaveTextContent('0,0102 Ω');
  });

  it('strona dolna poza pasmem nN → uczciwy stan „nie dotyczy" (bez liczb pętli)', async () => {
    mockFetch({
      status: 'nie dotyczy',
      network_system: 'TN-C-S',
      kod_odmowy: 'nn.transformer_lv_not_nn_band',
      reason_pl: 'Transformator ma stronę dolną 6 kV — poza pasmem nN.',
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-insp-petla-niedotyczy')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('mvd-insp-petla-niedotyczy')).toHaveTextContent('poza pasmem nN');
  });

  it('układ IT bez pojemności doziemnych → odmowa NAZWANA kodem (W5-E-TTIT), nie „nie dotyczy"', async () => {
    mockFetch({
      status: 'brak danych',
      network_system: 'IT',
      kod_odmowy: 'nn.brak_pojemnosci_doziemnej',
      reason_pl: 'Odcinki bez susceptancji zerowej b_0: c_a.',
      missing_data: ['c_a:b0_siemens_per_km'],
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla-brak')).toBeInTheDocument());
    const brak = screen.getByTestId('mvd-insp-petla-brak');
    expect(brak).toHaveAttribute('data-kod-odmowy', 'nn.brak_pojemnosci_doziemnej');
    expect(brak).toHaveTextContent('Odcinki bez susceptancji zerowej b_0: c_a.');
    expect(screen.queryByTestId('mvd-insp-petla-niedotyczy')).toBeNull();
  });

  it('układ IT policzony → pojemność, prąd pierwszego i drugiego zwarcia, napięcie dotykowe z solvera', async () => {
    mockFetch({
      status: 'OK',
      network_system: 'IT',
      fault_loop: {
        z_loop_ohm: { magnitude: 0.05 },
        ik_min_a: 4388.1,
        ik_max_a: 4850.0,
        components: [],
        tt_it: {
          uklad: 'IT',
          rodzaj_pradu_pl: 'drugie zwarcie doziemne L-PE-L',
          r_a_ohm: 25,
          r_b_ohm: null,
          i_delta_n_a: null,
          u_dotyk_v: null,
          c_e_f: 1.9099e-8,
          czestotliwosc_hz: 50,
          i_d_pierwsze_zwarcie_a: 0.004139,
          u_dotyk_pierwsze_zwarcie_v: 0.1035,
          i_d2_min_a: 4388.1,
          i_d2_max_a: 4850.0,
        },
      },
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla')).toBeInTheDocument());
    const sekcja = screen.getByTestId('mvd-insp-petla');
    expect(sekcja).toHaveTextContent('drugie zwarcie doziemne L-PE-L');
    expect(sekcja).toHaveTextContent('0,019 µF');
    expect(sekcja).toHaveTextContent('4 mA');
    expect(sekcja).toHaveTextContent('0,10 V');
    expect(sekcja).toHaveTextContent('4,39 kA');
  });

  it('układ TT policzony → uziomy R_B/R_A, I_Δn i napięcie dotykowe R_A·I_Δn z solvera', async () => {
    mockFetch({
      status: 'OK',
      network_system: 'TT',
      fault_loop: {
        z_loop_ohm: { magnitude: 26.9 },
        ik_min_a: 8.12,
        ik_max_a: 8.97,
        components: [],
        tt_it: {
          uklad: 'TT',
          rodzaj_pradu_pl: 'zwarcie doziemne przez uziomy',
          r_a_ohm: 25,
          r_b_ohm: 2,
          i_delta_n_a: 0.03,
          u_dotyk_v: 0.75,
          c_e_f: null,
          czestotliwosc_hz: null,
          i_d_pierwsze_zwarcie_a: null,
          u_dotyk_pierwsze_zwarcie_v: null,
          i_d2_min_a: null,
          i_d2_max_a: null,
        },
      },
    });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla')).toBeInTheDocument());
    const sekcja = screen.getByTestId('mvd-insp-petla');
    expect(sekcja).toHaveTextContent('2,00 Ω / 25,00 Ω');
    expect(sekcja).toHaveTextContent('30 mA');
    expect(sekcja).toHaveTextContent('0,75 V');
    expect(sekcja).toHaveTextContent('8,12 A');
  });

  it('brak danych transformatora → uczciwy komunikat z listą braków', async () => {
    mockFetch({ status: 'brak danych', network_system: 'TN-S', missing_data: ['uk_percent'] });
    render(<SekcjaPetlaZwarcia stationRef="stn-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-petla-brak')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-insp-petla-brak')).toHaveTextContent('uk_percent');
  });
});
