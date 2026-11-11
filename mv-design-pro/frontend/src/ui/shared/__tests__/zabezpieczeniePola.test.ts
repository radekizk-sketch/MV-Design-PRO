// @vitest-environment node
/**
 * Jedna funkcja odczytu zabezpieczenia pola na jednej strukturze modelu — sterowniku pola
 * (`ProtectionAssignment` z `bay_ref`, karta OCHRONA-JEDNO-ZRODLO, ADR-022). Iloczyn cech:
 * sterownik {brak, przypisany do innego pola, przypisany, bez funkcji, funkcja wyłączona,
 * dwa stopnie jednej funkcji, wyłączony, z wyrobem katalogu} × rola {liniowa, pomiarowa} ×
 * aparat {wyłącznik, bezpieczniki w rekordzie aparatu, gałąź bezpiecznikowa pola}.
 *
 * Każdy konsument (karta pola K6, inspektor ui2, blok przekaźnika na kanwie SLD, lista
 * przekaźników konfiguratora stacji) czyta TEN SAM sterownik przez `ui/shared/sterownikZabezpieczen`
 * — parytet konsumentów przypina drugi blok; test parytetu karty i inspektora jest
 * w `ui/sld/shared/__tests__/kartaTechnicznaElementu.braki.test.tsx`.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, EnergyNetworkModel, ProtectionAssignment } from '../../../types/enm';
import { resolveBayProtectionMarking } from '../../sld/v2/canvas/enmToSldAdapter';
import { przekaznikiStacji } from '../../network-build/station-configurator/przekaznikiStacji';
import { brakZabezpieczenia, sterownikPola, tekstZabezpieczeniaPola, zabezpieczeniePola } from '../zabezpieczeniePola';

type Sterownik =
  | 'brak'
  | 'obce_pole'
  | 'przypisany'
  | 'bez_funkcji'
  | 'funkcja_wylaczona'
  | 'dwa_stopnie'
  | 'wylaczony'
  | 'z_katalogu';
const STEROWNIKI: readonly Sterownik[] = [
  'brak',
  'obce_pole',
  'przypisany',
  'bez_funkcji',
  'funkcja_wylaczona',
  'dwa_stopnie',
  'wylaczony',
  'z_katalogu',
];
type Aparat = 'CB' | 'FUSE' | 'galaz_bezpiecznikowa';
const APARATY: readonly Aparat[] = ['CB', 'FUSE', 'galaz_bezpiecznikowa'];

/** Kody, które sterownik danego wariantu niesie jako włączone (kolejność zapisu, kod raz). */
function oczekiwaneKody(sterownik: Sterownik): string[] {
  if (sterownik === 'bez_funkcji') return [];
  if (sterownik === 'funkcja_wylaczona') return ['50'];
  return ['51', '50'];
}

function sterownikModelu(sterownik: Sterownik): ProtectionAssignment {
  const funkcje =
    sterownik === 'bez_funkcji'
      ? []
      : sterownik === 'funkcja_wylaczona'
        ? [
            { ref: 'f-51', kod: '51', wlaczona: false },
            { ref: 'f-50', kod: '50' },
          ]
        : sterownik === 'dwa_stopnie'
          ? [
              { ref: 'f-51-1', kod: '51' },
              { ref: 'f-50', kod: '50' },
              { ref: 'f-51-2', kod: '51' },
            ]
          : [
              { ref: 'f-51', kod: '51' },
              { ref: 'f-50', kod: '50' },
            ];
  return {
    id: 'uuid-pz-1',
    ref_id: 'pz-1',
    name: 'Sterownik pola 3',
    bay_ref: sterownik === 'obce_pole' ? 'bay-inne' : 'bay-3',
    wejscia: {},
    funkcje,
    grupy_nastaw: [{ numer: 1, funkcje: [] }],
    aktywna_grupa: 1,
    macierz_wyzwolen: funkcje.map((f) => ({ funkcja_ref: f.ref, aparat_refs: ['cb-3'] })),
    is_enabled: sterownik !== 'wylaczony',
    ...(sterownik === 'z_katalogu' ? { materialized_params: { name_pl: 'Sterownik polowy X' } } : {}),
    tags: [],
    meta: {},
  } as unknown as ProtectionAssignment;
}

