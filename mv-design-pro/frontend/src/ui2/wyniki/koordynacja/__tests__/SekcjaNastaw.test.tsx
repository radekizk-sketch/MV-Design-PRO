/**
 * Sekcja „Nastawy nadprądowe I>/I>>" — metoda Hoppela/IRiESD (karta W3-C1).
 *
 * Kliki natywne (userEvent), `fetch` mockowany 1:1 z kontraktem końcówek
 * `pakiet-dowodowy-nastaw/dostepnosc`, `nastawy`, `nastawy/dopasowanie`,
 * `catalog/protection/device-types`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { SekcjaNastaw } from '../SekcjaNastaw';
import { KOORDYNACJA_STRINGS as T } from '../strings';
import type { SprawdzenieCieplne } from '../nastawyApi';
// Bloki `thermal` generowane z backendu (`ProtectionSettingsEngine.calculate`) przez
// backend/tests/uczciwosc/generuj_fixtury_ocen_fe.py; parytet pilnuje test_fixtury_ocen_fe.py.
import nastawyCieplne from './nastawyCieplne.json';

const CIEPLNE = nastawyCieplne as unknown as Record<'wytrzymuje' | 'nie_wytrzymuje', SprawdzenieCieplne>;

const RUN_SC_MAX = {
  id: 'run-sc-max',
  study_case_id: 'case-1',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-09-09T08:00:00Z',
  started_at: '2026-09-09T07:59:00Z',
} as never;

/** Odmowa bez wskazania — tekst z rekordu backendu (kanon kodów gotowości). */
const ODMOWA_BRAK_WSKAZANIA = {
  kod: 'protection.relay_terminal_indication_missing',
  powod_pl:
    'Model nie wskazuje, przy którym zacisku gałęzi stoi zabezpieczenie — wskaż zacisk '
    + 'początkowy albo końcowy — gałąź ln1: Zacisk początkowy — szyna GPZ SN albo '
    + 'Zacisk końcowy — szyna Stacja A.',
};

function zaciski(od: string, doSzyna: string) {
  return {
    od: { szyna_ref: od, etykieta_pl: `Zacisk początkowy — szyna ${od}` },
    do: { szyna_ref: doSzyna, etykieta_pl: `Zacisk końcowy — szyna ${doSzyna}` },
  };
}

const DOSTEPNOSC_OK = {
  run_id: 'run-sc-max',
  dostepny: true,
  powod_pl: null,
  linie: [
    {
      // Model milczy — wymagany wybór zacisku; kandydaci osobno dla każdego zacisku.
      line_id: 'ln1',
      nazwa: 'Linia GPZ – Stacja A',
      zacisk_z_modelu: null,
      wymaga_wskazania_zacisku: true,
      zaciski_dozwolone: ['od', 'do'],
      odmowa_zacisku: ODMOWA_BRAK_WSKAZANIA,
      zaciski: zaciski('GPZ SN', 'Stacja A'),
      nastepne_szyny_wg_zacisku: { od: ['b_b'], do: [] },
    },
    {
      // Model rozstrzyga (zabezpieczenie w szeregu z zaciskiem `od`) — tylko do odczytu.
      line_id: 'ln2',
      nazwa: 'Linia Stacja A – Stacja B',
      zacisk_z_modelu: 'od',
      wymaga_wskazania_zacisku: false,
      zaciski_dozwolone: ['od'],
      odmowa_zacisku: null,
      zaciski: zaciski('Stacja A', 'Stacja B'),
      nastepne_szyny_wg_zacisku: { od: ['b_c'], do: [] },
    },
    {
      // Pętla: wyłącznik w szeregu z oboma zaciskami — brak dozwolonego zacisku.
      line_id: 'ln3',
      nazwa: 'Linia z pętlą',
      zacisk_z_modelu: null,
      wymaga_wskazania_zacisku: false,
      zaciski_dozwolone: [],
      odmowa_zacisku: {
        kod: 'protection.relay_terminal_breaker_loop',
        powod_pl: 'Wyłącznik z przypiętym zabezpieczeniem stoi w szeregu z oboma zaciskami.',
      },
      zaciski: zaciski('Stacja B', 'Stacja C'),
      nastepne_szyny_wg_zacisku: { od: [], do: [] },
    },
  ],
};

