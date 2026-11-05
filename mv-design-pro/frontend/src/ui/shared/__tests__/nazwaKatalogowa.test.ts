/**
 * Liczba i jednostka w nazwie pozycji katalogu nie rozchodzą się przy łamaniu wiersza
 * (odbiór zrzutu konfiguratora GPZ: „…630” / „A” w dwóch liniach). Iloczyn cech:
 * jednostka {A, kA, kV, MVA, kVA, mm², km, Hz, %, Ω} × liczba {całkowita, z kropką handlową,
 * z przecinkiem, ułamek z kreską} × kontekst {koniec napisu, przed spacją, przed przecinkiem,
 * przed nawiasem} × negatywy {słowo zaczynające się literą jednostki, brak liczby, kilka spacji}.
 */
import { describe, expect, it } from 'vitest';

import { bezLamaniaLiczbyIJednostki, nazwaKatalogowa, TWARDA_SPACJA } from '../nazwaKatalogowa';

const T = TWARDA_SPACJA;

describe('nazwaKatalogowa — liczba i jednostka połączone spacją twardą', () => {
  it.each([
    ['ABB VD4 17.5 kV 630 A', `ABB VD4 17.5${T}kV 630${T}A`],
    ['Wyłącznik 24 kV 1250 A 25 kA', `Wyłącznik 24${T}kV 1250${T}A 25${T}kA`],
    ['TR 110/15 kV 25 MVA Yd11', `TR 110/15${T}kV 25${T}MVA Yd11`],
    ['Kabel YAKXS 3x120 mm², 1,5 km', `Kabel YAKXS 3x120${T}mm², 1,5${T}km`],
    ['Przekładnik 15/0,1 kV (kl. 0,5)', `Przekładnik 15/0,1${T}kV (kl. 0,5)`],
    ['Bezpiecznik 40 A)', `Bezpiecznik 40${T}A)`],
    ['uk 11 %, 50 Hz, 2  Ω', `uk 11${T}%, 50${T}Hz, 2${T}Ω`],
    ['TR blokowy 1 250 kVA Dyn5', `TR blokowy 1 250${T}kVA Dyn5`],
  ])('%s', (wejscie, wynik) => {
    expect(nazwaKatalogowa(wejscie)).toBe(wynik);
  });

  it.each([
    ['słowo po liczbie zaczynające się literą jednostki', 'Seria 2 Advance', 'Seria 2 Advance'],
    ['jednostka bez liczby', 'kV i A w nazwie', 'kV i A w nazwie'],
    ['kropka dziesiętna nazwy handlowej zostaje', 'VD4 17.5', 'VD4 17.5'],
    ['litera A jako słowo po liczbie w środku wyrazu', 'Typ 3 AB', 'Typ 3 AB'],
  ])('bez zmian: %s', (_opis, wejscie, wynik) => {
    expect(nazwaKatalogowa(wejscie)).toBe(wynik);
  });

  it('jedna reguła dla nazw katalogu i opisów złożonych', () => {
    expect(bezLamaniaLiczbyIJednostki('630 A')).toBe(nazwaKatalogowa('630 A'));
  });
});
