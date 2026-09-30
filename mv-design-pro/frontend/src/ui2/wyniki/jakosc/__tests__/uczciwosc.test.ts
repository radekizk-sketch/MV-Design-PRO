/*
 * Uczciwość natychmiastowa (2026-09-23) — etykieta kontroli pasma wiarygodności.
 * Backend (`analysis/sanity_bounds/short_circuit_bounds.py::CREDIBLE`, wspólna stała
 * pasm zwarciowych i napięciowych) zwraca „w paśmie wiarygodności" zamiast
 * „zweryfikowany": kontrola sprawdza WYŁĄCZNIE, czy liczba leży w paśmie fizycznie
 * możliwym — nie jest weryfikacją wyrocznią ani pomiarem. Interfejs nie może ani
 * wyświetlać starej etykiety, ani liczyć koloru od niej.
 */

import { describe, expect, it } from 'vitest';

import { STATUS_WIARYGODNOSCI, istotnoscWiarygodnosci } from '../strings';

describe('status pasma wiarygodności z backendu', () => {
  it('„w paśmie wiarygodności" → kolor pozytywny (liczba w paśmie)', () => {
    expect(istotnoscWiarygodnosci('w paśmie wiarygodności')).toBe('ok');
  });

  it('dawna etykieta „zweryfikowany" nie jest już znana interfejsowi', () => {
    expect(Object.values(STATUS_WIARYGODNOSCI)).not.toContain('zweryfikowany');
    expect(istotnoscWiarygodnosci('zweryfikowany')).toBe('neutral');
  });
});
