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

  immutableNota: 'Typy katalogowe są niezmienne — karta służy wyłącznie do odczytu.',
} as const;

/** Etykiety PL kategorii katalogu. */
export const ETYKIETY_KATEGORII: Readonly<Record<KategoriaId, string>> = {
  LINIA: 'Linie napowietrzne',
  KABEL: 'Kable SN',
  TRANSFORMATOR: 'Transformatory',
  APARAT: 'Aparaty łączeniowe SN',
  FALOWNIK: 'Falowniki (OZE)',
  CT: 'Przekładniki prądowe',
  VT: 'Przekładniki napięciowe',
  KABEL_NN: 'Kable nN',
  APARAT_NN: 'Aparaty nN',
  APARAT_NN_RCD: 'Wyłączniki różnicowoprądowe nN',
};
