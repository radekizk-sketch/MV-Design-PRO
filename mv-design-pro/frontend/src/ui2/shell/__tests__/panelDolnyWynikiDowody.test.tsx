/*
 * Zakładki „Wyniki" i „Dowody" panelu dolnego (karta UI-02 PANEL-DOLNY). Klik natywny
 * (userEvent), produkcyjne klienty HTTP — zaślepiona jest wyłącznie sieć (`fetch`)
 * w kształcie odpowiedzi backendu:
 *   `GET /api/execution/runs/{id}/results/v1`,
 *   `GET /api/analysis-runs/{id}/pakiet-dowodowy/dostepnosc`,
 *   `GET /api/analysis-runs/{id}/export/proof/dostepnosc`.
 *
 * ILOCZYN CECH:
 *  - Wyniki: stan komórki {brak wyniku, zero, wartość} × świeżość biegu {aktualne,
 *    nieaktualne, nieznana} × sortowanie {źródłowe, rosnąco, malejąco} × filtr {brak,
 *    rodzaj, tekst, oba} × zaznaczenie {klik zaznacza element realną ścieżką, wiersz
 *    wyróżniony, drugi klik przenosi wyróżnienie} × biegi {brak, jeden, kilka — wybór};
 *  - Dowody: pakiet {dostępny, niedostępny z powodem serwera} × eksport {komplet,
 *    brak danych, brak składu PDF} × rodzaj biegu {zwarcie 3F, rozpływ, stan fazowy}
 *    × polecenie {otwórz dowód, pobierz pakiet, eksport formatu}.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelDolny } from '../panelDolny/PanelDolny';
import { ZAKLADKI_PANELU_DOLNEGO } from '../panelDolny/rejestrZakladek';
import { useWynikiPaneluStore } from '../panelDolny/wynikiPanelu';
import { swiezoscBiegu } from '../panelDolny/ZakladkaWyniki';
import { BOTTOM_DEFAULT, useShellStore } from '../useShellStore';
import { zaznaczElementModelu } from '../zaznaczElementModelu';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSelectionStore } from '../../../ui/selection/store';
import type { ExecutionAnalysisType, ExecutionRun } from '../../../ui/study-cases/types';
import type { EnergyNetworkModel } from '../../../types/enm';

const CASE_ID = 'case-wyniki';
const initialSnapshot = useSnapshotStore.getState();
const initialRuns = useExecutionRunsStore.getState();
const initialSelection = useSelectionStore.getState();

function run(
  id: string,
  analysis: ExecutionAnalysisType,
  finished: string,
  modelRevision: number | null = 3,
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: CASE_ID,
    analysis_type: analysis,
    solver_input_hash: 'sha',
    status,
    started_at: finished,
    finished_at: finished,
    error_message: null,
    model_revision: modelRevision,
  };
}

const SNAPSHOT = {
  header: { revision: 3 },
  buses: [
    { id: 'u-1', ref_id: 'bus-gpz', name: 'Szyna GPZ', voltage_kv: 15 },
    { id: 'u-2', ref_id: 'bus-odb', name: 'Szyna odbioru', voltage_kv: 15 },
    { id: 'u-3', ref_id: 'bus-zero', name: 'Szyna rezerwowa', voltage_kv: 15 },
  ],
  branches: [
    { id: 'u-4', ref_id: 'kab-1', name: 'Kabel K1', type: 'cable', from_bus_ref: 'bus-gpz', to_bus_ref: 'bus-odb' },
  ],
  transformers: [],
  sources: [],
  loads: [],
  generators: [],
  substations: [],
  bays: [],
  junctions: [],
  corridors: [],
  measurements: [],
  protection_assignments: [],
  branch_points: [],
} as unknown as EnergyNetworkModel;

function metryka(code: string, value: number | null, unit: string, format_hint = 'fixed2') {
  return { code, value, unit, format_hint, source: 'solver' };
}

/** Wynik rozpływu: szyna z wartością, szyna z ZEREM, gałąź bez U (brak wyniku), uwaga. */
const WYNIK_ROZPLYWU = {
  run_id: 'r-lf',
  analysis_type: 'LOAD_FLOW',
  overlay_payload: {
    elements: {
      'bus-gpz': {
        ref_id: 'bus-gpz',
        kind: 'bus',
        badges: [],
        metrics: { U_kV: metryka('U_kV', 15.02, 'kV'), P_MW: metryka('P_MW', 1.25, 'MW', 'fixed4') },
        severity: 'INFO',
      },
      'bus-zero': {
        ref_id: 'bus-zero',
        kind: 'bus',
        badges: [],
        metrics: { U_kV: metryka('U_kV', 0, 'kV'), P_MW: metryka('P_MW', 0, 'MW', 'fixed4') },
        severity: 'INFO',
      },
      'kab-1': {
        ref_id: 'kab-1',
        kind: 'branch',
        badges: [{ code: 'W-1', severity: 'WARNING', message: 'x' }],
        metrics: { P_MW: metryka('P_MW', -0.5, 'MW', 'fixed4'), I_A: metryka('I_A', 48.1, 'A', 'fixed1') },
        severity: 'WARNING',
      },
    },
  },
};

