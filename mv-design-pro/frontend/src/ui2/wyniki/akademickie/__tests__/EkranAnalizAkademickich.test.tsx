/*
 * Testy okna „Analizy akademickie" (ui2/wyniki/akademickie). Ćwiczą REALNĄ ścieżkę
 * natywną użytkownika (`fireEvent` na realnych kontrolkach JSX — bez syntetycznych
 * `dispatchEvent`, bez wymuszania stanu wewnętrznego). API mockowane NA GRANICY
 * `fetch`, więc test przechodzi też przez `api.ts` (adresy siedmiu rodzin końcówek).
 *
 * ILOCZYN CECH (nie przykład z karty):
 *   rodzaj analizy (z parametrami / bez / z listą złożoną / z odesłaniem do SSCI)
 *   × stan (zerowy bez przypadku / lista rodzajów niedostępna / błąd biegu / wynik)
 *   × artefakt (wynik pełny / ślad > 8 kroków / dowód / raport > 3 sekcji / katalog).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';

const CASE_ID = 'case-akad-1';
const RUN_ID = 'run-akad-abc';

/** Komplet rodzajów odsyłany przez katalog backendu (`catalog/v126/analysis-types`). */
const RODZAJE = [
  'power_quality_harmonics',
  'ssci_impedance',
  'voltage_stability',
  'reliability_contingency',
  'earthing_safety',
  'insulation_coordination',
  'earth_fault_detection',
  'transient_trv',
  'motor_starting',
  'hosting_capacity',
  'opf_loss_lcc',
  'benchmark_validation',
  'uncertainty_sensitivity',
  'neutral_earthing_design',
];

interface OpcjeMocka {
  readonly rodzaje?: readonly string[] | 'blad';
  readonly wynik?: Record<string, unknown>;
  /** Liczba kroków śladu — 25 sprawdza, że limit 8 powierzchni zastanej zniknął. */
  readonly krokowSladu?: number;
  /** Liczba sekcji raportu — 7 sprawdza, że limit 3 zniknął. */
  readonly sekcjiRaportu?: number;
  readonly bladBiegu?: string;
}

function odpowiedz(dane: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => dane } as Response;
}

function ustawFetch(opcje: OpcjeMocka = {}): ReturnType<typeof vi.fn> {
  const krokow = opcje.krokowSladu ?? 3;
  const sekcji = opcje.sekcjiRaportu ?? 3;
  const mock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const metoda = init?.method ?? 'GET';

    if (adres.includes('/api/catalog/v126/analysis-types')) {
      if (opcje.rodzaje === 'blad') {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ detail: 'Katalog niedostępny.' }),
        } as Response;
      }
      return odpowiedz({ namespace: 'analysis-types', items: opcje.rodzaje ?? RODZAJE });
    }
    if (adres.includes('/api/catalog/v126/')) {
      return odpowiedz({
        namespace: 'harmonic-limits',
        items: { thdu_pnen50160_percent: 8, thdu_ieee519_percent: 5 },
      });
    }
    if (metoda === 'POST' && adres.includes('/runs/v126/')) {
      if (opcje.bladBiegu) {
        return {
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: async () => ({ detail: opcje.bladBiegu }),
        } as Response;
      }
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: adres.split('/runs/v126/')[1],
        status: 'FINISHED',
        result_url: '',
        trace_url: '',
        proof_url: '',
        report_url: '',
        deterministic_hash: 'hash-akad',
      });
    }
    if (adres.includes('/trace')) {
      return odpowiedz({
        run_id: RUN_ID,
        analysis_type: 'voltage_stability',
        trace_version: 'AcademicWhiteBoxTraceV1',
        deterministic_hash: 'hash-akad',
        steps: Array.from({ length: krokow }, (_, i) => ({
          step: i + 1,
          key: `krok_${i + 1}`,
          formula: 'a = b',
          data: {},
          substitution: `podstawienie ${i + 1}`,
          result: { wartosc: i + 1 },
          unit_check: 'zgodne',
          proof_ref: `proof:v126:test:${i + 1}`,
          proof_status: 'complete',
          reporting_status: 'reportable',
        })),
      });
    }
    if (adres.includes('/proof')) {
      return odpowiedz({
        contract: 'AcademicProofPackV1',
        proof_id: 'proof:v126:test:abc',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: 'voltage_stability',
        source_result_hash: 'hash-akad',
        trace_step_count: krokow,
        steps: Array.from({ length: krokow }, (_, i) => ({
          ordinal: i + 1,
          proof_ref: `proof:v126:test:${i + 1}`,
          formula: 'a = b',
          data: {},
          substitution: `podstawienie ${i + 1}`,
          result: { wartosc: i + 1 },
          unit_check: 'zgodne',
          proof_status: 'complete',
        })),
        proof_hash: 'hash-dowodu',
      });
    }
    if (adres.includes('/report')) {
      return odpowiedz({
        contract: 'AcademicReportV1',
        report_id: 'report:v126:test:abc',
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: 'voltage_stability',
        source_result_hash: 'hash-akad',
        source_proof_hash: 'hash-dowodu',
        export_policy: 'frozen_result_and_proof_only',
        sections: Array.from({ length: sekcji }, (_, i) => ({
          section_id: `sekcja_${i}`,
          title: `Sekcja ${i}`,
          metrics: [{ label: 'metryka', value: i }],
        })),
        report_hash: 'hash-raportu',
      });
    }
    if (adres.includes('/results/v126/')) {
      return odpowiedz({
        run_id: RUN_ID,
        case_id: CASE_ID,
        analysis_type: 'voltage_stability',
        status: 'FINISHED',
        created_at: '2026-08-07T10:00:00+00:00',
        result: {
          contract: 'AcademicAnalysisResultV1',
          analysis_type: 'voltage_stability',
          solver_version: 'v126-test',
          input_hash: 'hash-wejscia',
          result: opcje.wynik ?? { margines_pu: 0.42, spelnione: true },
          white_box_trace: [],
          deterministic_hash: 'hash-akad',
        },
        proof_ref: 'proof:v126:test:abc',
        report_ref: 'report:v126:test:abc',
      });
    }
    throw new Error(`Nieoczekiwane wywołanie fetch: ${metoda} ${adres}`);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Ciała żądań POST utworzenia przebiegu (do sprawdzenia ładunku parametrów). */
