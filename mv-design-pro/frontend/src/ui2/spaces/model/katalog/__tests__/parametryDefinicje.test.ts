import { describe, expect, it } from 'vitest';

import {
  DEFINICJE_PARAMETROW,
  LICZBA_DEFINICJI,
  definicjaParametru,
} from '../parametryDefinicje';

describe('parametryDefinicje — słownik definicji parametrów', () => {
  it('zawiera co najmniej 15 udokumentowanych definicji (kryterium E4.1 §3.2)', () => {
    expect(LICZBA_DEFINICJI).toBeGreaterThanOrEqual(15);
  });

  it('każda definicja ma symbol, etykietę, normę i definicję (bez pustych pól)', () => {
    for (const [klucz, def] of Object.entries(DEFINICJE_PARAMETROW)) {
      expect(def.symbol.trim().length, klucz).toBeGreaterThan(0);
      expect(def.etykieta.trim().length, klucz).toBeGreaterThan(0);
      expect(def.norma.trim().length, klucz).toBeGreaterThan(0);
      expect(def.definicja.trim().length, klucz).toBeGreaterThan(0);
    }
  });

  it('każda norma odwołuje się do normy IEC (źródło normatywne)', () => {
    for (const [klucz, def] of Object.entries(DEFINICJE_PARAMETROW)) {
      expect(def.norma, klucz).toMatch(/IEC \d+/);
    }
  });

  it('definicje liczbowe mają jednostkę lub są jawnie bezwymiarowe (cosφ)', () => {
    // Wielkości JAWNIE bezwymiarowe: współczynnik mocy, współczynnik
    // bezpieczeństwa przyrządowego Fs i współczynnik napięciowy Fv (krotności,
    // nie wielkości mianowane) oraz liczba żył kabla (liczność).
    const bezwymiarowe = [
      'cosphi_min',
      'cosphi_max',
      'fs_safety_factor',
      'rated_voltage_factor',
      'number_of_cores',
    ];
    for (const [klucz, def] of Object.entries(DEFINICJE_PARAMETROW)) {
      if (def.typ === 'liczba' && !bezwymiarowe.includes(klucz)) {
        expect(def.jednostka.trim().length, klucz).toBeGreaterThan(0);
      }
    }
  });

  it('uk_percent ma symbol „uk", jednostkę „%" i normę IEC 60076-1', () => {
    const def = definicjaParametru('uk_percent');
    expect(def).not.toBeNull();
    expect(def?.symbol).toBe('uk');
    expect(def?.jednostka).toBe('%');
    expect(def?.norma).toContain('IEC 60076-1');
  });

  it('rated_power_mva ma symbol „Sn" i jednostkę „MVA"', () => {
    const def = definicjaParametru('rated_power_mva');
    expect(def?.symbol).toBe('Sn');
    expect(def?.jednostka).toBe('MVA');
  });

  it('vector_group jest definicją tekstową (grupa połączeń, bez jednostki)', () => {
    const def = definicjaParametru('vector_group');
    expect(def?.typ).toBe('tekst');
    expect(def?.jednostka).toBe('');
  });

  it('pole niejednoznaczne (bez znaczenia normowego) nie ma definicji', () => {
    expect(definicjaParametru('cooling_class')).toBeNull();
    expect(definicjaParametru('trade_name')).toBeNull();
    expect(definicjaParametru('nieistniejace_pole')).toBeNull();
  });

  it('nie zawiera snake_case w etykietach pierwszoplanowych', () => {
    for (const def of Object.values(DEFINICJE_PARAMETROW)) {
      expect(def.etykieta).not.toMatch(/[a-z]_[a-z]/);
    }
  });
});
