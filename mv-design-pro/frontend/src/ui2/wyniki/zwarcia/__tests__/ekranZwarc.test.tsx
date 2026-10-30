import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { INSPECTOR_STRINGS, znacznikNieaktualne } from '../../../inspector';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { konfiguracjaBieguFixture, shortCircuitResultsFixture, wkladyFixture } from './fixtures';
import { atrapaFetchPasma, renderEkranZwarc } from './renderEkranZwarc';
import userEvent from '@testing-library/user-event';
import { useZadanieCzasuTb } from '../../../spaces/obliczenia/scenariusze/zadanieCzasuTb';
import { useShellStore } from '../../../shell/useShellStore';

// Karta UI2 p.9 (test klasy §2: {koperta obecna, koperta nieobecna} × {rozpływ,
// zbieżność, ZWARCIA}) — trzeci człon macierzy, dotąd nietestowany w tym pliku
// (blankietowa atrapa `fetch` 404 z `renderEkranZwarc.tsx` domyślnie tłumiła
// realny `useAnalysisRunContract`, więc znacznik nigdy się nie pokazywał —
// mockowany tu tak samo jak w `tabelaSzyn.test.tsx`/`ekranZbieznosci.test.tsx`).
const kontraktMock = vi.fn();
vi.mock('../../../../ui/workspace/analysisRunContract', () => ({
  useAnalysisRunContract: (runId: string | null) => kontraktMock(runId),
}));

