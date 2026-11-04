// @vitest-environment node
/**
 * Property Grid Validation Tests.
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: walidacja siatki = walidacja definicji pola w rejestrze
 * (`ui2/model/rejestrPol.ts`). Intencja dawnych testów (odmowa pustej nazwy, ujemnego
 * napięcia, ułamkowego zaczepu, cos φ > 1; pomijanie pól odczytu, typu i wyników) zostaje;
 * zmienia się źródło reguły — jedno dla siatki, karty odcinka i kreatorów. Dawne granice
 * wymyślone w kodzie (długość ≤ 500 km, zaczep ±20) zniknęły: długość ma dziedzinę operacji
 * (> 0), zakres zaczepu sprawdza backend na podstawie przełącznika z katalogu.
 */

import { describe, it, expect } from 'vitest';
import { KOD_ODMOWY_REJESTRU, validateField, validateElement } from '../property-grid/validation';
import { POLE_DLUGOSC_ODCINKA } from '../../ui2/model/rejestrPol';
import type { PropertyField } from '../types';

function pole(key: string, value: unknown, extra: Partial<PropertyField> = {}): PropertyField {
  return { key, label: key, value, type: 'number', editable: true, source: 'instance', ...extra };
}

describe('Walidacja siatki właściwości z rejestru pól', () => {
  it('odmawia pustej nazwy po polsku', () => {
    const wynik = validateField('Bus', pole('name', '', { type: 'string' }), '');
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe(KOD_ODMOWY_REJESTRU);
    expect(wynik.message).toBe('Nazwa nie może być pusta.');
  });

  it('przyjmuje niepustą nazwę', () => {
    expect(validateField('Bus', pole('name', 'Szyna 1', { type: 'string' }), 'Szyna 1').valid).toBe(true);
  });

  it('odmawia ujemnego napięcia szyny i przyjmuje dodatnie', () => {
    expect(validateField('Bus', pole('voltage_kv', -5), -5).valid).toBe(false);
    expect(validateField('Bus', pole('voltage_kv', 15), 15).valid).toBe(true);
  });

  it('długość odcinka: ta sama dziedzina co karta odcinka (> 0, bez górnej granicy)', () => {
    for (const wartosc of [0, -1, Number.NaN]) {
      expect(validateField('LineBranch', pole('length_km', wartosc), wartosc).valid).toBe(false);
      expect(POLE_DLUGOSC_ODCINKA.waliduj(wartosc)).not.toBeNull();
    }
    // 800 km odrzucała dawna reguła siatki (≤ 500), kreator magistrali przyjmował — jedna reguła.
    expect(validateField('LineBranch', pole('length_km', 800), 800).valid).toBe(true);
    expect(POLE_DLUGOSC_ODCINKA.waliduj(800_000)).toBeNull();
  });

  it('zaczep transformatora musi być całkowity (zakres sprawdza backend)', () => {
    expect(validateField('TransformerBranch', pole('tap_position', 1.5), 1.5).valid).toBe(false);
    expect(validateField('TransformerBranch', pole('tap_position', 25), 25).valid).toBe(true);
  });

  it('cos φ odbioru z przedziału (0; 1]', () => {
    expect(validateField('Load', pole('cos_phi', 1.5), 1.5).valid).toBe(false);
    expect(validateField('Load', pole('cos_phi', 0), 0).valid).toBe(false);
    expect(validateField('Load', pole('cos_phi', 0.9), 0.9).valid).toBe(true);
  });

  it('pole spoza rejestru (odczyt) nie ma reguły', () => {
    expect(validateField('LineBranch', pole('from_bus_ref', '', { type: 'ref' }), '').valid).toBe(true);
  });

  it('validateElement zbiera odmowy tylko pól edytowalnych instancji', () => {
    const komunikaty = validateElement('Bus', [
      pole('id', '', { type: 'string', editable: false }),
      pole('name', '', { type: 'string' }),
      pole('voltage_kv', -5),
      pole('ikss_ka', null, { editable: false, source: 'calculated' }),
    ]);
    expect(komunikaty.map((k) => k.field).sort()).toEqual(['name', 'voltage_kv']);
    expect(validateElement('LineBranch', [pole('r_ohm_per_km', 0, { editable: false, source: 'type' })])).toEqual([]);
  });
});
