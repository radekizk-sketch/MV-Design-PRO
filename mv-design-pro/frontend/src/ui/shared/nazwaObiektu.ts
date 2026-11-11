/**
 * Nazwa obiektu na ekranie — JEDNO miejsce reguły „nazwa albo jawny opis, nigdy identyfikator”.
 *
 * Dawniej każdy ekran miał własne `obiekt.name || obiekt.ref_id`: obiekt bez nazwy pokazywał
 * projektantowi referencję modelu z odciskiem (`stn/4855…/station`), identyfikator katalogu
 * albo UUID. Teraz obiekt bez nazwy dostaje opis rodzaju i miejsce w modelu — numer porządkowy
 * w swojej kolekcji („Odcinek bez nazwy (3 z 12)”) albo nazwę rodzica („Szyna bez nazwy
 * (GPZ Północ)”); obiekt wskazany referencją, którego nie ma w modelu, jest nazwany wprost
 * („Szyna spoza modelu”). Identyfikator wolno pokazać wyłącznie w informacjach audytowych
 * (`ui2/wyniki/wzorzec/InformacjeAudytowe`). Pilnuje strażnik
 * `ui/__tests__/kodyZamiastOpisow.guard.test.ts` (reguła R4).
 *
 * Ekrany wyników, które znają WYŁĄCZNIE referencję (rodzaj obiektu nieznany), nazywają obiekt
 * mostem `nazwaObiektuZMigawki` (`ui2/wyniki/wzorzec/useNazwaObiektu.ts`): nazwa z migawki
 * modelu, a bez niej opis rodzaju z segmentów referencji — ta sama reguła (nigdy identyfikator),
 * inne wejście. Gdzie rodzaj obiektu jest znany, obowiązuje ten moduł.
 */

import { isRawTechnicalIdentifier } from './publicTechnicalLabels';

export type RodzajObiektuNazwy =
  | 'szyna'
  | 'odcinek'
  | 'transformator'
  | 'zrodlo'
  | 'generator'
  | 'stacja'
  | 'pole'
  | 'odbior'
  | 'lacznik'
  | 'przekladnik'
  | 'wylacznik_roznicowopradowy'
  | 'sekcja'
  | 'punkt_podzialu'
  | 'przypadek'
  | 'pozycja_katalogu'
  | 'gniazdo'
  | 'ciag'
  | 'producent'
  | 'element';

export const RODZAJ_OBIEKTU_PL: Readonly<Record<RodzajObiektuNazwy, string>> = {
  szyna: 'Szyna',
  odcinek: 'Odcinek',
  transformator: 'Transformator',
  zrodlo: 'Źródło',
  generator: 'Źródło wytwórcze',
  stacja: 'Stacja',
  pole: 'Pole',
  odbior: 'Odbiór',
  lacznik: 'Łącznik',
  przekladnik: 'Przekładnik',
  wylacznik_roznicowopradowy: 'Wyłącznik różnicowoprądowy',
  sekcja: 'Sekcja szyn',
  punkt_podzialu: 'Punkt podziału',
  przypadek: 'Przypadek obliczeniowy',
  pozycja_katalogu: 'Pozycja katalogu',
  gniazdo: 'Gniazdo',
  ciag: 'Ciąg',
  producent: 'Producent',
  element: 'Element modelu',
};

/** Miejsce obiektu bez nazwy: numer w kolekcji, nazwa rodzica, „spoza modelu” (referencja
 *  modelu bez obiektu) albo „spoza katalogu” (referencja katalogu bez pozycji). */
export type MiejsceObiektu =
  | { readonly numer: number; readonly liczba: number }
  | { readonly rodzic: string }
  | { readonly spozaModelu: true }
  | { readonly spozaKatalogu: true };

/** Nazwa nadająca się na ekran: niepusta i niebędąca identyfikatorem (backend bez nazwy
 *  elementu bywa podstawia referencję z odciskiem albo UUID — ta sama reguła co
 *  `publicTechnicalLabel`). */
