/*
 * Testy wykresu obszaru P–Q (karta P30). Weryfikują: render kontenera z tytułem
 * PL, legendę linii sieci, warunkową legendę nakładki producenta oraz determinizm
 * markupu. Kolory pochodzą z tokenów --mvd-* (niesprawdzane tu — kontrakt CSS).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { WykresObszaruChart } from '../WykresObszaruChart';
import { punktyObszaru } from '../obszarModel';
import { OBSZAR_STRINGS } from '../strings';
import { rekordyKonwerterowFixture, widokObszaruFixture } from './fixtures';

function renderWykres(zNakladka: boolean) {
  const widok = widokObszaruFixture();
  const curve = zNakladka ? rekordyKonwerterowFixture()[0].pq_curve : undefined;
  return render(
    <WykresObszaruChart punkty={punktyObszaru(widok.vertices, curve)} zNakladkaProducenta={zNakladka} />,
  );
}

describe('WykresObszaruChart', () => {
  it('renderuje kontener wykresu z tytułem PL', () => {
    renderWykres(false);
    expect(screen.getByTestId('mvd-obszar-wykres')).toBeInTheDocument();
    expect(screen.getByText(OBSZAR_STRINGS.wykresTytul)).toBeInTheDocument();
  });

  it('legenda pokazuje polskie nazwy linii dopuszczalnego pasma sieci', () => {
    renderWykres(false);
    expect(screen.getByText(OBSZAR_STRINGS.legendaQMax)).toBeInTheDocument();
    expect(screen.getByText(OBSZAR_STRINGS.legendaQMin)).toBeInTheDocument();
  });

  it('bez nakładki nie pokazuje serii producenta', () => {
    renderWykres(false);
    expect(screen.queryByText(OBSZAR_STRINGS.legendaProdMax)).not.toBeInTheDocument();
    expect(screen.queryByText(OBSZAR_STRINGS.legendaProdMin)).not.toBeInTheDocument();
  });

  it('z nakładką pokazuje serie krzywej producenta', () => {
    renderWykres(true);
    expect(screen.getByText(OBSZAR_STRINGS.legendaProdMax)).toBeInTheDocument();
    expect(screen.getByText(OBSZAR_STRINGS.legendaProdMin)).toBeInTheDocument();
  });

  it('jest deterministyczny — ten sam markup dla tych samych danych', () => {
    // Recharts nadaje inkrementowane identyfikatory (recharts<N>) — normalizujemy je
    // przed porównaniem, by badać determinizm treści, nie licznika biblioteki.
    const normalizuj = (html: string) => html.replace(/recharts\d+/g, 'rechartsN');
    const a = renderWykres(true);
    const markupA = normalizuj(a.container.innerHTML);
    a.unmount();
    const b = renderWykres(true);
    expect(normalizuj(b.container.innerHTML)).toBe(markupA);
  });
});
