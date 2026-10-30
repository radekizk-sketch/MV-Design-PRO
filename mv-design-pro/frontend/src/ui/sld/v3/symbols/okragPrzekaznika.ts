/**
 * KODY FUNKCJI W OKRĘGU PRZEKAŹNIKA — jedno źródło wyboru i położenia (karta
 * UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta §11.7 pkt 5: podłoga czytelności S9-7 —
 * 8 px przy wejściu w LOD 2 — obejmuje litery symboli).
 *
 * Okrąg przekaźnika (spec §17.3) niesie co najwyżej dwa kody funkcji, ale WYŁĄCZNIE takie,
 * których tusz pismem podłogi (8 px, waga 600) mieści się w okręgu bez nakładania na jego
 * kreskę. Zasięg tuszu z tabeli kroju (`core/text.ts`: posuwy — szerokość, nagłówki glifów —
 * wysokość), nie z szacunku. Wybór to PREFIKS listy kodów z danych (kolejność danych, zero
 * sortowania): najpierw dwa pierwsze kody w dwóch wierszach, gdy się nie mieszczą — pierwszy
 * w jednym wierszu, gdy i on się nie mieści — okrąg bez kodów. Kody spoza okręgu niosą wiersze
 * bloku (`compose/protectionMarking.ts`), więc okrąg ∪ wiersze = lista kodów pola, w kolejności
 * danych, bez powtórzeń.
 *
 * Kompozycja (`compose/station.ts`, `compose/gpz.ts`) wybiera kody tą funkcją, a glif
 * (`symbols/glyphs.tsx::ProtectionRelayGlyph`) rysuje je w liniach bazowych z tej samej
 * funkcji — wybór i rysunek nie mogą się rozjechać.
 */
import { posuwZnakuEm, zasiegPionowyTuszu } from '../core/text';

/** Okrąg przekaźnika w układzie glifu 24 × 24 (`SYMBOL_DEFS.protectionRelay`). */
export const OKRAG_PRZEKAZNIKA = { cx: 12, cy: 12, r: 11 } as const;

/** Grubość kreski okręgu [px świata] — `V3_STROKE_APPARATUS` (`symbols/glyphs.tsx`); test
 *  podłogi liter przypina równość obu stałych. */
export const KRESKA_OKREGU_PRZEKAZNIKA = 1.2;

/** Prześwit tuszu kodu od wewnętrznej krawędzi kreski okręgu [px świata]. */
export const PRZESWIT_KODU_OD_OKREGU = 0.4;

/** Promień, w którym musi leżeć tusz kodu: r − pół kreski − prześwit. */
export const PROMIEN_UZYTECZNY_OKREGU =
  OKRAG_PRZEKAZNIKA.r - KRESKA_OKREGU_PRZEKAZNIKA / 2 - PRZESWIT_KODU_OD_OKREGU;

/** Pismo kodu w okręgu — podłoga S9-7 (8 px świata = 8 px ekranu przy wejściu w LOD 2). */
export const PISMO_KODU_W_OKREGU = { fontSize: 8, fontWeight: 600 } as const;

/** Odstęp tuszu dwóch wierszy kodów w okręgu [px świata]. */
export const ODSTEP_WIERSZY_W_OKREGU = 1.5;

/** Prostokąt tuszu wiersza kodu względem środka okręgu: szerokość = suma posuwów (górna
 *  granica szerokości tuszu przy `text-anchor: middle`), wysokość z nagłówków glifów. */
interface TuszWiersza {
  readonly polSzerokosci: number;
  readonly gora: number;
  readonly dol: number;
}

function tuszWiersza(kod: string): TuszWiersza {
  const { fontSize, fontWeight } = PISMO_KODU_W_OKREGU;
  let em = 0;
  for (const znak of kod) em += posuwZnakuEm(znak, fontWeight);
  const { gora, dol } = zasiegPionowyTuszu(kod, fontSize, fontWeight);
  return { polSzerokosci: (em * fontSize) / 2, gora, dol };
}

/** Czy prostokąt [−pół; +pół] × [y0; y1] (względem środka okręgu) leży w promieniu użytecznym
 *  — wystarczy najdalszy narożnik. */
function wOkregu(polSzerokosci: number, y0: number, y1: number): boolean {
  const dy = Math.max(Math.abs(y0), Math.abs(y1));
  return polSzerokosci * polSzerokosci + dy * dy <= PROMIEN_UZYTECZNY_OKREGU * PROMIEN_UZYTECZNY_OKREGU + 1e-9;
}

/** Linie bazowe [y glifu] wierszy wyśrodkowanych pionowo w okręgu (blok tuszu symetryczny
 *  względem środka) albo `null`, gdy któryś wiersz wychodzi poza promień użyteczny. */
function linieBazowe(kody: readonly string[]): readonly number[] | null {
  const tusze = kody.map(tuszWiersza);
  const wysokosc =
    tusze.reduce((suma, t) => suma + (t.dol - t.gora), 0) + ODSTEP_WIERSZY_W_OKREGU * (tusze.length - 1);
  let gornaKrawedz = -wysokosc / 2;
  const bazy: number[] = [];
  for (const t of tusze) {
    const baza = gornaKrawedz - t.gora;
    if (!wOkregu(t.polSzerokosci, baza + t.gora, baza + t.dol)) return null;
    bazy.push(OKRAG_PRZEKAZNIKA.cy + baza);
    gornaKrawedz = baza + t.dol + ODSTEP_WIERSZY_W_OKREGU;
  }
  return bazy;
}

export interface UkladKodowWOkregu {
  /** Kody rysowane w okręgu — prefiks listy z danych (0, 1 albo 2 kody). */
  readonly kody: readonly string[];
  /** Linia bazowa [y glifu] każdego kodu z `kody`. */
  readonly linieBazowe: readonly number[];
}

/** Wybór i położenie kodów w okręgu przekaźnika (opis w nagłówku pliku). */
export function ukladKodowWOkregu(codes: readonly string[]): UkladKodowWOkregu {
  for (const liczba of [2, 1]) {
    if (codes.length < liczba) continue;
    const kody = codes.slice(0, liczba);
    const bazy = linieBazowe(kody);
    if (bazy) return { kody, linieBazowe: bazy };
  }
  return { kody: [], linieBazowe: [] };
}

/** Kody rysowane w okręgu przekaźnika (prefiks listy, `ukladKodowWOkregu`). */
export function kodyWOkreguPrzekaznika(codes: readonly string[]): readonly string[] {
  return ukladKodowWOkregu(codes).kody;
}

/** Kody pola poza okręgiem przekaźnika — reszta listy po prefiksie z okręgu. */
export function kodyPozaOkregiemPrzekaznika(codes: readonly string[]): readonly string[] {
  return codes.slice(kodyWOkreguPrzekaznika(codes).length);
}
