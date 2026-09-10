/**
 * Testy walidacji syntaktycznej property-grid dla źródła (Source) — CV-4.3 K7.
 *
 * Kontekst naprawy: klucz reguły 'Source.sk_mva' nie odpowiadał żadnemu polu
 * (field-definitions.ts używa 'sk3_mva' — ten sam klucz co model ENM
 * `Source.sk3_mva`), więc reguła NIGDY się nie uruchamiała (`validateField`
 * dopasowuje po `${elementType}.${field.key}`). Naprawione w komplecie z
 * dodaniem trzech pól scenariusza MIN (K7-FE).
 */

import { describe, expect, it } from 'vitest';

import type { PropertyField } from '../../types';
import { validateField } from '../validation';

function pole(nadpisz: Partial<PropertyField> = {}): PropertyField {
  return {
    key: 'sk3_mva',
    label: 'Moc zwarciowa Sk″',
    value: 250,
    editable: true,
    type: 'number',
    source: 'instance',
    ...nadpisz,
  };
}

describe('validateField — Source.sk3_mva (naprawa klucza)', () => {
  it('odrzuca brak wartości (requiredNumber)', () => {
    const wynik = validateField('Source', pole({ value: null }), null);
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe('E-REQ-02');
  });

  it('odrzuca wartość ujemną/zerową (positiveNumber)', () => {
    const wynik = validateField('Source', pole({ value: 0 }), 0);
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe('E-RANGE-01');
  });

  it('przyjmuje wartość dodatnią', () => {
    expect(validateField('Source', pole({ value: 250 }), 250).valid).toBe(true);
  });
});

describe('validateField — Source scenariusz MIN (CV-4.3 K7)', () => {
  it('sk3_min_mva: puste (null) jest DOZWOLONE — pole opcjonalne (zero fabrykacji)', () => {
    const wynik = validateField(
      'Source',
      pole({ key: 'sk3_min_mva', value: null }),
      null,
    );
    expect(wynik.valid).toBe(true);
  });

  it('sk3_min_mva: wartość ujemna/zerowa jest odrzucana, gdy podana', () => {
    const wynik = validateField(
      'Source',
      pole({ key: 'sk3_min_mva', value: -1 }),
      -1,
    );
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe('E-RANGE-01');
  });

  it('ik3_min_ka: puste dozwolone, dodatnia wartość przechodzi', () => {
    expect(
      validateField('Source', pole({ key: 'ik3_min_ka', value: null }), null).valid,
    ).toBe(true);
    expect(
      validateField('Source', pole({ key: 'ik3_min_ka', value: 5.2 }), 5.2).valid,
    ).toBe(true);
  });

  it('rx_ratio_min: puste dozwolone, wartość ujemna odrzucona', () => {
    expect(
      validateField('Source', pole({ key: 'rx_ratio_min', value: null }), null).valid,
    ).toBe(true);
    const wynik = validateField(
      'Source',
      pole({ key: 'rx_ratio_min', value: -0.1 }),
      -0.1,
    );
    expect(wynik.valid).toBe(false);
  });
});

/**
 * Karta K7c-FE: naprawa kluczy `Source.bus_id`→`bus_ref` i
 * `Source.voltage_kv`→`sn_voltage_kv` (ta sama klasa co `sk_mva`→`sk3_mva`
 * naprawione kartą K7-FE, patrz docstring pliku) — reguła klucza NIEZGODNEGO
 * z `field-definitions.ts` nigdy się nie uruchamiała (`validateField` dopasowuje
 * po `${elementType}.${field.key}`), więc pole zawsze przechodziło walidację
 * mimo braku wartości.
 */
describe('validateField — Source.bus_ref / Source.sn_voltage_kv (naprawa klucza, CV-4.3 K7c)', () => {
  it('bus_ref: pusta referencja jest odrzucana (requiredRef)', () => {
    const wynik = validateField('Source', pole({ key: 'bus_ref', value: '' }), '');
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe('E-REF-01');
  });

  it('bus_ref: niepusta referencja przechodzi', () => {
    expect(validateField('Source', pole({ key: 'bus_ref', value: 'bus-1' }), 'bus-1').valid).toBe(true);
  });

  // Odbiór K7c-FE (KLASA, NIE INSTANCJA): te same reguły `requiredRef` dla referencji szyn
  // POZOSTAŁYCH typów elementów — klucze modelu ENM (`from_bus_ref`/`to_bus_ref`,
  // `hv_bus_ref`/`lv_bus_ref`, `Load.bus_ref`); z kluczami `*_bus_id` reguła nigdy nie biegła.
  it.each([
    ['LineBranch', 'from_bus_ref'],
    ['LineBranch', 'to_bus_ref'],
    ['TransformerBranch', 'hv_bus_ref'],
    ['TransformerBranch', 'lv_bus_ref'],
    ['Load', 'bus_ref'],
  ] as const)('%s.%s: pusta referencja odrzucana, niepusta przechodzi', (typ, klucz) => {
    const pusta = validateField(typ, pole({ key: klucz, value: '' }), '');
    expect(pusta.valid).toBe(false);
    expect(pusta.code).toBe('E-REF-01');
    expect(validateField(typ, pole({ key: klucz, value: 'bus-1' }), 'bus-1').valid).toBe(true);
  });

  it('sn_voltage_kv: brak wartości odrzucony (requiredNumber)', () => {
    const wynik = validateField('Source', pole({ key: 'sn_voltage_kv', value: null }), null);
    expect(wynik.valid).toBe(false);
    expect(wynik.code).toBe('E-REQ-02');
  });

  it('sn_voltage_kv: wartość dodatnia przechodzi', () => {
    expect(validateField('Source', pole({ key: 'sn_voltage_kv', value: 15 }), 15).valid).toBe(true);
  });
});

describe('validateField — Source.u_set_pu (napięcie zadane szyny bilansującej, CV-4.3 K7c)', () => {
  it('puste (null) jest DOZWOLONE — pole opcjonalne (zero fabrykacji, znamionowe)', () => {
    expect(validateField('Source', pole({ key: 'u_set_pu', value: null }), null).valid).toBe(true);
  });

  it('wartość w paśmie 0,8-1,2 p.u. przechodzi', () => {
    expect(validateField('Source', pole({ key: 'u_set_pu', value: 1.06 }), 1.06).valid).toBe(true);
    expect(validateField('Source', pole({ key: 'u_set_pu', value: 0.8 }), 0.8).valid).toBe(true);
    expect(validateField('Source', pole({ key: 'u_set_pu', value: 1.2 }), 1.2).valid).toBe(true);
  });

  it('wartość poza pasmem 0,8-1,2 p.u. jest odrzucana', () => {
    const ponizej = validateField('Source', pole({ key: 'u_set_pu', value: 0.7 }), 0.7);
    expect(ponizej.valid).toBe(false);
    expect(ponizej.code).toBe('E-RANGE-03');
    const powyzej = validateField('Source', pole({ key: 'u_set_pu', value: 1.3 }), 1.3);
    expect(powyzej.valid).toBe(false);
  });
});
