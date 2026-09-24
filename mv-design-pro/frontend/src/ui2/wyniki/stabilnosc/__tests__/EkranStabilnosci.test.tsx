/**
 * Testy ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Interakcje natywne (userEvent.click) — Zero-Debt pkt 5. Dostawca danych
 * mockuje `fetch` 1:1 z endpointami results/dynamic-stability i
 * results/automation-trace — bez fabrykacji danych po stronie ekranu.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): bieg zwraca ECHO scenariusza
 * wpisanego przez użytkownika z oceną niewykonaną — werdykt STABILNY/NIESTABILNY,
 * wskaźnik, margines, kryteria progowe, statusy wielkości, narracja zdarzeń automatyki
 * i akcja „Popraw w modelu" z utraty stabilności skasowane. Testy, które przypinały te
 * werdykty, są odwrócone; pełny iloczyn cech pilnuje `uczciwosc.test.tsx`.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranStabilnosci } from '../EkranStabilnosci';
import type { RekordOcenyNiewykonanej } from '../../wzorzec/OcenaNiewykonana';
import rekordyOceny from './rekordyOceny.json';
import { POLA_SCENARIUSZA_STABILNOSCI } from '../model';
import { STABILNOSC_STRINGS as T } from '../strings';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** Wartości scenariusza KOMPLETNE — jedna dla wszystkich testów formularza,
 *  żeby test iloczynu cech (walidacja per pole) nie duplikował literałów. */
const WARTOSCI_SCENARIUSZA: Record<string, string> = {
  faulted_element_id: 'line/gpz/1',
  clearing_time_ms: '120',
  cleared_by_element_ids: 'cb-a, cb-b',
  pre_fault_angle_deg: '10',
  during_fault_angle_deg: '75',
  post_fault_angle_deg: '28',
  post_fault_voltage_pu: '0,97',
  post_fault_frequency_pu: '0.99',
  recovery_time_constant_s: '0,3',
};

const RUN_DYN = {
  id: 'run-dyn',
  analysis_type: 'DYNAMIC_STABILITY',
  status: 'DONE',
  finished_at: '2026-07-21T10:00:00Z',
  started_at: '2026-07-21T09:59:00Z',
} as never;

/** Rekord oceny niewykonanej — 1:1 z `ocena_stabilnosci_niewykonana()` (skrócony opis braków). */
const OCENA = (rekordyOceny as unknown as { scenariusz_dyn_1: RekordOcenyNiewykonanej })
  .scenariusz_dyn_1;

/** Wiersz wyniku — echo scenariusza (`EchoScenariuszaStabilnosci.to_dict`) + raportowalność. */
const WYNIK = {
  run_id: 'run-dyn',
  rows: [
    {
      scenario_id: 'dyn-1',
      scenario_type: 'FAULT_CLEAR',
      source_id: 'src/pv/1',
      faulted_element_id: 'line/gpz/1',
      cleared_by_element_ids: ['cb-main'],
      status: 'NIE_OCENIONO',
      contract_version: 'dynamic_stability_fault_clear_echo_v2',
      clearing_time_ms: 120,
      pre_fault_angle_deg: 10,
      during_fault_angle_deg: 75,
      post_fault_angle_deg: 28,
      post_fault_voltage_pu: 0.97,
      post_fault_frequency_pu: 0.99,
      ocena: OCENA,
      source_kind: 'generator',
      faulted_element_kind: 'galaz_liniowa',
      reporting_status_pl: 'nieraportowalny',
      proof_status_pl: 'czesciowy',
      reporting_limitations: [
        'Kąty wirnika i wielkości pozwarciowe pochodzą z opcji biegu — wynik nie jest dowodem '
        + 'regulacyjnym.',
      ],
    },
  ],
};

/** Ślad automatyki — `build_automation_trace_results`: bez zdarzeń, efekt zadeklarowany. */
const SLAD = {
  run_id: 'run-dyn',
  topology_effect: { network_state: 'ISLANDED_SECTION', outage_scope: 'SECTION' },
  rows: [],
  ocena: OCENA,
};