const WYNIK_NASTAW = {
  wynik: {
    line_id: 'ln1',
    line_name: 'Linia GPZ – Stacja A',
    delayed: {
      i_setting_a: 48.5,
      t_setting_s: 0.3,
      i_load_max_a: 40.4,
      k_b: 1.2,
      sensitivity_ratio: 87.27,
      is_valid: true,
      validation_notes: [],
      trace: [],
    },
    instantaneous: {
      i_setting_a: 5820.5,
      i_min_selectivity_a: 5000.0,
      i_max_thermal_a: 7000.0,
      i_max_sensitivity_a: 6500.0,
      range_valid: true,
      k_b: 1.2,
      k_bth: 1.1,
      is_valid: true,
      validation_notes: [],
      trace: [],
    },
    thermal: CIEPLNE.wytrzymuje,
    spz: {
      spz_allowed: true,
      total_fault_time_s: 0.6,
      i_th_required_a: 8000.0,
      i_th_available_a: 15000.0,
      blocking_recommended: false,
      trace: [],
    },
    overall_valid: true,
    summary_notes: [],
  },
  wejscie: {
    kotwica_run_id: 'run-sc-max',
    scenariusz_kotwicy: 'MAX',
    c_kotwicy: { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
    c_wariantu_min: 'IEC 60909-0 tab. 1, scenariusz MIN (per węzeł)',
    line_id: 'ln1',
    next_bus_id: 'b_b',
    zacisk_zabezpieczenia: 'od',
    zrodlo_zacisku: 'wskazanie',
    project_name: 'Projekt testowy',
    case_name: 'case-1',
    line_name: 'Linia GPZ – Stacja A',
    run_timestamp: '2026-09-09T08:00:00+00:00',
    solver_version: 'IEC_60909;load-flow-newton-raphson-v1',
    engine_input: {},
  },
  dostepnosc_pakietu: true,
};

const APARATY = [
  { id: 'ABB_REF601', name_pl: 'ABB REF601' },
  { id: 'REF-OC-100', name_pl: 'Profil referencyjny (nie produkt producenta) - OC-100' },
];

const DOPASOWANIE_ZGODNE = {
  status: 'SUCCEEDED',
  compatible: true,
  violations: [],
  mapped_settings: { I51: 48.5, T51: 0.3, I50: 5820.5, CURVE: 'DT' },
  assumptions: ['LOGICAL_MAPPING_ONLY', 'NO_VENDOR_PARAM_IDS'],
  vendor_mapping: {
    vendor: 'ABB',
    vendor_settings: { 'ABB.OC.I51_PICKUP_A': 48.5 },
    vendor_violations: [],
    vendor_assumptions: ['VENDOR_KEYS_SYMBOLIC_V0'],
  },
  wymaganie: {
    curve: 'DT',
    i_pickup_51_a: 48.5,
    tms_51: null,
    t_51_s: 0.3,
    i_inst_50_a: 5820.5,
    i_pickup_51n_a: null,
    tms_51n: null,
    i_inst_50n_a: null,
  },
  device_id: 'ABB_REF601',
  capability: {},
  proweniencja_nastaw: WYNIK_NASTAW.wejscie,
};

// Typ mocka = sygnatura implementacji (vitest 1.x: `Mock<TArgs, TReturn>`); `ReturnType<typeof vi.fn>`
// dawal `Mock<any[], unknown>`, do ktorego `vi.fn(async (input) => Response)` nie jest przypisywalny (TS2322).
type FetchMock = Mock<[input: RequestInfo | URL], Promise<Response>>;
let fetchMock: FetchMock;

function ustawKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
}

