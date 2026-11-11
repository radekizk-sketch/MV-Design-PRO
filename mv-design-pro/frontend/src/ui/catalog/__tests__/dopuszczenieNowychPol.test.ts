/**
 * Jedyny predykat pickerów aparatu SN (zakaz gazów fluorowanych w obiektach projektowanych) —
 * iloczyn cech: stan obiektu {ISTNIEJACY, PROJEKTOWANY, '', null, undefined} × pole backendu
 * `dopuszczony_do_nowych_pol` {true, false, brak} × pozycja {już wybrana, inna, brak wyboru}.
 *
 * Brak pola NIE jest dopuszczeniem (brak potwierdzenia ≠ brak gazu — zasada backendu); obiekt
 * istniejący widzi wszystko (art. 13 ust. 7 i 10); pozycja już przypisana nie znika z listy.
 */
import { describe, expect, it } from 'vitest';

import {
  KATEGORIE_Z_DOPUSZCZENIEM_NOWYCH_POL,
  czyPozycjaDoWyboru,
  nazwaMediumPl,
  notaPozycjiUkrytych,
  pozycjeDoWyboru,
  type PozycjaZDopuszczeniem,
  type StanObiektuWyboru,
} from '../dopuszczenieNowychPol';

const STANY: readonly StanObiektuWyboru[] = ['ISTNIEJACY', 'PROJEKTOWANY', '', null, undefined];
const POLA: readonly (boolean | undefined)[] = [true, false, undefined];
const WYBOR = ['ta', 'inna', 'brak'] as const;

describe('czyPozycjaDoWyboru — iloczyn stan × pole backendu × wybór', () => {
  for (const stan of STANY) {
    for (const pole of POLA) {
      for (const wybor of WYBOR) {
        it(`stan=${String(stan)} pole=${String(pole)} wybór=${wybor}`, () => {
          const pozycja: PozycjaZDopuszczeniem = { id: 'poz-a', dopuszczony_do_nowych_pol: pole };
          const wybrana = wybor === 'ta' ? 'poz-a' : wybor === 'inna' ? 'poz-b' : null;
          const oczekiwane = stan === 'ISTNIEJACY' || wybor === 'ta' || pole === true;
          expect(czyPozycjaDoWyboru(pozycja, stan, wybrana)).toBe(oczekiwane);
        });
      }
    }
  }
});

describe('pozycjeDoWyboru i nota', () => {
  const pozycje: PozycjaZDopuszczeniem[] = [
    { id: 'sf6', dopuszczony_do_nowych_pol: false, powod_blokady_nowych_pol_pl: 'Aparat A wykorzystuje gaz fluorowany.' },
    { id: 'vac', dopuszczony_do_nowych_pol: true, powod_blokady_nowych_pol_pl: null },
    { id: 'bez-pola' },
  ];

  it('obiekt projektowany: wyłącznie pozycje dopuszczone, kolejność katalogu', () => {
    expect(pozycjeDoWyboru(pozycje, 'PROJEKTOWANY').map((p) => p.id)).toEqual(['vac']);
  });

  it('obiekt istniejący: cały katalog', () => {
    expect(pozycjeDoWyboru(pozycje, 'ISTNIEJACY').map((p) => p.id)).toEqual(['sf6', 'vac', 'bez-pola']);
    expect(notaPozycjiUkrytych(pozycje, 'ISTNIEJACY')).toBeNull();
  });

  it('pozycja już przypisana zostaje na liście obiektu projektowanego', () => {
    expect(pozycjeDoWyboru(pozycje, 'PROJEKTOWANY', 'sf6').map((p) => p.id)).toEqual(['sf6', 'vac']);
  });

  it('nota liczy ukryte i cytuje powód backendu', () => {
    expect(notaPozycjiUkrytych(pozycje, 'PROJEKTOWANY')).toBe(
      'Ukryto pozycje niedopuszczone do obiektu projektowanego: 2. Przykład: Aparat A wykorzystuje gaz fluorowany.',
    );
    expect(notaPozycjiUkrytych([{ id: 'x' }], null)).toBe(
      'Ukryto pozycje niedopuszczone do obiektu projektowanego: 1.',
    );
    expect(notaPozycjiUkrytych([pozycje[1]], 'PROJEKTOWANY')).toBeNull();
  });
});

describe('nazwaMediumPl i kategorie z dopuszczeniem', () => {
  it.each([
    ['VACUUM', 'próżnia'],
    ['vacuum', 'próżnia'],
    ['AIR', 'powietrze'],
    ['SF6', 'SF₆'],
    [' SF6 ', 'SF₆'],
    ['OLEJ', 'OLEJ'],
  ])('%s → %s', (medium, nazwa) => {
    expect(nazwaMediumPl(medium)).toBe(nazwa);
  });

  it('brak medium → brak etykiety', () => {
    expect(nazwaMediumPl(null)).toBeNull();
    expect(nazwaMediumPl(undefined)).toBeNull();
    expect(nazwaMediumPl('  ')).toBeNull();
  });

  it('filtr dotyczy wyłącznie kategorii aparatury SN', () => {
    expect([...KATEGORIE_Z_DOPUSZCZENIEM_NOWYCH_POL].sort()).toEqual(['MV_APPARATUS', 'SWITCH_EQUIPMENT']);
  });
});
