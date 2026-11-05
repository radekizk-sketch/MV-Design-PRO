/**
 * Jedyny formater liczb sekcji aparatury (karta APARATURA-TABELA, wymaganie 9): prądy i zapasy
 * 2 miejsca, czasy 3, wartość całkowita bez zbędnych zer, przecinek dziesiętny, zapas ze
 * znakiem (minus typograficzny), zero bez znaku.
 */
import { describe, expect, it } from 'vitest';

import { formatujWielkosc } from '../format';

describe('formatujWielkosc', () => {
  it.each([
    [50, 'prad', '50'],
    [20.015, 'prad', '20,02'],
    [9.17, 'prad', '9,17'],
    [31.2, 'prad', '31,20'],
    [-2.5, 'prad', '−2,50'],
    [29.98, 'zapas', '+29,98'],
    [10, 'zapas', '+10'],
    [-1.5, 'zapas', '−1,50'],
    [0, 'zapas', '0'],
    [-0.001, 'zapas', '0,00'],
    [0.36, 'czas', '0,360'],
    [0.065, 'czas', '0,065'],
    [1, 'czas', '1'],
    [0, 'czas', '0'],
    // Współczynniki wyprowadzenia (κ, m, n; karta KD6-SZCZEGOLY) — 3 miejsca, bez znaku.
    [1.5563, 'wspolczynnik', '1,556'],
    [0.0123, 'wspolczynnik', '0,012'],
    [1, 'wspolczynnik', '1'],
  ] as const)('%s jako %s → %s', (wartosc, rodzaj, oczekiwany) => {
    expect(formatujWielkosc(wartosc, rodzaj)).toBe(oczekiwany);
  });
});
