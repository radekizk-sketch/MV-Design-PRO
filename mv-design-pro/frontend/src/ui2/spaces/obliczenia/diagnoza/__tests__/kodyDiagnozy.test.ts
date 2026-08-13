/*
 * Mapowanie kod → zdanie inżynierskie (karta DIAGNOZA-PRZEBIEGU §0.2).
 *
 * Kompletność WOBEC BACKENDU pilnuje test dwustronny po stronie pytest
 * (`backend/tests/api/test_kody_diagnozy_maja_zdania.py`) — tylko on widzi oba
 * stosy naraz. Tutaj sprawdzamy WŁASNOŚCI zdań, których tamten test nie
 * obejmuje: że są po polsku, że nie przemycają angielskich kodów i że funkcje
 * zwracają zdanie, a nie kod, także dla wejścia spoza słownika.
 */

import { describe, expect, it } from 'vitest';

import {
  ETYKIETY_DOSTEPNOSCI,
  ETYKIETY_WAGI,
  ZDANIA_DIAGNOZY_PRZEBIEGU,
  ZDANIA_PRZYCZYN_PRZERWANIA,
  ZDANIA_REGUL,
  etykietaDostepnosci,
  etykietaWagi,
  zdaniaBlokad,
  zdanieDiagnozy,
  zdaniePrzyczyny,
  zdanieReguly,
} from '../kodyDiagnozy';

const WSZYSTKIE_ZDANIA = [
  ...Object.values(ZDANIA_REGUL),
  ...Object.values(ZDANIA_DIAGNOZY_PRZEBIEGU),
  ...Object.values(ZDANIA_PRZYCZYN_PRZERWANIA),
];

describe('słowniki zdań diagnostycznych', () => {
  it('każde zdanie jest niepustym zdaniem, nie skrótem ani kodem', () => {
    for (const zdanie of WSZYSTKIE_ZDANIA) {
      expect(zdanie.length).toBeGreaterThan(20);
      expect(zdanie).toMatch(/[a-ząćęłńóśźż]/);
    }
  });

  it('żadne zdanie nie wkleja surowego kodu produkcyjnego', () => {
    for (const zdanie of WSZYSTKIE_ZDANIA) {
      expect(zdanie).not.toMatch(/\b[EWI]-D\d{2}\b/);
      expect(zdanie).not.toMatch(/\bPRZ-[A-Z-]+\b/);
      // Angielskie tokeny kontraktu solvera nie mogą trafić na ekran.
      expect(zdanie).not.toMatch(/\b(max_iter|singular_\w+|numerical_issue|BLOCKER|AVAILABLE)\b/);
    }
  });

  it('osobliwość macierzy jest nazwana wprost — to sedno pytania „co osobliwe"', () => {
    expect(ZDANIA_PRZYCZYN_PRZERWANIA.singular_jacobian).toMatch(/osobliw/i);
    expect(ZDANIA_PRZYCZYN_PRZERWANIA.singular_matrix).toMatch(/osobliw/i);
  });
});

describe('funkcje tłumaczące', () => {
  it('zwracają zdanie ze słownika dla kodu znanego', () => {
    expect(zdanieReguly('E-D01')).toBe(ZDANIA_REGUL['E-D01']);
    expect(zdanieDiagnozy('PRZ-ZBIEZNY')).toBe(ZDANIA_DIAGNOZY_PRZEBIEGU['PRZ-ZBIEZNY']);
    expect(zdaniePrzyczyny('max_iter')).toBe(ZDANIA_PRZYCZYN_PRZERWANIA.max_iter);
  });

  it('dla kodu NIEZNANEGO nie wypisują kodu na ekran', () => {
    // Zakaz kodów produkcyjnych obowiązuje także w gałęzi awaryjnej —
    // inaczej pierwszy nowy kod backendu wyciekłby użytkownikowi.
    expect(zdanieReguly('E-D99')).not.toContain('E-D99');
    expect(zdanieDiagnozy('PRZ-CZEGOS-TAM')).not.toContain('PRZ-');
    expect(zdaniePrzyczyny('cos_nowego')).not.toContain('cos_nowego');
  });

  it('brak przyczyny przerwania to brak zdania, nie zdanie o braku', () => {
    expect(zdaniePrzyczyny(null)).toBeNull();
  });

  it('etykiety wagi i dostępności są po polsku', () => {
    expect(etykietaWagi('BLOCKER')).toBe(ETYKIETY_WAGI.BLOCKER);
    expect(etykietaWagi('NIEZNANA')).toBe(ETYKIETY_WAGI.INFO);
    expect(etykietaDostepnosci('AVAILABLE')).toBe(ETYKIETY_DOSTEPNOSCI.AVAILABLE);
    expect(etykietaDostepnosci('NIEZNANY')).toBe(ETYKIETY_DOSTEPNOSCI.BLOCKED);
  });
});

describe('zdania blokad analizy', () => {
  it('tłumaczy każdy kod blokujący na zdanie, zachowując kolejność', () => {
    expect(zdaniaBlokad(['E-D01', 'E-D05'])).toEqual([
      ZDANIA_REGUL['E-D01'],
      ZDANIA_REGUL['E-D05'],
    ]);
  });

  it('nie powtarza tego samego zdania dwa razy', () => {
    expect(zdaniaBlokad(['E-D01', 'E-D01'])).toEqual([ZDANIA_REGUL['E-D01']]);
  });

  it('pusta lista blokad daje pustą listę zdań', () => {
    expect(zdaniaBlokad([])).toEqual([]);
  });
});
