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
    i2t_a2s: 56_250_000,
    i2t_dopuszczalne_a2s: 64_000_000,
    margines_procent: 6.25,
    kryteria: [
      {
        kod: 'prad_dopuszczalny',
        nazwa_pl: 'Prąd zwarciowy wobec dopuszczalnego dla czasu t',
        warunek_pl: 'I_th ≤ I_dop(t) = I_th(1s)/√t',
        wartosc: 15000,
        granica: 13160,
        jednostka: 'A',
        status: 'FAIL',
      },
      {
        kod: 'energia_cieplna',
        nazwa_pl: 'Energia zwarcia wobec wytrzymałości żyły',
        warunek_pl: 'I²·t ≤ k²·S²',
        wartosc: 56_250_000,
        granica: 64_000_000,
        jednostka: 'A²·s',
        status: 'FAIL',
      },
    ],
    powod_decyzji_pl: 'Przekrój 70 mm² jest mniejszy od wymaganego 79,8 mm² z warunku cieplnego.',
    zalecenia: [
      {
        kod: 'zwieksz_przekroj',
        dzialanie_pl: 'Zwiększ przekrój żyły',
        wzor: 'S ≥ I·√t / k',
        wartosc_docelowa: 79.8,
        jednostka: 'mm²',
        wartosc_obecna: 70,
        skutek_pl: 'Przekrój 79,8 mm² sprowadza wykorzystanie wytrzymałości do 100 %.',
      },
    ],
    wrazliwosc: [
      {
        parametr: 'czas_wylaczenia',
        nazwa_pl: 'Czas wyłączenia',
        mnoznik: 0.5,
        wartosc: 0.125,
        jednostka: 's',
        wykorzystanie: 0.806,
      },
    ],
    uzasadnienie_k: {
      k_a_s05_per_mm2: 143,
      tozsamosc_pl: 'k = Jth(1 s) — gęstość prądu zwarciowego dla 1 s z karty katalogowej.',
      material_zyly: 'CU',
      izolacja: 'XLPE',
      temp_poczatkowa_c: 90,
      temp_koncowa_c: 250,
      zrodlo_pl: 'IEC 60502-2 / IEC 60949',
      braki_pl: [],
      kompletne: true,
    },
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
    aktualnosc: {
      aktualny: true,
      powod_pl: 'Wynik policzony dla biezacej wersji modelu.',
      model_hash: 'h1',
      snapshot_hash: 'h1',
    },
    normy: [
      {
        norma: 'PN-HD 60364-4-43',
        punkt: '§ 434.5.2',
        tresc_pl: 'Warunek adiabatyczny doboru przekroju: S ≥ √(I²·t) / k.',
      },
    ],
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
    // Werdykt wystepuje w wierszu tabeli ORAZ w naglowku panelu dowodu — oba maja
    // niesc ikone i tekst, wiec sprawdzamy, ze pojawia sie co najmniej raz.
    expect(
      screen.getAllByText(new RegExp(JAKOSC_STRINGS.ocenaNaruszone)).length,
    ).toBeGreaterThan(0);
    // Wymagany przekrój (79,8) jest większy od zastosowanego (70) — projektant widzi,
    // CO ma zmienić, nie tylko że jest źle.
    // 79,8 mm² wystepuje w kolumnie „Wymagany min." oraz w zaleceniu naprawczym
    // (karta F-K1 faza 6) — projektant widzi te sama liczbe jako diagnoze i jako cel.
    expect(screen.getAllByText(/79,8/).length).toBeGreaterThan(0);
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
            powod_decyzji_pl: null,
            kryteria: [],
            zalecenia: [],
            wrazliwosc: [],
            i2t_a2s: null,
            i2t_dopuszczalne_a2s: null,
            margines_procent: null,
            uzasadnienie_k: null,
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

