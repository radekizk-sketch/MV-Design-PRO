/**
 * Testy ekranu „Koordynacja zabezpieczeń" (rama prowadząca F-E5b).
 * Kliki natywne (userEvent). Testy przebiegów mockują `fetch` 1:1 z kontraktem backendu
 * (koordynacja: POST .../projects/:id/run z samymi identyfikatorami biegów, GET .../:runId;
 * ocena zabezpieczeń: POST /projects/:id/protection-runs, POST .../execute, GET .../results),
 * a wyniki to PRAWDZIWE odpowiedzi backendu z generatora fikstur (sieć złota G08).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../shell/useShellStore';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import type {
  CoordinationResult,
  CoordinationSummaryResponse,
} from '../../../../ui/protection-coordination/types';
import type { WynikOcenyZabezpieczen } from '../ocenaZabezpieczenApi';
import wynikKoordynacjiSceny from '../../../../harness-fixtures/generated/koordynacja_scena_wynik.json';
import wynikOcenySceny from '../../../../harness-fixtures/generated/koordynacja_scena_ocena.json';
import { EkranKoordynacji } from '../EkranKoordynacji';
import { KOORDYNACJA_STRINGS as T } from '../strings';

const DONE_SC_RUN = {
  id: 'run-sc-1',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-07-18T10:00:00Z',
  started_at: '2026-07-18T09:59:00Z',
} as never;

/** Drugi bieg zwarciowy (wariant minimalny) — czułość wymaga osobnego biegu MIN. */
const DONE_SC_RUN_MIN = {
  id: 'run-sc-2',
  analysis_type: 'SC_3F',
  status: 'DONE',
  finished_at: '2026-07-18T10:01:00Z',
  started_at: '2026-07-18T10:00:30Z',
} as never;

/**
 * Konfiguracja biegu zwarciowego w kształcie KONTRAKTU backendu
 * (`api/canonical_run_views.py::build_konfiguracja_biegu_zwarcia`) — niesie
 * WARIANT (`scenariusz`), po którym ekran dzieli wyniki na przypadek
 * maksymalny i minimalny.
 */
function konfiguracjaBiegu(scenariusz: 'MAX' | 'MIN', cFactor: number) {
  return {
    c_factor: { tryb: 'jawny' as const, wartosc: cFactor },
    thermal_time_seconds: { wartosc: 1.0, pochodzenie: 'opcje_biegu' as const },
    metoda: 'IEC 60909',
    scenariusz,
  };
}

/** Prawdziwe wyniki backendu dla sieci złotej G08 (generator fikstur harnessu). */
const WYNIK_KOORDYNACJI = wynikKoordynacjiSceny as unknown as CoordinationResult;
const WYNIK_OCENY = wynikOcenySceny as unknown as WynikOcenyZabezpieczen;

/** Odpowiedzi tła ekranu (sekcja nastaw, lista biegów oceny) — nieistotne dla danego testu. */
function odpowiedzTla(url: string): Response {
  if (url.includes('/protection-runs')) {
    return { ok: true, status: 200, json: async () => ({ runs: [] }) } as Response;
  }
  if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ run_id: 'run-sc-1', dostepny: false, powod_pl: 'brak', linie: [] }),
    } as Response;
  }
  if (url.includes('/api/catalog/protection/device-types')) {
    return { ok: true, status: 200, json: async () => [] } as Response;
  }
  throw new Error(`Niespodziewane wywołanie fetch: ${url}`);
}

function ustawKompletnyKontekst() {
  useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
  // Wariant pracy jest potrzebny od V12K-262: z niego pochodzi migawka modelu,
  // czyli lista elementów, w których wolno umieścić zabezpieczenie.
  useAppStateStore.getState().setActiveCase('case-1', 'Wariant bazowy');
  useExecutionRunsStore.setState({ runs: [DONE_SC_RUN] });
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
  // Tło bez biegów: ekrany wołają listę biegów oceny i dostępność nastaw.
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => odpowiedzTla(String(input))));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EkranKoordynacji — rama prowadząca', () => {
  it('nagłówek: eyebrow obszaru i zdanie celu inżynierskiego', () => {
    render(<EkranKoordynacji />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-koordynacja')).toBeInTheDocument();
  });

  it('rama jest obecna niezależnie od stanu wejścia', () => {
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja')).toBeInTheDocument();
  });
});