const WYNIK_ZWARC = {
  run_id: 'r-sc',
  analysis_type: 'SC_3F',
  overlay_payload: {
    elements: {
      'bus-odb': {
        ref_id: 'bus-odb',
        kind: 'bus',
        badges: [],
        metrics: { IK_3F_A: metryka('IK_3F_A', 8.91, 'kA') },
        severity: 'INFO',
      },
    },
  },
};

interface OdpowiedzSieci {
  ok: boolean;
  status: number;
  body: unknown;
}

function stubSiec(trasy: Record<string, OdpowiedzSieci>) {
  const fetchMock = vi.fn(async (url: string) => {
    const odp = trasy[url];
    if (!odp) throw new Error(`nieoczekiwane zapytanie: ${url}`);
    return {
      ok: odp.ok,
      status: odp.status,
      headers: new Headers({ 'content-disposition': 'attachment; filename="plik.zip"' }),
      json: async () => odp.body,
      blob: async () => new Blob(['x']),
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = (body: unknown): OdpowiedzSieci => ({ ok: true, status: 200, body });

function renderPanel(aktywna: string, over: Partial<Parameters<typeof PanelDolny>[0]> = {}) {
  const akcje = {
    onWybierzZakladke: vi.fn<[string], void>(),
    onZmienWysokosc: vi.fn<[number], void>(),
    onZamknij: vi.fn<[], void>(),
    // Realna ścieżka zaznaczenia (ta sama co w AppRoot): migawka → store selekcji.
    onWybierzElement: vi.fn((ref: string) => zaznaczElementModelu(ref, 'panel-dolny')),
    onOtworzDowodBiegu: vi.fn<[string], void>(),
  };
  render(
    <PanelDolny zakladki={ZAKLADKI_PANELU_DOLNEGO} aktywna={aktywna} wysokosc={BOTTOM_DEFAULT} {...akcje} {...over} />,
  );
  return akcje;
}

function nazwyWierszy(): string[] {
  return screen.getAllByTestId('mvd-wyn-wiersz').map((tr) => tr.querySelector('td')?.textContent ?? '');
}

beforeEach(() => {
  localStorage.clear();
  useSnapshotStore.setState(initialSnapshot, true);
  useExecutionRunsStore.setState(initialRuns, true);
  useSelectionStore.setState(initialSelection, true);
  useWynikiPaneluStore.setState({ wybranyRunId: null, wyniki: {} });
  useShellStore.setState({ szczegolyAudytowe: false });
  useSnapshotStore.setState({ snapshot: SNAPSHOT, rewizjaBiezacegoModelu: 3 });
  // jsdom nie ma URL.createObjectURL — pobranie pliku zapisuje go przez kotwicę.
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Zakładka Wyniki — brak biegu', () => {
  for (const [opis, runs] of [
    ['brak przebiegów', []],
    ['wyłącznie bieg nieudany i trwający', [run('r-f', 'SC_3F', '2026-10-01T10:00:00Z', 3, 'FAILED'), run('r-r', 'LOAD_FLOW', '2026-10-01T11:00:00Z', 3, 'RUNNING')]],
  ] as const) {
    it(`${opis} → uczciwy stan „brak wyników", bez zapytania o wynik`, () => {
      const fetchMock = stubSiec({});
      useExecutionRunsStore.setState({ runs: [...runs] });
      renderPanel('wyniki');
      expect(screen.getByTestId('mvd-wyniki-brak')).toHaveTextContent('Oblicz');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId('mvd-bottom-licznik-wyniki')).not.toBeInTheDocument();
    });
  }
});

describe('Zakładka Wyniki — stan komórki × świeżość', () => {
  for (const [opis, rewizjaBiegu, rewizjaModelu, oczekiwana] of [
    ['aktualne', 3, 3, 'aktualne'],
    ['nieaktualne po edycji modelu', 3, 5, 'nieaktualne'],
    ['nieznana rewizja biegu', null, 3, 'nieznana'],
  ] as const) {
    it(`${opis}: brak wyniku „—", zero „0,00", wartość z jednostką kolumny`, async () => {
      stubSiec({ '/api/execution/runs/r-lf/results/v1': ok(WYNIK_ROZPLYWU) });
      useSnapshotStore.setState({ rewizjaBiezacegoModelu: rewizjaModelu });
      useExecutionRunsStore.setState({ runs: [run('r-lf', 'LOAD_FLOW', '2026-10-02T10:00:00Z', rewizjaBiegu)] });
      renderPanel('wyniki');
      const tabela = await screen.findByTestId('mvd-wyniki-tabela');

      // Nazwy z modelu, nie identyfikatory; kolejność po nazwie (polski porządek).
      expect(nazwyWierszy()).toEqual(['Kabel K1', 'Szyna GPZ', 'Szyna rezerwowa']);
      // Etykiety pełne z rejestru, jednostka z backendu w nagłówku.
      expect(screen.getByTestId('mvd-wyn-th-m:U_kV')).toHaveTextContent('Napięcie');
      expect(screen.getByTestId('mvd-wyn-th-m:U_kV')).toHaveTextContent('[kV]');
      expect(screen.getByTestId('mvd-wyn-th-m:I_A')).toHaveTextContent('Prąd[A]');

      const [kabel, gpz, zero] = screen.getAllByTestId('mvd-wyn-wiersz');
      const komorkaU = (wiersz: HTMLElement) => within(wiersz).getAllByRole('cell')[2];
      // Brak wyniku: kreska z opisem, nie zero.
      expect(komorkaU(kabel)).toHaveTextContent('—');
      expect(komorkaU(kabel)).toHaveAttribute('title', 'brak wyniku');
      // Zero: liczba zero w formacie backendu.
      expect(komorkaU(zero)).toHaveTextContent('0,00');
      expect(komorkaU(zero)).not.toHaveAttribute('title');
      expect(komorkaU(gpz)).toHaveTextContent('15,02');
      // Liczby: wyrównanie do prawej + krój maszynowy (tabular-nums w klasie mvd-num).
      expect(komorkaU(gpz)).toHaveClass('mvd-wyn-td-prawo', 'mvd-num');
      // Moc ujemna zachowuje znak, zapis polski.
      expect(within(kabel).getAllByRole('cell')[3]).toHaveTextContent('-0,5000');
      // Ważność: uwaga elementu albo „bez uwag" (nie „informacja" wymyślona z braku uwag).
      expect(within(kabel).getAllByRole('cell')[5]).toHaveTextContent('Ostrzeżenie');
      expect(within(gpz).getAllByRole('cell')[5]).toHaveTextContent('bez uwag');

      if (oczekiwana === 'aktualne') {
        expect(screen.queryByTestId('mvd-wyniki-nieaktualne')).not.toBeInTheDocument();
        expect(tabela).toHaveAttribute('data-nieaktualne', 'false');
      }
      if (oczekiwana === 'nieaktualne') {
        expect(screen.getByTestId('mvd-wyniki-nieaktualne')).toHaveTextContent('nieaktualne (rew. 3 → 5)');
        expect(tabela).toHaveAttribute('data-nieaktualne', 'true');
        expect(tabela).toHaveClass('mvd-dolny-przygaszone');
      }
      if (oczekiwana === 'nieznana') {
        expect(screen.getByTestId('mvd-wyniki-swiezosc-nieznana')).toBeInTheDocument();
        expect(screen.queryByTestId('mvd-wyniki-nieaktualne')).not.toBeInTheDocument();
      }
      expect(screen.getByTestId('mvd-bottom-licznik-wyniki')).toHaveTextContent('3');
    });
  }

  it('świeżość biegu: para rewizji z biegu i modelu, brak którejkolwiek = nie do oceny', () => {
    const bieg = run('r', 'SC_3F', '2026-10-02T10:00:00Z', 4);
    expect(swiezoscBiegu(bieg, 4)?.stan).toBe('aktualne');
    expect(swiezoscBiegu(bieg, 6)).toEqual({ stan: 'nieaktualne', rewizjaDanej: 4, rewizjaModelu: 6, przyczyna: 'model-zmieniony' });
    expect(swiezoscBiegu(bieg, null)).toBeNull();
    expect(swiezoscBiegu(run('r', 'SC_3F', '2026-10-02T10:00:00Z', null), 4)).toBeNull();
  });
});

describe('Zakładka Wyniki — sortowanie × filtr × zaznaczenie', () => {
  beforeEach(() => {
    stubSiec({ '/api/execution/runs/r-lf/results/v1': ok(WYNIK_ROZPLYWU) });
    useExecutionRunsStore.setState({ runs: [run('r-lf', 'LOAD_FLOW', '2026-10-02T10:00:00Z')] });
  });

  it('sortowanie po wielkości: liczbowo rosnąco, malejąco, powrót do kolejności źródłowej', async () => {
    const user = userEvent.setup();
    renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    const naglowek = within(screen.getByTestId('mvd-wyn-th-m:P_MW')).getByRole('button');
    await user.click(naglowek);
    expect(nazwyWierszy()).toEqual(['Kabel K1', 'Szyna rezerwowa', 'Szyna GPZ']); // −0,5 < 0 < 1,25
    await user.click(naglowek);
    expect(nazwyWierszy()).toEqual(['Szyna GPZ', 'Szyna rezerwowa', 'Kabel K1']);
    await user.click(naglowek);
    expect(nazwyWierszy()).toEqual(['Kabel K1', 'Szyna GPZ', 'Szyna rezerwowa']);
  });

  it('filtr po rodzaju i tekstowy (osobno i razem), licznik widocznych, filtr bez trafień', async () => {
    const user = userEvent.setup();
    renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    const rodzaj = screen.getByTestId('mvd-wyniki-filtr-rodzaj');
    expect([...rodzaj.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Wszystkie rodzaje',
      'Odcinek liniowy',
      'Szyna',
    ]);
    await user.selectOptions(rodzaj, 'Szyna');
    expect(nazwyWierszy()).toEqual(['Szyna GPZ', 'Szyna rezerwowa']);
    expect(screen.getByTestId('mvd-wyniki-liczba')).toHaveTextContent('2 z 3 elementów');
    await user.type(screen.getByTestId('mvd-wyniki-filtr-tekst'), 'rezerw');
    expect(nazwyWierszy()).toEqual(['Szyna rezerwowa']);
    await user.selectOptions(rodzaj, '');
    await user.clear(screen.getByTestId('mvd-wyniki-filtr-tekst'));
    await user.type(screen.getByTestId('mvd-wyniki-filtr-tekst'), 'kabel');
    expect(nazwyWierszy()).toEqual(['Kabel K1']);
    await user.type(screen.getByTestId('mvd-wyniki-filtr-tekst'), 'xyz');
    expect(screen.getByTestId('mvd-wyniki-filtr-pusty')).toBeInTheDocument();
  });

  it('pojedynczy klik wiersza zaznacza element (store selekcji) i wyróżnia JEDEN wiersz', async () => {
    const user = userEvent.setup();
    const p = renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    const [kabel, gpz] = screen.getAllByTestId('mvd-wyn-wiersz');
    await user.click(within(gpz).getAllByRole('cell')[0]);
    expect(p.onWybierzElement).toHaveBeenLastCalledWith('bus-gpz');
    expect(useSelectionStore.getState().selectedElement?.id).toBe('bus-gpz');
    expect(screen.getAllByTestId('mvd-wyn-wiersz').filter((tr) => tr.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')[1]).toHaveAttribute('aria-selected', 'true');
    await user.click(within(kabel).getAllByRole('cell')[0]);
    expect(useSelectionStore.getState().selectedElement?.id).toBe('kab-1');
    const wybrane = screen.getAllByTestId('mvd-wyn-wiersz').filter((tr) => tr.getAttribute('aria-selected') === 'true');
    expect(wybrane).toHaveLength(1);
    expect(wybrane[0]).toHaveTextContent('Kabel K1');
  });

  it('zaznaczenie z innego miejsca (schemat) wyróżnia wiersz tego elementu', async () => {
    renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    act(() => zaznaczElementModelu('bus-zero', 'schemat'));
    expect(screen.getAllByTestId('mvd-wyn-wiersz')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('identyfikator elementu wyłącznie w szczegółach audytowych', async () => {
    renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    expect(screen.queryByTestId('mvd-wyn-th-ref')).not.toBeInTheDocument();
    act(() => useShellStore.setState({ szczegolyAudytowe: true }));
    expect(screen.getByTestId('mvd-wyn-th-ref')).toBeInTheDocument();
    expect(screen.getByText('bus-gpz')).toBeInTheDocument();
  });
});

describe('Zakładka Wyniki — wybór biegu, błąd odczytu, kod bez etykiety', () => {
  it('kilka biegów: domyślnie najnowszy, wybór pobiera wynik WSKAZANEGO biegu', async () => {
    const user = userEvent.setup();
    const fetchMock = stubSiec({
      '/api/execution/runs/r-lf/results/v1': ok(WYNIK_ROZPLYWU),
      '/api/execution/runs/r-sc/results/v1': ok(WYNIK_ZWARC),
    });
    useExecutionRunsStore.setState({
      runs: [run('r-lf', 'LOAD_FLOW', '2026-10-02T10:00:00Z'), run('r-sc', 'SC_3F', '2026-10-03T10:00:00Z')],
    });
    renderPanel('wyniki');
    await screen.findByTestId('mvd-wyniki-tabela');
    expect(nazwyWierszy()).toEqual(['Szyna odbioru']);
    expect(screen.getByTestId('mvd-wyn-th-m:IK_3F_A')).toHaveTextContent('Prąd zwarciowy początkowy');
    await user.selectOptions(screen.getByTestId('mvd-wyniki-bieg'), 'r-lf');
    await waitFor(() => expect(nazwyWierszy()).toEqual(['Kabel K1', 'Szyna GPZ', 'Szyna rezerwowa']));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      '/api/execution/runs/r-sc/results/v1',
      '/api/execution/runs/r-lf/results/v1',
    ]);
  });

  it('błąd serwera → komunikat (rola alert) z powodem i ponowienie', async () => {
    const user = userEvent.setup();
    const fetchMock = stubSiec({
      '/api/execution/runs/r-lf/results/v1': { ok: false, status: 409, body: { detail: 'Wyniki niedostępne — przebieg w toku.' } },
    });
    useExecutionRunsStore.setState({ runs: [run('r-lf', 'LOAD_FLOW', '2026-10-02T10:00:00Z')] });
    renderPanel('wyniki');
    const blad = await screen.findByTestId('mvd-wyniki-blad');
    expect(blad).toHaveAttribute('role', 'alert');
    expect(blad).toHaveTextContent('przebieg w toku');
    await user.click(within(blad).getByRole('button', { name: 'Ponów' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('kod metryki bez etykiety → jawny komunikat, nie kolumna z kodem maszynowym', async () => {
    stubSiec({
      '/api/execution/runs/r-x/results/v1': ok({
        overlay_payload: {
          elements: {
            'bus-gpz': { ref_id: 'bus-gpz', kind: 'bus', badges: [], metrics: { NOWY_KOD: metryka('NOWY_KOD', 1, 'kV') }, severity: 'INFO' },
          },
        },
      }),
    });
    useExecutionRunsStore.setState({ runs: [run('r-x', 'LOAD_FLOW', '2026-10-02T10:00:00Z')] });
    renderPanel('wyniki');
    expect(await screen.findByTestId('mvd-wyniki-nieznane-kody')).toHaveTextContent('NOWY_KOD');
    expect(screen.queryByTestId('mvd-wyn-th-m:NOWY_KOD')).not.toBeInTheDocument();
  });
});

describe('Zakładka Dowody — pakiet × eksport × rodzaj biegu', () => {
  const pakietDostepny = (runId: string, rodzajPl: string, punkty = [{ target_id: 'bus-odb', nazwa: 'Szyna odbioru' }]) =>
    ok({ run_id: runId, dostepny: true, rodzaj: 'X', rodzaj_pl: rodzajPl, powod_pl: null, punkty, punkty_etykieta_pl: null, zawartosc_pl: [] });
  const pakietBrak = (runId: string, powod: string) =>
    ok({ run_id: runId, dostepny: false, rodzaj: null, rodzaj_pl: null, powod_pl: powod, punkty: [], punkty_etykieta_pl: null, zawartosc_pl: [] });
  const eksport = (runId: string, powody: Partial<Record<'json' | 'latex' | 'pdf', string>>) =>
    ok({
      run_id: runId,
      formaty: (['json', 'latex', 'pdf'] as const).map((format) => ({
        format,
        dostepny: powody[format] === undefined,
        powod_pl: powody[format] ?? null,
      })),
    });

  it('brak zakończonych biegów → stan zerowy z następnym krokiem', () => {
    stubSiec({});
    renderPanel('dowody');
    expect(screen.getByTestId('mvd-dowody-brak')).toHaveTextContent('Oblicz');
  });

  it('każdy bieg: dostępność z serwera, powody braku w wierszu, polecenia nieaktywne z przyczyną', async () => {
    const BRAK_DANYCH = 'Ślad obliczeniowy niedostępny dla tego obliczenia.';
    const BRAK_PDF = 'Eksport PDF wymaga reportlab. Zainstaluj: pip install reportlab';
    const POWOD_PAKIETU = 'Ten rodzaj obliczenia nie ma jeszcze dedykowanego pakietu dowodowego.';
    stubSiec({
      '/api/analysis-runs/r-sc/pakiet-dowodowy/dostepnosc': pakietDostepny('r-sc', 'Zwarcie trójfazowe', [
        { target_id: 'bus-odb', nazwa: 'Szyna odbioru' },
        { target_id: 'bus-gpz', nazwa: 'Szyna GPZ' },
      ]),
      '/api/analysis-runs/r-sc/export/proof/dostepnosc': eksport('r-sc', {}),
      '/api/analysis-runs/r-lf/pakiet-dowodowy/dostepnosc': pakietDostepny('r-lf', 'Rozpływ mocy'),
      '/api/analysis-runs/r-lf/export/proof/dostepnosc': eksport('r-lf', { pdf: BRAK_PDF }),
      '/api/analysis-runs/r-pf/pakiet-dowodowy/dostepnosc': pakietBrak('r-pf', POWOD_PAKIETU),
      '/api/analysis-runs/r-pf/export/proof/dostepnosc': eksport('r-pf', { json: BRAK_DANYCH, latex: BRAK_DANYCH, pdf: BRAK_DANYCH }),
    });
    useExecutionRunsStore.setState({
      runs: [
        run('r-sc', 'SC_3F', '2026-10-03T10:00:00Z'),
        run('r-lf', 'LOAD_FLOW', '2026-10-02T10:00:00Z'),
        run('r-pf', 'PHASE_STATE_SN', '2026-10-01T10:00:00Z'),
        run('r-fail', 'SC_3F', '2026-10-04T10:00:00Z', 3, 'FAILED'),
      ],
    });
    renderPanel('dowody');
    // Tylko biegi zakończone wynikiem, najnowszy na górze; licznik = liczba wierszy.
    const wiersze = [...screen.getByTestId('mvd-dowody').querySelectorAll('li')].map((li) => li.getAttribute('data-testid'));
    expect(wiersze).toEqual(['mvd-dowod-r-sc', 'mvd-dowod-r-lf', 'mvd-dowod-r-pf']);
    expect(screen.getByTestId('mvd-bottom-licznik-dowody')).toHaveTextContent('3');

    // Zwarcie: komplet — pakiet dla pierwszego punktu serwera, wszystkie formaty.
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet-r-sc')).toBeEnabled());
    expect(screen.getByTestId('mvd-dowod-pakiet-opis-r-sc')).toHaveTextContent('Zwarcie trójfazowe — dla: Szyna odbioru');
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-eksport-pdf-r-sc')).toBeEnabled());
    expect(screen.getByTestId('mvd-dowod-eksport-latex-r-sc')).toBeEnabled();
    expect(screen.getByTestId('mvd-dowod-eksport-json-r-sc')).toBeEnabled();
    expect(screen.queryByTestId('mvd-dowod-eksport-powod-r-sc')).not.toBeInTheDocument();

    // Rozpływ: pakiet jest, PDF nie (brak składu) — tylko PDF nieaktywny, z przyczyną.
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-eksport-latex-r-lf')).toBeEnabled());
    expect(screen.getByTestId('mvd-dowod-eksport-pdf-r-lf')).toBeDisabled();
    expect(screen.getByTestId('mvd-dowod-eksport-pdf-r-lf')).toHaveAttribute('title', BRAK_PDF);
    expect(screen.getByTestId('mvd-dowod-eksport-powod-r-lf')).toHaveTextContent(BRAK_PDF);

    // Stan fazowy: pakietu nie ma (powód serwera), eksport bez danych — wszystko nieaktywne.
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet-opis-r-pf')).toHaveTextContent(POWOD_PAKIETU));
    expect(screen.getByTestId('mvd-dowod-pakiet-r-pf')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-eksport-powod-r-pf')).toHaveTextContent(BRAK_DANYCH));
    for (const format of ['pdf', 'latex', 'json']) {
      expect(screen.getByTestId(`mvd-dowod-eksport-${format}-r-pf`)).toBeDisabled();
    }
    // „Otwórz dowód" jest zawsze dostępny dla zakończonego biegu (okno dowodu sam mówi, czego brak).
    expect(screen.getByTestId('mvd-dowod-otworz-r-pf')).toBeEnabled();
  });

  it('polecenia: otwórz dowód TEGO biegu, pobierz pakiet dla punktu z serwera, eksport formatu', async () => {
    const user = userEvent.setup();
    const fetchMock = stubSiec({
      '/api/analysis-runs/r-sc/pakiet-dowodowy/dostepnosc': pakietDostepny('r-sc', 'Zwarcie trójfazowe'),
      '/api/analysis-runs/r-sc/export/proof/dostepnosc': eksport('r-sc', {}),
      '/api/analysis-runs/r-sc/pakiet-dowodowy?punkt=bus-odb': ok({}),
      '/api/analysis-runs/r-sc/export/proof/latex': ok({}),
    });
    useExecutionRunsStore.setState({ runs: [run('r-sc', 'SC_3F', '2026-10-03T10:00:00Z')] });
    const p = renderPanel('dowody');
    await user.click(screen.getByTestId('mvd-dowod-otworz-r-sc'));
    expect(p.onOtworzDowodBiegu).toHaveBeenCalledWith('r-sc');

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-pakiet-r-sc')).toBeEnabled());
    await user.click(screen.getByTestId('mvd-dowod-pakiet-r-sc'));
    expect(await screen.findByTestId('mvd-dowod-wynik-r-sc')).toHaveTextContent('Pobrano pakiet: plik.zip');

    await waitFor(() => expect(screen.getByTestId('mvd-dowod-eksport-latex-r-sc')).toBeEnabled());
    await user.click(screen.getByTestId('mvd-dowod-eksport-latex-r-sc'));
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-wynik-r-sc')).toHaveTextContent('LaTeX'));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain('/api/analysis-runs/r-sc/export/proof/latex');
  });

  it('błąd bramy eksportu → polecenia nieaktywne z przyczyną, nie aktywne „na wszelki wypadek"', async () => {
    stubSiec({
      '/api/analysis-runs/r-sc/pakiet-dowodowy/dostepnosc': { ok: false, status: 500, body: { detail: 'awaria' } },
      '/api/analysis-runs/r-sc/export/proof/dostepnosc': { ok: false, status: 500, body: { detail: 'awaria' } },
    });
    useExecutionRunsStore.setState({ runs: [run('r-sc', 'SC_3F', '2026-10-03T10:00:00Z')] });
    renderPanel('dowody');
    await waitFor(() => expect(screen.getByTestId('mvd-dowod-eksport-powod-r-sc')).toHaveTextContent('awaria'));
    expect(screen.getByTestId('mvd-dowod-pakiet-opis-r-sc')).toHaveTextContent('awaria');
    expect(screen.getByTestId('mvd-dowod-pakiet-r-sc')).toBeDisabled();
    expect(screen.getByTestId('mvd-dowod-eksport-pdf-r-sc')).toBeDisabled();
  });

  it('bez celu „Otwórz dowód" polecenie jest nieaktywne (zero martwego kliku)', () => {
    stubSiec({
      '/api/analysis-runs/r-sc/pakiet-dowodowy/dostepnosc': pakietDostepny('r-sc', 'Zwarcie trójfazowe'),
      '/api/analysis-runs/r-sc/export/proof/dostepnosc': eksport('r-sc', {}),
    });
    useExecutionRunsStore.setState({ runs: [run('r-sc', 'SC_3F', '2026-10-03T10:00:00Z')] });
    renderPanel('dowody', { onOtworzDowodBiegu: undefined });
    expect(screen.getByTestId('mvd-dowod-otworz-r-sc')).toBeDisabled();
  });
});