function props(over: Partial<Parameters<typeof EkranZwarc>[0]> = {}) {
  return {
    szczegolyAudytowe: false as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
  // Pasmo MIN/MAX (W3-G3) pobiera się efektem przy KAŻDYM renderze z biegiem —
  // atrapa i render z odczekaniem w `renderEkranZwarc.tsx` (jedno miejsce dla
  // wszystkich plików testów ekranu zwarć).
  atrapaFetchPasma();
  kontraktMock.mockReset();
  kontraktMock.mockReturnValue({ data: null, isLoading: false, error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ustawWynik() {
  useResultsInspectorStore.setState({
    shortCircuitResults: shortCircuitResultsFixture(),
    selectedRunId: 'sc-run-1',
  });
}

describe('EkranZwarc — panel „Bilans IEC 60909" (ZWARCIA-PRO F1)', () => {
  beforeEach(ustawWynik);

  it('bilans wybranego punktu pokazuje komplet wielkosci z wiersza kanonicznego', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    // Wielkosci impedancyjne i wspolczynniki (z FROZEN solvera, format PL).
    expect(within(bilans).getByText(ZWARCIA_STRINGS.bilansZk)).toBeInTheDocument();
    expect(within(bilans).getByText('0,7777 Ω')).toBeInTheDocument();
    expect(within(bilans).getByText('1,728')).toBeInTheDocument(); // kappa
    expect(within(bilans).getByText('9,416')).toBeInTheDocument(); // X/R
    expect(within(bilans).getByText('1,100')).toBeInTheDocument(); // c
    // Podstawa c TEGO węzła (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK) — tekst backendu.
    expect(within(bilans).getByText(ZWARCIA_STRINGS.bilansCZrodlo)).toBeInTheDocument();
    expect(within(bilans).getByText('IEC 60909-0 tab. 1, pasmo SN, MAX')).toBeInTheDocument();
    expect(within(bilans).getByText('15,0 kV')).toBeInTheDocument(); // Un
    expect(within(bilans).getByText('156,250 kA²·s')).toBeInTheDocument(); // I2t
  });

  it('klik innego wiersza przelacza bilans na ten punkt', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[2]); // BUS-ST2 — starszy wynik bez bilansu
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    // Uczciwe kreski (kontrakt addytywny — brak fabrykacji).
    expect(within(bilans).queryByText('0,7777 Ω')).not.toBeInTheDocument();
    const kreski = within(bilans)
      .getAllByRole('definition')
      .filter((el) => el.textContent === ZWARCIA_STRINGS.kreska);
    // 18 pozycji bilansu. Karta TB-WARTOSC-ROBOCZA: t_b rozstrzyga się w każdym punkcie,
    // stan „nie obliczono — bieg bez tb" nie istnieje — wiersz bez wyniku solvera ma
    // uczciwe kreski także przy Ib, iDC(tb) i tb (18 kresek), bez etykiety wartości roboczej.
    expect(kreski.length).toBe(18);
    expect(within(bilans).queryByTestId('mvd-zwarcia-bilans-tb-robocza')).not.toBeInTheDocument();
  });

  it('kolumny impedancyjne (Rk/Xk/|Zk|/X/R/kappa) w trybie eksperckim, ukryte w podstawowym', async () => {
    const { unmount } = await renderEkranZwarc(<EkranZwarc {...props({ szczegolyAudytowe: true })} />);
    expect(screen.getByTestId('mvd-wyn-th-zk')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-th-kappa')).toBeInTheDocument();
    unmount();
    ustawWynik();
    await renderEkranZwarc(<EkranZwarc {...props({ szczegolyAudytowe: false })} />);
    expect(screen.queryByTestId('mvd-wyn-th-zk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-th-kappa')).not.toBeInTheDocument();
  });
});

// Karta TB-WARTOSC-ROBOCZA — akcja „Zmień wartość" przy t_b roboczym prowadzi do t_b
// scenariusza zwarciowego: iloczyn {bieg ze scenariusza · bieg przypadku bez scenariusza} ×
// {t_b robocze · t_b projektanta}. Klik natywny (userEvent), Zero-Debt pkt 5.
describe('EkranZwarc — t_b punktu: wartość robocza i „Zmień wartość"', () => {
  const TB_ROBOCZE = {
    wartosc_s: 0.1,
    pochodzenie: 'PROPOZYCJA' as const,
    wartosc_robocza: true,
    jakosc: 'ESTIMATED' as const,
    opis_pl: 't_b = 0,1 s — wartość robocza (węzeł tablicy μ IEC 60909-0:2016 …).',
    zrodlo_pl: 'węzeł tablicy μ IEC 60909-0:2016 (rys. 16 / wzory (70)–(73), t_min = 0,1 s)',
  };

  function ustawBieg(scenariuszId: string | undefined, robocze: boolean) {
    const wyniki = shortCircuitResultsFixture({
      konfiguracja_biegu: konfiguracjaBieguFixture({
        breaking_time_seconds: robocze
          ? { wartosc: null, pochodzenie: 'punkt_zwarcia', opis_pl: 'Reguła punktu zwarcia.' }
          : { wartosc: 0.08, pochodzenie: 'opcje_biegu' },
        ...(scenariuszId === undefined ? {} : { scenariusz_zwarciowy_id: scenariuszId }),
      }),
    });
    wyniki.rows[0] = robocze
      ? { ...wyniki.rows[0], tb_s: 0.1, tb_zrodlo: TB_ROBOCZE }
      : { ...wyniki.rows[0], tb_s: 0.08, tb_zrodlo: undefined };
    useResultsInspectorStore.setState({ shortCircuitResults: wyniki, selectedRunId: 'sc-run-1' });
  }

  beforeEach(() => {
    useZadanieCzasuTb.setState({ zadanie: null });
    useShellStore.getState().setActiveSpace('wyniki');
  });

  it.each([
    ['bieg ze scenariusza → edycja t_b TEGO scenariusza', 'scn-7', 'scn-7'],
    ['bieg przypadku bez scenariusza → nowy scenariusz z polem t_b', undefined, null],
  ] as const)('%s', async (_n, scenariuszId, oczekiwany) => {
    ustawBieg(scenariuszId, true);
    const user = userEvent.setup();
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    expect(within(bilans).getByTestId('mvd-zwarcia-bilans-tb-robocza')).toHaveTextContent(
      ZWARCIA_STRINGS.bilansTbRobocza,
    );
    expect(within(bilans).getByTestId('mvd-zwarcia-bilans-tb-zrodlo')).toHaveTextContent(TB_ROBOCZE.opis_pl);
    await user.click(within(bilans).getByTestId('mvd-zwarcia-bilans-tb-zmien'));
    expect(useZadanieCzasuTb.getState().zadanie).toEqual({ scenarioId: oczekiwany });
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('t_b projektanta → bez etykiety, bez źródła i bez akcji (predykat parami)', async () => {
    ustawBieg('scn-7', false);
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    expect(within(bilans).getByText('0,08 s')).toBeInTheDocument();
    expect(within(bilans).queryByTestId('mvd-zwarcia-bilans-tb-robocza')).not.toBeInTheDocument();
    expect(within(bilans).queryByTestId('mvd-zwarcia-bilans-tb-zrodlo')).not.toBeInTheDocument();
    expect(within(bilans).queryByTestId('mvd-zwarcia-bilans-tb-zmien')).not.toBeInTheDocument();
    expect(useZadanieCzasuTb.getState().zadanie).toBeNull();
  });
});

describe('EkranZwarc — stan pusty (brak wyniku w store)', () => {
  it('bez wyniku: komunikat PL zamiast tabeli', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    expect(screen.getByText(ZWARCIA_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — znacznik świeżości nagłówka (karta UI2 p.9, V12K-264)', () => {
  // Dowód, że pozycja 2 historii domknięcia w `zwarciaModel.ts` ("FreshnessBadge
  // się pokazuje") jest FAKTEM: `useSwiezoscNaglowka(runId)` musi być realnie
  // wpięty w `naglowek`, nie tylko architektonicznie dostępny.
  beforeEach(ustawWynik);

  it('rewizja biegu ≠ bieżąca rewizja modelu → FreshnessBadge „nieaktualne (rew. a → b)"', async () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: 3 } },
      isLoading: false,
      error: null,
    });

    await renderEkranZwarc(<EkranZwarc {...props()} />);

    expect(screen.getByText(znacznikNieaktualne(3, 5))).toBeInTheDocument();
  });

  it('rewizja biegu = bieżąca rewizja modelu → FreshnessBadge „aktualne"', async () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: 5 } },
      isLoading: false,
      error: null,
    });

    await renderEkranZwarc(<EkranZwarc {...props()} />);

    expect(screen.getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
  });

  it('kontrakt biegu bez koperty rewizji (bieg sprzed CV-2) → BRAK znacznika (zero zgadywania)', async () => {
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: 5 } as never);
    kontraktMock.mockReturnValue({
      data: { analysisCaseContext: { rewizjaModelu: null } },
      isLoading: false,
      error: null,
    });

    await renderEkranZwarc(<EkranZwarc {...props()} />);

    expect(screen.queryByText(INSPECTOR_STRINGS.aktualne)).not.toBeInTheDocument();
    expect(screen.queryByText(/nieaktualne/i)).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — konkretyzacja wzorca na realnym kształcie danych', () => {
  beforeEach(ustawWynik);

  it('nagłówek: nazwa analizy PL', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    expect(screen.getByText(ZWARCIA_STRINGS.analiza)).toBeInTheDocument();
  });

  it('założenia: metoda IEC 60909 oraz c/czas z konfiguracji ZAPISANEJ na biegu (nie z aktywnego przypadku)', async () => {
    // Karta TODO-UI2 p.7: c/czas cieplny pochodzą z `wynik.konfiguracja_biegu`
    // (odpowiedź endpointu wyników TEGO biegu), nie z propsów zasilanych
    // wcześniej aktywnym przypadkiem obliczeniowym.
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        konfiguracja_biegu: konfiguracjaBieguFixture({
          c_factor: { tryb: 'nadpisanie', wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' },
          thermal_time_seconds: { wartosc: 1.0, pochodzenie: 'opcje_biegu' },
        }),
      }),
      selectedRunId: 'sc-run-1',
    });
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ZWARCIA_STRINGS.zalMetoda)).toBeInTheDocument();
    expect(within(zalozenia).getByText('IEC 60909')).toBeInTheDocument();
    expect(within(zalozenia).getByText(ZWARCIA_STRINGS.zalWspolczynnikC)).toBeInTheDocument();
    expect(
      within(zalozenia).getByText('1,05 — nadpisanie ręczne: Uzgodnienie z OSD'),
    ).toBeInTheDocument();
  });

  it('założenia: c auto-per-węzeł (bez jawnego override) pokazuje uczciwy opis, nie liczbę', async () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        konfiguracja_biegu: konfiguracjaBieguFixture({
          c_factor: { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
          scenariusz: 'MIN',
        }),
      }),
      selectedRunId: 'sc-run-1',
    });
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(
      within(zalozenia).getByText(ZWARCIA_STRINGS.zalWspolczynnikCAuto('MIN')),
    ).toBeInTheDocument();
  });

  it('założenia: brak konfiguracji biegu (starszy zapis) → kreska uczciwa, nie zgadnięta liczba', async () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({ konfiguracja_biegu: undefined }),
      selectedRunId: 'sc-run-1',
    });
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ZWARCIA_STRINGS.zalWspolczynnikC)).toBeInTheDocument();
    expect(within(zalozenia).getAllByText(ZWARCIA_STRINGS.kreska).length).toBeGreaterThan(0);
  });

  it('tabela: wiersz per punkt, wielkości Ik"/ip/Ith/Sk" z jednostkami w nagłówkach', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('12,345')).toBeInTheDocument();
    expect(tabela.getByText('320,8')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-ikss')).getByText(`[${ZWARCIA_STRINGS.jednKA}]`)).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-sk')).getByText(`[${ZWARCIA_STRINGS.jednMVA}]`)).toBeInTheDocument();
  });

  it('wartości null renderowane jako „—"', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    // Wiersz BUS-ST2 ma wszystkie wielkości null → co najmniej 4 kreski w tabeli.
    expect(tabela.getAllByText(ZWARCIA_STRINGS.kreska).length).toBeGreaterThanOrEqual(4);
  });

  it('rodzaj zwarcia mapowany na polską nazwę', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('zwarcie trójfazowe')).toBeInTheDocument();
    expect(tabela.getByText('zwarcie jednofazowe (doziemne)')).toBeInTheDocument();
  });

  it('podwójne kliknięcie na wartości Ik" → onOtworzDowod z ref (element_id)', async () => {
    const onOtworzDowod = vi.fn();
    await renderEkranZwarc(<EkranZwarc {...props({ onOtworzDowod })} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    fireEvent.doubleClick(tabela.getByText('12,345'));
    expect(onOtworzDowod).toHaveBeenCalledWith('EL-GPZ');
  });

  it('sortowanie po kolumnie liczbowej (Sk") — malejąco po dwóch kliknięciach', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const thSk = within(screen.getByTestId('mvd-wyn-th-sk')).getByRole('button');
    fireEvent.click(thSk); // rosnąco
    fireEvent.click(thSk); // malejąco
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    const pierwszy = within(wiersze[0]);
    expect(pierwszy.getByText('320,8')).toBeInTheDocument(); // największe Sk" na górze
  });

  it('identyfikatory punktu i przebiegu nie stoją na pierwszym planie w żadnym trybie (karta #145)', async () => {
    const { rerender } = await renderEkranZwarc(<EkranZwarc {...props({ szczegolyAudytowe: false })} />);
    expect(screen.queryByTestId('mvd-wyn-th-identyfikator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-informacje-audytowe')).not.toBeInTheDocument();
    rerender(<EkranZwarc {...props({ szczegolyAudytowe: true })} />);
    expect(screen.queryByTestId('mvd-wyn-th-identyfikator')).not.toBeInTheDocument();
    // Karta #145: identyfikator przebiegu wyłącznie w „Informacjach audytowych" (zwinięte).
    fireEvent.click(screen.getByTestId('mvd-wyn-informacje-audytowe-przelacz'));
    expect(screen.getByTestId('mvd-wyn-informacje-audytowe-lista')).toHaveTextContent('sc-run-1');
  });

  it('wykres słupkowy Ik" obecny w slocie wykresu', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const slot = screen.getByTestId('mvd-wyn-wykres');
    expect(within(slot).getByTestId('mvd-zwarcia-wykres')).toBeInTheDocument();
    expect(within(slot).getByText(ZWARCIA_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('przełącznik wielkości w slocie wykresu — klik Sk" zmienia podpis (karta W-A F2)', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const slot = screen.getByTestId('mvd-wyn-wykres');
    fireEvent.click(within(slot).getByTestId('mvd-zwarcia-wykres-btn-sk'));
    expect(within(slot).getByText(ZWARCIA_STRINGS.wykresTytulSk)).toBeInTheDocument();
    expect(within(slot).queryByText(ZWARCIA_STRINGS.wykresTytul)).not.toBeInTheDocument();
  });

  it('onEksport przekazany do stopki wzorca', async () => {
    const onEksport = vi.fn();
    await renderEkranZwarc(<EkranZwarc {...props({ onEksport })} />);
    screen.getByRole('button', { name: WZORZEC_STRINGS.eksport }).click();
    expect(onEksport).toHaveBeenCalledTimes(1);
  });
});

