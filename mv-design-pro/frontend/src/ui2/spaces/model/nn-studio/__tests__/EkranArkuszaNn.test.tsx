/**
 * Testy zakładki ARKUSZ — arkusz obliczeń obwodów nN (karta ARKUSZ-NN).
 * Fixtura ma REALNY kształt odpowiedzi backendu (skopiowany z uruchomienia
 * `application/analyses/nn_circuit_sheet.build_nn_circuit_sheet` na sieci
 * referencyjnej — pola i wartości 1:1). Pokrywa: render tabeli, stany zerowe
 * uczciwe (brak stacji/brak odpływów), wiersz rozwijalny (klik natywny),
 * eksport CSV (klik natywny, treść identyczna z tabelą, determinizm).
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EkranArkuszaNn } from '../EkranArkuszaNn';
import type { ArkuszWiersz, WidokArkuszaNn } from '../nnSiteApi';

const appState = { activeCaseId: 'case-1' as string | null };
vi.mock('../../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

function wierszRealny(): ArkuszWiersz {
  return {
    nr: 1,
    wyszczegolnienie: 'AP1',
    feeder_root_branch_ref: 'ap1',
    worst_point_bus_ref: 'b2',
    worst_point_zrodlo: 'pętla zwarcia (impedancja)',
    obciazenie: { p_mw: 0.02, q_mvar: 0.01, s_mva: 0.02236, cos_phi: 0.8944, fazy: 3, liczba_odbiorow: 1 },
    ib: { status: 'OK', wartosc: 32.2749, zrodlo_pl: 'tabliczka (Σ odbiorów odpływu, S=√3·U·I)', reason_pl: null },
    zrodlo_ib: 'tabliczka',
    aparat: {
      status: 'OK',
      wartosc: { kind: 'MCB', nazwa: 'AP1', in_a: 16, klasa_mcb: 'B', nastawa_n: 1, ir_a: 16 },
      zrodlo_pl: "materialized_params gałęzi 'ap1'",
      reason_pl: null,
    },
    zapas_zabezpieczenia_procent: { status: 'OK', wartosc: -101.72, zrodlo_pl: '(Ir−Ib)/Ir', reason_pl: null },
    iz: {
      status: 'OK',
      wartosc: {
        iz_prime_a: 80,
        iz_katalogowe_a: 80,
        rozklad: { f_temperatura: 1, f_rezystywnosc_gruntu: 1, f_grupowanie: 1, iloczyn: 1 },
        branch_ref_decydujacy: 'c1',
        segmenty: [{ branch_ref: 'c1', iz_katalogowe_a: 80, iz_prime_a: 80, status: 'OK', reason_pl: 'Warunki katalogowe' }],
      },
      zrodlo_pl: 'Warunki katalogowe',
      reason_pl: null,
    },
    k2_i2: { status: 'OK', wartosc: { k2: 1.45, i2_a: 23.2 }, zrodlo_pl: 'IEC 60898-1', reason_pl: null },
    przewod: {
      status: 'OK',
      wartosc: { branch_ref: 'c1', nazwa: 'C1', catalog_ref: null, material: 'CU', przekroj_mm2: 16, gamma_ms_m: 58 },
      zrodlo_pl: "katalog kabla 'c1'",
      reason_pl: null,
    },
    kryterium_i_ib_in_iz: {
      status: 'OK',
      wartosc: { status: 'nie spełnia', wartosci: { ib_a: 32.2749, in_a: 16, iz_prime_a: 80 } },
      zrodlo_pl: 'In=16 A < Ib=32,2749 A — aparat NIE POKRYWA obciążenia obwodu.',
      reason_pl: null,
    },
    kryterium_ii_i2_iz: {
      status: 'OK',
      wartosc: { status: 'spełnia', wartosci: { i2_a: 23.2, limit_a: 116 } },
      zrodlo_pl: 'I2=23,2 A <= 1,45·Iz′=116 A.',
      reason_pl: null,
    },
    dlugosc_m: { status: 'OK', wartosc: 50, zrodlo_pl: 'suma długości odcinków', reason_pl: null },
    delta_u: { status: 'brak danych', wartosc: null, zrodlo_pl: null, reason_pl: 'Brak biegu rozpływu mocy (parametr load_flow_run_id) — uruchom rozpływ, żeby zobaczyć ΔU.' },
    ik_max: { status: 'brak danych', wartosc: null, zrodlo_pl: null, reason_pl: 'Brak biegu zwarciowego IEC 60909 (parametr short_circuit_run_id) dla punktu.' },
    ik_min: { status: 'OK', wartosc: 3941.6, zrodlo_pl: 'pętla zwarcia IEC 60364-4-41 (Ik1_min, scenariusz MIN)', reason_pl: null },
    swz: {
      status: 'OK',
      wartosc: { status: 'spełnia', wartosci: { ik1_min_a: 3941.6, ia_wymagane_a: 80 } },
      zrodlo_pl: 'Ik1_min=3941,6 A ≥ Ia=80,0 A (MCB B 16 A).',
      reason_pl: null,
    },
    i2t: { status: 'brak danych', wartosc: null, zrodlo_pl: null, reason_pl: 'Brak Ith — wymaga biegu zwarciowego IEC 60909.' },
    status_doboru: {
      status: 'OK',
      wartosc: { kwalifikuje_sie: false, kryteria: [] },
      zrodlo_pl: 'ocena aparatu zainstalowanego wobec czterech kryteriów doboru (P0.7)',
      reason_pl: null,
    },
    provenance: {
      load_flow_run_id: null,
      short_circuit_run_id: null,
      fault_duration_s: null,
      rewizja_modelu: 'abc123',
      swiezosc: { load_flow_aktualny: null, short_circuit_aktualny: null },
    },
  };
}

let odpowiedz: WidokArkuszaNn = {
  status: 'OK',
  station_ref: 'stn',
  station_name: 'Stacja',
  network_system: 'TN-C-S',
  wiersze: [wierszRealny()],
  missing_data: [],
  reason_pl: null,
  provenance: {
    load_flow_run_id: null,
    short_circuit_run_id: null,
    fault_duration_s: null,
    rewizja_modelu: 'abc123',
    swiezosc: { load_flow_aktualny: null, short_circuit_aktualny: null },
  },
};

const fetchMock = vi.fn(() => Promise.resolve(odpowiedz));
vi.mock('../nnSiteApi', async () => {
  const actual = await vi.importActual<typeof import('../nnSiteApi')>('../nnSiteApi');
  return { ...actual, fetchNnCircuitSheet: (...args: unknown[]) => fetchMock(...args) };
});

describe('EkranArkuszaNn — tabela realna', () => {
  afterEach(() => {
    cleanup();
    fetchMock.mockClear();
    odpowiedz = {
      status: 'OK',
      station_ref: 'stn',
      station_name: 'Stacja',
      network_system: 'TN-C-S',
      wiersze: [wierszRealny()],
      missing_data: [],
      reason_pl: null,
      provenance: {
        load_flow_run_id: null,
        short_circuit_run_id: null,
        fault_duration_s: null,
        rewizja_modelu: 'abc123',
        swiezosc: { load_flow_aktualny: null, short_circuit_aktualny: null },
      },
    };
  });

  it('renderuje wiersz z realnymi wartościami (Ib, aparat, Iz′, kryteria)', async () => {
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-tabela')).toBeInTheDocument());
    const wiersz = screen.getByTestId('mvd-nn-studio-arkusz-tabela-wiersz');
    expect(within(wiersz).getByText('AP1')).toBeInTheDocument();
    expect(within(wiersz).getByText(/32,3 \(tabliczka\)/)).toBeInTheDocument();
  });

  it('kolumny zależne od biegu (ΔU/Ik″max/I²t) pokazują uczciwy trzeci stan, nie puste komórki', async () => {
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-tabela')).toBeInTheDocument());
    const wiersz = screen.getByTestId('mvd-nn-studio-arkusz-tabela-wiersz');
    // ΔU i Ik''max są 'brak danych' w fixture — komórka NIGDY pusta.
    expect(within(wiersz).getAllByText(/brak danych/).length).toBeGreaterThanOrEqual(2);
  });

  it('stan zerowy: stacja bez odpływów', async () => {
    odpowiedz = { status: 'OK', station_ref: 'stn', wiersze: [], missing_data: [], reason_pl: null };
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-brak-odplywow')).toBeInTheDocument());
  });

  it('stan zerowy: stacja nieznana (brak danych, uczciwy powód)', async () => {
    odpowiedz = { status: 'brak danych', wiersze: [], missing_data: ['station'], reason_pl: null };
    render(<EkranArkuszaNn stationRef="nieistniejaca" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-brak-danych')).toBeInTheDocument());
  });

  it('podpowiedź o brakującym ID biegu, gdy pola puste i są wiersze', async () => {
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-podpowiedz-biegu')).toBeInTheDocument());
  });

  it('klik natywny "Szczegóły" otwiera panel z rozkładem Iz′, ΔU i dowodami kryteriów', async () => {
    const user = userEvent.setup();
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-tabela')).toBeInTheDocument());

    const przycisk = screen.getByTestId('mvd-nn-studio-arkusz-tabela-komorka-szczegoly-ap1-akcja');
    await user.click(przycisk);

    expect(screen.getByTestId('mvd-nn-studio-arkusz-szczegoly')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-nn-studio-arkusz-rozklad-k')).toBeInTheDocument();
    expect(screen.getByText(/Warunki katalogowe/)).toBeInTheDocument();
    // ΔU brak danych w fixture -> panel ODcinkowy nie renderuje tabeli, tylko powód.
    expect(screen.getByText('Brak biegu rozpływu mocy (parametr load_flow_run_id) — uruchom rozpływ, żeby zobaczyć ΔU.')).toBeInTheDocument();

    const zamknij = screen.getByTestId('mvd-nn-studio-arkusz-szczegoly-zamknij');
    await user.click(zamknij);
    expect(screen.queryByTestId('mvd-nn-studio-arkusz-szczegoly')).not.toBeInTheDocument();
  });

  it('klik natywny "Odśwież" ponownie pobiera arkusz', async () => {
    const user = userEvent.setup();
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-tabela')).toBeInTheDocument());
    const wywolaniaPrzed = fetchMock.mock.calls.length;
    await user.click(screen.getByTestId('mvd-nn-studio-arkusz-odswiez'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(wywolaniaPrzed));
  });

  it('klik natywny "Eksportuj CSV" pobiera plik z treścią identyczną jak w tabeli', async () => {
    const czesciBlob: BlobPart[][] = [];
    const originalBlob = globalThis.Blob;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    // jsdom nie implementuje Blob.text() — przechwytujemy części konstruktora
    // SYNCHRONICZNIE (ten sam ciąg znaków, który trafiłby do pliku), zamiast
    // czytać Blob asynchronicznie.
    class BlobStub {
      constructor(parts: BlobPart[]) {
        czesciBlob.push(parts);
      }
    }
    // @ts-expect-error — stub testowy, nie pełna implementacja Blob.
    globalThis.Blob = BlobStub;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const user = userEvent.setup();
    render(<EkranArkuszaNn stationRef="stn" />);
    await waitFor(() => expect(screen.getByTestId('mvd-nn-studio-arkusz-tabela')).toBeInTheDocument());

    const komorkaIb = screen.getByTestId('mvd-nn-studio-arkusz-tabela-komorka-ib-ap1');
    const tekstKomorkiIb = komorkaIb.textContent ?? '';

    await user.click(screen.getByTestId('mvd-nn-studio-arkusz-eksport-csv'));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(czesciBlob).toHaveLength(1);
    const trescCsv = String(czesciBlob[0][1]);
    // Treść CSV zawiera DOKŁADNIE ten sam tekst Ib, co komórka ekranu.
    expect(trescCsv).toContain(tekstKomorkiIb);
    expect(trescCsv.split('\r\n')[0]).toContain('Wyszczególnienie');

    globalThis.Blob = originalBlob;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    clickSpy.mockRestore();
  });
});
