import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { WkladyZwarciowe } from '../WkladyZwarciowe';
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