describe('EkranZwarc — wybór punktu i sekcja wkładów', () => {
  beforeEach(ustawWynik);

  it('domyślnie wybrany pierwszy punkt; wkłady z propsów renderowane w tabeli', async () => {
    await renderEkranZwarc(<EkranZwarc {...props({ wklady: { 'BUS-GPZ': wkladyFixture() } })} />);
    const wklady = screen.getByTestId('mvd-zwarcia-wklady');
    // Zapytania w zakresie TABELI wkładów — te same etykiety niesie także wykres
    // udziałów (karta W-A F2); intencja testu bez zmian.
    const tabela = within(within(wklady).getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('Sieć zasilająca 110 kV')).toBeInTheDocument();
    expect(tabela.getByText('75,0')).toBeInTheDocument();
    expect(within(wklady).queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
  });

  it('brak wkładów dla punktu → stan „dane niedostępne w tym przebiegu"', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    expect(screen.getByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.wkladyNiedostepne)).toBeInTheDocument();
  });

  it('natywny wybór wiersza tabeli przełącza sekcję wkładów (delta API wzorca)', async () => {
    await renderEkranZwarc(<EkranZwarc {...props({ wklady: { 'BUS-GPZ': wkladyFixture() } })} />);
    // Start: BUS-GPZ (pierwszy wiersz) ma wkłady i jest wybrany.
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
    // Klik na wiersz BUS-ST1 (brak wkładów) → stan niedostępny + zaznaczenie.
    fireEvent.click(wiersze[1]);
    expect(wiersze[1]).toHaveAttribute('aria-selected', 'true');
    expect(wiersze[0]).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
  });

  it('Enter na wierszu wybiera punkt (klawiatura)', async () => {
    await renderEkranZwarc(<EkranZwarc {...props()} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.keyDown(wiersze[1], { key: 'Enter' });
    expect(wiersze[1]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('EkranZwarc - realny dostawca wkladow (R3-B / K3-G3)', () => {
  beforeEach(() => {
    // Wynik z realnego backendu zawsze niesie `konfiguracja_biegu` (canonical_run_views:
    // build_short_circuit_results_response) — z niej ekran bierze scenariusz i nadpisanie c,
    // bez których końcówka wkładów odmawia 422 (karta WSPÓŁCZYNNIK-C).
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({ konfiguracja_biegu: konfiguracjaBieguFixture() }),
      selectedRunId: 'sc-run-1',
    });
    useSnapshotStore.setState({
      snapshot: { header: { name: 'Siec testowa' }, buses: [], branches: [], transformers: [], sources: [], loads: [], generators: [], substations: [], bays: [] },
    } as never);
  });

  it('bez props wklady: pobiera rozbicie z backendu i pokazuje zrodlo z pradem', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contributions: [
          { source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    // Zakres TABELI wkładów — nazwę źródła niesie także wykres udziałów (W-A F2).
    const tabela = within(await within(sekcja).findByTestId('mvd-wyn-tabela'));
    expect(await tabela.findByText('Agregat')).toBeInTheDocument();
    // A -> kA (skalowanie prezentacji): 1234,5 A = 1,235 kA (format PL, 3 miejsca).
    expect(tabela.getByText('1,234')).toBeInTheDocument();
    // Endpoint dostal ref ENM aktywnego punktu (target_id pierwszego wiersza).
    //
    // WYSZUKANIE PO ADRESIE, NIE PO KOLEJNOSCI (V12K-265). Asercja celowala w
    // `calls[0]`, czyli zakladala, ze wklady sa PIERWSZYM zapytaniem ekranu. Gdy
    // ekran zaczal dodatkowo pobierac kontrakt przebiegu (rewizja modelu dla
    // znacznika swiezosci), pierwszy stal sie GET bez ciala i test padal na
    // `init.body` — mimo ze sprawdzana wlasciwosc byla spelniona. Intencja dotyczy
    // KONKRETNEJ koncowki, wiec szukamy jej po adresie.
    const wywolanieWkladow = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/proof/sc3f/contributions'),
    );
    expect(wywolanieWkladow, 'brak zapytania o wklady zwarciowe').toBeDefined();
    const init = wywolanieWkladow![1] as RequestInit;
    expect(JSON.parse(init.body as string).fault_node_id).toBe(
      shortCircuitResultsFixture().rows[0].target_id,
    );
    vi.unstubAllGlobals();
  });

  // Karta WSPÓŁCZYNNIK-C (scalenie partii 10 i 11): końcówka wkładów wymaga scenariusza
  // biegu i przyjmuje nadpisanie c z uzasadnieniem. Iloczyn: scenariusz {MAX, MIN} ×
  // nadpisanie c {brak, z uzasadnieniem} × treść zapytania o wkłady.
  it.each([
    ['MAX', null],
    ['MIN', null],
    ['MAX', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }],
    ['MIN', { wartosc: 0.95, uzasadnienie: 'Uzgodnienie z OSD' }],
  ] as const)('bieg %s, nadpisanie %j -> zapytanie o wklady niesie parametry biegu', async (scen, nadp) => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        konfiguracja_biegu: konfiguracjaBieguFixture({
          scenariusz: scen,
          c_factor: nadp
            ? { tryb: 'nadpisanie', wartosc: nadp.wartosc, uzasadnienie: nadp.uzasadnienie }
            : { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
        }),
      }),
      selectedRunId: 'sc-run-1',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contributions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-wklady');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/proof/sc3f/contributions')),
      ).toBe(true),
    );
    const wywolanie = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/proof/sc3f/contributions'),
    );
    const cialo = JSON.parse((wywolanie![1] as RequestInit).body as string);
    expect(cialo.scenariusz).toBe(scen);
    expect(cialo.nadpisanie_c).toEqual(nadp);
    expect(cialo).not.toHaveProperty('c_factor');
    vi.unstubAllGlobals();
  });

  it('bieg bez zapisanego scenariusza -> brak zapytania o wklady, uczciwe "dane niedostepne"', async () => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        konfiguracja_biegu: konfiguracjaBieguFixture({ scenariusz: null }),
      }),
      selectedRunId: 'sc-run-1',
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    expect(await screen.findByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/proof/sc3f/contributions')),
    ).toBe(false);
    vi.unstubAllGlobals();
  });

  // Karta OD-14: wkłady źródeł biegu przez impedancję przejścia liczone z TĄ SAMĄ Z_f
  // co bieg (`konfiguracja_biegu.impedancja_przejscia`), nie metalicznie. Iloczyn:
  // {bieg metaliczny, bieg przez Z_f} × treść zapytania o wkłady.
  it.each([
    ['metaliczny', undefined, undefined],
    [
      'przez Z_f',
      { r_f_ohm: 2, x_f_ohm: 0.5, poza_zakresem_iec60909: true as const },
      { r_f_ohm: 2, x_f_ohm: 0.5 },
    ],
  ])('bieg %s -> zapytanie o wklady niesie fault_impedance tylko dla Z_f', async (_n, z, oczekiwana) => {
    useResultsInspectorStore.setState({
      shortCircuitResults: shortCircuitResultsFixture({
        konfiguracja_biegu: konfiguracjaBieguFixture(z ? { impedancja_przejscia: z } : {}),
      }),
      selectedRunId: 'sc-run-1',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        contributions: [{ source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    await screen.findByTestId('mvd-zwarcia-wklady');
    const wywolanie = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/proof/sc3f/contributions'),
    );
    expect(wywolanie, 'brak zapytania o wklady zwarciowe').toBeDefined();
    const cialo = JSON.parse((wywolanie![1] as RequestInit).body as string);
    expect(cialo.fault_impedance).toEqual(oczekiwana);
    vi.unstubAllGlobals();
  });

  it('wywod z backendu -> slad obliczen na zadanie z wzorami KaTeX (zasada 2026-07-22)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contributions: [
            { source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 },
          ],
          wywod: [
            { tekst: 'Model: IEC 60909-0:2016 par. 6.6', latex: null },
            {
              tekst: 'Wzor pradu czesciowego maszyny',
              latex: "I''_{k,m} = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot Z''_m}",
            },
            {
              tekst: 'Agregat: ...',
              latex: "I_b = \\mu \\cdot q \\cdot I''_k = 0.813 \\cdot 1.000 \\cdot 1.234\\,\\text{kA} = 1.003\\,\\text{kA}",
            },
          ],
        }),
      }),
    );
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    // Domyslnie zwiniety (bez przeladowania ekranu) — dostepny na klik.
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-slad')).not.toBeInTheDocument();
    fireEvent.click(await within(sekcja).findByTestId('mvd-zwarcia-wklady-slad-btn'));
    const slad = within(sekcja).getByTestId('mvd-zwarcia-wklady-slad');
    const wzory = within(slad).getAllByTestId('math-rendered');
    expect(wzory).toHaveLength(2);
    expect(wzory[1].getAttribute('data-latex')).toContain('I_b = \\mu');
    // Krok tekstowy (bez latex) pozostaje monospace.
    expect(within(slad).getByText('Model: IEC 60909-0:2016 par. 6.6')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('wywod_sekcje z backendu -> slad SEKCYJNY: akordeon zwiniety, klik sekcji -> kroki + KaTeX, norma przy tytule, checklista walidacji (ZWARCIA-PRO F3)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contributions: [
            { source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 },
          ],
          wywod: [{ tekst: 'Model: IEC 60909-0:2016 par. 6.6', latex: null }],
          wywod_sekcje: [
            {
              tytul: 'Dane wejściowe i model',
              kroki: [{ tekst: 'Model: IEC 60909-0:2016 par. 6.6', latex: null }],
              norma: 'IEC 60909-0:2016',
            },
            {
              tytul: 'Wkład: Agregat',
              kroki: [
                {
                  tekst: 'Prad wylaczeniowy symetryczny: Ib = 1.003 kA',
                  latex:
                    "I_b = \\mu \\cdot q \\cdot I''_{k,m} = 0.813 \\cdot 1.000 \\cdot 1.234\\;\\mathrm{kA} = 1.003\\;\\mathrm{kA}",
                },
              ],
              norma: 'IEC 60909-0:2016 §6.6',
            },
          ],
          walidacja_iec: [
            {
              pozycja_pl: 'Reguła małych silników (p. 6.6)',
              wartosc_pl:
                'w modelu brak silników asynchronicznych, więc reguła nie dotyczy (wkłady maszyn synchronicznych liczone zawsze)',
            },
          ],
        }),
      }),
    );
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    // Slad na zadanie: zwiniety przed klikiem.
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-slad')).not.toBeInTheDocument();
    fireEvent.click(await within(sekcja).findByTestId('mvd-zwarcia-wklady-slad-btn'));
    // Akordeon sekcji zamiast plaskiej listy: sekcje zwiniete (aria-expanded=false).
    const btnSekcji = within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-sekcja-btn-1');
    expect(btnSekcji).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(sekcja).queryByTestId('mvd-zwarcia-wklady-slad-sekcja-kroki-1'),
    ).not.toBeInTheDocument();
    // Odwolanie normowe przy tytule sekcji.
    expect(within(btnSekcji).getByText('Wkład: Agregat')).toBeInTheDocument();
    expect(within(btnSekcji).getByText('IEC 60909-0:2016 §6.6')).toBeInTheDocument();
    // Klik sekcji -> kroki z wzorem KaTeX (math-rendered).
    fireEvent.click(btnSekcji);
    const kroki = within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-sekcja-kroki-1');
    expect(within(kroki).getByTestId('math-rendered').getAttribute('data-latex')).toContain(
      'I_b = \\mu',
    );
    // Panel metody IEC na koncu wywodu sekcyjnego (fakty biegu, bez statusow).
    fireEvent.click(within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-walidacja-btn'));
    const walidacja = within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-walidacja');
    expect(within(walidacja).getByText('Reguła małych silników (p. 6.6)')).toBeInTheDocument();
    expect(
      within(walidacja).getByText('w modelu brak silników asynchronicznych, więc reguła nie dotyczy (wkłady maszyn synchronicznych liczone zawsze)'),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('odpowiedz BEZ wywod_sekcje (starszy backend) -> plaski SladWywodu, bez akordeonu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contributions: [
            { source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 },
          ],
          wywod: [{ tekst: 'Model: IEC 60909-0:2016 par. 6.6', latex: null }],
        }),
      }),
    );
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    fireEvent.click(await within(sekcja).findByTestId('mvd-zwarcia-wklady-slad-btn'));
    // Plaska lista krokow (kompatybilnosc), zero przyciskow sekcji.
    expect(within(sekcja).getByTestId('mvd-zwarcia-wklady-slad')).toBeInTheDocument();
    expect(
      within(sekcja).getByText('Model: IEC 60909-0:2016 par. 6.6'),
    ).toBeInTheDocument();
    expect(
      within(sekcja).queryByTestId('mvd-zwarcia-wklady-slad-sekcja-btn-0'),
    ).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('szczegol maszyny z odpowiedzi endpointu: klik wiersza -> mu/q/Ib + wywod maszyny (W-A F2)', async () => {
    // Realna sciezka dostawcy: pola maszynowe 1:1 z MachinePartialContribution.to_dict.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contributions: [
            {
              source_id: 'gen1',
              source_name: 'Agregat',
              ikss_partial_a: 1234.5,
              machine_type: 'SYNCHRONOUS',
              ir_a: 412.0,
              ratio_ik_ir: 2.995,
              mu: 0.813,
              q: 1.0,
              ib_a: 1003.6,
              wywod: [
                {
                  tekst: 'I_b = mu * q * Ik',
                  latex: "I_b = \\mu \\cdot q \\cdot I''_k",
                },
              ],
            },
          ],
        }),
      }),
    );
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    // Natywny klik komórki wiersza wkladu rozwija szczegol maszyny (zakres tabeli —
    // nazwa źródła występuje też na wykresie udziałów).
    const tabela = within(await within(sekcja).findByTestId('mvd-wyn-tabela'));
    fireEvent.click(await tabela.findByText('Agregat'));
    const panel = within(sekcja).getByTestId('mvd-zwarcia-wklad-szczegol');
    expect(within(panel).getByText('maszyna synchroniczna')).toBeInTheDocument();
    expect(within(panel).getByText('0,412 kA')).toBeInTheDocument(); // Ir (A -> kA)
    expect(within(panel).getByText('0,813')).toBeInTheDocument(); // mu
    expect(within(panel).getByText('1,000')).toBeInTheDocument(); // q
    expect(within(panel).getByText('1,004 kA')).toBeInTheDocument(); // Ib (A -> kA)
    // Wywod dyplomowy TEJ maszyny — na zadanie, wzor przez KaTeX.
    fireEvent.click(within(panel).getByTestId('mvd-zwarcia-wklad-szczegol-slad-btn'));
    const wzory = within(panel).getAllByTestId('math-rendered');
    expect(wzory[0].getAttribute('data-latex')).toContain('I_b = \\mu');
    vi.unstubAllGlobals();
  });

  it('blad pobrania -> stan BLEDU odczytu, nie "dane niedostepne" (blad != brak danych)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = screen.getByTestId('mvd-zwarcia-wklady');
    expect(await within(sekcja).findByTestId('mvd-zwarcia-wklady-blad')).toBeInTheDocument();
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.wkladyBlad)).toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-wczytywanie')).not.toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-filtr')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('odczyt w toku -> stan WCZYTYWANIA, nie "dane niedostepne"; po odpowiedzi tabela', async () => {
    let zwolnij: (odp: unknown) => void = () => undefined;
    const wstrzymane = new Promise((r) => {
      zwolnij = r;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) =>
        String(url).includes('/api/proof/sc3f/contributions')
          ? wstrzymane
          : Promise.resolve({ ok: false, status: 404 }),
      ),
    );
    await renderEkranZwarc(<EkranZwarc szczegolyAudytowe={false} onOtworzDowod={() => undefined} />);
    const sekcja = screen.getByTestId('mvd-zwarcia-wklady');
    const wczytywanie = within(sekcja).getByTestId('mvd-zwarcia-wklady-wczytywanie');
    expect(wczytywanie).toHaveAttribute('aria-busy', 'true');
    expect(wczytywanie).toHaveTextContent(ZWARCIA_STRINGS.wkladyWczytywanie);
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
    expect(within(sekcja).queryByText(ZWARCIA_STRINGS.wkladyNiedostepne)).not.toBeInTheDocument();
    zwolnij({
      ok: true,
      json: async () => ({
        contributions: [{ source_id: 'gen1', source_name: 'Agregat', ikss_partial_a: 1234.5 }],
      }),
    });
    expect(await within(sekcja).findByTestId('mvd-wyn-tabela')).toBeInTheDocument();
    expect(within(sekcja).queryByTestId('mvd-zwarcia-wklady-wczytywanie')).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('props wklady ma pierwszenstwo - dostawca wkladow nie pobiera (1:1 dla testow)', async () => {
    // Karta W3-G3: ekran ma DRUGI dostawca na zadanie (pasmo MIN/MAX, właściwość
    // CAŁEGO biegu — niezależny od wybranego punktu/propsu `wklady`), więc
    // asercja celuje w KONKRETNĄ końcówkę wkładów (jak w innych testach tego
    // pliku), nie w brak JAKIEGOKOLWIEK zapytania sieciowego ekranu.
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    // Kontrakt propsu: mapa punkt -> wkłady (`Record<string, WkladZwarciowy[]>`),
    // jak w pozostałych testach tego pliku (odbiór fali 3 W3: dług typów poza
    // bramką naprawiony u źródła, nie wyciszony).
    await renderEkranZwarc(
      <EkranZwarc
        szczegolyAudytowe={false}
        onOtworzDowod={() => undefined}
        wklady={{ 'BUS-GPZ': wkladyFixture() }}
      />,
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/proof/sc3f/contributions')),
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});

