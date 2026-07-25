/**
 * Prądy wejściowe koordynacji z REALNYCH biegów (karta F-K4 faza 3b).
 *
 * Test pilnuje tego, co było defektem: prądy nie mogą powstawać z niczego.
 * Wartości oczekiwane wynikają z niezależnego rachunku jednostkowego zapisanego
 * w każdym przypadku (kA→A tylko dla wyniku zwarciowego; wiersz rozpływu jest
 * już w amperach).
 */

import { describe, expect, it } from 'vitest';

import type { BranchResultRow, ShortCircuitRow } from '../../results-inspector/types';
import type { ProtectionDevice } from '../types';
import {
  podzielWierszeNaPrzypadki,
  pradyRoboczeZRozplywu,
  pradyZwarcioweZBiegu,
  zbudujPradyKoordynacji,
} from '../pradyZBiegow';

function wierszSC(over: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'node-1',
    element_id: 'bus/sn/1',
    target_name: 'Szyna SN 1',
    ikss_ka: 8.4,
    ip_ka: null,
    ith_ka: null,
    sk_mva: null,
    fault_type: '3F',
    flags: [],
    ...over,
  } as ShortCircuitRow;
}

function wierszGalezi(over: Partial<BranchResultRow> = {}): BranchResultRow {
  return {
    branch_id: 'line-1',
    element_id: 'bus/sn/1',
    name: 'Magistrala',
    from_bus: 'b1',
    to_bus: 'b2',
    i_a: 187.5,
    s_mva: null,
    p_mw: null,
    q_mvar: null,
    loading_pct: null,
    flags: [],
    ...over,
  };
}

function urzadzenie(over: Partial<ProtectionDevice> = {}): ProtectionDevice {
  return {
    id: 'dev-1',
    name: 'Zabezpieczenie pola',
    device_type: 'RELAY',
    location_element_id: 'bus/sn/1',
    settings: {},
    ...over,
  } as ProtectionDevice;
}

describe('przeliczenie jednostek', () => {
  it('prąd zwarciowy z kA na A (8,4 kA = 8400 A)', () => {
    expect(pradyZwarcioweZBiegu([wierszSC()]).get('bus/sn/1')).toBe(8400);
  });

  it('prąd roboczy rozpływu zostaje w amperach (bez mnożenia przez 1000)', () => {
    expect(pradyRoboczeZRozplywu([wierszGalezi()]).get('bus/sn/1')).toBe(187.5);
  });

  it('brak wartości w wierszu nie tworzy pozycji', () => {
    expect(pradyZwarcioweZBiegu([wierszSC({ ikss_ka: null })]).size).toBe(0);
    expect(pradyRoboczeZRozplywu([wierszGalezi({ i_a: null })]).size).toBe(0);
  });
});

describe('zbudujPradyKoordynacji — zero fabrykacji', () => {
  it('oba biegi zwarciowe + rozpływ dają kompletne prądy', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC({ ikss_ka: 8.4 })],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
      wierszeGalezi: [wierszGalezi()],
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'bus/sn/1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(wynik.operatingCurrents).toEqual([
      { location_id: 'bus/sn/1', i_operating_a: 187.5 },
    ]);
    expect(wynik.braki).toEqual([]);
  });

  it('brak biegu minimalnego → pozycji prądowej NIE MA, jest jawny brak', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC()],
      wierszeGalezi: [wierszGalezi()],
    });

    // Ik_min nie da się wziąć z Ik_max — czułość liczona na przepisanej wartości
    // byłaby fałszem, więc pozycja nie powstaje.
    expect(wynik.faultCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje)).toEqual(['prad_zwarciowy_min']);
  });

  it('urządzenie w miejscu bez wyniku zwarciowego → brak prądu, nie wartość domyślna', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ location_element_id: 'bus/sn/9' })],
      wierszeMax: [wierszSC()],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
    });

    expect(wynik.faultCurrents).toEqual([]);
    expect(wynik.operatingCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje).sort()).toEqual([
      'prad_roboczy',
      'prad_zwarciowy_max',
    ]);
    expect(wynik.braki[0].deviceName).toBe('Zabezpieczenie pola');
  });

  it('brak rozpływu → brak prądu roboczego, ale prądy zwarciowe zostają', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: [wierszSC()],
      wierszeMin: [wierszSC({ ikss_ka: 3.1 })],
    });

    expect(wynik.faultCurrents).toHaveLength(1);
    expect(wynik.operatingCurrents).toEqual([]);
    expect(wynik.braki.map((b) => b.czegoBrakuje)).toEqual(['prad_roboczy']);
  });

  it('dopasowanie po target_id, gdy wiersz nie niesie element_id', () => {
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie({ location_element_id: 'node-7' })],
      wierszeMax: [wierszSC({ target_id: 'node-7', element_id: undefined })],
      wierszeMin: [wierszSC({ target_id: 'node-7', element_id: undefined, ikss_ka: 2.0 })],
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'node-7', ik_max_3f_a: 8400, ik_min_3f_a: 2000 },
    ]);
  });

  it('wynik jest deterministyczny dla tego samego wejścia', () => {
    const params = {
      urzadzenia: [urzadzenie(), urzadzenie({ id: 'dev-2', location_element_id: 'bus/sn/2' })],
      wierszeMax: [wierszSC(), wierszSC({ element_id: 'bus/sn/2', ikss_ka: 5.0 })],
      wierszeMin: [
        wierszSC({ ikss_ka: 3.1 }),
        wierszSC({ element_id: 'bus/sn/2', ikss_ka: 1.8 }),
      ],
      wierszeGalezi: [wierszGalezi()],
    };

    expect(zbudujPradyKoordynacji(params)).toEqual(zbudujPradyKoordynacji(params));
  });
});

describe('podzielWierszeNaPrzypadki — klasyfikacja po współczynniku c (IEC 60909)', () => {
  it('c = 1,10 to przypadek maksymalny, c = 0,95 minimalny', () => {
    const wynik = podzielWierszeNaPrzypadki([
      wierszSC({ c_factor: 1.1, ikss_ka: 8.4 }),
      wierszSC({ c_factor: 0.95, ikss_ka: 3.1 }),
    ]);

    expect(wynik.max.map((w) => w.ikss_ka)).toEqual([8.4]);
    expect(wynik.min.map((w) => w.ikss_ka)).toEqual([3.1]);
    expect(wynik.bezWspolczynnika).toEqual([]);
  });

  it('wiersz bez c nie trafia do żadnego przypadku (zero zgadywania)', () => {
    const wynik = podzielWierszeNaPrzypadki([wierszSC({ c_factor: null })]);

    expect(wynik.max).toEqual([]);
    expect(wynik.min).toEqual([]);
    expect(wynik.bezWspolczynnika).toHaveLength(1);
  });

  it('dwa biegi razem dają komplet prądów koordynacji', () => {
    const { max, min } = podzielWierszeNaPrzypadki([
      wierszSC({ c_factor: 1.1, ikss_ka: 8.4 }),
      wierszSC({ c_factor: 0.95, ikss_ka: 3.1 }),
    ]);
    const wynik = zbudujPradyKoordynacji({
      urzadzenia: [urzadzenie()],
      wierszeMax: max,
      wierszeMin: min,
      wierszeGalezi: [wierszGalezi()],
    });

    expect(wynik.faultCurrents).toEqual([
      { location_id: 'bus/sn/1', ik_max_3f_a: 8400, ik_min_3f_a: 3100 },
    ]);
    expect(wynik.braki).toEqual([]);
  });
});
