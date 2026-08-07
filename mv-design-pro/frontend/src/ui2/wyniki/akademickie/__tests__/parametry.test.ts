/*
 * Testy budowy ładunku parametrów projektowych (ui2/wyniki/akademickie/parametry.ts).
 *
 * Pilnują MOCNEJ DEKLARACJI: okno NIE podstawia żadnej wartości za solver — pole
 * puste oznacza klucz nieobecny w żądaniu. To strażnik defektu powierzchni zastanej,
 * która wysyłała zaszyty silnik „MOTOR_SN_1" 630 kW na węźle „BUS_SN" (węzeł, którego
 * w modelu użytkownika nie ma) i narzucała sposób uziemienia punktu neutralnego
 * niezależnie od projektu — projektant oglądał wynik dla cudzej sieci.
 *
 * Iloczyn cech: rodzaj z polami prostymi × rodzaj z obiektem uziomu × rodzaj z listą
 * złożoną × rodzaj bez parametrów; wartość pusta × wartość podana × wartość błędna.
 */

import { describe, expect, it } from 'vitest';

import { maParametry, zbudujParametry, zestawParametrow } from '../parametry';

describe('zbudujParametry — zero podstawiania za solver', () => {
  it('pusty formularz rodzaju z polami → pusty ładunek', () => {
    const parametry = zbudujParametry({
      rodzaj: 'opf_loss_lcc',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({});
  });

  it('pola z samymi odstępami traktowane jak puste', () => {
    const parametry = zbudujParametry({
      rodzaj: 'opf_loss_lcc',
      pola: { energy_price_pln_per_kwh: '   ', discount_rate: '' },
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({});
  });

  it('wypełnione pola liczbowe trafiają jako liczby, przecinek dziesiętny działa', () => {
    const parametry = zbudujParametry({
      rodzaj: 'opf_loss_lcc',
      pola: { energy_price_pln_per_kwh: '0,72', lcc_years: '25' },
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({ energy_price_pln_per_kwh: 0.72, lcc_years: 25 });
  });

  it('wartość nieliczbowa w polu liczbowym jest pomijana (bez fabrykacji zera)', () => {
    const parametry = zbudujParametry({
      rodzaj: 'hosting_capacity',
      pola: { hosting_monte_carlo_n: 'dużo' },
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({});
  });

  it('rodzaj bez parametrów ignoruje wpisy z innego rodzaju', () => {
    const parametry = zbudujParametry({
      rodzaj: 'voltage_stability',
      pola: { energy_price_pln_per_kwh: '0,72' },
      uziom: { rho1_ohm_m: '100' },
      metody: ['wattmetric'],
      wiersze: [{ ref: 'M1' }],
    });
    expect(parametry).toEqual({});
  });
});

describe('zbudujParametry — obiekt uziomu', () => {
  it('częściowo wypełniony uziom niesie TYLKO wypełnione pola', () => {
    const parametry = zbudujParametry({
      rodzaj: 'earthing_safety',
      pola: {},
      uziom: { gpz_ref: 'GPZ-1', rho1_ohm_m: '120', width_m: '' },
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({ earthing: { gpz_ref: 'GPZ-1', rho1_ohm_m: 120 } });
  });

  it('pusty uziom nie tworzy klucza `earthing`', () => {
    const parametry = zbudujParametry({
      rodzaj: 'earthing_safety',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(parametry).toEqual({});
    expect('earthing' in parametry).toBe(false);
  });
});

describe('zbudujParametry — metody detekcji i listy złożone', () => {
  it('zaznaczone metody trafiają jako lista; brak zaznaczeń = brak klucza', () => {
    const zZaznaczeniem = zbudujParametry({
      rodzaj: 'earth_fault_detection',
      pola: { neutral_grounding: 'isolated' },
      uziom: {},
      metody: ['wattmetric', 'admittance'],
      wiersze: [],
    });
    expect(zZaznaczeniem).toEqual({
      neutral_grounding: 'isolated',
      relay_methods: ['wattmetric', 'admittance'],
    });

    const bezZaznaczen = zbudujParametry({
      rodzaj: 'earth_fault_detection',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(bezZaznaczen).toEqual({});
  });

  it('lista silników: puste wiersze odpadają, wypełnione trafiają w całości', () => {
    const parametry = zbudujParametry({
      rodzaj: 'motor_starting',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [{}, { ref: 'M1', bus_ref: 'SZYNA_1', rated_kw: '630' }, { ref: '' }],
    });
    expect(parametry).toEqual({
      motors: [{ ref: 'M1', bus_ref: 'SZYNA_1', rated_kw: 630 }],
    });
  });

  it('lista pusta NIE tworzy klucza — koniec zaszytego silnika powierzchni zastanej', () => {
    // Pin dopisany po iniekcji: przywrócenie fabrykacji `motors: [MOTOR_SN_1 …]`
    // przechodziło przez model i łapał je dopiero test okna. Deklaracja „okno nie
    // podstawia danych wejściowych" musi mieć strażnika także tutaj.
    const silniki = zbudujParametry({
      rodzaj: 'motor_starting',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [],
    });
    expect(silniki).toEqual({});
    expect('motors' in silniki).toBe(false);

    const referencje = zbudujParametry({
      rodzaj: 'benchmark_validation',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [{}],
    });
    expect(referencje).toEqual({});
    expect('benchmark_references' in referencje).toBe(false);
  });

  it('lista referencji benchmarkowych trafia pod własnym kluczem', () => {
    const parametry = zbudujParametry({
      rodzaj: 'benchmark_validation',
      pola: {},
      uziom: {},
      metody: [],
      wiersze: [
        { network: 'IEEE 14', test: 'rozpływ', reference: '1,05', calculated: '1,04', tolerance_percent: '2' },
      ],
    });
    expect(parametry).toEqual({
      benchmark_references: [
        { network: 'IEEE 14', test: 'rozpływ', reference: 1.05, calculated: 1.04, tolerance_percent: 2 },
      ],
    });
  });
});

describe('zestaw parametrów rodzaju', () => {
  it('rodzaj spoza kontraktu okna → zestaw pusty (bez wyjątku)', () => {
    expect(zestawParametrow('rodzaj_ktorego_nie_ma')).toEqual({
      pola: [],
      uziom: false,
      lista: null,
      metodyDetekcji: false,
    });
    expect(maParametry('rodzaj_ktorego_nie_ma')).toBe(false);
  });

  it('rodzaje liczące wprost z modelu nie mają parametrów', () => {
    expect(maParametry('power_quality_harmonics')).toBe(false);
    expect(maParametry('insulation_coordination')).toBe(false);
    expect(maParametry('voltage_stability')).toBe(false);
    expect(maParametry('reliability_contingency')).toBe(false);
    expect(maParametry('uncertainty_sensitivity')).toBe(false);
  });

  it('rodzaje wymagające danych projektowych mają zestaw', () => {
    expect(maParametry('earthing_safety')).toBe(true);
    expect(maParametry('motor_starting')).toBe(true);
    expect(maParametry('neutral_earthing_design')).toBe(true);
    expect(maParametry('earth_fault_detection')).toBe(true);
  });
});
