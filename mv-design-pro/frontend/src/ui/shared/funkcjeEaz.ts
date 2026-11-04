/**
 * Słownik funkcji EAZ pola — lustro backendu (`network_model/catalog/funkcje_eaz.py`) czytane
 * z pliku GENEROWANEGO `slownikFunkcjiEaz.json` (parytet: `backend/tests/ci/
 * test_parytet_slownika_funkcji_eaz.py`; regeneracja opisana w nagłówku testu). Front nie ma
 * własnej tabeli kodów — każdy kod funkcji sterownika pola (`ProtectionAssignment.funkcje`) ma wpis
 * w słowniku backendu (walidator modelu), a tu tylko go odczytujemy: oznaczenie, nazwa, rodzaj,
 * SCHEMAT NASTAW (klucz, jednostka, wartości wyboru), wymagane wejścia, ewaluator i zestawy
 * funkcji rodzajów urządzeń. Nowa funkcja to wpis rejestru backendu — front nie ma listy.
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

/** Wejście funkcji (rejestr `WEJSCIA_FUNKCJI`): prądy fazowe, napięcia, 3I0, 3U0, druga strona
 *  strefy różnicowej, sygnał binarny. */
export type WejscieFunkcjiEaz = 'I' | 'U' | '3I0' | '3U0' | 'I_STRONY_2' | 'SYGNAL';

/** Pozycja schematu nastaw funkcji (lustro `SchematNastawy` rejestru). */
export interface SchematNastawyEaz {
  readonly klucz: string;
  readonly nazwaPl: string;
  readonly typ: 'LICZBA' | 'WYBOR' | 'LOGICZNA';
  /** Jednostka wartości liczbowej (`null` — wybór albo wartość logiczna). */
  readonly jednostka: string | null;
  /** Dozwolone wartości wyboru (pusta lista — nastawa liczbowa albo logiczna). */
  readonly wartosci: readonly string[];
  /** Wartość liczbowa musi być dodatnia (zwłoka strefy Z1 może być zerem). */
  readonly dodatnia: boolean;
}

export interface FunkcjaEaz {
  readonly kod: string;
  /** Zapis z rysunków standardu (I>, Io>, LRW, SPZ…). */
  readonly oznaczeniePl: string;
  /** Numer IEEE C37.2 (ANSI) — `null`, gdy funkcja ma wyłącznie skrót krajowy (ZS, SCO…). */
  readonly ansi: string | null;
  readonly nazwaPl: string;
  readonly rodzaj: RodzajFunkcjiEaz;
  readonly wejsciaWymagane: readonly WejscieFunkcjiEaz[];
  readonly wejsciaOpcjonalne: readonly WejscieFunkcjiEaz[];
  /** Ewaluator produktu (`null` — funkcja bez ewaluatora: ocena „nie oceniono” z powodem). */
  readonly ocena: string | null;
  readonly nastawy: readonly SchematNastawyEaz[];
}

interface WpisSchematu {
  readonly klucz: string;
  readonly nazwa_pl: string;
  readonly typ: string;
  readonly jednostka: string | null;
  readonly wartosci: readonly string[];
  readonly dodatnia: boolean;
}

interface WpisSlownika {
  readonly oznaczenie_pl: string;
  readonly ansi: string | null;
  readonly nazwa_pl: string;
  readonly rodzaj: string;
  readonly wejscia_wymagane: readonly string[];
  readonly wejscia_opcjonalne: readonly string[];
  readonly ocena: string | null;
  readonly nastawy: readonly WpisSchematu[];
}

const RODZAJE: ReadonlySet<string> = new Set(slownik.rodzaje);
const WEJSCIA: ReadonlySet<string> = new Set(slownik.wejscia);
const TYPY_NASTAW: ReadonlySet<string> = new Set(['LICZBA', 'WYBOR', 'LOGICZNA']);

