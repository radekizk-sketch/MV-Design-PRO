/**
 * Jedna funkcja odczytu zabezpieczenia pola — iloczyn cech:
 * funkcje wymagane przez wzorzec {są, brak} × sterownik {brak referencji, referencja wisząca,
 * przypisany po `ref_id`, po `id`, wyłącznikiem pola bez referencji, bez nastaw, wyłączony} ×
 * rola {liniowa, pomiarowa} × aparat {wyłącznik, bezpieczniki}.
 *
 * Każdy konsument (karta pola K6, kanwa SLD, inspektor ui2, lista przekaźników konfiguratora
 * stacji) czyta przez tę funkcję — test parytetu konsumentów jest w
 * `ui/sld/shared/__tests__/kartaTechnicznaElementu.braki.test.tsx`.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, EnergyNetworkModel, ProtectionAssignment } from '../../../types/enm';
import { resolveBayProtectionMarking } from '../../sld/v2/canvas/enmToSldAdapter';
import { przekaznikiStacji } from '../../network-build/station-configurator/przekaznikiStacji';
import {
  brakZabezpieczenia,
  przypisanieZabezpieczeniaPola,
  tekstZabezpieczeniaPola,
  zabezpieczeniePola,
} from '../zabezpieczeniePola';

type Sterownik = 'brak' | 'wiszacy' | 'ref_id' | 'id' | 'wylacznik' | 'bez_nastaw' | 'wylaczony';
const STEROWNIKI: readonly Sterownik[] = ['brak', 'wiszacy', 'ref_id', 'id', 'wylacznik', 'bez_nastaw', 'wylaczony'];

function przypisanie(sterownik: Sterownik): ProtectionAssignment {
  return {
    id: 'uuid-pz-1',
    ref_id: 'pz-1',
    name: 'Sterownik pola 3',
    breaker_ref: 'cb-3',
    device_type: 'overcurrent',
    settings:
      sterownik === 'bez_nastaw'
        ? []
        : ([
            { function_type: 'overcurrent_51', threshold_a: 400, time_delay_s: 0.5 },
            { function_type: 'overcurrent_50', threshold_a: 2000, time_delay_s: 0.1 },
            { function_type: 'overcurrent_51', threshold_a: 450, time_delay_s: 0.6 },
          ] as unknown as ProtectionAssignment['settings']),
    is_enabled: sterownik !== 'wylaczony',
    tags: [],
    meta: {},
  } as unknown as ProtectionAssignment;
}

function scena(wymagane: boolean, sterownik: Sterownik, rola: 'FEEDER' | 'MEASUREMENT', aparat: 'CB' | 'FUSE') {
  const pole = {
    id: 'bay-3',
    ref_id: 'bay-3',
    name: 'Pole liniowe 3',
    bay_role: rola,
    bus_ref: 'bus-sn',
    // Wyłącznik wykonawczy sterownika (`cb-3`) jest aparatem pola tylko w wariancie „wylacznik” —
    // w pozostałych sterownik działa na wyłącznik spoza pola.
    equipment_refs: sterownik === 'wylacznik' ? ['cb-3'] : [],
    primary_devices: [{ kind: aparat, device_ref: 'ap-3' }],
    protection_codes: wymagane ? ['51', '50', '51N', '67N', '51'] : [],
    protection_ref:
      sterownik === 'brak' || sterownik === 'wylacznik'
        ? null
        : sterownik === 'wiszacy'
          ? 'pz-nie-ma'
          : sterownik === 'id'
            ? 'uuid-pz-1'
            : 'pz-1',
  } as unknown as Bay;
  const model = { protection_assignments: [przypisanie(sterownik)], branches: [] } as unknown as EnergyNetworkModel;
  return { pole, model };
}

describe('zabezpieczenie pola — iloczyn wymagane × sterownik × rola × aparat', () => {
  for (const wymagane of [true, false]) {
    for (const sterownik of STEROWNIKI) {
      for (const rola of ['FEEDER', 'MEASUREMENT'] as const) {
        for (const aparat of ['CB', 'FUSE'] as const) {
          it(`wymagane=${wymagane} sterownik=${sterownik} rola=${rola} aparat=${aparat}`, () => {
            const { pole, model } = scena(wymagane, sterownik, rola, aparat);
            const stan = zabezpieczeniePola(model, pole);
            const przypisany = sterownik !== 'brak' && sterownik !== 'wiszacy';
            const tekst = tekstZabezpieczeniaPola(stan);
            // Tekst nigdy nie jest ogólnikiem „brak danych”.
            expect(tekst ?? '').not.toMatch(/brak danych/u);
            if (przypisany) {
              expect(stan.rodzaj).toBe('sterownik');
              if (stan.rodzaj !== 'sterownik') return;
              expect(stan.sterownik.kody).toEqual(sterownik === 'bez_nastaw' ? [] : ['51', '50']);
              expect(stan.wymagane).toEqual(wymagane ? ['51', '50', '51N', '67N'] : []);
              expect(tekst).toContain('Sterownik pola 3');
              expect(tekst!.includes('wyłączony w modelu')).toBe(sterownik === 'wylaczony');
              expect(brakZabezpieczenia(stan)).toBe(false);
              return;
            }
            if (wymagane) {
              expect(stan).toEqual({ rodzaj: 'brak_sterownika', wymagane: ['51', '50', '51N', '67N'] });
              expect(tekst).toBe('Brak sterownika — wzorzec pola wymaga funkcji 51, 50, 51N, 67N');
              expect(brakZabezpieczenia(stan)).toBe(true);
            } else if (rola === 'MEASUREMENT') {
              expect(stan.rodzaj).toBe('nie_dotyczy');
              expect(tekst).toBeNull();
            } else if (aparat === 'FUSE') {
              expect(stan.rodzaj).toBe('bezpieczniki');
              expect(brakZabezpieczenia(stan)).toBe(false);
            } else {
              expect(stan.rodzaj).toBe('brak_sterownika');
              expect(tekst).toBe('Brak sterownika zabezpieczeniowego w polu');
              expect(brakZabezpieczenia(stan)).toBe(true);
            }
          });
        }
      }
    }
  }
});

describe('jeden predykat powiązania pola ze sterownikiem — parytet konsumentów', () => {
  it.each(STEROWNIKI.map((s) => [s] as const))('sterownik=%s: karta pola, kanwa SLD i konfigurator stacji widzą to samo', (sterownik) => {
    const { pole, model } = scena(true, sterownik, 'FEEDER', 'CB');
    const rekord = przypisanieZabezpieczeniaPola(model, pole);
    const przypisany = sterownik !== 'brak' && sterownik !== 'wiszacy';
    expect(rekord !== null).toBe(przypisany);
    // Kanwa: tor wyzwalania z tego samego rekordu, kody w okręgu = funkcje wymagane wzorca.
    const znak = resolveBayProtectionMarking(pole, model);
    expect(znak?.breakerRef ?? null).toBe(przypisany ? 'cb-3' : null);
    expect(znak?.codes).toEqual(['51', '50', '51N', '67N']);
    // Konfigurator stacji: lista przekaźników z tego samego rekordu i tych samych kodów.
    const wiersze = przekaznikiStacji(model.protection_assignments ?? [], [{ oznaczenie: 'Pole liniowe 3', pole }]);
    expect(wiersze.length).toBe(przypisany ? 1 : 0);
    if (przypisany) expect(wiersze[0].functionsPl).toEqual(sterownik === 'bez_nastaw' ? [] : ['51', '50']);
  });
});
