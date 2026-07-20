/**
 * Test wykresu charakterystyki AVR (regulacja zaczepów) — czysta prezentacja SVG.
 * Sprawdza: kropki per zaczep, pasmo nieczułości tylko przy zadanym dbFrac (tryb AUTO),
 * brak pasma w trybie ręcznym/DETC.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WykresAvr } from '../WykresAvr';

afterEach(cleanup);

describe('WykresAvr — charakterystyka regulacji zaczepów', () => {
  it('rysuje kropkę dla każdego zaczepu w zakresie (mały zakres)', () => {
    const { container } = render(
      <WykresAvr tapMin={-2} tapMax={2} tapNeutral={0} stepPct={1.25} dbFrac={null} />,
    );
    // zakres -2..2 = 5 zaczepów → 5 kropek (skok=1 dla ≤25).
    expect(container.querySelectorAll('circle.mvd-wykres-punkt').length).toBe(5);
  });

  it('pokazuje pasmo nieczułości gdy podano dbFrac (AUTO)', () => {
    const { container } = render(
      <WykresAvr tapMin={-4} tapMax={4} tapNeutral={0} stepPct={1.5} dbFrac={0.02} />,
    );
    expect(container.querySelector('rect.mvd-wykres-pasmo')).not.toBeNull();
  });

  it('nie rysuje pasma w trybie ręcznym/DETC (dbFrac null)', () => {
    const { container } = render(
      <WykresAvr tapMin={-4} tapMax={4} tapNeutral={0} stepPct={1.5} dbFrac={null} />,
    );
    expect(container.querySelector('rect.mvd-wykres-pasmo')).toBeNull();
  });

  it('przerzedza kropki dla dużego zakresu zaczepów (czytelność)', () => {
    const { container } = render(
      <WykresAvr tapMin={-16} tapMax={16} tapNeutral={0} stepPct={0.8} dbFrac={null} />,
    );
    // 33 zaczepy > 25 → skok=2 → 17 kropek (indeksy parzyste 0..32).
    expect(container.querySelectorAll('circle.mvd-wykres-punkt').length).toBe(17);
  });
});