const PRZEBIEG = {
  run_id: 'run-dyn',
  has_time_series: true,
  time_unit: 's',
  contract_version: 'dynamic_stability_fault_clear_echo_v2',
  uwaga_pl:
    'Przebieg zadany: funkcja wykładnicza odbudowy do napięcia i częstotliwości po zwarciu '
    + 'wpisanych przez użytkownika, ze stałą czasową z opcji biegu — nie jest rozwiązaniem '
    + 'sieci ani przebiegiem zmierzonym.',
  quantities: [
    { key: 'voltage_pu', label_pl: 'Napięcie', unit: 'p.u.' },
    { key: 'frequency_pu', label_pl: 'Częstotliwość', unit: 'p.u.' },
  ],
  points: [
    { t_s: -0.1, voltage_pu: 1.0, frequency_pu: 1.0 },
    { t_s: 0.0, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 0.12, voltage_pu: 0.0, frequency_pu: 1.0 },
    { t_s: 0.5, voltage_pu: 0.74, frequency_pu: 1.0 },
    { t_s: 2.0, voltage_pu: 0.97, frequency_pu: 0.99 },
  ],
};

const PRZEBIEG_BRAK = {
  run_id: 'run-dyn',
  has_time_series: false,
  time_unit: 's',
  quantities: [],
  points: [],
};

