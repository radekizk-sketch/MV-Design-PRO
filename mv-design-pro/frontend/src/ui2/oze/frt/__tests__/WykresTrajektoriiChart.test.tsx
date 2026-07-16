/*
 * Testy wykresu trajektorii FRT (karta U4 P38). Weryfikują: render kontenera,
 * legendę PL (napięcie + obwiednia), przełączanie serii P(t)/Iq(t) przyciskami
 * oraz determinizm markupu dla tych samych danych (normalizacja `recharts\d+`).
 * Kolory pochodzą z tokenów --mvd-* (niesprawdzane tu — to kontrakt CSS).
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { WykresTrajektoriiChart } from '../WykresTrajektoriiChart';
import { punktyObwiedniFrt, punktyTrajektoriiFrt } from '../frtModel';
import { FRT_STRINGS } from '../strings';
import { widokLvrtWObwiedniFixture } from './fixtures';

function renderWykres() {
  const widok = widokLvrtWObwiedniFixture();
  return render(
    <WykresTrajektoriiChart
      trajektoria={punktyTrajektoriiFrt(widok.scenariusze[0])}
      obwiednia={punktyObwiedniFrt(widok)}
    />,
  );
}

describe('WykresTrajektoriiChart', () => {
  it('renderuje kontener wykresu z tytułem PL', () => {
    renderWykres();
    expect(screen.getByTestId('mvd-frt-wykres')).toBeInTheDocument();
    expect(screen.getByText(FRT_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('legenda pokazuje napięcie U(t) i obwiednię profilu (PL)', () => {
    renderWykres();
    expect(screen.getByText(FRT_STRINGS.legendaNapiecie)).toBeInTheDocument();
    expect(screen.getByText(FRT_STRINGS.legendaObwiednia)).toBeInTheDocument();
  });

  it('serie P(t)/Iq(t) są domyślnie ukryte', () => {
    renderWykres();
    expect(screen.queryByText(FRT_STRINGS.legendaP)).not.toBeInTheDocument();
    expect(screen.queryByText(FRT_STRINGS.legendaIq)).not.toBeInTheDocument();
  });

  it('przycisk P(t) dodaje serię mocy czynnej do legendy', () => {
    renderWykres();
    fireEvent.click(screen.getByTestId('mvd-frt-serie-p'));
    expect(screen.getByText(FRT_STRINGS.legendaP)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-frt-serie-p')).toHaveAttribute('aria-pressed', 'true');
  });

  it('przycisk Iq(t) dodaje serię prądu biernego do legendy', () => {
    renderWykres();
    fireEvent.click(screen.getByTestId('mvd-frt-serie-iq'));
    expect(screen.getByText(FRT_STRINGS.legendaIq)).toBeInTheDocument();
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