describe('EkranKoordynacji — uczciwe stany zerowe z akcją', () => {
  it('bez aktywnego projektu: instrukcja + akcja prowadzi do przestrzeni Projekt', async () => {
    const user = userEvent.setup();
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeInTheDocument();
    expect(screen.getByText(T.brakProjektuTytul)).toBeInTheDocument();
    // Brak pustej tabeli — realna strona się nie renderuje.
    expect(screen.queryByTestId('protection-coordination-page')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-koordynacja-brak-projektu-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('brak projektu ma pierwszeństwo nad brakiem przebiegu zwarciowego', () => {
    useExecutionRunsStore.setState({ runs: [DONE_SC_RUN] });
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja-brak-projektu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-zwarcia')).not.toBeInTheDocument();
  });

  it('projekt bez zakończonego przebiegu zwarciowego: akcja prowadzi do Obliczeń', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('mvd-koordynacja-brak-zwarcia')).toBeInTheDocument();
    expect(screen.queryByTestId('protection-coordination-page')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-koordynacja-brak-zwarcia-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('projekt z przebiegiem rozpływowym (nie zwarciowym) nadal pokazuje stan zerowy zwarcia', () => {
    useAppStateStore.getState().setActiveProject('project-1', 'GPZ Wschód');
    useExecutionRunsStore.setState({
      runs: [{ id: 'run-lf', analysis_type: 'LOAD_FLOW', status: 'DONE', finished_at: null, started_at: null } as never],
    });
    render(<EkranKoordynacji />);
    expect(screen.getByTestId('mvd-koordynacja-brak-zwarcia')).toBeInTheDocument();
  });
});

describe('EkranKoordynacji — realna strona przy kompletnym kontekście', () => {
  it('projekt + zakończony przebieg zwarciowy → renderuje ProtectionCoordinationPage', () => {
    ustawKompletnyKontekst();
    render(<EkranKoordynacji />);

    expect(screen.getByTestId('protection-coordination-page')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-projektu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-koordynacja-brak-zwarcia')).not.toBeInTheDocument();
  });

  it('przebieg analizy koordynacji woła API 1:1 z kontraktem api.ts (POST run + GET wynik)', async () => {
    const user = userEvent.setup();
    ustawKompletnyKontekst();
    // Koordynacja wymaga biegu maksymalnego i minimalnego (scenariusz zapisany NA BIEGU).
    useExecutionRunsStore.setState({ runs: [DONE_SC_RUN, DONE_SC_RUN_MIN] });

    const summary = { run_id: 'coord-run-1' } as CoordinationSummaryResponse;
    const result = WYNIK_KOORDYNACJI;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/protection-coordination/projects/project-1/run' && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => summary } as Response;
      }
      if (url === '/api/protection-coordination/coord-run-1') {
        return { ok: true, status: 200, json: async () => result } as Response;
      }
      if (url === '/api/analysis-runs/run-sc-1/results/short-circuit') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: 'run-sc-1', rows: [], konfiguracja_biegu: konfiguracjaBiegu('MAX', 1.1) }),
        } as Response;
      }
      if (url === '/api/analysis-runs/run-sc-2/results/short-circuit') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: 'run-sc-2', rows: [], konfiguracja_biegu: konfiguracjaBiegu('MIN', 1.0) }),
        } as Response;
      }
      return odpowiedzTla(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranKoordynacji />);

    // Realna ścieżka: biegi wskazane z listy biegów przypadku, klik „Wykonaj analizę".
    const strona = screen.getByTestId('protection-coordination-page');
    await waitFor(() =>
      expect(within(strona).getByTestId('coordination-run-min')).toHaveTextContent('✓'),
    );
    await user.click(within(strona).getByTestId('run-analysis-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/protection-coordination/coord-run-1');
    });
    // Ciało POST: WYŁĄCZNIE identyfikatory biegów — urządzenia i nastawy z modelu.
    const postCall = fetchMock.mock.calls.find(
      ([u]) => String(u) === '/api/protection-coordination/projects/project-1/run',
    );
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      sc_run_id: 'run-sc-1',
      sc_run_id_min: 'run-sc-2',
    });
    expect(await within(strona).findByTestId('coordination-devices')).toHaveTextContent(
      result.devices[0].name,
    );
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Ocena zabezpieczeń z modelu na biegu zwarciowym (bieg `protection_sn`) — uruchomienie
// i wynik NA ŚCIEŻCE projektanta (karta BIEG-ZABEZPIECZEN-Z-MODELU). Wynik = PRAWDZIWA
// odpowiedź backendu dla sieci złotej G08 (`koordynacja_scena_ocena`).
// Iloczyn cech: {brak biegu oceny, bieg oceny istnieje} × {uruchomienie udane, bieg FAILED}
// × {świeży, nieaktualny} × {odmowa z akcją naprawczą}.
// ---------------------------------------------------------------------------

