/**
 * Słownik funkcji EAZ pola — lustro backendu (`network_model/catalog/funkcje_eaz.py`) czytane
 * z pliku GENEROWANEGO `slownikFunkcjiEaz.json` (parytet: `backend/tests/ci/
 * test_parytet_slownika_funkcji_eaz.py`; regeneracja opisana w nagłówku testu). Front nie ma
 * własnej tabeli kodów — każdy kod `Bay.protection_codes` ma wpis w słowniku backendu (walidator
 * modelu), a tu tylko go odczytujemy.
 *
 * Dwóch konsumentów jednej klasyfikacji (karta UX-04/POLE-LINIOWE-WZORZEC):
 *  · blok przekaźnika na schemacie — co najwyżej `MAKS_KODOW_ZABEZPIECZEN_NA_SCHEMACIE` kodów
 *    funkcji rodzaju ZABEZPIECZENIE i znacznik „+N" pozostałych funkcji pola; automatyka,
 *    blokady i zabezpieczenia technologiczne nie stoją na kanwie
 *    (`compose/protectionMarking.ts::kodyBlokuPrzekaznika`);
 *  · sekcja „Zabezpieczenia i automatyka" karty pola w inspektorze — wiersz na KAŻDĄ funkcję
 *    (kod IEEE C37.2, zapis z rysunku, nazwa polska, rodzaj).
 * Ten sam predykat (`czyFunkcjaNaSchemacie`) rozstrzyga, co jest na kanwie, a co liczy „+N" —
 * para predykatów z jednego źródła (CLAUDE.md, reguła KLASA pkt 3).
 */
import slownik from './slownikFunkcjiEaz.json';

export type RodzajFunkcjiEaz = 'ZABEZPIECZENIE' | 'AUTOMATYKA' | 'BLOKADA' | 'TECHNOLOGICZNE';

export interface FunkcjaEaz {
  readonly kod: string;
  /** Zapis z rysunków standardu (I>, Io>, LRW, SPZ…). */
  readonly oznaczeniePl: string;
  /** Numer IEEE C37.2 (ANSI) — `null`, gdy funkcja ma wyłącznie skrót krajowy (ZS, SCO…). */
  readonly ansi: string | null;
  readonly nazwaPl: string;
  readonly rodzaj: RodzajFunkcjiEaz;
}

interface WpisSlownika {
  readonly oznaczenie_pl: string;
  readonly ansi: string | null;
  readonly nazwa_pl: string;
  readonly rodzaj: string;
}

const RODZAJE: ReadonlySet<string> = new Set(slownik.rodzaje);

const FUNKCJE: ReadonlyMap<string, FunkcjaEaz> = new Map(
  Object.entries(slownik.funkcje as Record<string, WpisSlownika>).map(([kod, w]) => {
    if (!RODZAJE.has(w.rodzaj)) throw new Error(`słownik funkcji EAZ: nieznany rodzaj „${w.rodzaj}" kodu ${kod}`);
    return [
      kod,
      { kod, oznaczeniePl: w.oznaczenie_pl, ansi: w.ansi, nazwaPl: w.nazwa_pl, rodzaj: w.rodzaj as RodzajFunkcjiEaz },
    ];
  }),
);

/** Wpis słownika dla kodu; `null` — kod spoza słownika (model go nie dopuszcza, dane testowe tak). */
export function funkcjaEaz(kod: string): FunkcjaEaz | null {
  return FUNKCJE.get(kod) ?? null;
}

/** Polska nazwa rodzaju funkcji (kolumna „Rodzaj" karty pola). */
export const RODZAJ_FUNKCJI_EAZ_PL: Readonly<Record<RodzajFunkcjiEaz, string>> = {
  ZABEZPIECZENIE: 'zabezpieczenie',
  AUTOMATYKA: 'automatyka',
  BLOKADA: 'blokada',
  TECHNOLOGICZNE: 'zabezpieczenie technologiczne',
};

/** Najwięcej kodów funkcji zabezpieczeń w bloku przekaźnika na schemacie. */
export const MAKS_KODOW_ZABEZPIECZEN_NA_SCHEMACIE = 4;

/**
 * Czy funkcja może stać na kanwie: rodzaj ZABEZPIECZENIE. Kod spoza słownika zostaje na kanwie —
 * to dana modelu, której nie umiemy sklasyfikować; ukrycie jej byłoby cichym pominięciem.
 */
export function czyFunkcjaNaSchemacie(kod: string): boolean {
  const f = funkcjaEaz(kod);
  return f === null || f.rodzaj === 'ZABEZPIECZENIE';
}

export interface PodzialFunkcjiNaSchemacie {
  /** Kody narysowane w bloku przekaźnika — kolejność danych modelu. */
  readonly naSchemacie: readonly string[];
  /** Funkcje pola poza kanwą (nadmiar zabezpieczeń i każda automatyka/blokada/technologiczne). */
  readonly pozaSchematem: readonly string[];
}

/** Podział funkcji pola na blok przekaźnika i resztę (jedno źródło dla rysunku i „+N"). */
export function podzialFunkcjiNaSchemacie(kody: readonly string[]): PodzialFunkcjiNaSchemacie {
  const naSchemacie: string[] = [];
  const pozaSchematem: string[] = [];
  for (const kod of kody) {
    if (czyFunkcjaNaSchemacie(kod) && naSchemacie.length < MAKS_KODOW_ZABEZPIECZEN_NA_SCHEMACIE) naSchemacie.push(kod);
    else pozaSchematem.push(kod);
  }
  return { naSchemacie, pozaSchematem };
}
