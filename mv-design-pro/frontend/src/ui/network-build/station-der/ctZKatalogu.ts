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
 * Zastosowanie rdzenia — CZYTANE Z KATALOGU, nie wyprowadzane tutaj (V12K-239).
 *
 * Regula normowa IEC 61869-2 („klasa z litera P ⇒ rdzen zabezpieczeniowy") mieszkala
 * przez jedna karte W TEJ WARSTWIE, czyli norma zyla w prezentacji, a kontrakt katalogu
 * tej danej nie wystawial. Derywacja stoi teraz w katalogu
 * (`network_model/catalog/types.py::rdzen_ct_z_klasy`) i wraca polem `application`,
 * wiec front NIE MA wlasnej kopii reguly — czyta opublikowana wartosc.
 *
 * Wartosc nieznana katalogowi (`null`/brak, np. zapis zlozony opisujacy dwa rdzenie)
 * zostaje `null`: regula gotowosci zglosi wtedy brak danej, a nie spelnienie warunku.
 */
export function zastosowanieZKatalogu(
  typ: CTCatalogType | undefined,
): 'protection' | 'metering' | 'dual' | null {
  const zKatalogu = typ?.application;
  if (zKatalogu === 'protection' || zKatalogu === 'metering' || zKatalogu === 'dual') {
    return zKatalogu;
  }
  return null;
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

  // Klasa i rodzaj rdzenia to DWIE NIEZALEZNE dane — kazda uzupelniana osobno.
  // Wczesniejsza wersja przerywala na obecnej klasie, wiec rekord z klasa (np. z
  // materializacji katalogowej w modelu) NIGDY nie dostawal `ct_application`: po
  // uzupelnieniu katalogu o typ dwurdzeniowy warunek 87T pozostalby trwale
  // nierozstrzygalny, bez podania powodu.
  const typ = typyCt.find((t) => t.id === ref);
  const klasa = der.ct_accuracy_class ?? klasaKanoniczna(typ?.accuracy_class);
  const zastosowanie = der.ct_application ?? zastosowanieZKatalogu(typ);
  if (klasa === null && zastosowanie === null) return der;

  return {
    ...der,
    // Dana obecna na rekordzie ma pierwszenstwo; katalog bez danej zostawia pole
    // puste, wiec regula zglosi brak, a nie spelnienie warunku.
    ...(klasa !== null ? { ct_accuracy_class: klasa } : {}),
    ...(zastosowanie !== null ? { ct_application: zastosowanie } : {}),
  };
}

/** Ta sama operacja dla listy wytworcow (wygoda miejsca wywolania). */
export function wzbogacDeryOKlaseCt(
  dery: readonly StationDerConnection[],
  typyCt: readonly CTCatalogType[],
): StationDerConnection[] {
  return dery.map((der) => wzbogacOKlaseCt(der, typyCt));
}
