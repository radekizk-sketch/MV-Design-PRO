import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { shortCircuitResultsFixture, wkladyFixture } from './fixtures';

function props(over: Partial<Parameters<typeof EkranZwarc>[0]> = {}) {
  return {
    trybZaawansowania: 'basic' as const,
    onOtworzDowod: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  useResultsInspectorStore.getState().reset();
});

function ustawWynik() {
  useResultsInspectorStore.setState({
    shortCircuitResults: shortCircuitResultsFixture(),
    selectedRunId: 'sc-run-1',
  });
}

describe('EkranZwarc — panel „Bilans IEC 60909" (ZWARCIA-PRO F1)', () => {
  beforeEach(ustawWynik);

  it('bilans wybranego punktu pokazuje komplet wielkosci z wiersza kanonicznego', () => {
    render(<EkranZwarc {...props()} />);
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    // Wielkosci impedancyjne i wspolczynniki (z FROZEN solvera, format PL).
    expect(within(bilans).getByText(ZWARCIA_STRINGS.bilansZk)).toBeInTheDocument();
    expect(within(bilans).getByText('0,7777 Ω')).toBeInTheDocument();
    expect(within(bilans).getByText('1,728')).toBeInTheDocument(); // kappa
    expect(within(bilans).getByText('9,416')).toBeInTheDocument(); // X/R
    expect(within(bilans).getByText('1,100')).toBeInTheDocument(); // c
    expect(within(bilans).getByText('15,0 kV')).toBeInTheDocument(); // Un
    expect(within(bilans).getByText('156,250 kA²·s')).toBeInTheDocument(); // I2t
  });

  it('klik innego wiersza przelacza bilans na ten punkt', () => {
    render(<EkranZwarc {...props()} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.click(wiersze[2]); // BUS-ST2 — starszy wynik bez bilansu
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    // Uczciwe kreski (kontrakt addytywny — brak fabrykacji).
    expect(within(bilans).queryByText('0,7777 Ω')).not.toBeInTheDocument();
    const kreski = within(bilans)
      .getAllByRole('definition')
      .filter((el) => el.textContent === ZWARCIA_STRINGS.kreska);
    expect(kreski.length).toBe(16);
  });

  it('kolumny impedancyjne (Rk/Xk/|Zk|/X/R/kappa) w trybie eksperckim, ukryte w podstawowym', () => {
    const { unmount } = render(<EkranZwarc {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyn-th-zk')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-th-kappa')).toBeInTheDocument();
    unmount();
    ustawWynik();
    render(<EkranZwarc {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-th-zk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-th-kappa')).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — stan pusty (brak wyniku w store)', () => {
  it('bez wyniku: komunikat PL zamiast tabeli', () => {
    render(<EkranZwarc {...props()} />);
    expect(screen.getByText(ZWARCIA_STRINGS.brakWyniku)).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.brakWynikuOpis)).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-tabela')).not.toBeInTheDocument();
  });
});

describe('EkranZwarc — konkretyzacja wzorca na realnym kształcie danych', () => {
  beforeEach(ustawWynik);

  it('nagłówek: nazwa analizy PL', () => {
    render(<EkranZwarc {...props()} />);
    expect(screen.getByText(ZWARCIA_STRINGS.analiza)).toBeInTheDocument();
  });

  it('założenia: metoda IEC 60909 oraz c/czas z propsów', () => {
    render(<EkranZwarc {...props({ wspolczynnikC: 1.1, czasCieplnyS: 1.0 })} />);
    const zalozenia = screen.getByTestId('mvd-wyn-zalozenia');
    expect(within(zalozenia).getByText(ZWARCIA_STRINGS.zalMetoda)).toBeInTheDocument();
    expect(within(zalozenia).getByText('IEC 60909')).toBeInTheDocument();
    expect(within(zalozenia).getByText(ZWARCIA_STRINGS.zalWspolczynnikC)).toBeInTheDocument();
    expect(within(zalozenia).getByText('1,10')).toBeInTheDocument();
  });

  it('tabela: wiersz per punkt, wielkości Ik"/ip/Ith/Sk" z jednostkami w nagłówkach', () => {
    render(<EkranZwarc {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('12,345')).toBeInTheDocument();
    expect(tabela.getByText('320,8')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-ikss')).getByText(`[${ZWARCIA_STRINGS.jednKA}]`)).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-sk')).getByText(`[${ZWARCIA_STRINGS.jednMVA}]`)).toBeInTheDocument();
  });

  it('wartości null renderowane jako „—"', () => {
    render(<EkranZwarc {...props()} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    // Wiersz BUS-ST2 ma wszystkie wielkości null → co najmniej 4 kreski w tabeli.
    expect(tabela.getAllByText(ZWARCIA_STRINGS.kreska).length).toBeGreaterThanOrEqual(4);
  });

  it('rodzaj zwarcia mapowany na polską nazwę', () => {
    render(<EkranZwarc {...props()} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    expect(tabela.getByText('zwarcie trójfazowe')).toBeInTheDocument();
    expect(tabela.getByText('zwarcie jednofazowe (doziemne)')).toBeInTheDocument();
  });

  it('podwójne kliknięcie na wartości Ik" → onOtworzDowod z ref (element_id)', () => {
    const onOtworzDowod = vi.fn();
    render(<EkranZwarc {...props({ onOtworzDowod })} />);
    const tabela = within(screen.getByTestId('mvd-wyn-tabela'));
    fireEvent.doubleClick(tabela.getByText('12,345'));
    expect(onOtworzDowod).toHaveBeenCalledWith('EL-GPZ');
  });

  it('sortowanie po kolumnie liczbowej (Sk") — malejąco po dwóch kliknięciach', () => {
    render(<EkranZwarc {...props()} />);
    const thSk = within(screen.getByTestId('mvd-wyn-th-sk')).getByRole('button');
    fireEvent.click(thSk); // rosnąco
    fireEvent.click(thSk); // malejąco
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    const pierwszy = within(wiersze[0]);
    expect(pierwszy.getByText('320,8')).toBeInTheDocument(); // największe Sk" na górze
  });

  it('identyfikator punktu widoczny wyłącznie w trybie eksperckim', () => {
    const { rerender } = render(<EkranZwarc {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-th-identyfikator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-run-id')).not.toBeInTheDocument();
    rerender(<EkranZwarc {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyn-th-identyfikator')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-wyn-run-id')).toHaveTextContent('sc-run-1');
  });

  it('wykres słupkowy Ik" obecny w slocie wykresu', () => {
    render(<EkranZwarc {...props()} />);
    const slot = screen.getByTestId('mvd-wyn-wykres');
    expect(within(slot).getByTestId('mvd-zwarcia-wykres')).toBeInTheDocument();
    expect(within(slot).getByText(ZWARCIA_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('onEksport przekazany do stopki wzorca', () => {
    const onEksport = vi.fn();
    render(<EkranZwarc {...props({ onEksport })} />);
    screen.getByRole('button', { name: WZORZEC_STRINGS.eksport }).click();
    expect(onEksport).toHaveBeenCalledTimes(1);
  });
});

describe('EkranZwarc — wybór punktu i sekcja wkładów', () => {
  beforeEach(ustawWynik);

  it('domyślnie wybrany pierwszy punkt; wkłady z propsów renderowane w tabeli', () => {
    render(<EkranZwarc {...props({ wklady: { 'BUS-GPZ': wkladyFixture() } })} />);
    const wklady = screen.getByTestId('mvd-zwarcia-wklady');
    expect(within(wklady).getByText('Sieć zasilająca 110 kV')).toBeInTheDocument();
    expect(within(wklady).getByText('75,0')).toBeInTheDocument();
    expect(within(wklady).queryByTestId('mvd-zwarcia-wklady-brak')).not.toBeInTheDocument();
  });

  it('brak wkładów dla punktu → stan „dane niedostępne w tym przebiegu"', () => {
    render(<EkranZwarc {...props()} />);
    expect(screen.getByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    expect(screen.getByText(ZWARCIA_STRINGS.wkladyNiedostepne)).toBeInTheDocument();
  });

  it('natywny wybór wiersza tabeli przełącza sekcję wkładów (delta API wzorca)', () => {
    render(<EkranZwarc {...props({ wklady: { 'BUS-GPZ': wkladyFixture() } })} />);
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

  it('Enter na wierszu wybiera punkt (klawiatura)', () => {
    render(<EkranZwarc {...props()} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    fireEvent.keyDown(wiersze[1], { key: 'Enter' });
    expect(wiersze[1]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('EkranZwarc - realny dostawca wkladow (R3-B / K3-G3)', () => {
  beforeEach(() => {
    ustawWynik();
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
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    const sekcja = await screen.findByTestId('mvd-zwarcia-wklady');
    expect(await within(sekcja).findByText('Agregat')).toBeInTheDocument();
    // A -> kA (skalowanie prezentacji): 1234,5 A = 1,235 kA (format PL, 3 miejsca).
    expect(within(sekcja).getByText('1,234')).toBeInTheDocument();
    // Endpoint dostal ref ENM aktywnego punktu (target_id pierwszego wiersza).
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).fault_node_id).toBe(
      shortCircuitResultsFixture().rows[0].target_id,
    );
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
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
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
              pozycja_pl: 'Reguła małych silników (5%)',
              wartosc_pl: 'SPELNIONA — silniki pomijalne w Ib',
              status: 'PASS',
            },
          ],
        }),
      }),
    );
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
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
    // Checklista walidacji metody IEC na koncu wywodu sekcyjnego.
    fireEvent.click(within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-walidacja-btn'));
    const walidacja = within(sekcja).getByTestId('mvd-zwarcia-wklady-slad-walidacja');
    expect(within(walidacja).getByText('Reguła małych silników (5%)')).toBeInTheDocument();
    expect(
      within(walidacja).getByText('SPELNIONA — silniki pomijalne w Ib'),
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
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
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

  it('blad pobrania -> uczciwy stan "dane niedostepne" (bez fabrykacji)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<EkranZwarc trybZaawansowania="basic" onOtworzDowod={() => undefined} />);
    expect(await screen.findByTestId('mvd-zwarcia-wklady-brak')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('props wklady ma pierwszenstwo - dostawca nie pobiera (1:1 dla testow)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <EkranZwarc
        trybZaawansowania="basic"
        onOtworzDowod={() => undefined}
        wklady={wkladyFixture()}
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

