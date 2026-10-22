import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { WkladyZwarciowe } from '../WkladyZwarciowe';
import {
  kluczWkladow,
  naWklady,
  parametryWkladowZKonfiguracji,
  useWkladyZwarciowe,
  type ParametryWkladowBiegu,
} from '../api';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { ZWARCIA_STRINGS } from '../strings';
import { wkladyFixture, wkladyZeSzczegolemFixture } from './fixtures';

function renderuj(wklady = wkladyFixture()) {
  return render(
    <WkladyZwarciowe
      punktNazwa="Szyna GPZ 15 kV"
      wklady={wklady}
      odczyt="gotowe"
      szczegolyAudytowe={false}
      onOtworzDowod={vi.fn()}
    />,
  );
}

describe('WkladyZwarciowe — sortowanie (reuse TabelaWynikow, karta W-A F2)', () => {
  it('klik nagłówka „Prąd wkładu" sortuje rosnąco, drugi klik malejąco', () => {
    renderuj();
    const thPrad = within(screen.getByTestId('mvd-wyn-th-prad')).getByRole('button');
    fireEvent.click(thPrad); // rosnąco
    let wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('Falownik PV')).toBeInTheDocument();
    fireEvent.click(thPrad); // malejąco
    wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(within(wiersze[0]).getByText('Sieć zasilająca 110 kV')).toBeInTheDocument();
  });
});

describe('WkladyZwarciowe — filtr tekstowy po źródle (karta W-A F2)', () => {
  it('wpisanie frazy zawęża wiersze; udział [%] pozostaje z pełnego zbioru', () => {
    renderuj();
    fireEvent.change(screen.getByTestId('mvd-zwarcia-wklady-filtr'), {
      target: { value: 'falownik' },
    });
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze).toHaveLength(1);
    expect(within(wiersze[0]).getByText('Falownik PV')).toBeInTheDocument();
    // Udział liczony PRZED filtrem: 3/12 = 25,0 % (nie 100 %).
    expect(within(wiersze[0]).getByText('25,0')).toBeInTheDocument();
  });

  it('fraza bez trafień → uczciwy komunikat zamiast tabeli', () => {
    renderuj();
    fireEvent.change(screen.getByTestId('mvd-zwarcia-wklady-filtr'), {
      target: { value: 'nie-ma-takiego-zrodla' },
    });
    expect(screen.getByTestId('mvd-zwarcia-wklady-filtr-brak')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.wkladyFiltrBrak)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('WkladyZwarciowe — rozwinięcie szczegółu maszyny (karta W-A F2)', () => {
  it('klik wiersza rozwija szczegół: typ PL, Ir, Ik"/Ir, μ, q, Ib + wywód maszyny (KaTeX)', () => {
    renderuj(wkladyZeSzczegolemFixture());
    expect(screen.queryByTestId('mvd-zwarcia-wklad-szczegol')).not.toBeInTheDocument();
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[0]); // Agregat biogazowni (ma szczegół)
    const panel = screen.getByTestId('mvd-zwarcia-wklad-szczegol');
    expect(within(panel).getByRole('heading')).toHaveTextContent(
      ZWARCIA_STRINGS.wkladSzczegolTytul,
    );
    expect(within(panel).getByText('maszyna synchroniczna')).toBeInTheDocument();
    expect(within(panel).getByText('0,412 kA')).toBeInTheDocument(); // Ir
    expect(within(panel).getByText('2,995')).toBeInTheDocument(); // Ik"/Ir
    expect(within(panel).getByText('0,813')).toBeInTheDocument(); // μ
    expect(within(panel).getByText('1,000')).toBeInTheDocument(); // q
    expect(within(panel).getByText('1,003 kA')).toBeInTheDocument(); // Ib
    // Wywód dyplomowy TEJ maszyny — na żądanie (SladWywodu), wzory przez KaTeX.
    fireEvent.click(within(panel).getByTestId('mvd-zwarcia-wklad-szczegol-slad-btn'));
    const slad = within(panel).getByTestId('mvd-zwarcia-wklad-szczegol-slad');
    const wzory = within(slad).getAllByTestId('math-rendered');
    expect(wzory).toHaveLength(2);
    expect(wzory[1].getAttribute('data-latex')).toContain('I_b = \\mu');
  });

  it('ponowny klik tego samego wiersza zwija szczegół (toggle)', () => {
    renderuj(wkladyZeSzczegolemFixture());
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[0]);
    expect(screen.getByTestId('mvd-zwarcia-wklad-szczegol')).toBeInTheDocument();
    fireEvent.click(wiersze[0]);
    expect(screen.queryByTestId('mvd-zwarcia-wklad-szczegol')).not.toBeInTheDocument();
  });

  it('wkład bez szczegółu → uczciwy stan „szczegóły niedostępne" (zero fabrykacji)', () => {
    renderuj(wkladyZeSzczegolemFixture());
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[1]); // Sieć zasilająca — bez szczegółu
    const panel = screen.getByTestId('mvd-zwarcia-wklad-szczegol');
    expect(within(panel).getByTestId('mvd-zwarcia-wklad-szczegol-brak')).toBeInTheDocument();
    expect(within(panel).getByText(ZWARCIA_STRINGS.wkladSzczegolBrak)).toBeInTheDocument();
  });
});