function scena(sterownik: Sterownik, rola: 'FEEDER' | 'MEASUREMENT', aparat: Aparat) {
  const pole = {
    id: 'bay-3',
    ref_id: 'bay-3',
    name: 'Pole liniowe 3',
    bay_role: rola,
    bus_ref: 'bus-sn',
    equipment_refs: aparat === 'galaz_bezpiecznikowa' ? ['fu-3'] : ['cb-3'],
    primary_devices: aparat === 'galaz_bezpiecznikowa' ? [] : [{ kind: aparat, device_ref: 'ap-3' }],
  } as unknown as Bay;
  const model = {
    protection_assignments: sterownik === 'brak' ? [] : [sterownikModelu(sterownik)],
    branches: aparat === 'galaz_bezpiecznikowa' ? [{ ref_id: 'fu-3', type: 'fuse' }] : [],
  } as unknown as EnergyNetworkModel;
  return { pole, model };
}

describe('zabezpieczenie pola — iloczyn sterownik × rola × aparat (jedna struktura, ADR-022)', () => {
  for (const sterownik of STEROWNIKI) {
    for (const rola of ['FEEDER', 'MEASUREMENT'] as const) {
      for (const aparat of APARATY) {
        it(`sterownik=${sterownik} rola=${rola} aparat=${aparat}`, () => {
          const { pole, model } = scena(sterownik, rola, aparat);
          const stan = zabezpieczeniePola(model, pole);
          const przypisany = sterownik !== 'brak' && sterownik !== 'obce_pole';
          const tekst = tekstZabezpieczeniaPola(stan);
          // Tekst nigdy nie jest ogólnikiem „brak danych” ani identyfikatorem modelu.
          expect(tekst ?? '').not.toMatch(/brak danych/u);
          expect(tekst ?? '').not.toContain('pz-1');
          if (przypisany) {
            expect(stan.rodzaj).toBe('sterownik');
            if (stan.rodzaj !== 'sterownik') return;
            expect(stan.sterownik.kody).toEqual(oczekiwaneKody(sterownik));
            expect(tekst).toContain('Sterownik pola 3');
            expect(tekst!.includes('Sterownik polowy X')).toBe(sterownik === 'z_katalogu');
            expect(tekst!.includes('bez funkcji')).toBe(sterownik === 'bez_funkcji');
            expect(tekst!.includes('wyłączony w modelu')).toBe(sterownik === 'wylaczony');
            expect(brakZabezpieczenia(stan)).toBe(false);
            return;
          }
          if (rola === 'MEASUREMENT') {
            expect(stan.rodzaj).toBe('nie_dotyczy');
            expect(tekst).toBeNull();
            expect(brakZabezpieczenia(stan)).toBe(false);
          } else if (aparat !== 'CB') {
            expect(stan.rodzaj).toBe('bezpieczniki');
            expect(tekst).toBe('Bezpieczniki aparatu pola');
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
});

describe('jeden sterownik pola — parytet konsumentów', () => {
  it.each(STEROWNIKI.map((s) => [s] as const))(
    'sterownik=%s: stan pola, kanwa SLD i konfigurator stacji widzą ten sam rekord i te same kody',
    (sterownik) => {
      const { pole, model } = scena(sterownik, 'FEEDER', 'CB');
      const przypisany = sterownik !== 'brak' && sterownik !== 'obce_pole';
      const rekord = sterownikPola(model, pole);
      expect(rekord !== null).toBe(przypisany);
      const kody = przypisany ? oczekiwaneKody(sterownik) : [];
      // Kanwa: blok przekaźnika z kodów tego samego sterownika, tor wyzwalania z jego macierzy;
      // sterownik bez włączonych funkcji nie rysuje bloku (brak danych = brak oznaczenia).
      const znak = resolveBayProtectionMarking(pole, model);
      if (kody.length === 0) {
        expect(znak).toBeUndefined();
      } else {
        expect(znak?.codes).toEqual(kody);
        expect(znak?.breakerRef).toBe('cb-3');
      }
      // Konfigurator stacji: lista przekaźników z tego samego rekordu i tych samych kodów.
      const wiersze = przekaznikiStacji(model, [{ oznaczenie: 'Pole liniowe 3', bayRef: pole.ref_id }]);
      expect(wiersze.length).toBe(przypisany ? 1 : 0);
      if (przypisany) {
        expect(wiersze[0].functionsPl).toEqual(kody);
        expect(wiersze[0].relayId).toBe(rekord!.ref);
        expect(wiersze[0].typePl).toBe(rekord!.urzadzenie);
        expect(wiersze[0].enabled).toBe(rekord!.wlaczone);
      }
    },
  );
});
