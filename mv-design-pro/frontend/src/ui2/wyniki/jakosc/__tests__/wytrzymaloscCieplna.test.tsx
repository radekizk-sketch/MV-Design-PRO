/**
 * Sekcja „Wytrzymałość zwarciowa przewodów" (karta F-K1, znalezisko Z1 audytu FLOW).
 *
 * METODA: mockowany jest GLOBALNY `fetch`, nie moduł `../api` — test ćwiczy realną
 * ścieżkę (adres końcówki, parsowanie, adapter, render), a nie ją omija.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SekcjaWytrzymaloscCieplna } from '../EkranJakosci';
import { JAKOSC_STRINGS } from '../strings';
import { przebiegTestowy } from './fixtures';
import type {
  DowodCieplnyResponse,
  PozycjaCieplna,
  SladCzasuWylaczenia,
  WytrzymaloscCieplnaResponse,
} from '../api';

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
    czas_wylaczenia: slad(),
    ...over,
  };
}

function slad(over: Partial<SladCzasuWylaczenia> = {}): SladCzasuWylaczenia {
  return {
    tk_s: 0.594119,
    zrodlo: 'nastawa_zabezpieczenia',
    powod_pl: 'Czas z charakterystyki IEC_SI zabezpieczenia pola przy prądzie gałęzi.',
    urzadzenie_ref: 'CB1',
    urzadzenie_nazwa: 'Wyłącznik pola liniowego',
    funkcja: 'overcurrent_51',
    prad_galezi_a: 6000,
    prad_rozruchowy_a: 600,
    krzywa: 'IEC_SI',
    tms: 0.2,
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
    czasy_wylaczenia: {
      z_nastawy: items.filter((i) => i.czas_wylaczenia?.zrodlo === 'nastawa_zabezpieczenia')
        .length,
      z_zalozenia: items.filter((i) => i.czas_wylaczenia?.zrodlo === 'zalozenie_przypadku').length,
      razem: items.length,
    },
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
              'Brak przepływu prądu zwarciowego — gałąź poza drogą zwarcia; kryterium cieplne spełnione trywialnie.',
          }),
        ]),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    expect(screen.getByText(/poza drogą zwarcia/)).toBeTruthy();
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

describe('SekcjaWytrzymaloscCieplna — źródło czasu wyłączenia (karta F-K1 faza 5)', () => {
  it('odróżnia czas z nastawy od czasu założonego w przypadku', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(
        odpowiedz([
          pozycja(),
          pozycja({
            branch_id: 'cable_B',
            branch_name: 'Odgałęzienie L-02',
            status: 'PASS',
            czas_wylaczenia: slad({
              tk_s: 0.25,
              zrodlo: 'zalozenie_przypadku',
              powod_pl:
                'Aparat nie ma przypisanego czynnego zabezpieczenia. Przyjęto założony czas przypadku 0,25 s.',
              urzadzenie_ref: null,
              urzadzenie_nazwa: null,
              funkcja: null,
              krzywa: null,
              tms: null,
            }),
          }),
        ]),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());

    // Obie gałęzie mają czas, ale tabela mówi wprost, która z nastawy, a która z
    // założenia — bez tego liczby wyglądałyby identycznie.
    expect(screen.getByText(JAKOSC_STRINGS.czasZNastawy)).toBeTruthy();
    expect(screen.getByText(JAKOSC_STRINGS.czasZZalozenia)).toBeTruthy();
    // Tabela formatuje czas do dwoch miejsc (wspolny format liczb sekcji).
    expect(screen.getByText('0,59')).toBeTruthy();
    // Założenia sekcji podają PROPORCJĘ, a nie jedną wspólną wartość czasu.
    expect(screen.getByText(JAKOSC_STRINGS.czasPodsumowanie(1, 1))).toBeTruthy();
  });

  it('nieznany kod źródła nie jest zgadywany — pokazuje kreskę', async () => {
    fetchMock.mockResolvedValue(
      odpowiedzOk(odpowiedz([pozycja({ czas_wylaczenia: slad({ zrodlo: 'cos_nowego' }) })])),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    expect(screen.queryByText(JAKOSC_STRINGS.czasZNastawy)).toBeNull();
  });
});

describe('SekcjaWytrzymaloscCieplna — dowód kryterium (karta F-K1 faza 5)', () => {
  const dowod: DowodCieplnyResponse = {
    run_id: 'sc-1',
    branch_id: 'cable_A',
    branch_name: 'Magistrala L-01',
    status: 'FAIL',
    kroki: [
      {
        step: 1,
        key: 'conductor_thermal_time_source',
        title: 'Czas trwania zwarcia z nastawy zabezpieczenia',
        inputs: {},
        substitution: 'Charakterystyka IEC_SI aparatu CB1 ⇒ t_k = 0,594119 s',
        result: { tk_s: { value: 0.594119, unit: 's', label: 'Czas trwania zwarcia' } },
        notes: 'Czas z charakterystyki IEC_SI.',
      },
      {
        step: 2,
        key: 'conductor_thermal_admissible',
        title: 'Prąd dopuszczalny przewodu przy czasie trwania zwarcia',
        formula_latex: '$$I_{dop}(t) = I_{th(1s)}$$',
        inputs: {},
        substitution: 'I_dop = 13800 / 0,771 = 17899 A',
        result: { i_dop_a: { value: 17899, unit: 'A', label: 'Prąd dopuszczalny' } },
        notes: 'Nagrzewanie adiabatyczne.',
      },
    ],
  };

  it('wybór gałęzi w tabeli pobiera dowód dla TEJ gałęzi i pokazuje kroki', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        odpowiedzOk(String(url).includes('/proof') ? dowod : odpowiedz([pozycja()])),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());

    // Przed wyborem: uczciwa podpowiedź zamiast pustego panelu.
    expect(screen.getByTestId('mvd-jakosc-cieplna-dowod-pusty')).toBeTruthy();

    // ŚCIEŻKA REALNA: klik w wiersz tabeli, nie wymuszony stan komponentu.
    fireEvent.click(screen.getByText('Magistrala L-01'));

    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna-dowod')).toBeTruthy());
    const adres = String(
      fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/proof')),
    );
    expect(adres).toContain('run_id=sc-1');
    expect(adres).toContain('branch_id=cable_A');
    // Tytul kroku pojawia sie i w spisie krokow, i w naglowku kroku.
    expect(screen.getAllByText(/Czas trwania zwarcia z nastawy/).length).toBeGreaterThan(0);
  });

  it('błąd pobrania dowodu nie udaje wyniku', async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).includes('/proof')
        ? Promise.resolve({
            ok: false,
            status: 422,
            statusText: 'Unprocessable Entity',
            json: async () => ({ detail: 'brak galezi' }),
          } as Response)
        : Promise.resolve(odpowiedzOk(odpowiedz([pozycja()]))),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());

    fireEvent.click(screen.getByText('Magistrala L-01'));

    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna-dowod-blad')).toBeTruthy());
  });
});