function mockDomyslny() {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
      return { ok: true, status: 200, json: async () => DOSTEPNOSC_OK } as Response;
    }
    if (url.includes('/nastawy/dopasowanie')) {
      return { ok: true, status: 200, json: async () => DOPASOWANIE_ZGODNE } as Response;
    }
    if (url.includes('/nastawy')) {
      return { ok: true, status: 200, json: async () => WYNIK_NASTAW } as Response;
    }
    if (url.includes('/api/catalog/protection/device-types')) {
      return { ok: true, status: 200, json: async () => APARATY } as Response;
    }
    throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('SekcjaNastaw — brak kotwicy', () => {
  it('zero SC_3F DONE runs: stan zerowy z akcją "Uruchom zwarcie 3F (scenariusz MAX)"', async () => {
    ustawKontekst();
    mockDomyslny();
    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-brak')).toBeInTheDocument(),
    );
    expect(screen.getByText(T.nastawyBrakKotwicyTytul)).toBeInTheDocument();
    // Lista aparatów katalogu wczytuje się niezależnie od kotwicy (wzbogacenie
    // sekcji dopasowania) — bez kandydatów na kotwicę nie ma jednak ŻADNEGO
    // wywołania trasy `dostepnosc`/`nastawy`.
    const wywolaniaNastaw = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/pakiet-dowodowy-nastaw') || String(c[0]).includes('/nastawy'),
    );
    expect(wywolaniaNastaw).toHaveLength(0);
  });

  it('kandydat istnieje, ale backend odmawia (np. bieg c_min) — powód backendu widoczny', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            run_id: 'run-sc-max',
            dostepny: false,
            powod_pl: 'Ten przebieg jest wariantem MINIMALNYM.',
            linie: [],
          }),
        } as Response;
      }
      throw new Error(`Niespodziewane wywołanie: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-brak')).toBeInTheDocument(),
    );
    expect(screen.getByText(/wariantem MINIMALNYM/)).toBeInTheDocument();
  });

  it('akcja stanu zerowego prowadzi do przestrzeni obliczeń (native click)', async () => {
    ustawKontekst();
    mockDomyslny();
    const user = userEvent.setup();
    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-brak')).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-brak-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('SekcjaNastaw — brak kandydatów (dostępność bez linii)', () => {
  it('dostępny bieg bez linii z kompletem danych katalogowych pokazuje uczciwy powód', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: 'run-sc-max', dostepny: true, powod_pl: null, linie: [] }),
        } as Response;
      }
      if (url.includes('/api/catalog/protection/device-types')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      throw new Error(`Niespodziewane wywołanie: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-brak-odcinkow')).toBeInTheDocument(),
    );
    expect(screen.getByText(T.nastawyBrakOdcinkowTytul)).toBeInTheDocument();
  });
});

