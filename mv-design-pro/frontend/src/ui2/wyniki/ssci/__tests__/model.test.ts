/*
 * Testy mapowania modelu okna „Stabilność SSCI" (ui2/wyniki/ssci/model). Sprawdzają
 * czyste helpery: werdykt → istotność/etykieta oraz werdykt → wiersze metryk
 * (kolejność, wartości PL, istotność z FLAG backendu, uczciwe „—" przy braku danych).
 */

import { describe, expect, it } from 'vitest';

import { etykietaWerdyktu, istotnoscWerdyktu, naMetryki } from '../model';
import { widokBrakDanychFixture, widokNiestabilnyFixture, widokStabilnyFixture } from './fixtures';

describe('istotnoscWerdyktu', () => {
  it('mapuje kody werdyktu na istotność koloru', () => {
    expect(istotnoscWerdyktu('stabilny')).toBe('ok');
    expect(istotnoscWerdyktu('ryzyko SSCI')).toBe('warn');
    expect(istotnoscWerdyktu('niestabilny')).toBe('err');
    expect(istotnoscWerdyktu('brak danych')).toBe('neutral');
  });
});

describe('etykietaWerdyktu', () => {
  it('zwraca polską etykietę werdyktu', () => {
    expect(etykietaWerdyktu('niestabilny')).toBe('niestabilny');
    expect(etykietaWerdyktu('brak danych')).toBe('brak danych');
  });
});

describe('naMetryki — werdykt niestabilny', () => {
  const metryki = naMetryki(widokNiestabilnyFixture().verdict);

  it('zachowuje stałą kolejność sześciu metryk', () => {
    expect(metryki.map((m) => m.klucz)).toEqual([
      'max-gain',
      'margines',
      'czest-winna',
      'odleglosc',
      'okrazenia',
      'rezystancja-ujemna',
    ]);
  });

  it('formatuje wartości PL (przecinek) i jednostki', () => {
    const byKey = Object.fromEntries(metryki.map((m) => [m.klucz, m]));
    expect(byKey['max-gain'].wartosc).toBe('1,420');
    expect(byKey['margines'].wartosc).toBe('-3,50 °');
    expect(byKey['czest-winna'].wartosc).toBe('34,50 Hz');
    expect(byKey['okrazenia'].wartosc).toBe('1');
    expect(byKey['rezystancja-ujemna'].wartosc).toContain('obecna');
  });

  it('wyprowadza istotność z flag backendu (crossover/okrążenia/rezystancja)', () => {
    const byKey = Object.fromEntries(metryki.map((m) => [m.klucz, m]));
    expect(byKey['max-gain'].istotnosc).toBe('warn'); // has_magnitude_crossover
    expect(byKey['czest-winna'].istotnosc).toBe('warn'); // offending_frequency_hz != null
    expect(byKey['okrazenia'].istotnosc).toBe('err'); // encirclement_count >= 1
    expect(byKey['rezystancja-ujemna'].istotnosc).toBe('warn'); // present
  });
});

describe('naMetryki — werdykt stabilny', () => {
  it('bez przecięcia modułów: max|L| ok, brak częstotliwości winnej („—")', () => {
    const metryki = naMetryki(widokStabilnyFixture().verdict);
    const byKey = Object.fromEntries(metryki.map((m) => [m.klucz, m]));
    expect(byKey['max-gain'].istotnosc).toBe('ok');
    expect(byKey['czest-winna'].wartosc).toBe('—');
    expect(byKey['czest-winna'].istotnosc).toBe('neutral');
    expect(byKey['okrazenia'].istotnosc).toBe('ok');
    expect(byKey['rezystancja-ujemna'].istotnosc).toBe('ok');
  });
});

describe('naMetryki — werdykt brak danych', () => {
  it('metryki liczbowe puste renderowane jako „—" (uczciwość, bez fabrykacji)', () => {
    const metryki = naMetryki(widokBrakDanychFixture().verdict);
    const byKey = Object.fromEntries(metryki.map((m) => [m.klucz, m]));
    expect(byKey['max-gain'].wartosc).toBe('—');
    expect(byKey['margines'].wartosc).toBe('—');
    expect(byKey['czest-winna'].wartosc).toBe('—');
    expect(byKey['odleglosc'].wartosc).toBe('—');
    expect(byKey['rezystancja-ujemna'].wartosc).toBe('brak');
  });
});
