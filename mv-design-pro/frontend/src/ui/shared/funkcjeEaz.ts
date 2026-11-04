/**
 * Słownik funkcji EAZ pola — lustro backendu (`network_model/catalog/funkcje_eaz.py`) czytane
 * z pliku GENEROWANEGO `slownikFunkcjiEaz.json` (parytet: `backend/tests/ci/
 * test_parytet_slownika_funkcji_eaz.py`; regeneracja opisana w nagłówku testu). Front nie ma
 * własnej tabeli kodów — każdy kod `Bay.protection_codes` ma wpis w słowniku backendu (walidator
 * modelu), a tu tylko go odczytujemy.
 *
 * Konsument: sekcja „Zabezpieczenia i automatyka" karty pola w inspektorze — wiersz na KAŻDĄ
 * funkcję (kod IEEE C37.2, zapis z rysunku, nazwa polska, rodzaj). Blok przekaźnika na schemacie
 * rysuje WSZYSTKIE kody pola bez klasyfikacji i bez licznika (odbiór B-02 właściciela 2026-11-04,
 * korekta: „napis +3 ma zniknąć całkowicie"; `compose/protectionMarking.ts`).
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
