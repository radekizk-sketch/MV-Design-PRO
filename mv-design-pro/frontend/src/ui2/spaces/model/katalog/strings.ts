/**
 * Etykiety PL przeglądarki katalogu (ui2 · przestrzeń „Model sieci" → Katalog).
 * Wszystkie teksty pierwszoplanowe po polsku; symbole branżowe (uk, Sn, In)
 * są nomenklaturą techniczną i pozostają dozwolone.
 */

import type { KategoriaId } from './types';

export const STRINGS = {
  tytul: 'Katalog typów',
  podtytul: 'Biblioteka typów sieci — przeglądanie i karta techniczna (tylko odczyt)',

  szukajPlaceholder: 'Szukaj typu lub producenta…',
  filtrProducent: 'Producent',
  filtrProducentWszyscy: 'Wszyscy producenci',

  listaPusta: 'Brak typów w tej kategorii.',
  listaPustaFiltr: 'Żaden typ nie pasuje do wyszukiwania.',
  ladowanie: 'Wczytywanie typów…',
  bladLadowania: 'Nie udało się wczytać typów katalogu.',

  wybierzTyp: 'Wybierz typ z listy, aby zobaczyć kartę techniczną.',
  liczbaTypow: (n: number): string => `Liczba typów: ${n}`,

  // Karta techniczna
  kartaParametry: 'Parametry techniczne',
  kartaPochodzenie: 'Pochodzenie danych',
  kartaBrakParametrow: 'Brak udokumentowanych parametrów dla tego typu.',
  producentNieznany: 'Producent nieznany',
  wkrotce: 'wkrótce',

  pochodzenieZrodlo: 'Źródło danych',
  pochodzenieWeryfikacja: 'Status weryfikacji',
  pochodzenieStatus: 'Status katalogu',
  pochodzenieNorma: 'Norma odniesienia',
  pochodzenieNota: 'Nota weryfikacyjna',

  // Gdzie użyty
  gdzieUzytyTytul: 'Gdzie użyty',
  gdzieUzytyPusto: 'Ten typ nie jest przypisany do żadnego elementu modelu.',
  gdzieUzytyLiczba: (n: number): string =>
    n === 1 ? 'Użyty w 1 elemencie modelu' : `Użyty w ${n} elementach modelu`,
  gdzieUzytyPokaz: 'Pokaż element w modelu',

  immutableNota: 'Typy katalogowe są niezmienne — karta służy wyłącznie do odczytu.',
} as const;

/** Etykiety PL kategorii katalogu. */
export const ETYKIETY_KATEGORII: Readonly<Record<KategoriaId, string>> = {
  LINIA: 'Linie napowietrzne',
  KABEL: 'Kable',
  TRANSFORMATOR: 'Transformatory',
  APARAT: 'Aparaty łączeniowe',
  FALOWNIK: 'Falowniki (OZE)',
};

/** Etykiety PL rodzajów aparatu łączeniowego (pole `equipment_kind`). */
export const ETYKIETY_RODZAJU_APARATU: Readonly<Record<string, string>> = {
  CIRCUIT_BREAKER: 'Wyłącznik',
  DISCONNECTOR: 'Odłącznik',
  EARTH_SWITCH: 'Uziemnik',
  LOAD_BREAK_SWITCH: 'Rozłącznik',
  SWITCH_DISCONNECTOR: 'Rozłącznik izolacyjny',
};

/** Etykiety PL rodzaju falownika/źródła (pole `kind`). */
export const ETYKIETY_RODZAJU_FALOWNIKA: Readonly<Record<string, string>> = {
  PV: 'Fotowoltaika',
  WIND: 'Farma wiatrowa',
  BESS: 'Magazyn energii',
  INVERTER: 'Przekształtnik',
};

/** Etykiety PL statusu weryfikacji katalogu (pole `verification_status`). */
export const ETYKIETY_WERYFIKACJI: Readonly<Record<string, string>> = {
  ZWERYFIKOWANY: 'Zweryfikowany',
  CZESCIOWO_ZWERYFIKOWANY: 'Częściowo zweryfikowany',
  NIEWERYFIKOWANY: 'Niezweryfikowany',
  REFERENCYJNY: 'Referencyjny',
};

/** Etykiety PL statusu katalogu (pole `catalog_status`). */
export const ETYKIETY_STATUSU_KATALOGU: Readonly<Record<string, string>> = {
  PRODUKCYJNY_V1: 'Produkcyjny',
  REFERENCYJNY_V1: 'Referencyjny',
  ANALITYCZNY_V1: 'Analityczny',
  TESTOWY: 'Testowy',
};
