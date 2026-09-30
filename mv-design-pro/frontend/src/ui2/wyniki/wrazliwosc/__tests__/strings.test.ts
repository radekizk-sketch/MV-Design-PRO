/*
 * Test domykający deklarację „zbiór ZAMKNIĘTY" mapy kryteriów wrażliwości
 * (reguła KLASA-NIE-INSTANCJA pkt 4: deklaracja bez testu = fałszywa pewność).
 *
 * Źródło prawdy: `backend/src/analysis/sensitivity/builder.py` — wyliczenie
 * wszystkich wartości `parameter_id=` emitowanych przez builder (linie:
 * `_entries_from_normative` load_q/load_p, `_entry_from_voltage_row`
 * voltage_limit, `_entry_from_short_circuit` short_circuit_level,
 * `_entry_from_protection_settings` protection_margin,
 * `_entries_from_protection_curves` protection_curve_margin).
 * Dopisanie nowego kodu w builderze bez etykiety PL = surowy identyfikator
 * w UI; ten test pilnuje, żeby mapa nie miała też kluczy MARTWYCH (literówka
 * `protection_settings` zamiast `protection_margin` była realnym defektem
 * wykrytym przy domykaniu tej karty).
 */

import { describe, expect, it } from 'vitest';
import { KRYTERIA_PL, etykietaKryterium } from '../strings';
import { WZORZEC_STRINGS } from '../../wzorzec/strings';

/** Wyliczenie kontraktu buildera (patrz nagłówek — źródło prawdy). */
const PARAMETER_ID_BUILDERA = [
  'load_q',
  'load_p',
  'voltage_limit',
  'short_circuit_level',
  'protection_margin',
  'protection_curve_margin',
] as const;

describe('KRYTERIA_PL — zbiór zamknięty builderem analysis/sensitivity', () => {
  it('mapa pokrywa DOKŁADNIE kody buildera (bez braków i bez kluczy martwych)', () => {
    expect(Object.keys(KRYTERIA_PL).sort()).toEqual([...PARAMETER_ID_BUILDERA].sort());
  });

  it('każda etykieta jest po polsku i niepusta', () => {
    for (const kod of PARAMETER_ID_BUILDERA) {
      const etykieta = etykietaKryterium(kod);
      expect(etykieta).not.toBe(kod);
      expect(etykieta.length).toBeGreaterThan(3);
    }
  });

  // Karta #145 (zmiana kanonu): kod spoza słownika nie trafia na ekran surowo — intencja
  // „nie zgadujemy nazwy" zostaje (brak fabrykowanej etykiety), ale zamiast kodu stoi
  // uczciwe zdanie po polsku.
  it('nieznany kod → uczciwe zdanie, nie kod i nie zgadnięta nazwa', () => {
    expect(etykietaKryterium('nowy_kod_bez_etykiety')).toBe(WZORZEC_STRINGS.wartoscSpozaSlownika);
  });
});