describe('WkladyZwarciowe — wykres udziałów procentowych (karta W-A F2)', () => {
  it('renderuje poziome słupki udziałów z nazwami źródeł (tokeny --mvd-*)', () => {
    const { container } = renderuj();
    const wykres = screen.getByTestId('mvd-zwarcia-wklady-wykres');
    expect(within(wykres).getByText(ZWARCIA_STRINGS.wkladyWykresTytul)).toBeInTheDocument();
    const svg = wykres.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.textContent).toContain('Sieć zasilająca 110 kV');
    expect(svg!.textContent).toContain('Falownik PV');
    expect(svg!.outerHTML).toContain('var(--mvd-accent)');
    expect(svg!.outerHTML).not.toMatch(/#(?:[0-9a-fA-F]{6})\b/);
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
  });

  it('suma prądów zero → wykres nie renderuje się (bez dzielenia przez zero)', () => {
    renderuj([{ id: 'S', zrodlo: 'Źródło', pradKA: 0 }]);
    expect(screen.queryByTestId('mvd-zwarcia-wklady-wykres')).not.toBeInTheDocument();
  });

  it('stan „dane niedostępne" (null) — bez filtru, wykresu i tabeli (1:1)', () => {
    render(
      <WkladyZwarciowe
        punktNazwa="Szyna GPZ 15 kV"
        wklady={null}
        odczyt="gotowe"
        szczegolyAudytowe={false}
        onOtworzDowod={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zwarcia-wklady-filtr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zwarcia-wklady-wykres')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });

  // Iloczyn {błąd, pobieranie} × sekcja wkładów: każdy stan ma WŁASNY komunikat, żaden nie
  // trafia w „dane niedostępne" (dawniej pobieranie mówiło „nie udało się pobrać").
  it.each([
    ['blad', 'mvd-zwarcia-wklady-blad', ZWARCIA_STRINGS.wkladyBlad],
    ['wczytywanie', 'mvd-zwarcia-wklady-wczytywanie', ZWARCIA_STRINGS.wkladyWczytywanie],
  ] as const)('stan %s → własny komunikat, nie „dane niedostępne"', (stan, testId, tekst) => {
    render(
      <WkladyZwarciowe
        punktNazwa="Szyna GPZ 15 kV"
        wklady={null}
        odczyt={stan}
        szczegolyAudytowe={false}
        onOtworzDowod={vi.fn()}
      />,
    );
    expect(screen.getByTestId(testId)).toHaveTextContent(tekst);
    expect(screen.queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
  });
});

// Karta OD-14 × karta WSPÓŁCZYNNIK-C: pamięć podręczna wkładów rozróżnia parametry biegu —
// ten sam punkt z innym scenariuszem c, innym nadpisaniem c albo inną Z_f to INNE wkłady
// (inaczej ekran pokazałby wkłady innego biegu). Iloczyn: scenariusz {MAX, MIN} ×
// nadpisanie c {brak, A, B} × Z_f {brak, A, B} dla jednego punktu.
describe('kluczWkladow — klucz pamięci wkładów zależy od parametrów biegu', () => {
  const zf = (r: number, x: number) => ({ r_f_ohm: r, x_f_ohm: x, poza_zakresem_iec60909: true as const });
  const nadpisania = [null, { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }, { wartosc: 1.0, uzasadnienie: 'Uzgodnienie z OSD' }];
  const impedancje = [undefined, zf(2, 0), zf(0, 2)];

  // Karta SC-IB-ITH-ZRODLA: czwarta cecha — czas wyłączenia t_b biegu (t_min krzywych μ, q).
  const czasyTb = [null, 0.1, 0.25];

  it('iloczyn 2 × 3 × 3 × 3 daje 54 różne klucze; te same wartości → ten sam klucz', () => {
    const klucze = new Set<string>();
    for (const scenariusz of ['MAX', 'MIN'] as const)
      for (const nadpisanieC of nadpisania)
        for (const impedancja of impedancje)
          for (const tMinS of czasyTb)
            klucze.add(
              kluczWkladow(
                'BUS-GPZ',
                impedancja ? { scenariusz, nadpisanieC, tMinS, impedancja } : { scenariusz, nadpisanieC, tMinS },
              ),
            );
    expect(klucze.size).toBe(54);
    expect(
      kluczWkladow('BUS-GPZ', { scenariusz: 'MAX', nadpisanieC: null, tMinS: 0.1, impedancja: zf(2, 0) }),
    ).toBe(kluczWkladow('BUS-GPZ', { scenariusz: 'MAX', nadpisanieC: null, tMinS: 0.1, impedancja: zf(2, 0) }));
  });
});

describe('parametryWkladowZKonfiguracji — odczyt konfiguracji zapisanej na biegu', () => {
  const konf = (over: Record<string, unknown> = {}) =>
    ({
      c_factor: { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
      thermal_time_seconds: { wartosc: 1, pochodzenie: 'opcje_biegu' },
      metoda: 'IEC 60909',
      scenariusz: 'MIN',
      ...over,
    }) as never;

  it('scenariusz biegu i brak nadpisania → parametry bez Z_f', () => {
    expect(parametryWkladowZKonfiguracji(konf())).toEqual({ scenariusz: 'MIN', nadpisanieC: null, tMinS: null });
  });

  it('t_b scenariusza zapisany na biegu → t_min wkładów; t_b w punkcie zwarcia → null (backend rozstrzyga punkt), nie 0,10 s z UI', () => {
    expect(
      parametryWkladowZKonfiguracji(
        konf({ breaking_time_seconds: { wartosc: 0.25, pochodzenie: 'opcje_biegu' } }),
      ),
    ).toEqual({ scenariusz: 'MIN', nadpisanieC: null, tMinS: 0.25 });
    expect(
      parametryWkladowZKonfiguracji(
        konf({ breaking_time_seconds: { wartosc: null, pochodzenie: 'punkt_zwarcia', opis_pl: 'Reguła.' } }),
      ),
    ).toEqual({ scenariusz: 'MIN', nadpisanieC: null, tMinS: null });
  });

  it('nadpisanie z uzasadnieniem i Z_f biegu przechodzą 1:1', () => {
    const z = { r_f_ohm: 2, x_f_ohm: 0.5, poza_zakresem_iec60909: true };
    expect(
      parametryWkladowZKonfiguracji(
        konf({
          scenariusz: 'MAX',
          c_factor: { tryb: 'nadpisanie', wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' },
          impedancja_przejscia: z,
        }),
      ),
    ).toEqual({
      scenariusz: 'MAX',
      nadpisanieC: { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' },
      tMinS: null,
      impedancja: z,
    });
  });

  it.each([
    ['brak konfiguracji', undefined],
    ['bieg bez zapisanego scenariusza', konf({ scenariusz: null })],
    ['nadpisanie bez uzasadnienia', konf({ c_factor: { tryb: 'nadpisanie', wartosc: 1.05, uzasadnienie: null } })],
  ])('%s → null (uczciwy brak, bez domyślnego MAX)', (_n, k) => {
    expect(parametryWkladowZKonfiguracji(k)).toBeNull();
  });
});

// Karta OD-14: odświeżenie wyniku biegu daje NOWY obiekt parametrów o tych samych wartościach —
// hook nie może przez to ponawiać (i anulować) tego samego żądania. Iloczyn: {te same
// parametry nowym obiektem, inna Z_f, inny scenariusz, inne nadpisanie c} × liczba żądań
// i treść żądania (scenariusz i nadpisanie c jadą zawsze — końcówka bez nich odmawia 422).
describe('useWkladyZwarciowe — parametry biegu w zależnościach wartościami, nie obiektem', () => {
  it('te same parametry nowym obiektem → jedno żądanie; każda zmiana wartości → kolejne', async () => {
    useSnapshotStore.setState({
      snapshot: { header: { name: 'Siec' }, buses: [] },
    } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contributions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const zf = (r: number) => ({ r_f_ohm: r, x_f_ohm: 0, poza_zakresem_iec60909: true as const });
    const par = (
      r: number,
      scenariusz: 'MAX' | 'MIN' = 'MAX',
      nadpisanieC: { wartosc: number; uzasadnienie: string } | null = null,
      tMinS: number | null = null,
    ) => ({ scenariusz, nadpisanieC, tMinS, impedancja: zf(r) });
    const { rerender } = renderHook(({ p }) => useWkladyZwarciowe('BUS-GPZ', p), {
      initialProps: { p: par(2) },
    });
    rerender({ p: par(2) });
    rerender({ p: par(2) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ p: par(3) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ p: par(3, 'MIN') });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    rerender({ p: par(3, 'MIN', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    // Karta SC-IB-ITH-ZRODLA: t_b biegu jedzie jako `t_min_s`; bieg bez t_b — pola brak.
    rerender({ p: par(3, 'MIN', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }, 0.1) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    rerender({ p: par(3, 'MIN', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }, 0.1) });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    const ciala = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(ciala.map((c) => [c.scenariusz, c.nadpisanie_c, c.fault_impedance, 't_min_s' in c ? c.t_min_s : 'brak'])).toEqual([
      ['MAX', null, { r_f_ohm: 2, x_f_ohm: 0 }, 'brak'],
      ['MAX', null, { r_f_ohm: 3, x_f_ohm: 0 }, 'brak'],
      ['MIN', null, { r_f_ohm: 3, x_f_ohm: 0 }, 'brak'],
      ['MIN', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }, { r_f_ohm: 3, x_f_ohm: 0 }, 'brak'],
      ['MIN', { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' }, { r_f_ohm: 3, x_f_ohm: 0 }, 0.1],
    ]);
    vi.unstubAllGlobals();
  });

  it('brak parametrów biegu → brak żądania i stan „dane niedostępne" (null)', async () => {
    useSnapshotStore.setState({
      snapshot: { header: { name: 'Siec' }, buses: [] },
    } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useWkladyZwarciowe('BUS-GPZ', null));
    expect(result.current).toEqual({ odczyt: 'niezlecony' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  const PARAMETRY: ParametryWkladowBiegu = { scenariusz: 'MAX', nadpisanieC: null, tMinS: null };

  it('pobieranie → wczytywanie; odpowiedź → gotowe z danymi', async () => {
    useSnapshotStore.setState({
      snapshot: { header: { name: 'Siec' }, buses: [] },
    } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contributions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useWkladyZwarciowe('BUS-GPZ', PARAMETRY));
    expect(result.current).toEqual({ odczyt: 'wczytywanie' });
    await waitFor(() => expect(result.current.odczyt).toBe('gotowe'));
    const stan = result.current;
    expect(stan.odczyt === 'gotowe' ? stan.dane.wklady : null).toEqual([]);
    vi.unstubAllGlobals();
  });

  it.each([
    ['HTTP 500', () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })],
    ['sieć', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('błąd pobrania (%s) → blad ROZPOZNANY, jedno żądanie (bez pętli ponowień)', async (_n, odp) => {
    useSnapshotStore.setState({
      snapshot: { header: { name: 'Siec' }, buses: [] },
    } as never);
    const fetchMock = vi.fn().mockImplementation(odp);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(() => useWkladyZwarciowe('BUS-GPZ', PARAMETRY));
    await waitFor(() => expect(result.current).toEqual({ odczyt: 'blad' }));
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  // Scalenie partii 13 z kartą NCRFG-LADOWANIE: klucz pamięci = migawka modelu × punkt ×
  // parametry biegu. Iloczyn {ta sama / nowa migawka} × {te same / inne parametry}: wpis
  // innej migawki to wynik innej sieci — nowa migawka przy TYCH SAMYCH parametrach musi
  // pobrać ponownie i wrócić do „wczytywanie", a nie podać wkładów starej sieci.
  it('nowa migawka modelu × te same parametry → nowe żądanie; ta sama migawka → bez żądania', async () => {
    const pierwsza = { header: { name: 'Siec A' }, buses: [] };
    useSnapshotStore.setState({ snapshot: pierwsza } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contributions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ p }: { p: ParametryWkladowBiegu }) => useWkladyZwarciowe('BUS-GPZ', p),
      {
        initialProps: { p: PARAMETRY },
      },
    );
    await waitFor(() => expect(result.current.odczyt).toBe('gotowe'));
    rerender({ p: { ...PARAMETRY } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => {
      useSnapshotStore.setState({ snapshot: { header: { name: 'Siec B' }, buses: [] } } as never);
    });
    rerender({ p: PARAMETRY });
    expect(result.current.odczyt).toBe('wczytywanie');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.odczyt).toBe('gotowe'));
    rerender({ p: { scenariusz: 'MIN', nadpisanieC: null, tMinS: null } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    vi.unstubAllGlobals();
  });

  it('brak migawki modelu → „dane niedostępne", nie wieczne pobieranie', () => {
    useSnapshotStore.setState({ snapshot: null } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useWkladyZwarciowe('BUS-GPZ', PARAMETRY));
    expect(result.current).toEqual({ odczyt: 'niezlecony' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// Karta TB-WARTOSC-ROBOCZA: backend liczy μ, q i Ib maszyny zawsze (t_min = t_b punktu);
// projekcja przenosi liczby 1:1 (Ib A → kA), a starsza odpowiedź bez pól zostaje brakiem —
// nigdy 0 kA.
describe('naWklady — μ, q, Ib maszyny z odpowiedzi 1:1, brak pola = brak', () => {
  const maszyna = (mu?: number, q?: number, ib?: number) => ({
    contributions: [
      {
        source_id: 'gen_sync',
        source_name: 'Generator synchroniczny',
        ikss_partial_a: 1395,
        machine_type: 'SYNCHRONOUS',
        ir_a: 192.5,
        ratio_ik_ir: 7.2,
        ...(mu === undefined ? {} : { mu }),
        ...(q === undefined ? {} : { q }),
        ...(ib === undefined ? {} : { ib_a: ib }),
        wywod: [],
      },
    ],
  });

  it.each([
    ['t_b = 0,1 s (wartość robocza albo scenariusz)', 0.691, 1, 963.9, 0.9639],
    ['t_b z pola = 0,36 s', 0.62, 1, 864, 0.864],
    ['starsza odpowiedź bez pól', undefined, undefined, undefined, null],
  ])('%s', (_n, mu, q, ib, ibKA) => {
    const [wklad] = naWklady(maszyna(mu, q, ib) as never);
    expect(wklad.szczegol?.mu ?? null).toBe(mu ?? null);
    expect(wklad.szczegol?.q ?? null).toBe(q ?? null);
    expect(wklad.szczegol?.ibKA).toBe(ibKA);
  });
});