function mockFetchStabilnosci(przebieg: unknown = PRZEBIEG) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = url.endsWith('/results/dynamic-stability/time-series')
      ? przebieg
      : url.endsWith('/results/dynamic-stability')
        ? WYNIK
        : url.endsWith('/results/automation-trace')
          ? SLAD
          : null;
    if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
    return { ok: true, status: 200, json: async () => json } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useNetworkBuildStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EkranStabilnosci — kontrakt ekranu prowadzącego (FLOW §0.3)', () => {
  it('nagłówek: eyebrow, tytuł i zdanie celu inżynierskiego', () => {
    render(<EkranStabilnosci />);
    expect(screen.getByText(T.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: T.tytul })).toBeInTheDocument();
    expect(screen.getByText(T.cel)).toBeInTheDocument();
  });

  it('brak zakończonego przebiegu stabilności → uczciwy stan zerowy z formularzem, bez oceny', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);

    const zero = screen.getByTestId('mvd-stabilnosc-zero');
    expect(zero).toBeInTheDocument();
    expect(zero).toHaveTextContent(T.zeroTytul);
    expect(screen.queryByTestId('mvd-stabilnosc-ocena')).not.toBeInTheDocument();
    // Stan zerowy pokazuje FORMULARZ scenariusza, nie tylko akcję nawigacyjną.
    expect(screen.getByTestId('mvd-stabilnosc-formularz')).toBeInTheDocument();
    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      expect(screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`)).toHaveValue('');
    }

    await user.click(screen.getByTestId('mvd-stabilnosc-zero-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('EkranStabilnosci — formularz scenariusza (karta W2 pkt 1, zero fabrykacji)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeCaseId: CASE_ID, activeProjectId: 'projekt-1' } as never);
    useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
    );
  });

  // Pomiar 2026-09-23 (odbiór AB-H0): iloczyn braków był JEDNYM testem z pętlą po 9 polach
  // (9 renderów ekranu × 8 pól wpisywanych znak po znaku) — 2,37 s samodzielnie, a pod
  // obciążeniem maszyny przekraczał limit 5 s i wywracał także następny test. Przyczyna to
  // długość jednego testu, nie wolna ścieżka produktu: każdy brak jest teraz OSOBNYM
  // przypadkiem (`it.each`) z tą samą, w pełni natywną ścieżką (wpisywanie znak po znaku,
  // natywny klik) — iloczyn cech bez zmian, a każdy przypadek mieści się w limicie z zapasem.
  it.each(POLA_SCENARIUSZA_STABILNOSCI.map((pole) => [pole.klucz, pole] as const))(
    'brak pola %s z osobna blokuje wysyłkę (iloczyn cech, nie przykład z karty)',
    async (_klucz, pominietePole) => {
      const user = userEvent.setup();
      const createAndExecuteRun = vi.fn();
      useExecutionRunsStore.setState({ runs: [], createAndExecuteRun } as never);
      render(<EkranStabilnosci />);

      for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
        if (pole.klucz === pominietePole.klucz) continue;
        await user.type(
          screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`),
          WARTOSCI_SCENARIUSZA[pole.klucz],
        );
      }
      await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

      expect(
        screen.getByTestId(`mvd-stabilnosc-pole-${pominietePole.klucz}-blad`),
        `pole ${pominietePole.klucz}: brak komunikatu błędu`,
      ).toBeInTheDocument();
      expect(
        createAndExecuteRun,
        `pole ${pominietePole.klucz}: bieg NIE powinien wystartować`,
      ).not.toHaveBeenCalled();
    },
  );

  it('natywny klik „Uruchom bieg scenariusza" z kompletem pól wysyła DOKŁADNIE kontrakt opcji biegu', async () => {
    const user = userEvent.setup();
    // Sygnatura mocka jawna (caseId, zadanie), zeby `mock.calls[0]` bylo typem krotki bez
    // rzutowania `[] as [string, unknown]` (dlug typow poza bramka, tsconfig_gate_guard).
    const createAndExecuteRun = vi.fn(async (_caseId: string, _zadanie: unknown) => ({
      id: 'run-nowy',
      study_case_id: CASE_ID,
      analysis_type: 'DYNAMIC_STABILITY',
      solver_input_hash: 'hash',
      status: 'DONE',
      started_at: '2026-09-09T10:00:00Z',
      finished_at: '2026-09-09T10:00:01Z',
      error_message: null,
    }));
    useExecutionRunsStore.setState({
      runs: [],
      createAndExecuteRun,
      pollRunStatus: vi.fn(),
      loadRuns: vi.fn(),
    } as never);
    render(<EkranStabilnosci />);

    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      await user.type(
        screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`),
        WARTOSCI_SCENARIUSZA[pole.klucz],
      );
    }
    await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

    expect(createAndExecuteRun).toHaveBeenCalledTimes(1);
    const [wolanyCaseId, zadanie] = createAndExecuteRun.mock.calls[0];
    expect(wolanyCaseId).toBe(CASE_ID);
    expect(zadanie).toEqual({
      analysis_type: 'DYNAMIC_STABILITY',
      solver_input: {
        faulted_element_id: 'line/gpz/1',
        clearing_time_ms: 120,
        cleared_by_element_ids: ['cb-a', 'cb-b'],
        pre_fault_angle_deg: 10,
        during_fault_angle_deg: 75,
        post_fault_angle_deg: 28,
        post_fault_voltage_pu: 0.97,
        post_fault_frequency_pu: 0.99,
        recovery_time_constant_s: 0.3,
      },
    });
  });

  it('czas wyłączenia i stała czasowa <= 0 dają błąd „wartość musi być dodatnia"', async () => {
    const user = userEvent.setup();
    const createAndExecuteRun = vi.fn();
    useExecutionRunsStore.setState({ runs: [], createAndExecuteRun } as never);
    render(<EkranStabilnosci />);

    for (const pole of POLA_SCENARIUSZA_STABILNOSCI) {
      const wartosc =
        pole.klucz === 'clearing_time_ms' || pole.klucz === 'recovery_time_constant_s'
          ? '0'
          : WARTOSCI_SCENARIUSZA[pole.klucz];
      await user.type(screen.getByTestId(`mvd-stabilnosc-pole-${pole.klucz}`), wartosc);
    }
    await user.click(screen.getByTestId('mvd-stabilnosc-formularz-uruchom'));

    expect(screen.getByTestId('mvd-stabilnosc-pole-clearing_time_ms-blad')).toHaveTextContent(
      T.bladDodatnie,
    );
    expect(
      screen.getByTestId('mvd-stabilnosc-pole-recovery_time_constant_s-blad'),
    ).toHaveTextContent(T.bladDodatnie);
    expect(createAndExecuteRun).not.toHaveBeenCalled();
  });
});

describe('EkranStabilnosci — dane przebiegu (fetch 1:1 z endpointami)', () => {
  beforeEach(() => {
    mockFetchStabilnosci();
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
  });

  // Odwrócone: dawny werdykt STABLE → „STABILNY" z wskaźnikiem i marginesem.
  it('założenia scenariusza i ocena niewykonana z backendu (bez werdyktu)', async () => {
    render(<EkranStabilnosci />);
    expect(
      await screen.findByTestId(`mvd-werdykt-${OCENA.kryterium_id}-zdanie`),
    ).toHaveTextContent(OCENA.wyjasnienie.zdanie_pl);
    expect(screen.queryByTestId('mvd-stabilnosc-werdykt')).not.toBeInTheDocument();
    // Założenia: element zakłócenia i elementy wyłączające scenariusza.
    expect(screen.getByText('line/gpz/1')).toBeInTheDocument();
    expect(screen.getByText('cb-main')).toBeInTheDocument();
  });

  // Intencja zachowana: liczby scenariusza widoczne z jednostkami. Zmiana kanonu: echo
  // wartości wpisanych, bez statusów kryteriów i bez sekcji kryteriów progowych.
  it('echo scenariusza zamiast wielkości ze statusami kryteriów i kryteriów progowych', async () => {
    render(<EkranStabilnosci />);
    const echo = await screen.findByTestId('mvd-stabilnosc-echo');
    expect(echo).toHaveTextContent(T.echoTytul);
    expect(screen.getByTestId('mvd-stabilnosc-echo-clearing_time_ms')).toHaveTextContent(
      '120,0 ms',
    );
    expect(screen.getByTestId('mvd-stabilnosc-echo-post_fault_voltage_pu')).toHaveTextContent(
      '0,970 p.u.',
    );
    expect(screen.queryByTestId('mvd-stabilnosc-kryteria')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-wielkosci')).not.toBeInTheDocument();
  });

  // Odwrócone: dawna tabela zdarzeń („start sekwencji automatyki", „wystąpienie zwarcia").
  it('ślad automatyki na żądanie (natywny klik) — bez zdarzeń, efekt topologii zadeklarowany', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    expect(screen.queryByTestId('mvd-stabilnosc-slad-brak')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-stabilnosc-slad-btn'));

    expect(screen.queryByTestId('mvd-stabilnosc-zdarzenia')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-stabilnosc-slad-brak')).toHaveTextContent(T.sladBrak);
    const topologia = screen.getByTestId('mvd-stabilnosc-topologia');
    expect(topologia).toHaveTextContent(T.sladTopologiaTytul);
    expect(topologia).toHaveTextContent('ISLANDED_SECTION');
  });

  it('akcja „Otwórz pełny dowód obliczeń" otwiera zakładkę dowodu przebiegu', async () => {
    const user = userEvent.setup();
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    await user.click(screen.getByTestId('mvd-stabilnosc-dowod'));
    expect(useShellStore.getState().wynikiTab).toBe('dowod');
    expect(useShellStore.getState().wynikiTabElement).toBe('run-dyn');
  });

  it('raportowalność PL z backendu; powrót do huba czyści powierzchnię trasową', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-32', { openMode: 'expand_workspace' });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-raport-status')).toHaveTextContent(
      'nieraportowalny',
    );
    await user.click(screen.getByTestId('mvd-stabilnosc-powrot'));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('karta S-1: wynik nieraportowalny (UNVALIDATED_MODEL) pokazuje ograniczenia z rejestru', async () => {
    const wynikNieraportowalny = {
      run_id: 'run-dyn',
      rows: [
        {
          ...WYNIK.rows[0],
          proof_status_pl: 'czesciowy',
          reporting_status_pl: 'nieraportowalny',
          dopuszczalnosc_raportowa: false,
          reporting_limitations: [
            'Model niezwalidowany: kąty wirnika i wielkości pozwarciowe pochodzą z opcji biegu '
              + '— wynik nie jest dowodem regulacyjnym.',
          ],
        },
      ],
    };
    mockFetchStabilnosci();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = url.endsWith('/results/dynamic-stability/time-series')
          ? PRZEBIEG
          : url.endsWith('/results/dynamic-stability')
            ? wynikNieraportowalny
            : url.endsWith('/results/automation-trace')
              ? SLAD
              : null;
        if (json === null) throw new Error(`Nieoczekiwany URL w teście: ${url}`);
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-raport-status')).toHaveTextContent(
      'nieraportowalny',
    );
    expect(screen.getByTestId('mvd-stabilnosc-raport-ograniczenia')).toHaveTextContent(
      'nie jest dowodem regulacyjnym',
    );
  });
});

describe('EkranStabilnosci — przebieg czasowy na żądanie (ST-1)', () => {
  // Intencja zachowana: przebieg na żądanie. Zmiana kanonu: przy wykresie uwaga
  // backendu o przebiegu ZADANYM (nie rozwiązanie sieci); dawna nota o braku szeregu
  // należała do skasowanej tabeli wielkości ze statusami kryteriów.
  it('nie pobiera przebiegu przed klikiem (na żądanie); klik ładuje wykres z uwagą backendu', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchStabilnosci();
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    // Na żądanie: endpoint szeregu NIE jest wołany przed klikiem.
    const wolaniaPrzed = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/time-series'),
    );
    expect(wolaniaPrzed).toHaveLength(0);
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));

    // Wykres pojawia się z danymi i seriami PL oraz z uwagą o przebiegu zadanym.
    expect(await screen.findByTestId('mvd-stabilnosc-wykres')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-stabilnosc-przebieg-uwaga')).toHaveTextContent(
      PRZEBIEG.uwaga_pl,
    );
    // Nazwa serii występuje w przełączniku i w legendzie wykresu.
    expect(screen.getAllByText(T.przebiegSeriaNapiecie).length).toBeGreaterThan(0);
    expect(screen.getAllByText(T.przebiegSeriaCzestotliwosc).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mvd-stabilnosc-serie-voltage_pu')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Endpoint szeregu wołany dokładnie raz (po kliku).
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/time-series')),
    ).toHaveLength(1);
  });

  it('starszy bieg bez szeregu → uczciwy stan zerowy przebiegu', async () => {
    const user = userEvent.setup();
    mockFetchStabilnosci(PRZEBIEG_BRAK);
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));

    expect(await screen.findByTestId('mvd-stabilnosc-przebieg-brak')).toHaveTextContent(
      T.przebiegBrak,
    );
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-przebieg-uwaga')).not.toBeInTheDocument();
  });

  it('błąd endpointu przebiegu → uczciwy komunikat, bez wykresu', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/results/dynamic-stability/time-series')) {
          return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        const json = url.endsWith('/results/dynamic-stability')
          ? WYNIK
          : { run_id: 'run-dyn', rows: [], topology_effect: null };
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    await user.click(screen.getByTestId('mvd-stabilnosc-przebieg-btn'));
    expect(await screen.findByTestId('mvd-stabilnosc-przebieg-blad')).toHaveTextContent(
      T.przebiegBlad,
    );
    expect(screen.queryByTestId('mvd-stabilnosc-wykres')).not.toBeInTheDocument();
  });
});

describe('EkranStabilnosci — uczciwe braki', () => {
  it('wynik niedostępny (błąd endpointu) → stan błędu z akcją naprawczą', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-blad')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-ocena')).not.toBeInTheDocument();
  });

  it('przebieg bez wiersza wyniku → uczciwy komunikat, bez tabel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = url.endsWith('/results/dynamic-stability')
          ? { run_id: 'run-dyn', rows: [] }
          : { run_id: 'run-dyn', rows: [], topology_effect: null };
        return { ok: true, status: 200, json: async () => json } as Response;
      }),
    );
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);

    expect(await screen.findByTestId('mvd-stabilnosc-brak-wiersza')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-stabilnosc-echo')).not.toBeInTheDocument();
  });
});

describe('EkranStabilnosci — pętla decyzji bez werdyktu (F-K4 faza 3 odwrócona)', () => {
  // Odwrócone: dawna akcja „Popraw w modelu" z utraty stabilności (miejsce zwarcia albo
  // źródło). Bez oceny stabilności nie ma przyczyny do naprawy — akcja zniknęła dla
  // KAŻDEGO wiersza, także tego, który niesie rodzaje elementów z kontraktu.
  it('wiersz z rodzajami elementów z kontraktu NIE dostaje akcji „Popraw w modelu"', async () => {
    mockFetchStabilnosci();
    useExecutionRunsStore.setState({ runs: [RUN_DYN] });
    render(<EkranStabilnosci />);
    await screen.findByTestId('mvd-stabilnosc-ocena');

    expect(screen.queryByTestId('mvd-stabilnosc-popraw')).toBeNull();
  });
});