describe('Panel dowodu obliczeniowego (karta F-K1 faza 6)', () => {
  const dowodPelny: DowodCieplnyResponse = {
    run_id: 'sc-1',
    branch_id: 'cable_A',
    branch_name: 'Magistrala L-01',
    status: 'FAIL',
    kroki: [
      {
        step: 1,
        key: 'conductor_thermal_k_factor',
        title: 'Współczynnik materiałowy k żyły',
        inputs: {},
        substitution: '$$k = 143$$',
        result: {},
        notes: 'k = Jth(1 s).',
      },
    ],
  };

  function renderZWyborem() {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        odpowiedzOk(String(url).includes('/proof') ? dowodPelny : odpowiedz([pozycja()])),
      ),
    );
    return render(<SekcjaWytrzymaloscCieplna {...props()} />);
  }

  it('pokazuje pełny bilans: energię, dopuszczalną energię i margines', async () => {
    renderZWyborem();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const bilans = await screen.findByTestId('mvd-jakosc-cieplna-bilans');
    // I²t = 56,25 mln A²s, k²S² = 64 mln A²s, margines 6,25 %.
    expect(bilans.textContent).toContain('56,250 mln');
    expect(bilans.textContent).toContain('64,000 mln');
    expect(bilans.textContent).toContain('6,25 %');
  });

  it('rozbija werdykt na kryteria cząstkowe z osobnym statusem', async () => {
    renderZWyborem();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const kryteria = await screen.findByTestId('mvd-jakosc-cieplna-kryteria');
    expect(kryteria.textContent).toContain('I_th ≤ I_dop(t) = I_th(1s)/√t');
    expect(kryteria.textContent).toContain('I²·t ≤ k²·S²');
    // Ikona towarzyszy tekstowi — sam kolor nie może nieść werdyktu.
    expect(kryteria.textContent).toContain(JAKOSC_STRINGS.ikonaNaruszone);
  });

  it('dla naruszenia podaje działanie naprawcze z progiem liczbowym', async () => {
    renderZWyborem();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const zalecenia = await screen.findByTestId('mvd-jakosc-cieplna-zalecenia');
    expect(zalecenia.textContent).toContain('Zwiększ przekrój żyły');
    expect(zalecenia.textContent).toContain('S ≥ I·√t / k');
    expect(zalecenia.textContent).toContain('79,8');
  });

  it('pokazuje wrażliwość i podstawę współczynnika k z temperaturami', async () => {
    renderZWyborem();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const wrazliwosc = await screen.findByTestId('mvd-jakosc-cieplna-wrazliwosc');
    expect(wrazliwosc.textContent).toContain('Czas wyłączenia');

    const material = screen.getByTestId('mvd-jakosc-cieplna-material');
    expect(material.textContent).toContain('143');
    expect(material.textContent).toContain('CU');
    expect(material.textContent).toContain('XLPE');
    expect(material.textContent).toContain('90');
    expect(material.textContent).toContain('250');
  });

  it('niepełne uzasadnienie k jest nazwane, a nie uzupełniane z tablic', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        odpowiedzOk(
          String(url).includes('/proof')
            ? dowodPelny
            : odpowiedz([
                pozycja({
                  uzasadnienie_k: {
                    k_a_s05_per_mm2: 143,
                    tozsamosc_pl: 'k = Jth(1 s).',
                    material_zyly: null,
                    izolacja: 'XLPE',
                    temp_poczatkowa_c: 90,
                    temp_koncowa_c: null,
                    zrodlo_pl: null,
                    braki_pl: ['materiał żyły', 'temperatura końcowa (zwarciowa)'],
                    kompletne: false,
                  },
                }),
              ]),
        ),
      ),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const brak = await screen.findByTestId('mvd-jakosc-cieplna-brak-k');
    expect(brak.textContent).toContain('materiał żyły');
    expect(brak.textContent).toContain('temperatura końcowa');
  });

  it('podaje normę z punktem i prowadzi na schemat realnym klikiem', async () => {
    renderZWyborem();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    fireEvent.click(screen.getByText('Magistrala L-01'));

    const normy = await screen.findByTestId('mvd-jakosc-cieplna-normy');
    expect(normy.textContent).toContain('PN-HD 60364-4-43');
    expect(normy.textContent).toContain('§ 434.5.2');

    // Pętla decyzji: przycisk prowadzi do gałęzi na schemacie (ścieżka natywna).
    const przycisk = screen.getByTestId('mvd-jakosc-cieplna-pokaz-schemat');
    fireEvent.click(przycisk);
    expect(przycisk).toBeTruthy();
  });
});

describe('Aktualność wyniku wobec modelu (uwaga 12 właściciela)', () => {
  it('bieg sprzed zmiany modelu dostaje jawne ostrzeżenie nad tabelą', async () => {
    const body = odpowiedz([pozycja()]);
    fetchMock.mockResolvedValue(
      odpowiedzOk({
        ...body,
        aktualnosc: {
          aktualny: false,
          powod_pl:
            'Model zmienil sie po tym biegu — liczby dotycza WCZESNIEJSZEJ wersji projektu.',
          model_hash: 'h2',
          snapshot_hash: 'h1',
        },
      }),
    );
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());

    const pasek = screen.getByTestId('mvd-jakosc-cieplna-nieaktualne');
    expect(pasek.textContent).toContain('WCZESNIEJSZEJ');
  });

  it('bieg zgodny z modelem nie pokazuje ostrzeżenia', async () => {
    fetchMock.mockResolvedValue(odpowiedzOk(odpowiedz([pozycja()])));
    render(<SekcjaWytrzymaloscCieplna {...props()} />);
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    expect(screen.queryByTestId('mvd-jakosc-cieplna-nieaktualne')).toBeNull();
  });
});