describe('SekcjaNastaw — wynik', () => {
  it('wybór odcinka, zacisku i szyny (native), policzenie nastaw, tabela wyniku widoczna', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    // Model milczy: liczenie zablokowane z powodem z rekordu odmowy backendu.
    expect(screen.getByTestId('mvd-koordynacja-nastawy-policz')).toBeDisabled();
    expect(screen.getByTestId('mvd-koordynacja-nastawy-policz-powod').textContent).toBe(
      ODMOWA_BRAK_WSKAZANIA.powod_pl,
    );
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-select-szyna')).toBeNull();
    await user.click(screen.getByLabelText('Zacisk początkowy — szyna GPZ SN'));
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
    expect(screen.getByTestId('mvd-koordynacja-nastawy-policz')).toBeEnabled();
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik')).toBeInTheDocument(),
    );
    expect(screen.getByText('48.5 A')).toBeInTheDocument();
    expect(screen.getByText('5820.5 A')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-koordynacja-nastawy-werdykt').textContent).toBe(
      T.nastawyWynikKompletny,
    );

    const wywolanie = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/nastawy?'),
    );
    expect(wywolanie).toBeTruthy();
    const url = new URL(String(wywolanie?.[0]), 'http://localhost');
    expect(url.searchParams.get('linia')).toBe('ln1');
    expect(url.searchParams.get('nastepna_szyna')).toBe('b_b');
    // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: zapytanie nie niesie fantomowego `c_min`
    // (backend go nie przyjmuje) — wariant minimalny to scenariusz MIN per węzeł.
    expect(url.searchParams.has('c_min')).toBe(false);
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-param-c-min')).toBeNull();
    // Podstawa c nastaw z proweniencji backendu — widoczna przy wyniku.
    expect(screen.getByTestId('mvd-koordynacja-nastawy-podstawa-c-kotwica').textContent).toBe(
      'scenariusz MAX, c: IEC 60909-0 tab. 1 per węzeł',
    );
    expect(screen.getByTestId('mvd-koordynacja-nastawy-podstawa-c-min').textContent).toBe(
      'IEC 60909-0 tab. 1, scenariusz MIN (per węzeł)',
    );
    expect(url.searchParams.get('zacisk_zabezpieczenia')).toBe('od');
    // Miejsce zabezpieczenia w wyniku — etykieta z backendu i źródło.
    expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik-zacisk').textContent).toContain(
      'Zacisk początkowy — szyna GPZ SN',
    );
    expect(screen.getByTestId('mvd-koordynacja-nastawy-pobierz-zip').getAttribute('href')).toContain(
      'zacisk_zabezpieczenia=od',
    );
  });

  it('model rozstrzyga zacisk: tylko do odczytu, bez parametru wskazania w zapytaniu', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln2');

    expect(screen.getByTestId('mvd-koordynacja-nastawy-zacisk-z-modelu').textContent).toContain(
      'Zacisk początkowy — szyna Stacja A',
    );
    expect(screen.queryByRole('radio')).toBeNull();
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_c');
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik')).toBeInTheDocument(),
    );
    const wywolanie = fetchMock.mock.calls.find(([u]) => String(u).includes('/nastawy?'));
    const url = new URL(String(wywolanie?.[0]), 'http://localhost');
    expect(url.searchParams.has('zacisk_zabezpieczenia')).toBe(false);
  });

  it('pętla wyłącznika (brak dozwolonego zacisku): odmowa z rekordu, liczenie zablokowane', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln3');

    expect(screen.getByTestId('mvd-koordynacja-nastawy-zacisk-odmowa').textContent).toContain(
      'w szeregu z oboma zaciskami',
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByTestId('mvd-koordynacja-nastawy-policz')).toBeDisabled();
  });

  it('odcinek bez gałęzi w dół pokazuje uczciwy powód zamiast pustego selecta szyny', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    // Zacisk końcowy: za końcem odcinka (szyna GPZ) nie ma kolejnej gałęzi.
    await user.click(screen.getByLabelText('Zacisk końcowy — szyna Stacja A'));

    expect(screen.getByTestId('mvd-koordynacja-nastawy-brak-szyn')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-select-szyna')).toBeNull();
    expect(screen.getByTestId('mvd-koordynacja-nastawy-policz')).toBeDisabled();
  });

  it('422 z backendu pokazuje treść odpowiedzi, nie ogólnik', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    const user = userEvent.setup();
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
        return { ok: true, status: 200, json: async () => DOSTEPNOSC_OK } as Response;
      }
      if (url.includes('/api/catalog/protection/device-types')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      if (url.includes('/nastawy?')) {
        // Odmowa bramy nastaw: `{kod, powod_pl}` (kod `null` poza odmowami zacisku).
        return {
          ok: false,
          status: 422,
          json: async () => ({
            detail: {
              kod: null,
              powod_pl: 'Element ln1 nie jest linią z kompletem danych katalogowych.',
            },
          }),
        } as Response;
      }
      throw new Error(`Niespodziewane wywołanie: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    await user.click(screen.getByLabelText('Zacisk początkowy — szyna GPZ SN'));
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik-blad')).toBeInTheDocument(),
    );
    expect(screen.getByText(/nie jest linią z kompletem danych katalogowych/)).toBeInTheDocument();
  });
});

describe('SekcjaNastaw — dopasowanie do aparatu', () => {
  it('wybór aparatu (native) po policzeniu nastaw pokazuje wynik dopasowania', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    await user.click(screen.getByLabelText('Zacisk początkowy — szyna GPZ SN'));
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik')).toBeInTheDocument(),
    );

    await user.selectOptions(
      await screen.findByTestId('mvd-koordynacja-dopasowanie-select-aparat'),
      'ABB_REF601',
    );

    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-dopasowanie-wynik')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('mvd-koordynacja-dopasowanie-werdykt').textContent).toBe(
      T.nastawyDopasowanieZgodny,
    );
  });
});

describe('SekcjaNastaw — katalog aparatów: odczyt w toku / błąd / pusty / lista (odczyt ≠ pusty katalog)', () => {
  type Wariant = 'wczytywanie' | 'blad' | 'pusty' | 'lista';
  const TESTID: Record<Wariant, string> = {
    wczytywanie: 'mvd-koordynacja-dopasowanie-aparaty-wczytywanie',
    blad: 'mvd-koordynacja-dopasowanie-aparaty-blad',
    pusty: 'mvd-koordynacja-dopasowanie-aparaty-brak',
    lista: 'mvd-koordynacja-dopasowanie-select-aparat',
  };

  function mockKatalogu(wariant: Wariant) {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
        return { ok: true, status: 200, json: async () => DOSTEPNOSC_OK } as Response;
      }
      if (url.includes('/nastawy')) {
        return { ok: true, status: 200, json: async () => WYNIK_NASTAW } as Response;
      }
      if (url.includes('/api/catalog/protection/device-types')) {
        if (wariant === 'wczytywanie') return new Promise<Response>(() => undefined);
        if (wariant === 'blad') return { ok: false, status: 500, json: async () => ({}) } as Response;
        return { ok: true, status: 200, json: async () => (wariant === 'pusty' ? [] : APARATY) } as Response;
      }
      throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it.each(['wczytywanie', 'blad', 'pusty', 'lista'] as const)('katalog %s → własny, rozłączny stan sekcji', async (wariant) => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockKatalogu(wariant);
    const user = userEvent.setup();
    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    await user.click(screen.getByLabelText('Zacisk początkowy — szyna GPZ SN'));
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));
    const sekcja = await screen.findByTestId('mvd-koordynacja-dopasowanie');
    expect(await within(sekcja).findByTestId(TESTID[wariant])).toBeInTheDocument();
    for (const inny of Object.keys(TESTID) as Wariant[]) {
      if (inny !== wariant) expect(within(sekcja).queryByTestId(TESTID[inny])).not.toBeInTheDocument();
    }
    if (wariant === 'wczytywanie') {
      expect(within(sekcja).getByTestId(TESTID.wczytywanie)).toHaveAttribute('aria-busy', 'true');
    }
  });
});

describe('SekcjaNastaw — wytrzymałość cieplna przewodu z rekordu W', () => {
  // Iloczyn: przypadek fizyczny (wytrzymuje × nie wytrzymuje) × nośnik (plakietka, zdanie, karta).
  // Etykieta, status i zdanie pochodzą z rekordu backendu — ekran niczego nie przemapowuje.
  it.each([
    ['wytrzymuje', 'BRAK_DOWODU'],
    ['nie_wytrzymuje', 'NIE_SPELNIA'],
  ] as const)('przypadek %s: plakietka i zdanie z rekordu (status %s)', async (klucz, status) => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const thermal = CIEPLNE[klucz];
    const odpowiedz = { ...WYNIK_NASTAW, wynik: { ...WYNIK_NASTAW.wynik, thermal } };
    const bazowy = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/nastawy?')) {
        return { ok: true, status: 200, json: async () => odpowiedz } as Response;
      }
      return bazowy!(input);
    });
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    await user.click(screen.getByLabelText('Zacisk początkowy — szyna GPZ SN'));
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
    await user.click(screen.getByTestId('mvd-koordynacja-nastawy-policz'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-koordynacja-nastawy-wynik')).toBeInTheDocument(),
    );

    expect(thermal.ocena.status_maszynowy).toBe(status);
    const plakietka = screen.getByTestId('mvd-koordynacja-nastawy-cieplna-etykieta');
    expect(plakietka.textContent).toBe(thermal.ocena.etykieta.etykieta_pl);
    expect(plakietka.getAttribute('data-status')).toBe(status);
    expect(plakietka.getAttribute('data-semantyka')).toBe(thermal.ocena.etykieta.semantyka);
    expect(screen.getByTestId('mvd-koordynacja-nastawy-cieplna-zdanie').textContent).toBe(
      thermal.ocena.wyjasnienie.zdanie_pl,
    );
    // Karta rekordu prowadzi do wyjaśnienia (etykieta bez wyjaśnienia nie jest odpowiedzią).
    expect(screen.getAllByText(thermal.ocena.wyjasnienie.zdanie_pl).length).toBeGreaterThanOrEqual(1);
  });
});
