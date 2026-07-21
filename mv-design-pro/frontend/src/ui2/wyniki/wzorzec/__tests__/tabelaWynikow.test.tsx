import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  TabelaWynikow,
  PROG_WIRTUALIZACJI,
  WYSOKOSC_WIERSZA_PX,
  WYSOKOSC_WIDOKU_PX,
  ZAPAS_WIERSZY,
} from '../TabelaWynikow';
import { WZORZEC_STRINGS } from '../strings';
import type { DefinicjaKolumny, WierszTabeli } from '../wzorzecModel';
import { kolumnyFixture, wierszeFixture } from './fixtures';

function props(over: Partial<Parameters<typeof TabelaWynikow>[0]> = {}) {
  return {
    kolumny: kolumnyFixture,
    wiersze: wierszeFixture,
    onOtworzDowod: vi.fn(),
    trybZaawansowania: 'basic' as const,
    ...over,
  };
}

/** Kolejność wartości pierwszej (widocznej) kolumny — do weryfikacji sortowania. */
function kolejnoscNazw(): string[] {
  return screen
    .getAllByTestId('mvd-wyn-wiersz')
    .map((tr) => within(tr).getAllByRole('cell')[0].textContent ?? '');
}

describe('TabelaWynikow — pętla decyzji (F-E6.1: „Popraw w modelu")', () => {
  it('bez onPoprawWModelu: brak kolumny decyzji i przycisków (zero zmiany dla nie-konsumentów)', () => {
    render(<TabelaWynikow {...props()} />);
    expect(screen.queryByTestId('mvd-wyn-th-decyzja')).toBeNull();
    expect(screen.queryByTestId('mvd-wyn-popraw')).toBeNull();
  });

  it('z onPoprawWModelu: kolumna decyzji + przycisk WYŁĄCZNIE na wierszu z ostrzeżeniem', () => {
    render(<TabelaWynikow {...props({ onPoprawWModelu: vi.fn() })} />);
    expect(screen.getByTestId('mvd-wyn-th-decyzja')).toBeInTheDocument();
    // Fixtura: dokładnie jeden wiersz z ostrzeżeniem („Szyna A").
    const przyciski = screen.getAllByTestId('mvd-wyn-popraw');
    expect(przyciski).toHaveLength(1);
    expect(przyciski[0]).toHaveTextContent(WZORZEC_STRINGS.poprawWModelu);
  });

  it('klik „Popraw w modelu" woła callback z kluczem wiersza (ref elementu) — klik natywny', () => {
    const onPopraw = vi.fn();
    render(<TabelaWynikow {...props({ onPoprawWModelu: onPopraw })} />);
    fireEvent.click(screen.getByTestId('mvd-wyn-popraw'));
    // Klucz wiersza = wartość pierwszej kolumny („nazwa") wiersza z ostrzeżeniem.
    expect(onPopraw).toHaveBeenCalledWith('Szyna A');
  });

  it('przycisk decyzji NIE propaguje do wyboru wiersza (stopPropagation)', () => {
    const onWybierz = vi.fn();
    const onPopraw = vi.fn();
    render(<TabelaWynikow {...props({ onWybierzWiersz: onWybierz, onPoprawWModelu: onPopraw })} />);
    fireEvent.click(screen.getByTestId('mvd-wyn-popraw'));
    expect(onPopraw).toHaveBeenCalledWith('Szyna A');
    expect(onWybierz).not.toHaveBeenCalled();
  });
});

