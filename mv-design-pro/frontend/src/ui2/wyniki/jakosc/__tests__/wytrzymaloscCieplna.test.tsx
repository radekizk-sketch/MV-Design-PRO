/**
 * Sekcja „Wytrzymałość zwarciowa przewodów" (karta F-K1, znalezisko Z1 audytu FLOW).
 *
 * METODA: mockowany jest GLOBALNY `fetch`, nie moduł `../api` — test ćwiczy realną
 * ścieżkę (adres końcówki, parsowanie, adapter, render), a nie ją omija.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SekcjaWytrzymaloscCieplna } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { przebiegTestowy } from './fixtures';
import type { PozycjaCieplna, WytrzymaloscCieplnaResponse } from '../api';

const fetchMock = vi.fn();

function pozycja(over: Partial<PozycjaCieplna> = {}): PozycjaCieplna {
  return {
    branch_id: 'cable_A',
    branch_name: 'Magistrala L-01',
    status: 'FAIL',
    i_fault_a: 15000,
    i_permissible_a: 13160,
    utilization: 1.14,
    s_min_mm2: 79.8,
    applied_cross_section_mm2: 70,
    missing_codes: [],
    uzasadnienie_pl: null,
    ...over,
  };
}

function odpowiedz(items: readonly PozycjaCieplna[]): WytrzymaloscCieplnaResponse {
  const pass = items.filter((i) => i.status === 'PASS').length;
  const fail = items.filter((i) => i.status === 'FAIL').length;
  const unavailable = items.filter((i) => i.status === 'UNAVAILABLE').length;
  return {
    run_id: 'sc-1',
    case_id: 'case-1',
    analysis_type: 'short_circuit_sn',
    fault_node_id: 'BUS-02',
    tk_s: 0.25,
    ocena: {
      items,
      summary: { pass_count: pass, fail_count: fail, unavailable_count: unavailable },
    },
  };
}

function props(over = {}) {
  return {
    przebieg: przebiegTestowy('sc-1', 'SC_3F'),
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

function odpowiedzOk(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SekcjaWytrzymaloscCieplna — realna ścieżka', () => {
  it('woła właściwą końcówkę z identyfikatorem przebiegu', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz([pozycja()])));
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/quality/conductor-thermal-withstand');
    expect(url).toContain('run_id=sc-1');
  });

  it('brak przebiegu zwarciowego → nie woła końcówki', () => {
    render(<SekcjaWytrzymaloscCieplna {...props({ przebieg: null })} />);
    expect(screen.getByTestId('mvd-jakosc-cieplna-brak')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('błąd końcówki → panel błędu, bez udawania wyniku', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: 'zly rodzaj przebiegu' }),
    } as Response);
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna-blad')).toBeTruthy());
  });
});

describe('SekcjaWytrzymaloscCieplna — werdykt i stany', () => {
  it('przekroczone kryterium pokazuje prąd, dopuszczalny i wymagany przekrój', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz([pozycja()])));
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());

    expect(screen.getByText('Magistrala L-01')).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.ocenaNaruszone)).toBeTruthy();
    // Wymagany przekrój (79,8) jest większy od zastosowanego (70) — projektant widzi,
    // CO ma zmienić, nie tylko że jest źle.
    expect(screen.getByText(/79,8/)).toBeTruthy();
    expect(screen.getByText(/13\s?160/)).toBeTruthy();
  });

  it('gałąź poza drogą zwarcia niesie uzasadnienie zamiast liczb kryterialnych', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz([
          pozycja(),
          pozycja({
            branch_id: 'cable_B',
            branch_name: 'Odgałęzienie L-02',
            status: 'PASS',
            i_fault_a: 0,
            i_permissible_a: null,
            utilization: null,
            s_min_mm2: null,
            uzasadnienie_pl:
              'Brak przeplywu pradu zwarciowego — galaz poza droga zwarcia; kryterium cieplne spelnione trywialnie.',
          }),
        ]),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    expect(screen.getByText(/poza droga zwarcia/)).toBeTruthy();
  });

  it('wszystko niesprawdzone → uczciwy stan z akcją, bez tabeli pustych liczb', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz([
          pozycja({
            status: 'UNAVAILABLE',
            i_fault_a: null,
            i_permissible_a: null,
            utilization: null,
            s_min_mm2: null,
            missing_codes: ['conductor.thermal_data_missing'],
          }),
        ]),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna-bez-danych')).toBeTruthy());
    expect(screen.getByText(JAKOSC_STRINGS.cieplnaBrakDanych)).toBeTruthy();
    expect(screen.queryByTestId('mvd-jakosc-cieplna')).toBeNull();
  });

  it('założenia podają kryterium, miejsce zwarcia i czas — skąd wzięły się liczby', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz([pozycja()])));
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    expect(screen.getByText(/I_th ≤ I_th\(1s\)/)).toBeTruthy();
    expect(screen.getByText('BUS-02')).toBeTruthy();
  });
});
