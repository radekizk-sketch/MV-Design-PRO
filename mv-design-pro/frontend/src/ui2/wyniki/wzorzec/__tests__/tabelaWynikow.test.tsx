import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TabelaWynikow } from '../TabelaWynikow';
import { WZORZEC_STRINGS } from '../strings';
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
