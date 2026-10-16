/**
 * Podstawa współczynnika c w bilansie IEC 60909 punktu zwarcia
 * (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK).
 *
 * INTENCJA: inżynier widzi, jakim c policzono Ik″ i SKĄD ta wartość — tekst
 * `c_zrodlo` z wiersza backendu, bez składania go w UI. Iloczyn cech:
 * {pasmo nN tolerancja +6 %, pasmo nN tolerancja +10 %, pasmo SN, nadpisanie ręczne}
 * × {scenariusz MAX, MIN} oraz wiersz starszy bez podstawy (uczciwa kreska).
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BilansIEC, naBilansIEC } from '../BilansIEC';
import { ZWARCIA_STRINGS } from '../strings';
import { shortCircuitResultsFixture } from './fixtures';

function wierszBazowy() {
  return shortCircuitResultsFixture().rows[0];
}

const PRZYPADKI = [
  ['nN +6 %', 'MAX', 1.05, 'IEC 60909-0 tab. 1, pasmo nN, tolerancja +6 %, MAX'],
  ['nN +6 %', 'MIN', 0.95, 'IEC 60909-0 tab. 1, pasmo nN, tolerancja +6 %, MIN'],
  ['nN +10 %', 'MAX', 1.1, 'IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 %, MAX'],
  ['nN +10 %', 'MIN', 0.9, 'IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 %, MIN'],
  ['SN', 'MAX', 1.1, 'IEC 60909-0 tab. 1, pasmo SN, MAX'],
  ['SN', 'MIN', 1.0, 'IEC 60909-0 tab. 1, pasmo SN, MIN'],
  ['nadpisanie', 'MAX', 1.05, 'nadpisanie ręczne: uzgodnienie z operatorem'],
] as const;

describe('BilansIEC — podstawa współczynnika c punktu', () => {
  it.each(PRZYPADKI)('%s, scenariusz %s: c i jego podstawa z wiersza backendu', (_, __, c, zrodlo) => {
    const row = { ...wierszBazowy(), c_factor: c, c_zrodlo: zrodlo };
    const pozycje = naBilansIEC(row);
    const indeksC = pozycje.findIndex((p) => p.etykieta === ZWARCIA_STRINGS.bilansC);
    expect(indeksC).toBeGreaterThanOrEqual(0);
    // Podstawa stoi bezpośrednio po wartości c — czytelna para „c / skąd c".
    expect(pozycje[indeksC + 1]).toEqual({
      etykieta: ZWARCIA_STRINGS.bilansCZrodlo,
      wartosc: zrodlo,
      jednostka: null,
      tekst: true,
    });

    render(<BilansIEC row={row} punktNazwa="Szyna testowa" />);
    const bilans = screen.getByTestId('mvd-zwarcia-bilans');
    const wartosc = within(bilans).getByText(zrodlo);
    expect(wartosc).toBeInTheDocument();
    // Opis podstawy c jest tekstem, nie liczbą: pozycja na pełny wiersz siatki i bez kroju
    // liczbowego `mvd-num` (nowrap) — inaczej długi opis wychodził na sąsiednią pozycję
    // (defekt widoczny w zrzucie „po” ekranu zwarć).
    expect(wartosc).not.toHaveClass('mvd-num');
    expect(wartosc.closest('div')).toHaveClass('mvd-zwarcia-bilans-poz--tekst');
  });

  it.each([null, undefined, '   '])('wiersz bez podstawy c (%s) → uczciwa kreska, nie domysł', (zrodlo) => {
    const row = { ...wierszBazowy(), c_zrodlo: zrodlo };
    const pozycja = naBilansIEC(row).find((p) => p.etykieta === ZWARCIA_STRINGS.bilansCZrodlo);
    expect(pozycja?.wartosc).toBe(ZWARCIA_STRINGS.kreska);
  });
});
