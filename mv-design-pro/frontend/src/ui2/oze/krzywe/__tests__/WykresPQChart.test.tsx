/*
 * Testy wykresu P–Q (karta P41). Weryfikują: render kontenera wykresu, legendę PL
 * (linie producenta) oraz determinizm markupu dla tych samych danych wejściowych.
 * Kolory pochodzą z tokenów --mvd-* (niesprawdzane tu — to kontrakt CSS).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WykresPQChart } from '../WykresPQChart';
import { punktyWykresuPQ } from '../krzyweModel';
import { KRZYWE_STRINGS } from '../strings';
import { widokPokryciaFixture } from './fixtures';

function renderWykres() {
  const widok = widokPokryciaFixture();
  return render(
    <WykresPQChart
      punkty={punktyWykresuPQ(widok)}
      wymaganieMin={widok.wymaganie.q_wymagane_min_mvar}
      wymaganieMax={widok.wymaganie.q_wymagane_max_mvar}
    />,
  );
}

describe('WykresPQChart', () => {
  it('renderuje kontener wykresu z tytułem PL', () => {
    renderWykres();
    expect(screen.getByTestId('mvd-krzywe-wykres')).toBeInTheDocument();
    expect(screen.getByText(KRZYWE_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('legenda pokazuje polskie nazwy linii producenta (q max / q min)', () => {
    renderWykres();
    expect(screen.getByText(KRZYWE_STRINGS.legendaQMax)).toBeInTheDocument();
    expect(screen.getByText(KRZYWE_STRINGS.legendaQMin)).toBeInTheDocument();
  });

  it('jest deterministyczny — ten sam markup dla tych samych danych', () => {
    // Recharts nadaje inkrementowane identyfikatory (recharts<N>-clip) — normalizujemy
    // je przed porównaniem, by badać determinizm treści, nie licznika biblioteki.
    const normalizuj = (html: string) => html.replace(/recharts\d+/g, 'rechartsN');
    const a = renderWykres();
    const markupA = normalizuj(a.container.innerHTML);
    a.unmount();
    const b = renderWykres();
    expect(normalizuj(b.container.innerHTML)).toBe(markupA);
  });
});
