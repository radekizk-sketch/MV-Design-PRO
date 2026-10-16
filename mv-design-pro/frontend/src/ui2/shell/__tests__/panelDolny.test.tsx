/*
 * Panel dolny powłoki (karta K1 POWLOKA) — dawniej atrapa „zawartość w kolejnym
 * kroku", teraz zakładki z realną treścią. Testy jako ILOCZYN CECH, klik natywny:
 *
 *   * zakładka {Problemy, Przebiegi, Dziennik} × stan danych {nieustalony/brak
 *     zakresu, pusty, z wpisami, błąd odczytu} × akcja wiersza (z celem / bez celu);
 *   * wysokość × wejście {klawiatura góra/dół, przeciąganie wskaźnikiem} × granica
 *     {wewnątrz, przy minimum, przy maksimum};
 *   * zakładki × klawiatura (strzałki z zawinięciem);
 *   * wejście z paska stanu (rewizja → Dziennik, przebieg → Przebiegi) na pełnej powłoce.
 *
 * Dziennik czyta PRODUKCYJNY klient `pobierzDziennikZmian` — zaślepiona jest tylko
 * sieć (`fetch`) w kształcie `GET /api/cases/{id}/enm/dziennik-zmian`.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelDolny } from '../panelDolny/PanelDolny';
import { ZAKLADKI_PANELU_DOLNEGO } from '../panelDolny/rejestrZakladek';
import { uporzadkujPrzebiegi } from '../panelDolny/ZakladkaPrzebiegi';
import { AppShell } from '../AppShell';
import { BOTTOM_DEFAULT, BOTTOM_MAX, BOTTOM_MIN, useShellStore } from '../useShellStore';
import { SHELL_STRINGS } from '../strings';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useAppStateStore } from '../../../ui/app-state';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import type { ReadinessInfo } from '../../../types/enm';

const CASE_ID = 'case-dolny';

const initialSnapshot = useSnapshotStore.getState();
const initialRuns = useExecutionRunsStore.getState();
const initialApp = useAppStateStore.getState();

function run(id: string, status: ExecutionRun['status'], finished: string | null): ExecutionRun {
  return {
    id,
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'sha',
    status,
    started_at: finished,
    finished_at: finished,
    error_message: null,
  };
}

function wpis(rewizja: number, zmienione: string[], utworzone: string[] = []) {
  return {
    rewizja,
    znacznik_czasu: `2026-10-0${rewizja}T10:00:00Z`,
    operacja: 'update_element_parameters',
    opis_pl: `Zmiana nr ${rewizja}`,
    utworzone,
    zmienione,
    usuniete: [],
    liczba_elementow: utworzone.length + zmienione.length,
  };
}

function stubDziennik(odpowiedz: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn(async (_url: string) => ({
    ok: odpowiedz.ok,
    status: odpowiedz.status,
    json: async () => odpowiedz.body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPanel(aktywna: string, over: Partial<Parameters<typeof PanelDolny>[0]> = {}) {
  const akcje = {
    onWybierzZakladke: vi.fn<[string], void>(),
    onZmienWysokosc: vi.fn<[number], void>(),
    onZamknij: vi.fn<[], void>(),
    onWybierzElement: vi.fn<[string], void>(),
    onPokazWynikiBiegu: vi.fn<[string], void>(),
  };
  render(
    <PanelDolny
      zakladki={ZAKLADKI_PANELU_DOLNEGO}
      aktywna={aktywna}
      wysokosc={BOTTOM_DEFAULT}
      {...akcje}
      {...over}
    />,
  );
  return akcje;
}

beforeEach(() => {
  localStorage.clear();
  useSnapshotStore.setState(initialSnapshot, true);
  useExecutionRunsStore.setState(initialRuns, true);
  useAppStateStore.setState(initialApp, true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Rejestr zakładek panelu dolnego', () => {
  it('Problemy, Przebiegi, Dziennik operacji — w tej kolejności, unikalne identyfikatory', () => {
    expect(ZAKLADKI_PANELU_DOLNEGO.map((z) => z.etykieta)).toEqual([
      SHELL_STRINGS.bottomProblemy,
      SHELL_STRINGS.bottomPrzebiegi,
      SHELL_STRINGS.bottomDziennik,
    ]);
    const ids = ZAKLADKI_PANELU_DOLNEGO.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejestr jest rozszerzalny: dopisana zakładka renderuje się bez zmiany panelu', async () => {
    const user = userEvent.setup();
    const Dodatkowa = () => <p data-testid="tresc-dodatkowa">treść</p>;
    const p = renderPanel('wyniki', {
      zakladki: [...ZAKLADKI_PANELU_DOLNEGO, { id: 'wyniki', etykieta: 'Wyniki', Tresc: Dodatkowa }],
    });
    expect(screen.getByTestId('tresc-dodatkowa')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-bottom-tab-problemy'));
    expect(p.onWybierzZakladke).toHaveBeenCalledWith('problemy');
  });

  it('nieznany identyfikator zakładki → pierwsza zakładka (zapis z dawnej wersji)', () => {
    renderPanel('nieistniejaca');
    expect(screen.getByTestId('mvd-bottom-tab-problemy')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Panel dolny — zakładki i klawiatura', () => {
  for (const [klawisz, start, oczekiwana] of [
    ['{ArrowRight}', 'problemy', 'przebiegi'],
    ['{ArrowRight}', 'dziennik', 'problemy'],
    ['{ArrowLeft}', 'problemy', 'dziennik'],
    ['{ArrowLeft}', 'przebiegi', 'problemy'],
  ] as const) {
    it(`${klawisz} na zakładce ${start} → ${oczekiwana}`, async () => {
      const user = userEvent.setup();
      stubDziennik({ ok: true, status: 200, body: { case_id: CASE_ID, rewizja_biezaca: 0, od_rewizji: 0, aktualny: true, wpisy: [] } });
      const p = renderPanel(start);
      screen.getByTestId(`mvd-bottom-tab-${start}`).focus();
      await user.keyboard(klawisz);
      expect(p.onWybierzZakladke).toHaveBeenLastCalledWith(oczekiwana);
    });
  }

  it('zamknięcie panelu przyciskiem', async () => {
    const user = userEvent.setup();
    const p = renderPanel('problemy');
    await user.click(screen.getByTestId('mvd-bottom-close'));
    expect(p.onZamknij).toHaveBeenCalledTimes(1);
  });
});

describe('Panel dolny — wysokość: wejście × granica', () => {
  for (const [opis, wysokosc, klawisz, oczekiwana] of [
    ['strzałka w górę wewnątrz granic', BOTTOM_DEFAULT, '{ArrowUp}', BOTTOM_DEFAULT + 24],
    ['strzałka w dół wewnątrz granic', BOTTOM_DEFAULT, '{ArrowDown}', BOTTOM_DEFAULT - 24],
    ['strzałka w górę przy maksimum', BOTTOM_MAX, '{ArrowUp}', BOTTOM_MAX],
    ['strzałka w dół przy minimum', BOTTOM_MIN, '{ArrowDown}', BOTTOM_MIN],
  ] as const) {
    it(opis, async () => {
      const user = userEvent.setup();
      const p = renderPanel('problemy', { wysokosc });
      const uchwyt = screen.getByTestId('mvd-bottom-handle');
      expect(uchwyt).toHaveAttribute('aria-valuenow', String(wysokosc));
      uchwyt.focus();
      await user.keyboard(klawisz);
      expect(p.onZmienWysokosc).toHaveBeenLastCalledWith(oczekiwana);
    });
  }

  for (const [opis, przesuniecie, oczekiwana] of [
    ['przeciąganie w górę powiększa', -60, BOTTOM_DEFAULT + 60],
    ['przeciąganie w dół zmniejsza', 50, BOTTOM_DEFAULT - 50],
    ['przeciąganie ponad maksimum jest przycinane', -2000, BOTTOM_MAX],
    ['przeciąganie poniżej minimum jest przycinane', 2000, BOTTOM_MIN],
  ] as const) {
    it(opis, () => {
      // Przeciąganie: jsdom nie ma klasy `PointerEvent`, więc `fireEvent.pointerDown`
      // gubi `clientY`; zdarzenia wskaźnika budujemy na `MouseEvent` (niesie
      // współrzędne) — ten sam tor co w przeglądarce: pointerdown na uchwycie
      // (delegacja Reacta), pointermove/pointerup na oknie.
      const p = renderPanel('problemy');
      fireEvent(
        screen.getByTestId('mvd-bottom-handle'),
        new MouseEvent('pointerdown', { clientY: 500, bubbles: true }),
      );
      fireEvent(window, new MouseEvent('pointermove', { clientY: 500 + przesuniecie }));
      fireEvent(window, new MouseEvent('pointerup'));
      expect(p.onZmienWysokosc).toHaveBeenLastCalledWith(oczekiwana);
      // Po puszczeniu ruch wskaźnika nie zmienia już wysokości.
      p.onZmienWysokosc.mockClear();
      fireEvent(window, new MouseEvent('pointermove', { clientY: 100 }));
      expect(p.onZmienWysokosc).not.toHaveBeenCalled();
    });
  }

  it('wysokość spoza granic z magazynu jest przycinana w renderze', () => {
    renderPanel('problemy', { wysokosc: 9999 });
    expect(screen.getByTestId('mvd-bottom-panel').style.height).toBe(`${BOTTOM_MAX}px`);
  });
});

describe('Zakładka Problemy — stan gotowości × akcja wiersza', () => {
  it('gotowość nieodczytana ≠ brak problemów', () => {
    renderPanel('problemy');
    expect(screen.getByTestId('mvd-problemy-nieustalone')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-problemy-brak')).not.toBeInTheDocument();
  });

  it('gotowość policzona bez uwag → „brak problemów"', () => {
    useSnapshotStore.setState({ readiness: { ready: true, blockers: [], warnings: [] } });
    renderPanel('problemy');
    expect(screen.getByTestId('mvd-problemy-brak')).toBeInTheDocument();
  });

  it('blokada z elementem: klik zaznacza element; ostrzeżenie bez elementu jest statyczne', async () => {
    const user = userEvent.setup();
    const readiness: ReadinessInfo = {
      ready: false,
      blockers: [{ code: 'E005', message_pl: 'Szyna bez napięcia znamionowego.', element_ref: 'BUS-7', severity: 'BLOCKER' }],
      warnings: [{ code: 'W002', message_pl: 'Brak długości odcinka.', element_ref: null, severity: 'WARNING' }],
    };
    useSnapshotStore.setState({ readiness, fixActions: [] });
    const p = renderPanel('problemy');
    const blokada = screen.getByTestId('mvd-problem-0');
    expect(blokada.tagName).toBe('BUTTON');
    expect(blokada).toHaveTextContent('Blokada');
    expect(blokada).toHaveTextContent('Szyna bez napięcia znamionowego.');
    const ostrzezenie = screen.getByTestId('mvd-problem-1');
    expect(ostrzezenie.tagName).toBe('DIV');
    expect(ostrzezenie).toHaveTextContent('Ostrzeżenie');
    await user.click(blokada);
    expect(p.onWybierzElement).toHaveBeenCalledWith('BUS-7');
    await user.click(ostrzezenie);
    expect(p.onWybierzElement).toHaveBeenCalledTimes(1);
  });
});

describe('Zakładka Przebiegi — stan × akcja', () => {
  it('brak przebiegów → uczciwy stan zerowy z następnym krokiem', () => {
    renderPanel('przebiegi');
    expect(screen.getByTestId('mvd-przebiegi-brak')).toHaveTextContent('Oblicz');
  });

  it('kolejność deterministyczna: najnowszy na górze, remis po identyfikatorze', () => {
    const runs = [
      run('a', 'DONE', '2026-10-01T10:00:00Z'),
      run('c', 'DONE', '2026-10-02T10:00:00Z'),
      run('b', 'DONE', '2026-10-02T10:00:00Z'),
    ];
    expect(uporzadkujPrzebiegi(runs).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(uporzadkujPrzebiegi([...runs].reverse()).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('DONE prowadzi do wyników; FAILED i RUNNING są statyczne', async () => {
    const user = userEvent.setup();
    useExecutionRunsStore.setState({
      runs: [
        run('r-done', 'DONE', '2026-10-03T10:00:00Z'),
        run('r-fail', 'FAILED', '2026-10-02T10:00:00Z'),
        run('r-run', 'RUNNING', null),
      ],
    });
    const p = renderPanel('przebiegi');
    expect(screen.getByTestId('mvd-przebieg-r-done').tagName).toBe('BUTTON');
    expect(screen.getByTestId('mvd-przebieg-r-fail').tagName).toBe('DIV');
    expect(screen.getByTestId('mvd-przebieg-r-run').tagName).toBe('DIV');
    await user.click(screen.getByTestId('mvd-przebieg-r-done'));
    expect(p.onPokazWynikiBiegu).toHaveBeenCalledWith('r-done');
  });

  it('bez celu wyników zakończony przebieg jest statyczny (zero martwego kliku)', () => {
    useExecutionRunsStore.setState({ runs: [run('r-done', 'DONE', '2026-10-03T10:00:00Z')] });
    renderPanel('przebiegi', { onPokazWynikiBiegu: undefined });
    expect(screen.getByTestId('mvd-przebieg-r-done').tagName).toBe('DIV');
  });
});

describe('Zakładka Dziennik — odczyt z serwera × stan × akcja', () => {
  it('brak aktywnego zakresu → komunikat, bez zapytania do serwera', () => {
    const fetchMock = stubDziennik({ ok: true, status: 200, body: {} });
    renderPanel('dziennik');
    expect(screen.getByTestId('mvd-dziennik-brak-zakresu')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wpisy: najnowsza rewizja na górze, liczniki, „Pokaż element" zaznacza pierwszy element', async () => {
    const user = userEvent.setup();
    useAppStateStore.setState({ activeCaseId: CASE_ID });
    const fetchMock = stubDziennik({
      ok: true,
      status: 200,
      body: {
        case_id: CASE_ID,
        rewizja_biezaca: 3,
        od_rewizji: 0,
        aktualny: false,
        wpisy: [wpis(1, [], ['BUS-1', 'BUS-2']), wpis(3, ['LIN-4']), wpis(2, [])],
      },
    });
    const p = renderPanel('dziennik');
    expect(screen.getByTestId('mvd-dziennik-wczytywanie')).toBeInTheDocument();
    const lista = await screen.findByTestId('mvd-dziennik');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/cases/${CASE_ID}/enm/dziennik-zmian?od_rewizji=0`);
    const wiersze = [...lista.querySelectorAll('li')].map((li) => li.getAttribute('data-testid'));
    expect(wiersze).toEqual(['mvd-dziennik-3', 'mvd-dziennik-2', 'mvd-dziennik-1']);
    expect(screen.getByTestId('mvd-dziennik-1')).toHaveTextContent('+2 / ~0 / −0');
    // Wpis bez elementów nie ma akcji (zero martwego kliku).
    expect(screen.queryByTestId('mvd-dziennik-pokaz-2')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-dziennik-pokaz-3'));
    expect(p.onWybierzElement).toHaveBeenCalledWith('LIN-4');
    await user.click(screen.getByTestId('mvd-dziennik-pokaz-1'));
    expect(p.onWybierzElement).toHaveBeenLastCalledWith('BUS-1');
  });

  it('pusty dziennik → stan zerowy', async () => {
    useAppStateStore.setState({ activeCaseId: CASE_ID });
    stubDziennik({ ok: true, status: 200, body: { case_id: CASE_ID, rewizja_biezaca: 0, od_rewizji: 0, aktualny: true, wpisy: [] } });
    renderPanel('dziennik');
    expect(await screen.findByTestId('mvd-dziennik-pusty')).toBeInTheDocument();
  });

  for (const [opis, odpowiedz, fragment] of [
    ['błąd HTTP', { ok: false, status: 500, body: {} }, 'HTTP 500'],
    ['zły kształt odpowiedzi', { ok: true, status: 200, body: { wpisy: 'x' } }, 'nieoczekiwany kształt'],
  ] as const) {
    it(`${opis} → komunikat błędu (rola alert), nie pusty dziennik`, async () => {
      useAppStateStore.setState({ activeCaseId: CASE_ID });
      stubDziennik(odpowiedz);
      renderPanel('dziennik');
      const blad = await screen.findByTestId('mvd-dziennik-blad');
      expect(blad).toHaveAttribute('role', 'alert');
      expect(blad).toHaveTextContent(fragment);
      expect(screen.queryByTestId('mvd-dziennik-pusty')).not.toBeInTheDocument();
    });
  }

  it('zmiana rewizji modelu ponawia odczyt dziennika', async () => {
    useAppStateStore.setState({ activeCaseId: CASE_ID });
    const fetchMock = stubDziennik({
      ok: true,
      status: 200,
      body: { case_id: CASE_ID, rewizja_biezaca: 1, od_rewizji: 0, aktualny: true, wpisy: [wpis(1, ['BUS-1'])] },
    });
    renderPanel('dziennik');
    await screen.findByTestId('mvd-dziennik');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      useSnapshotStore.setState({
        snapshot: { header: { revision: 2 } } as unknown as ReturnType<typeof useSnapshotStore.getState>['snapshot'],
      });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('Pełna powłoka — pasek stanu otwiera właściwą zakładkę panelu dolnego', () => {
  beforeEach(() => {
    useShellStore.setState({
      activeSpace: 'projekt',
      szczegolyAudytowe: false,
      bottomPanelOpen: false,
      bottomPanelTab: 'problemy',
      layoutBySpace: {},
    });
  });

  for (const [pozycja, zakladka] of [
    ['mvd-status-model', 'dziennik'],
    ['mvd-status-run', 'przebiegi'],
  ] as const) {
    it(`${pozycja} → zakładka ${zakladka}`, async () => {
      const user = userEvent.setup();
      stubDziennik({ ok: true, status: 200, body: {} });
      render(<AppShell onWybierzElement={vi.fn()} />);
      expect(screen.queryByTestId('mvd-bottom-panel')).not.toBeInTheDocument();
      await user.click(screen.getByTestId(pozycja));
      expect(screen.getByTestId('mvd-bottom-panel')).toBeInTheDocument();
      expect(screen.getByTestId(`mvd-bottom-tab-${zakladka}`)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId(`mvd-bottom-tresc-${zakladka}`)).toBeInTheDocument();
    });
  }

  it('„Panel dolny" z menu Widok otwiera i zamyka panel', async () => {
    const user = userEvent.setup();
    render(<AppShell onWybierzElement={vi.fn()} />);
    await user.click(screen.getByTestId('mvd-view-menu'));
    await user.click(screen.getByTestId('mvd-toggle-bottom'));
    expect(screen.getByTestId('mvd-bottom-panel')).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-bottom-close'));
    expect(screen.queryByTestId('mvd-bottom-panel')).not.toBeInTheDocument();
  });
});
