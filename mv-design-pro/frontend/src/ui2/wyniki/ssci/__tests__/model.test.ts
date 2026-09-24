/*
 * Testy mapowania modelu okna „Stabilność SSCI" (ui2/wyniki/ssci/model). Sprawdzają
 * czyste helpery: wynik → wiersze metryk audytowych (kolejność, wartości PL, uczciwe „—"
 * przy braku danych, BEZ istotności koloru) i opis strefy ujemnej rezystancji.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): mapy „werdykt → istotność /
 * etykieta" skasowane razem z werdyktem (Z_grid(f) bez przekładni transformatora); metryki
 * nie niosą koloru (kolor z flag byłby oceną). Brak eksportu map pilnuje `uczciwosc.test.tsx`.
 */

import { describe, expect, it } from 'vitest';

import { naMetryki, opisRezystancjiUjemnej } from '../model';
import {
  widokBezRezystancjiUjemnejFixture,
  widokBrakDanychFixture,
  widokZMetrykamiFixture,
} from './fixtures';

describe('naMetryki — komplet tablic (materiał audytowy)', () => {
  const metryki = naMetryki(widokZMetrykamiFixture().verdict);

  it('zachowuje stałą kolejność pięciu metryk L(f)', () => {
    expect(metryki.map((m) => m.klucz)).toEqual([
      'max-gain',
      'margines',
      'czest-winna',
      'odleglosc',
      'okrazenia',
    ]);
  });

  // Intencja zachowana: wartości PL z jednostkami, wprost z backendu.
  it('formatuje wartości PL (przecinek) i jednostki', () => {
    const byKey = Object.fromEntries(metryki.map((m) => [m.klucz, m]));
    expect(byKey['max-gain'].wartosc).toBe('1,420');
    expect(byKey['margines'].wartosc).toBe('-3,50 °');
    expect(byKey['czest-winna'].wartosc).toBe('34,50 Hz');
    expect(byKey['okrazenia'].wartosc).toBe('1');
  });

  // Odwrócone: dawna istotność warn/err z flag backendu byłaby oceną z L(f).
  it('metryki nie niosą istotności koloru', () => {
    for (const metryka of metryki) {
      expect('istotnosc' in metryka).toBe(false);
    }
  });
});

describe('naMetryki — bez przecięcia modułów', () => {
  it('brak częstotliwości winnej renderowany jako „—"', () => {
    const byKey = Object.fromEntries(
      naMetryki(widokBezRezystancjiUjemnejFixture().verdict).map((m) => [m.klucz, m]),
    );
    expect(byKey['max-gain'].wartosc).toBe('0,310');
    expect(byKey['czest-winna'].wartosc).toBe('—');
    expect(byKey['okrazenia'].wartosc).toBe('0');
  });
});

describe('naMetryki — brak danych karty', () => {
  it('metryki liczbowe puste renderowane jako „—" (uczciwość, bez fabrykacji)', () => {
    const byKey = Object.fromEntries(
      naMetryki(widokBrakDanychFixture().verdict).map((m) => [m.klucz, m]),
    );
    expect(byKey['max-gain'].wartosc).toBe('—');
    expect(byKey['margines'].wartosc).toBe('—');
    expect(byKey['czest-winna'].wartosc).toBe('—');
    expect(byKey['odleglosc'].wartosc).toBe('—');
  });
});

describe('opisRezystancjiUjemnej — informacja o modelu przekształtnika', () => {
  it('strefa obecna: częstotliwość i Re_min z backendu', () => {
    expect(opisRezystancjiUjemnej(widokZMetrykamiFixture().verdict)).toBe(
      'obecna (przy f 28,00 Hz, Re_min -0,0125 Ω)',
    );
  });

  it('strefa nieobecna → „brak"', () => {
    expect(opisRezystancjiUjemnej(widokBezRezystancjiUjemnejFixture().verdict)).toBe('brak');
    expect(opisRezystancjiUjemnej(widokBrakDanychFixture().verdict)).toBe('brak');
  });
});
