/**
 * Rozwiazanie danych przekladnika pradowego z PRAWDZIWEGO katalogu (V12K-233).
 *
 * DLACZEGO TEN MODUL ISTNIEJE. Regula normowa klasy zabezpieczeniowej (IEC 61869-2)
 * i warunek rdzenia podwojnego dla 87T (IEC 60255-13) czytaja klase przekladnika jako
 * DANA na rekordzie wytworcy (`ct_accuracy_class`, `ct_application` — V12K-232).
 * Pola byly w kontrakcie i w regule, ale NIKT ICH NIE WYPELNIAL, wiec dla kazdego
 * realnego przekladnika os zabezpieczen zostawala „czesciowo" z kodem
 * `der.ct_class.unresolved`. Ten modul jest brakujacym ogniwem: bierze typy z
 * `/api/catalog/ct-types` i rozwiazuje z nich klase oraz zastosowanie.
 *
 * ZERO ZGADYWANIA. Klasa spoza kanonicznej unii `CtClass` daje `null` (nie „chyba
 * 5P10"), a rdzen PODWOJNY nigdy nie jest wyprowadzany — wymaga jawnej danej, ktorej
 * kontrakt katalogu backendu jeszcze nie ma (zapis dlugu w V12K-232).
 */

import type { CTCatalogType } from '../../catalog/types';
import type { CtClass } from './protection-catalogs';
import type { StationDerConnection } from './types';

/** Klasy dokladnosci uznawane przez kanon (unia `CtClass`). */
const KANONICZNE_KLASY: readonly CtClass[] = [
  '0.2',
  '0.5',
  '1.0',
  '5P10',
  '5P20',
  '10P10',
  '10P20',
];

/**
 * Klasa katalogowa jako kanoniczna `CtClass`, albo `null`.
 *
 * Katalog wystawia klase jako TEKST, wiec zwezenie musi byc jawne. Wartosc, ktorej
 * kanon nie zna (np. `5P30` albo zapis zlozony `5P10/0.5`), daje `null` — czyli
 * „nie da sie ustalic", nie „przyjmijmy najblizsza". Przyblizenie klasy przekladnika
 * falszowaloby werdykt zabezpieczeniowy.
 */
export function klasaKanoniczna(klasaKatalogowa: string | undefined | null): CtClass | null {
  if (!klasaKatalogowa) return null;
  const znormalizowana = klasaKatalogowa.trim().toUpperCase();
  return KANONICZNE_KLASY.find((k) => k.toUpperCase() === znormalizowana) ?? null;
}

/**
 * Zastosowanie rdzenia WYPROWADZONE z klasy (IEC 61869-2), albo `null`.
 *
 * Podzial jest definicyjny, nie umowny: klasy z litera `P` opisuja rdzenie
 * ZABEZPIECZENIOWE (blad zdefiniowany przy wielokrotnosci pradu znamionowego —
 * IEC 61869-2 § 5.6.2), klasy liczbowe 0,2 / 0,5 / 1,0 opisuja rdzenie POMIAROWE
 * (blad przy pradzie znamionowym). Dlatego z klasy wolno wyprowadzic te dwie
 * wartosci — tak samo, jak z materialu zyly wolno wziac stale IEC 60949.
 *
 * `dual` NIE JEST wyprowadzane. Rdzen podwojny to CECHA KONSTRUKCYJNA przekladnika
 * (dwa niezalezne rdzenie: zabezpieczeniowy + pomiarowy), a nie wniosek z jednej
 * klasy. Kontrakt katalogu backendu nie ma jeszcze tej danej, wiec warunek 87T
 * pozostaje nierozstrzygalny dopoki jej nie dostanie — i mowi to wprost, zamiast
 * zgadywac (V12K-232).
 */
export function zastosowanieZKlasy(klasa: CtClass | null): 'protection' | 'metering' | null {
  if (klasa === null) return null;
  return klasa.includes('P') ? 'protection' : 'metering';
}

/**
 * Uzupelnij rekord wytworcy o klase i zastosowanie przypisanego przekladnika.
 *
 * Dana JUZ OBECNA na rekordzie ma pierwszenstwo (moze pochodzic z materializacji
 * katalogowej w modelu). Brak typu w katalogu albo nieznana klasa zostawia pola
 * puste — regula zglosi wtedy `der.ct_class.unresolved`, czyli brak wiedzy, a nie
 * spelnienie warunku.
 */
export function wzbogacOKlaseCt(
  der: StationDerConnection,
  typyCt: readonly CTCatalogType[],
): StationDerConnection {
  const ref = der.catalogs.ct_catalog_ref;
  if (!ref) return der;
  if (der.ct_accuracy_class) return der;

  const typ = typyCt.find((t) => t.id === ref);
  const klasa = klasaKanoniczna(typ?.accuracy_class);
  if (klasa === null) return der;

  return {
    ...der,
    ct_accuracy_class: klasa,
    // Zastosowanie tylko gdy rekord go nie ma — i nigdy `dual` (patrz wyzej).
    ct_application: der.ct_application ?? zastosowanieZKlasy(klasa),
  };
}

/** Ta sama operacja dla listy wytworcow (wygoda miejsca wywolania). */
export function wzbogacDeryOKlaseCt(
  dery: readonly StationDerConnection[],
  typyCt: readonly CTCatalogType[],
): StationDerConnection[] {
  return dery.map((der) => wzbogacOKlaseCt(der, typyCt));
}