describe('TabelaWynikow — nagłówki i komórki', () => {
  it('renderuje nagłówki kolumn z etykietą i jednostką', () => {
    render(<TabelaWynikow {...props()} />);
    expect(within(screen.getByTestId('mvd-wyn-th-wartosc')).getByText('Wartość')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-wartosc')).getByText('[kV]')).toBeInTheDocument();
  });

  it('renderuje wiersze i wartości komórek', () => {
    render(<TabelaWynikow {...props()} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    expect(screen.getByText('Szyna A')).toBeInTheDocument();
    expect(screen.getByText('20,50')).toBeInTheDocument();
  });

  it('pusta lista wierszy → komunikat braku wyników', () => {
    render(<TabelaWynikow {...props({ wiersze: [] })} />);
    expect(screen.getByTestId('mvd-wyn-tabela-pusta')).toHaveTextContent(WZORZEC_STRINGS.brakWynikow);
  });
});

describe('TabelaWynikow — sortowanie (deterministyczne, stabilne)', () => {
  it('kolejność źródłowa bez sortowania', () => {
    render(<TabelaWynikow {...props()} />);
    expect(kolejnoscNazw()).toEqual(['Szyna B', 'Szyna A', 'Szyna C']);
  });

  it('klik nagłówka liczbowego → rosnąco wg sortKey', () => {
    render(<TabelaWynikow {...props()} />);
    fireEvent.click(within(screen.getByTestId('mvd-wyn-th-wartosc')).getByRole('button'));
    // sortKey: A=15.1, C=18.0, B=20.5
    expect(kolejnoscNazw()).toEqual(['Szyna A', 'Szyna C', 'Szyna B']);
  });

  it('drugi klik → malejąco; trzeci klik → powrót do kolejności źródłowej', () => {
    render(<TabelaWynikow {...props()} />);
    const btn = within(screen.getByTestId('mvd-wyn-th-wartosc')).getByRole('button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(kolejnoscNazw()).toEqual(['Szyna B', 'Szyna C', 'Szyna A']);
    fireEvent.click(btn);
    expect(kolejnoscNazw()).toEqual(['Szyna B', 'Szyna A', 'Szyna C']);
  });

  it('kolumna tekstowa sortuje alfabetycznie (pl)', () => {
    render(<TabelaWynikow {...props()} />);
    fireEvent.click(within(screen.getByTestId('mvd-wyn-th-nazwa')).getByRole('button'));
    expect(kolejnoscNazw()).toEqual(['Szyna A', 'Szyna B', 'Szyna C']);
  });

  it('aria-sort odzwierciedla stan sortowania', () => {
    render(<TabelaWynikow {...props()} />);
    const th = screen.getByTestId('mvd-wyn-th-wartosc');
    expect(th).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(th).getByRole('button'));
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });
});

describe('TabelaWynikow — dowód (2× klik), próg → tag, tryb ekspercki', () => {
  it('komórka z dowodRef: podwójny klik → onOtworzDowod(ref)', () => {
    const p = props();
    render(<TabelaWynikow {...p} />);
    fireEvent.doubleClick(screen.getByText('20,50'));
    expect(p.onOtworzDowod).toHaveBeenCalledWith('dowod-b');
  });

  it('komórka bez dowodRef nie jest przyciskiem', () => {
    render(<TabelaWynikow {...props()} />);
    const komorka = screen.getByText('18,00');
    expect(komorka.closest('button')).toBeNull();
  });

  it('przekroczony próg → tag ostrzegawczy PL', () => {
    render(<TabelaWynikow {...props()} />);
    const tag = screen.getByTestId('mvd-wyn-tag-ostrzezenie');
    expect(tag).toHaveTextContent(WZORZEC_STRINGS.tagOstrzezenie);
  });

  it('kolumna „tylkoEkspercki" ukryta w trybie podstawowym', () => {
    render(<TabelaWynikow {...props({ trybZaawansowania: 'basic' })} />);
    expect(screen.queryByTestId('mvd-wyn-th-id')).not.toBeInTheDocument();
    expect(screen.queryByText('X-1')).not.toBeInTheDocument();
  });

  it('kolumna „tylkoEkspercki" widoczna w trybie eksperckim', () => {
    render(<TabelaWynikow {...props({ trybZaawansowania: 'expert' })} />);
    expect(screen.getByTestId('mvd-wyn-th-id')).toBeInTheDocument();
    expect(screen.getByText('X-1')).toBeInTheDocument();
  });
});

// ---- Wirtualizacja okienkowa (karta U4) ----

const duzeKolumny: DefinicjaKolumny[] = [
  { klucz: 'nazwa', etykieta: 'Element', wyrownanie: 'lewo' },
  { klucz: 'wartosc', etykieta: 'Wartość', jednostka: 'kV', mono: true },
];

/** Generator fixtures: n wierszy „Szyna 0…n-1", każdy z dowodRef. */
function duzeWiersze(n: number): WierszTabeli[] {
  return Array.from({ length: n }, (_, i) => ({
    nazwa: { wartosc: `Szyna ${i}` },
    wartosc: { wartosc: String(i), sortKey: i, dowodRef: `dowod-${i}` },
  }));
}

function propsDuze(n: number, over: Record<string, unknown> = {}) {
  return {
    kolumny: duzeKolumny,
    wiersze: duzeWiersze(n),
    onOtworzDowod: vi.fn(),
    trybZaawansowania: 'basic' as const,
    ...over,
  };
}

/** Ustawia scrollTop deterministycznie (jsdom nie liczy layoutu) i emituje scroll. */
function przewin(px: number): void {
  const wrap = screen.getByTestId('mvd-wyn-tabela-wrap');
  Object.defineProperty(wrap, 'scrollTop', { configurable: true, value: px });
  fireEvent.scroll(wrap);
}

/** Oczekiwana liczba wierszy DOM w oknie dla danego scrollTop (okno + zapas). */
const LICZBA_WIDOCZNYCH = Math.ceil(WYSOKOSC_WIDOKU_PX / WYSOKOSC_WIERSZA_PX);

describe('TabelaWynikow — wirtualizacja okienkowa (>500 wierszy)', () => {
  it('próg dokładnie 500 wierszy → BRAK wirtualizacji, renderuje wszystkie', () => {
    render(<TabelaWynikow {...propsDuze(PROG_WIRTUALIZACJI)} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(PROG_WIRTUALIZACJI);
    expect(screen.queryByTestId('mvd-wyn-spacer-dol')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-wyn-spacer-gora')).not.toBeInTheDocument();
  });

  it('poniżej progu (mały fixture) → zachowanie 1:1 (wrap bez przewijania pionowego)', () => {
    render(<TabelaWynikow kolumny={kolumnyFixture} wiersze={wierszeFixture} onOtworzDowod={vi.fn()} trybZaawansowania="basic" />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')).toHaveLength(3);
    const wrap = screen.getByTestId('mvd-wyn-tabela-wrap');
    expect(wrap.style.overflowY).toBe('');
  });

  it('powyżej progu (1000 wierszy) → renderuje TYLKO okno (DOM << 1000)', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    const wiersze = screen.getAllByTestId('mvd-wyn-wiersz');
    // scrollTop=0 → pierwszy=0, ostatni = LICZBA_WIDOCZNYCH + ZAPAS
    expect(wiersze).toHaveLength(LICZBA_WIDOCZNYCH + ZAPAS_WIERSZY);
    expect(wiersze.length).toBeLessThan(1000);
  });

  it('na szczycie: brak przekładki górnej, przekładka dolna o poprawnej wysokości', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    expect(screen.queryByTestId('mvd-wyn-spacer-gora')).not.toBeInTheDocument();
    const dol = screen.getByTestId('mvd-wyn-spacer-dol').querySelector('td');
    const renderowane = LICZBA_WIDOCZNYCH + ZAPAS_WIERSZY;
    expect(dol).toHaveStyle({ height: `${(1000 - renderowane) * WYSOKOSC_WIERSZA_PX}px` });
  });

  it('scroll przesuwa okno (pierwszy widoczny wiersz się zmienia)', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    expect(screen.getAllByTestId('mvd-wyn-wiersz')[0]).toHaveTextContent('Szyna 0');
    przewin(100 * WYSOKOSC_WIERSZA_PX); // indexStart=100 → pierwszy=100-ZAPAS=80
    expect(screen.getAllByTestId('mvd-wyn-wiersz')[0]).toHaveTextContent('Szyna 80');
    expect(screen.queryByText('Szyna 0')).not.toBeInTheDocument();
  });

  it('po przewinięciu: wysokości OBU przekładek poprawne', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    przewin(100 * WYSOKOSC_WIERSZA_PX);
    const pierwszy = 80; // 100 - ZAPAS
    const ostatni = 100 + LICZBA_WIDOCZNYCH + ZAPAS_WIERSZY;
    const gora = screen.getByTestId('mvd-wyn-spacer-gora').querySelector('td');
    const dol = screen.getByTestId('mvd-wyn-spacer-dol').querySelector('td');
    expect(gora).toHaveStyle({ height: `${pierwszy * WYSOKOSC_WIERSZA_PX}px` });
    expect(dol).toHaveStyle({ height: `${(1000 - ostatni) * WYSOKOSC_WIERSZA_PX}px` });
  });

  it('suma wysokości: górna + okno + dolna == całkowita wysokość listy', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    przewin(100 * WYSOKOSC_WIERSZA_PX);
    const gora = parseInt(
      (screen.getByTestId('mvd-wyn-spacer-gora').querySelector('td') as HTMLElement).style.height,
      10,
    );
    const dol = parseInt(
      (screen.getByTestId('mvd-wyn-spacer-dol').querySelector('td') as HTMLElement).style.height,
      10,
    );
    const okno = screen.getAllByTestId('mvd-wyn-wiersz').length * WYSOKOSC_WIERSZA_PX;
    expect(gora + okno + dol).toBe(1000 * WYSOKOSC_WIERSZA_PX);
  });

  it('wybór wiersza w oknie działa pod wirtualizacją (klik → callback z kluczem)', () => {
    const onWybierz = vi.fn();
    render(<TabelaWynikow {...propsDuze(1000, { onWybierzWiersz: onWybierz })} />);
    fireEvent.click(screen.getByText('Szyna 3').closest('tr')!);
    expect(onWybierz).toHaveBeenCalledWith('Szyna 3');
  });

  it('wiersz wybrany POZA oknem: niewidoczny na szczycie, po przewinięciu ma klasę wybraną', () => {
    render(
      <TabelaWynikow
        {...propsDuze(1000, { onWybierzWiersz: vi.fn(), wybranyWiersz: 'Szyna 500' })}
      />,
    );
    expect(screen.queryByText('Szyna 500')).not.toBeInTheDocument();
    przewin(500 * WYSOKOSC_WIERSZA_PX);
    const wiersz = screen.getByText('Szyna 500').closest('tr');
    expect(wiersz).toHaveClass('mvd-on');
  });

  it('2× klik dowodu działa dla wiersza w oknie', () => {
    const p = propsDuze(1000);
    render(<TabelaWynikow {...p} />);
    fireEvent.doubleClick(screen.getByText('7'));
    expect(p.onOtworzDowod).toHaveBeenCalledWith('dowod-7');
  });

  it('determinizm: ten sam scrollTop → ta sama pierwsza/ostatnia widoczna nazwa', () => {
    const { unmount } = render(<TabelaWynikow {...propsDuze(1000)} />);
    przewin(200 * WYSOKOSC_WIERSZA_PX);
    const wiersze1 = screen.getAllByTestId('mvd-wyn-wiersz');
    const pierwszy1 = wiersze1[0].textContent;
    const ostatni1 = wiersze1[wiersze1.length - 1].textContent;
    unmount();
    render(<TabelaWynikow {...propsDuze(1000)} />);
    przewin(200 * WYSOKOSC_WIERSZA_PX);
    const wiersze2 = screen.getAllByTestId('mvd-wyn-wiersz');
    expect(wiersze2[0].textContent).toBe(pierwszy1);
    expect(wiersze2[wiersze2.length - 1].textContent).toBe(ostatni1);
  });

  it('nagłówki renderowane bez zmian pod wirtualizacją', () => {
    render(<TabelaWynikow {...propsDuze(1000)} />);
    expect(within(screen.getByTestId('mvd-wyn-th-wartosc')).getByText('Wartość')).toBeInTheDocument();
    expect(within(screen.getByTestId('mvd-wyn-th-wartosc')).getByText('[kV]')).toBeInTheDocument();
  });
});
