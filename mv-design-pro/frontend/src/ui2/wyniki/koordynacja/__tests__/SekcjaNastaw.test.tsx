/**
 * Sekcja „Nastawy nadprądowe I>/I>>" — metoda Hoppela/IRiESD (karta W3-C1).
 *
 * Kliki natywne (userEvent), `fetch` mockowany 1:1 z kontraktem końcówek
 * `pakiet-dowodowy-nastaw/dostepnosc`, `nastawy`, `nastawy/dopasowanie`,
 * `catalog/protection/device-types`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { SekcjaNastaw } from '../SekcjaNastaw';
import { KOORDYNACJA_STRINGS as T } from '../strings';

const RUN_SC_MAX = {
  id: 'run-sc-max',
  study_case_id: 'case-1',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-09-09T08:00:00Z',
  started_at: '2026-09-09T07:59:00Z',
} as never;

const DOSTEPNOSC_OK = {
  run_id: 'run-sc-max',
  dostepny: true,
  powod_pl: null,
  linie: [
    { line_id: 'ln1', nazwa: 'Linia GPZ – Stacja A', nastepne_szyny_kandydujace: ['b_b'] },
    { line_id: 'ln2', nazwa: 'Linia Stacja A – Stacja B', nastepne_szyny_kandydujace: [] },
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
    thermal: {
      i_th_dop_a: 18544.2,
      j_thn: 94.0,
      cross_section_mm2: 120.0,
      t_fault_s: 0.37,
      ik_max_a: 8000.0,
      is_adequate: true,
      margin_percent: 56.9,
      trace: [],
    },
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
    c_max: 1.1,
    c_min: 1.0,
    line_id: 'ln1',
    next_bus_id: 'b_b',
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

let fetchMock: ReturnType<typeof vi.fn>;

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
  it('zero SC_3F DONE runs: stan zerowy z akcją "Uruchom zwarcie 3F (c_max)"', async () => {
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
  it('wybór odcinka i szyny (native), policzenie nastaw, tabela wyniku widoczna', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);

    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-szyna'), 'b_b');
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
    expect(url.searchParams.get('c_min')).toBe('1');
  });

  it('odcinek bez gałęzi w dół pokazuje uczciwy powód zamiast pustego selecta szyny', async () => {
    ustawKontekst();
    useExecutionRunsStore.setState({ runs: [RUN_SC_MAX] });
    mockDomyslny();
    const user = userEvent.setup();

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln2');

    expect(screen.getByTestId('mvd-koordynacja-nastawy-brak-szyn')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-select-szyna')).toBeNull();
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
        return {
          ok: false,
          status: 422,
          json: async () => ({ detail: 'Element ln1 nie jest linią z kompletem danych katalogowych.' }),
        } as Response;
      }
      throw new Error(`Niespodziewane wywołanie: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SekcjaNastaw caseId="case-1" />);
    await waitFor(() => expect(screen.getByTestId('mvd-koordynacja-nastawy')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('mvd-koordynacja-nastawy-select-linia'), 'ln1');
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
