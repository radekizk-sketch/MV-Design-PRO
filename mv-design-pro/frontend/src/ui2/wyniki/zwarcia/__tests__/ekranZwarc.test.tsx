import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { EkranZwarc } from '../EkranZwarc';
import { ZWARCIA_STRINGS } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
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