function zadaniaPost(mock: ReturnType<typeof vi.fn>): { adres: string; body: unknown }[] {
  return mock.mock.calls
    .filter((wywolanie) => (wywolanie[1] as RequestInit | undefined)?.method === 'POST')
    .map((wywolanie) => ({
      adres: String(wywolanie[0]),
      body: JSON.parse(String((wywolanie[1] as RequestInit).body)),
    }));
}

async function wybierzRodzaj(kod: string): Promise<void> {
  const selektor = await screen.findByTestId('mvd-akad-rodzaj');
  fireEvent.change(selektor, { target: { value: kod } });
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID, activeCaseResultStatus: 'NONE' });
  useShellStore.setState({ wynikiTab: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EkranAnalizAkademickich — stany wejściowe', () => {
  it('bez aktywnego przypadku → uczciwa instrukcja z akcją, bez wołań API', () => {
    useAppStateStore.setState({ activeCaseId: null });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-akad-brak-przypadku')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lista rodzajów pochodzi z katalogu backendu — komplet czternastu pozycji', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    expect(Array.from(selektor.options).map((o) => o.value)).toEqual(RODZAJE);
  });

  it('rodzaj bez ekranu trasowego jest osiągalny (dobór uziemienia punktu neutralnego)', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    expect(Array.from(selektor.options).map((o) => o.value)).toContain('neutral_earthing_design');
    expect(Array.from(selektor.options).map((o) => o.value)).toContain('earth_fault_detection');
  });

  it('katalog niedostępny → uczciwy błąd z ponowieniem, ZERO zaszytej listy zastępczej', async () => {
    ustawFetch({ rodzaje: 'blad' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-akad-rodzaje-blad')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-rodzaj')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
  });

  it('katalog pusty → uczciwy stan zerowy, bez możliwości uruchomienia', async () => {
    ustawFetch({ rodzaje: [] });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(await screen.findByTestId('mvd-akad-rodzaje-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — ścieżka natywna biegu', () => {
  it('klik „Uruchom" → wynik, ślad, dowód i raport z czterech końcówek', async () => {
    const mock = ustawFetch({ krokowSladu: 4, sekcjiRaportu: 3 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');

    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));

    expect(await screen.findByTestId('mvd-akad-wyniki')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-wynik')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-dowod')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-raport')).toBeInTheDocument();

    const adresy = mock.mock.calls.map((w) => String(w[0]));
    expect(adresy.some((a) => a.endsWith(`/api/cases/${CASE_ID}/runs/v126/voltage_stability`))).toBe(true);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/voltage_stability`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/voltage_stability/trace`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/voltage_stability/proof`);
    expect(adresy).toContain(`/api/analysis-runs/${RUN_ID}/results/v126/voltage_stability/report`);
  });

  it('rodzaj bez parametrów wysyła PUSTY ładunek — zero fabrykacji danych wejściowych', async () => {
    const mock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('motor_starting');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    const zadania = zadaniaPost(mock);
    expect(zadania).toHaveLength(1);
    expect(zadania[0].body).toEqual({ parameters: {} });
  });

  it('błąd biegu → uczciwy komunikat backendu (pole detail), bez wyniku', async () => {
    ustawFetch({ bladBiegu: 'Przypadek nie ma committed ENM z węzłami.' });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));

    expect(await screen.findByTestId('mvd-akad-blad')).toBeInTheDocument();
    expect(screen.getByText('Przypadek nie ma committed ENM z węzłami.')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-wyniki')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — komplet artefaktów bez zaszytych limitów', () => {
  it('ślad dłuższy niż 8 kroków renderuje się w CAŁOŚCI (limit powierzchni zastanej)', async () => {
    ustawFetch({ krokowSladu: 25 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    fireEvent.click(screen.getByTestId('mvd-akad-slad-przelacz'));
    expect(screen.getByTestId('mvd-akad-slad-krok-9')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-krok-25')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-akad-slad-licznik')).toHaveTextContent('25');
  });

  it('dowód dłuższy niż 8 kroków renderuje się w CAŁOŚCI', async () => {
    ustawFetch({ krokowSladu: 17 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    fireEvent.click(screen.getByTestId('mvd-akad-dowod-przelacz'));
    expect(screen.getByTestId('mvd-akad-dowod-krok-17')).toBeInTheDocument();
  });

  it('raport z więcej niż 3 sekcjami renderuje się w CAŁOŚCI (limit zastanej)', async () => {
    ustawFetch({ sekcjiRaportu: 7 });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    fireEvent.click(screen.getByTestId('mvd-akad-raport-przelacz'));
    expect(screen.getByTestId('mvd-akad-raport-sekcja-sekcja_6')).toBeInTheDocument();
  });

  it('wynik z ponad 18 polami renderuje wszystkie (limit 18 zastanej)', async () => {
    const wynik: Record<string, unknown> = {};
    for (let i = 0; i < 30; i += 1) wynik[`pole_${i}`] = i;
    ustawFetch({ wynik });
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    expect(screen.getByTestId('mvd-akad-wynik-licznik')).toHaveTextContent('30');
    expect(screen.getByTestId('mvd-akad-grupa-pole_29')).toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — parametry projektowe', () => {
  it('wypełnione pole trafia do żądania; pola puste NIE tworzą kluczy', async () => {
    const mock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('opf_loss_lcc');

    fireEvent.click(screen.getByTestId('mvd-akad-parametry-przelacz'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-energy_price_pln_per_kwh'), {
      target: { value: '0,89' },
    });
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    expect(zadaniaPost(mock)[0].body).toEqual({
      parameters: { energy_price_pln_per_kwh: 0.89 },
    });
  });

  it('lista silników: dodanie wiersza i wypełnienie trafia do ładunku', async () => {
    const mock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('motor_starting');

    fireEvent.click(screen.getByTestId('mvd-akad-parametry-przelacz'));
    fireEvent.click(screen.getByTestId('mvd-akad-dodaj-wiersz'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-ref'), { target: { value: 'M-1' } });
    fireEvent.change(screen.getByTestId('mvd-akad-pole-rated_kw'), { target: { value: '400' } });
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    expect(zadaniaPost(mock)[0].body).toEqual({
      parameters: { motors: [{ ref: 'M-1', rated_kw: 400 }] },
    });
  });

  it('zmiana rodzaju czyści parametry — wpisy nie wyciekają do innego rodzaju', async () => {
    const mock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('hosting_capacity');
    fireEvent.click(screen.getByTestId('mvd-akad-parametry-przelacz'));
    fireEvent.change(screen.getByTestId('mvd-akad-pole-hosting_monte_carlo_n'), {
      target: { value: '500' },
    });

    await wybierzRodzaj('earth_fault_detection');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');

    expect(zadaniaPost(mock)[0].body).toEqual({ parameters: {} });
  });

  it('rodzaj liczący wprost z modelu informuje o braku parametrów', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('power_quality_harmonics');
    expect(screen.queryByTestId('mvd-akad-parametry-przelacz')).not.toBeInTheDocument();
  });
});

describe('EkranAnalizAkademickich — dane odniesienia i odesłanie do SSCI', () => {
  it('rodzaj z katalogiem odniesienia pobiera go dopiero po rozwinięciu', async () => {
    const mock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('power_quality_harmonics');

    const przedRozwinieciem = mock.mock.calls.filter((w) =>
      String(w[0]).includes('/api/catalog/v126/harmonic-limits'),
    );
    expect(przedRozwinieciem).toHaveLength(0);

    fireEvent.click(screen.getByTestId('mvd-akad-katalog-przelacz'));
    await waitFor(() => {
      expect(
        mock.mock.calls.filter((w) => String(w[0]).includes('/api/catalog/v126/harmonic-limits')),
      ).toHaveLength(1);
    });
  });

  it('rodzaj bez katalogu odniesienia nie pokazuje sekcji', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('motor_starting');
    expect(screen.queryByTestId('mvd-akad-katalog')).not.toBeInTheDocument();
  });

  it('rodzaj SSCI kieruje do okna werdyktu zamiast duplikować werdykt', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('ssci_impedance');

    fireEvent.click(screen.getByTestId('mvd-akad-przejdz-ssci'));
    expect(useShellStore.getState().wynikiTab).toBe('ssci');
  });
});

describe('EkranAnalizAkademickich — świeżość i tryb ekspercki', () => {
  it('świeżość pochodzi ze wspólnego kontraktu — bez wyników stan „brak wyników"', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    expect(screen.getByTestId('mvd-akad-swiezosc')).toHaveTextContent('brak wyników');
  });

  // INTENCJA (zachowana po V126-JEZYK): identyfikatory techniczne przebiegu są
  // treścią ekspercką. Po wprowadzeniu bramy opracowania CAŁE okno jest ekspercke
  // (tryb podstawowy pokazuje bramę), więc rozgałęzienie „ekspercki vs nie"
  // WEWNĄTRZ okna byłoby martwym warunkiem — testujemy więc parę: okno widoczne
  // ⇒ identyfikatory są; tryb podstawowy ⇒ okna nie ma wcale (test bramy niżej).
  it('identyfikatory techniczne przebiegu są w oknie eksperckim', async () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await wybierzRodzaj('voltage_stability');
    fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
    await screen.findByTestId('mvd-akad-wyniki');
    expect(screen.getByText(RUN_ID)).toBeInTheDocument();
  });

  it('rodzaj wybrany z góry (wejście z ekranu trasowego) jest ustawiony', async () => {
    ustawFetch();
    render(
      <EkranAnalizAkademickich trybZaawansowania="expert" rodzajPoczatkowy="earthing_safety" />,
    );
    const selektor = (await screen.findByTestId('mvd-akad-rodzaj')) as HTMLSelectElement;
    expect(selektor.value).toBe('earthing_safety');
    expect(screen.getByTestId('mvd-akad-parametry-przelacz')).toBeInTheDocument();
  });
});

/**
 * V126-JEZYK: brama opracowania. Okno ma DWA wejścia (zakładka warsztatu
 * Wyników + powierzchnia trasowa E-40…E-50), więc brama siedzi w oknie, nie
 * tylko w pasku. Brama zamyka RÓWNIEŻ ruch sieciowy — „ukryte" okno, które
 * dalej pyta backend o katalog rodzajów, nie jest ukryte.
 */
describe('EkranAnalizAkademickich — brama opracowania (V126-JEZYK)', () => {
  it('tor podstawowy: brama zamiast treści, ZERO wołań do backendu', () => {
    const fetchMock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-wybor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-akad-uruchom')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tor rozszerzony: brama nadal zamknięta', () => {
    ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="extended" />);
    expect(screen.getByTestId('mvd-akad-brama-opracowania')).toBeInTheDocument();
  });

  it('tryb ekspercki: brama otwarta, okno pyta katalog rodzajów (kontrola dodatnia)', async () => {
    const fetchMock = ustawFetch();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-rodzaj');
    expect(screen.queryByTestId('mvd-akad-brama-opracowania')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