describe('EkranKoordynacji — ocena zabezpieczeń na biegu zwarciowym', () => {
  function kontekstOceny(): void {
    ustawKompletnyKontekst();
    useExecutionRunsStore.setState({ runs: [DONE_SC_RUN, DONE_SC_RUN_MIN] });
  }

  function mockOceny(opcje: {
    lista?: { id: string; status: string; created_at: string }[];
    wynik?: unknown;
    statusWykonania?: string;
  }) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/projects/project-1/protection-runs' && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ id: 'ocena-1', status: 'CREATED' }) } as Response;
      }
      if (url === '/api/protection-runs/ocena-1/execute') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'ocena-1',
            status: opcje.statusWykonania ?? 'FINISHED',
            error_message: opcje.statusWykonania === 'FAILED' ? 'Bieg zwarciowy nie istnieje.' : null,
          }),
        } as Response;
      }
      if (url.startsWith('/api/protection-runs/') && url.endsWith('/results')) {
        return { ok: true, status: 200, json: async () => opcje.wynik ?? WYNIK_OCENY } as Response;
      }
      if (url === '/api/projects/project-1/protection-runs') {
        return { ok: true, status: 200, json: async () => ({ runs: opcje.lista ?? [] }) } as Response;
      }
      if (url.endsWith('/results/short-circuit')) {
        const max = url.includes('run-sc-1');
        return {
          ok: true,
          status: 200,
          json: async () => ({ rows: [], konfiguracja_biegu: konfiguracjaBiegu(max ? 'MAX' : 'MIN', 1.0) }),
        } as Response;
      }
      return odpowiedzTla(url);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bez biegu oceny: stan nazwany; klik „Oceń" tworzy i wykonuje bieg na biegu MAX i pokazuje oceny', async () => {
    const user = userEvent.setup();
    kontekstOceny();
    const fetchMock = mockOceny({});
    render(<EkranKoordynacji />);

    expect(await screen.findByTestId('mvd-ocena-zabezpieczen-brak-wyniku')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom')).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom'));

    const wynik = await screen.findByTestId('mvd-ocena-zabezpieczen-wynik');
    const utworzenie = fetchMock.mock.calls.find(
      ([u, i]) => String(u) === '/api/projects/project-1/protection-runs' && i?.method === 'POST',
    );
    expect(JSON.parse((utworzenie?.[1] as RequestInit).body as string)).toEqual({
      sc_run_id: 'run-sc-1',
      protection_case_id: 'case-1',
    });
    expect(WYNIK_OCENY.evaluations.length).toBeGreaterThan(0);
    for (const o of WYNIK_OCENY.evaluations) {
      const wiersz = within(wynik).getByTestId(
        `mvd-ocena-zabezpieczen-wiersz-${o.device_id}-${o.fault_target_id}`,
      );
      expect(wiersz).toHaveTextContent(o.nazwa_urzadzenia_pl);
      expect(wiersz).toHaveTextContent(o.nazwa_punktu_pl);
      expect(wiersz).toHaveTextContent(o.ocena.etykieta.etykieta_pl);
      expect(wiersz).toHaveTextContent(o.ocena.wyjasnienie.zdanie_pl);
      expect(wiersz).not.toHaveTextContent(o.device_id);
    }
    expect(screen.queryByTestId('mvd-ocena-zabezpieczen-nieaktualny')).not.toBeInTheDocument();
  });

  it('wariant minimalny wskazany w polu wyboru trafia do żądania', async () => {
    const user = userEvent.setup();
    kontekstOceny();
    const fetchMock = mockOceny({});
    render(<EkranKoordynacji />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom')).not.toBeDisabled(),
    );
    await user.selectOptions(screen.getByTestId('mvd-ocena-zabezpieczen-wariant'), 'min');
    await user.click(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom'));
    await screen.findByTestId('mvd-ocena-zabezpieczen-wynik');
    const utworzenie = fetchMock.mock.calls.find(
      ([u, i]) => String(u) === '/api/projects/project-1/protection-runs' && i?.method === 'POST',
    );
    expect(JSON.parse((utworzenie?.[1] as RequestInit).body as string).sc_run_id).toBe('run-sc-2');
  });

  it('bieg zakończony porażką — komunikat backendu, nie pusty wynik', async () => {
    const user = userEvent.setup();
    kontekstOceny();
    mockOceny({ statusWykonania: 'FAILED' });
    render(<EkranKoordynacji />);
    await waitFor(() =>
      expect(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom')).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId('mvd-ocena-zabezpieczen-uruchom'));
    expect(await screen.findByTestId('mvd-ocena-zabezpieczen-blad')).toHaveTextContent(
      'Bieg zwarciowy nie istnieje.',
    );
    expect(screen.queryByTestId('mvd-ocena-zabezpieczen-wynik')).not.toBeInTheDocument();
  });

  it('istniejący bieg oceny wczytany po wejściu; nieaktualny — baner z przyczyną; odmowa prowadzi do edycji w modelu', async () => {
    const user = userEvent.setup();
    kontekstOceny();
    const openRouteSurface = vi.fn();
    useNetworkBuildStore.setState({ openRouteSurface } as never);
    mockOceny({
      lista: [{ id: 'ocena-stara', status: 'FINISHED', created_at: '2026-09-01T10:00:00Z' }],
      wynik: {
        ...WYNIK_OCENY,
        result_status: 'OUTDATED',
        result_status_reason_pl: 'Model zmienił się od biegu (zmiana nastaw zabezpieczenia).',
        odmowy: [
          {
            urzadzenie_ref: 'relay-q9',
            nazwa_pl: 'Zabezpieczenie Q9',
            breaker_ref: 'br-q9',
            braki: [
              {
                kod: 'protection.ct_missing',
                komunikat_pl: 'Wyłącznik nie ma przekładnika prądowego.',
                akcja_naprawcza_pl: 'Dodaj przekładnik prądowy przy wyłączniku.',
                funkcja: null,
              },
            ],
            kandydaci_naprawy: [],
          },
        ],
      },
    });
    render(<EkranKoordynacji />);

    expect(await screen.findByTestId('mvd-ocena-zabezpieczen-nieaktualny')).toHaveTextContent(
      'zmiana nastaw zabezpieczenia',
    );
    const odmowy = screen.getByTestId('mvd-ocena-zabezpieczen-odmowy');
    expect(odmowy).toHaveTextContent('Zabezpieczenie Q9:');
    expect(odmowy).toHaveTextContent('Dodaj przekładnik prądowy przy wyłączniku.');
    await user.click(screen.getByTestId('mvd-ocena-zabezpieczen-uzupelnij-relay-q9'));
    expect(openRouteSurface).toHaveBeenCalledWith('E-27');
  });
});

// ---------------------------------------------------------------------------
// Karta W3-C1: sekcja nastaw (metoda Hoppela) NA EKRANIE, przed selektywnością.
// Test celowo ćwiczy WPIĘCIE (nie sam komponent, patrz SekcjaNastaw.test.tsx):
// bez aktywnego przypadku sekcji nie ma czym zapytać, a kolejność
// „nastawy → selektywność" jest kontraktem flow.
// ---------------------------------------------------------------------------

const DOSTEPNOSC_E2E = {
  run_id: 'run-sc-1',
  dostepny: true,
  powod_pl: null,
  linie: [
    {
      line_id: 'ln1',
      nazwa: 'Linia testowa',
      // Kształt dostępności od decyzji O-51: zacisk zabezpieczenia i kandydaci kolejnej
      // szyny osobno dla każdego zacisku (model milczy — wymagany wybór).
      zacisk_z_modelu: null,
      wymaga_wskazania_zacisku: true,
      zaciski_dozwolone: ['od', 'do'],
      odmowa_zacisku: {
        kod: 'protection.relay_terminal_indication_missing',
        powod_pl: 'Model nie wskazuje, przy którym zacisku gałęzi stoi zabezpieczenie.',
      },
      zaciski: {
        od: { szyna_ref: 'b_a', etykieta_pl: 'Zacisk początkowy — szyna A' },
        do: { szyna_ref: 'b_b', etykieta_pl: 'Zacisk końcowy — szyna B' },
      },
      nastepne_szyny_wg_zacisku: { od: ['b_b'], do: [] },
    },
  ],
};

describe('EkranKoordynacji — nastawy z analizy (karta W3-C1)', () => {
  it('z aktywnym przypadkiem sekcja nastaw jest na ekranie PRZED stroną selektywności', async () => {
    ustawKompletnyKontekst();
    useAppStateStore.getState().setActiveCase('case-1', 'Warian bazowy');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/pakiet-dowodowy-nastaw/dostepnosc')) {
          return { ok: true, status: 200, json: async () => DOSTEPNOSC_E2E } as Response;
        }
        if (url.includes('/api/catalog/protection/device-types')) {
          return { ok: true, status: 200, json: async () => [] } as Response;
        }
        if (url.includes('/protection-runs')) return odpowiedzTla(url);
        // Strona selektywności ma własne wywołania — dla tego testu nieistotne.
        return { ok: true, status: 200, json: async () => ({ rows: [] }) } as Response;
      }),
    );

    render(<EkranKoordynacji />);

    const sekcja = await screen.findByTestId('mvd-koordynacja-nastawy');
    const strona = screen.getByTestId('mvd-koordynacja-strona');
    // Kolejność w DOM = kolejność pracy inżyniera: najpierw nastawy, potem selektywność.
    expect(sekcja.compareDocumentPosition(strona) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sekcja.textContent).toContain('Linia testowa');
    vi.unstubAllGlobals();
  });

  it('bez aktywnego przypadku sekcja nastaw się nie renderuje (nie ma czym zapytać)', () => {
    // Kontekst kompletny POZA wariantem pracy — `ustawKompletnyKontekst` ustawia go
    // od V12K-262 (migawka modelu), więc ten test musi go jawnie zdjąć: sprawdza
    // dokładnie stan „projekt jest, przypadku nie ma".
    ustawKompletnyKontekst();
    useAppStateStore.setState({ activeCaseId: null } as never);
    // Parametr w sygnaturze mocka: bez niego typ krotki wywolan to `[]` i `c[0]` jest bledem TS2493.
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<EkranKoordynacji />);

    expect(screen.queryByTestId('mvd-koordynacja-nastawy')).toBeNull();
    expect(screen.queryByTestId('mvd-koordynacja-nastawy-ladowanie')).toBeNull();
    const wywolaniaNastaw = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes('/pakiet-dowodowy-nastaw') || String(c[0]).includes('/nastawy'),
    );
    expect(wywolaniaNastaw).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
