/**
 * Etykiety i słowniki koordynacji zabezpieczeń (E-28).
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenia i nastawy z modelu — szablony urządzeń,
 * domyślne nastawy i domyślne kryteria po stronie ekranu skasowane (zero wartości
 * domyślnych w UI). Słownik charakterystyk = pełne kody `KrzywaNastawy` backendu.
 */

import { describe, it, expect } from 'vitest';
import * as moduleTypes from '../types';
import { LABELS } from '../types';
import { nazwaCharakterystykiPL } from '../TccChart';

/** Kody `KrzywaNastawy` z `backend/src/enm/models.py` — jedno źródło słownika. */
const KODY_KRZYWYCH_MODELU = [
  'DT',
  'IEC_SI',
  'IEC_VI',
  'IEC_EI',
  'IEC_LI',
  'IEEE_MI',
  'IEEE_VI',
  'IEEE_EI',
] as const;

describe('Etykiety koordynacji', () => {
  it('koordynacja bez werdyktów (P-06): brak etykiet i stylów PASS/MARGINAL/FAIL/ERROR', () => {
    expect('verdict' in LABELS).toBe(false);
    expect('verdictVerbose' in LABELS).toBe(false);
    for (const nazwa of ['VERDICT_STYLES', 'CoordinationVerdict']) {
      expect(nazwa in moduleTypes).toBe(false);
    }
    const wszystkie = JSON.stringify(LABELS);
    for (const slowo of ['Zgodne', 'Wymaga korekty', 'Na granicy dopuszczalności', 'Werdykt']) {
      expect(wszystkie).not.toContain(slowo);
    }
  });

  it('słownik charakterystyk pokrywa DOKŁADNIE kody nastaw modelu', () => {
    expect(Object.keys(LABELS.curveTypes).sort()).toEqual([...KODY_KRZYWYCH_MODELU].sort());
  });

  it.each(KODY_KRZYWYCH_MODELU)('kod %s ma nazwę polską (nie kod, nie „spoza słownika")', (kod) => {
    const nazwa = nazwaCharakterystykiPL(kod);
    expect(nazwa).not.toBe(LABELS.charakterystykaNierozpoznana);
    expect(nazwa).not.toBe(kod);
  });

  it('kod spoza słownika nazwany jawnie jako nierozpoznany', () => {
    expect(nazwaCharakterystykiPL('IEC_XX')).toBe(LABELS.charakterystykaNierozpoznana);
    expect(nazwaCharakterystykiPL('toString')).toBe(LABELS.charakterystykaNierozpoznana);
  });

  it('kolumny sprawdzeń bez skrótów „Δ" i angielskich symboli', () => {
    const kolumny = JSON.stringify(LABELS.checks);
    expect(kolumny).not.toContain('Δ');
    expect(kolumny).not.toContain('I_pickup');
    expect(kolumny).not.toContain('I_min');
  });

  it('brak nazw kodowych w etykietach', () => {
    const wszystkie = JSON.stringify(LABELS);
    for (const kod of ['P7', 'P11', 'P14', 'P15', 'P17', 'P20', 'FIX-']) { // no-codenames-ignore
      expect(wszystkie).not.toContain(kod);
    }
  });

  it('moduł nie eksportuje szablonów urządzeń ani wartości domyślnych nastaw i kryteriów', () => {
    for (const nazwa of [
      'DEVICE_TEMPLATES',
      'DEFAULT_CONFIG',
      'DEFAULT_CURVE_SETTINGS',
      'DEFAULT_STAGE_51',
    ]) {
      expect(nazwa in moduleTypes).toBe(false);
    }
  });
});
