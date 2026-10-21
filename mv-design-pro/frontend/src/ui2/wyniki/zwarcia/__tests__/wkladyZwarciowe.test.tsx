import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { WkladyZwarciowe } from '../WkladyZwarciowe';
import { kluczWkladow, naWklady, parametryWkladowZKonfiguracji, useWkladyZwarciowe } from '../api';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { ZWARCIA_STRINGS } from '../strings';
import { wkladyFixture, wkladyZeSzczegolemFixture } from './fixtures';

function renderuj(wklady = wkladyFixture()) {
  return render(
    <WkladyZwarciowe
      punktNazwa="Szyna GPZ 15 kV"
      wklady={wklady}
      trybZaawansowania="basic"
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
        trybZaawansowania="basic"
        onOtworzDowod={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zwarcia-wklady-filtr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-zwarcia-wklady-wykres')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
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

  it('czas wyłączenia t_b zapisany na biegu → t_min wkładów; bieg bez t_b → null, nie 0,10 s', () => {
    expect(
      parametryWkladowZKonfiguracji(
        konf({ breaking_time_seconds: { wartosc: 0.25, pochodzenie: 'opcje_biegu' } }),
      ),
    ).toEqual({ scenariusz: 'MIN', nadpisanieC: null, tMinS: 0.25 });
    expect(
      parametryWkladowZKonfiguracji(
        konf({ breaking_time_seconds: { wartosc: null, pochodzenie: 'brak_danej', kod: 'fault.czas_tb_brak' } }),
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
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// Karta SC-IB-ITH-ZRODLA: bieg bez t_b — backend zwraca μ/q/Ib maszyny jako `null`
// (krzywa zaniku zależy od t_min). Projekcja nie może zamienić `null` na 0 kA (dawne
// `c.ib_a !== undefined ? c.ib_a / 1000` dawało 0 dla `null`).
describe('naWklady — wielkości nieobliczone bez t_b zostają brakiem', () => {
  const maszyna = (mu: number | null, q: number | null, ib: number | null) => ({
    contributions: [
      {
        source_id: 'gen_sync',
        source_name: 'Generator synchroniczny',
        ikss_partial_a: 1395,
        machine_type: 'SYNCHRONOUS',
        ir_a: 192.5,
        ratio_ik_ir: 7.2,
        mu,
        q,
        ib_a: ib,
        wywod: [],
      },
    ],
  });

  it.each([
    ['bieg bez t_b', null, null, null, null],
    ['bieg z t_b = 0,1 s', 0.691, 1, 963.9, 0.9639],
  ])('%s', (_n, mu, q, ib, ibKA) => {
    const [wklad] = naWklady(maszyna(mu, q, ib) as never);
    expect(wklad.szczegol?.mu).toBe(mu);
    expect(wklad.szczegol?.q).toBe(q);
    expect(wklad.szczegol?.ibKA).toBe(ibKA);
  });
});