function wejsciaWpisu(kod: string, lista: readonly string[]): readonly WejscieFunkcjiEaz[] {
  for (const w of lista) {
    if (!WEJSCIA.has(w)) throw new Error(`słownik funkcji EAZ: nieznane wejście „${w}" kodu ${kod}`);
  }
  return lista as readonly WejscieFunkcjiEaz[];
}

const FUNKCJE: ReadonlyMap<string, FunkcjaEaz> = new Map(
  Object.entries(slownik.funkcje as Record<string, WpisSlownika>).map(([kod, w]) => {
    if (!RODZAJE.has(w.rodzaj)) throw new Error(`słownik funkcji EAZ: nieznany rodzaj „${w.rodzaj}" kodu ${kod}`);
    const nastawy = w.nastawy.map((n): SchematNastawyEaz => {
      if (!TYPY_NASTAW.has(n.typ)) throw new Error(`słownik funkcji EAZ: nieznany typ nastawy „${n.typ}" kodu ${kod}`);
      return {
        klucz: n.klucz,
        nazwaPl: n.nazwa_pl,
        typ: n.typ as SchematNastawyEaz['typ'],
        jednostka: n.jednostka,
        wartosci: n.wartosci,
        dodatnia: n.dodatnia,
      };
    });
    return [
      kod,
      {
        kod,
        oznaczeniePl: w.oznaczenie_pl,
        ansi: w.ansi,
        nazwaPl: w.nazwa_pl,
        rodzaj: w.rodzaj as RodzajFunkcjiEaz,
        wejsciaWymagane: wejsciaWpisu(kod, w.wejscia_wymagane),
        wejsciaOpcjonalne: wejsciaWpisu(kod, w.wejscia_opcjonalne),
        ocena: w.ocena,
        nastawy,
      },
    ];
  }),
);

/** Wpis słownika dla kodu; `null` — kod spoza słownika (model go nie dopuszcza, dane testowe tak). */
export function funkcjaEaz(kod: string): FunkcjaEaz | null {
  return FUNKCJE.get(kod) ?? null;
}

/** Wszystkie funkcje rejestru w kolejności rejestru (picker funkcji karty pola i kreatora). */
export function wszystkieFunkcjeEaz(): readonly FunkcjaEaz[] {
  return [...FUNKCJE.values()];
}

/** Etykieta funkcji dla projektanta: zapis z rysunku i kod w nawiasie — „I> (51)” (lustro
 *  `etykieta_funkcji_eaz` backendu). Kod spoza rejestru nazwany wprost. */
export function etykietaFunkcjiEaz(kod: string): string {
  const f = funkcjaEaz(kod);
  if (f === null) return `funkcja spoza rejestru (${kod})`;
  return f.oznaczeniePl === f.kod ? f.kod : `${f.oznaczeniePl} (${f.kod})`;
}

/** Polska etykieta wartości wyboru nastawy (krzywa, strona przekładnika, kierunek). */
export function etykietaWartosciNastawy(wartosc: string): string {
  return (slownik.etykiety_wartosci as Record<string, string>)[wartosc] ?? wartosc;
}

/** Zestaw funkcji rodzaju urządzenia (szybki wybór kreatora przekaźnika) — rejestr backendu. */
export const ZESTAWY_FUNKCJI_RODZAJU: Readonly<Record<string, readonly string[]>> =
  slownik.zestawy_rodzaju as Record<string, readonly string[]>;

/** Polska nazwa wejścia funkcji. */
export const NAZWA_WEJSCIA_PL: Readonly<Record<WejscieFunkcjiEaz, string>> = {
  I: 'prądy fazowe (przekładnik prądowy)',
  U: 'napięcia fazowe (przekładnik napięciowy)',
  '3I0': 'prąd zerowy 3I0 (Holmgreen albo Ferranti)',
  '3U0': 'napięcie zerowe 3U0 (otwarty trójkąt albo z napięć fazowych)',
  I_STRONY_2: 'prądy drugiej strony strefy różnicowej',
  SYGNAL: 'sygnał binarny',
};

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