export function jestNazwa(nazwa: unknown): nazwa is string {
  return typeof nazwa === 'string' && nazwa.trim() !== '' && !isRawTechnicalIdentifier(nazwa);
}

/**
 * Nazwa obiektu dla ekranu. `nazwa` niepusta → ona sama (bez białych znaków na brzegach);
 * inaczej opis rodzaju z miejscem w modelu. Nigdy nie zwraca identyfikatora.
 */
export function nazwaObiektuPl(
  nazwa: string | null | undefined,
  rodzaj: RodzajObiektuNazwy,
  miejsce?: MiejsceObiektu | null,
): string {
  return nazwaZRodzajemPl(nazwa, RODZAJ_OBIEKTU_PL[rodzaj], miejsce);
}

/**
 * Ta sama reguła dla rodzaju podanego już po polsku (np. etykieta typu elementu inspektora
 * „Szyna”, „Transformator”). `rodzajPl` pusty → „Element modelu”.
 */
export function nazwaZRodzajemPl(
  nazwa: string | null | undefined,
  rodzajPl: string,
  miejsce?: MiejsceObiektu | null,
): string {
  if (jestNazwa(nazwa)) return nazwa.trim();
  const rodzaj = rodzajPl.trim() || RODZAJ_OBIEKTU_PL.element;
  if (miejsce && 'spozaModelu' in miejsce) return `${rodzaj} spoza modelu`;
  if (miejsce && 'spozaKatalogu' in miejsce) return `${rodzaj} spoza katalogu`;
  if (miejsce && 'numer' in miejsce) return `${rodzaj} bez nazwy (${miejsce.numer} z ${miejsce.liczba})`;
  if (miejsce && 'rodzic' in miejsce && jestNazwa(miejsce.rodzic)) {
    return `${rodzaj} bez nazwy (${miejsce.rodzic.trim()})`;
  }
  return `${rodzaj} bez nazwy`;
}

interface ZIdentyfikatorem {
  readonly ref_id?: string | null;
  readonly id?: string | null;
}

/** Numer porządkowy obiektu (od 1) w kolekcji modelu — po tożsamości albo po referencji. */
export function miejsceWKolekcji(
  kolekcja: readonly ZIdentyfikatorem[] | null | undefined,
  obiekt: ZIdentyfikatorem | string | null | undefined,
): MiejsceObiektu | null {
  if (!kolekcja || obiekt === null || obiekt === undefined) return null;
  const ref = typeof obiekt === 'string' ? obiekt : obiekt.ref_id ?? obiekt.id ?? null;
  const indeks = kolekcja.findIndex(
    (el) => el === obiekt || (ref !== null && (el.ref_id === ref || el.id === ref)),
  );
  return indeks < 0 ? null : { numer: indeks + 1, liczba: kolekcja.length };
}

/**
 * Nazwa obiektu wskazanego referencją w kolekcji modelu: obiekt znaleziony → jego nazwa albo
 * „bez nazwy (n z N)”; referencja bez obiektu → „spoza modelu”; brak referencji → `brak`.
 */
export function nazwaPoReferencjiPl<T extends ZIdentyfikatorem & { readonly name?: string | null }>(
  kolekcja: readonly T[] | null | undefined,
  ref: string | null | undefined,
  rodzaj: RodzajObiektuNazwy,
  brak = '—',
): string {
  if (!ref) return brak;
  const obiekt = (kolekcja ?? []).find((el) => el.ref_id === ref || el.id === ref);
  if (!obiekt) return nazwaObiektuPl(null, rodzaj, { spozaModelu: true });
  return nazwaObiektuPl(obiekt.name, rodzaj, miejsceWKolekcji(kolekcja, obiekt));
}

/** Pierwsza wartość nadająca się na nazwę (np. `name_pl`, potem `name` pozycji katalogu). */
export function pierwszaNazwa(...wartosci: readonly unknown[]): string | null {
  for (const w of wartosci) if (jestNazwa(w)) return w.trim();
  return null;
}
