/**
 * SLD V3 — SŁOWNIK PL ENUMÓW (SCHEMAT-10 S2, V12K-135; audyt
 * `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §1 D4 „OVERHEAD Al" + §3 wiersz
 * „Etykiety"). JEDNO miejsce tłumaczenia wartości ENUM (izolacja/materiał
 * przewodu, rodzaj odcinka) na treść PL widoczną w etykiecie. Wartości
 * surowego enuma (np. `OVERHEAD`, `LINE_OVERHEAD`) NIGDY nie trafiają do treści
 * — zawsze przez ten słownik.
 *
 * ZAKRES. Słownik obejmuje angielskie IDENTYFIKATORY enumów, nie domenowe
 * OZNACZENIA MATERIAŁÓW: `XLPE`/`EPR`/`PVC`/`PAPER` to kanoniczne oznaczenia
 * izolacji używane 1:1 w polskim języku inżynierskim (kabel „XLPE") — NIE są
 * tłumaczone ani zakazane. Zakazane są wyłącznie angielskie słowa-enum
 * (`OVERHEAD`, `UNKNOWN`, `CABLE`, `LINE_OVERHEAD`, literały typu odcinka) —
 * lista `FORBIDDEN_RAW_ENUM_TOKENS` zasila wyrocznię sceny
 * `noRawEnumTokensInLabels` (`scene/buildScene.ts`).
 */

/** Izolacja odcinka (ENM `Cable.insulation` + tag adaptera dla linii). */
export type SegmentInsulation = 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN';

/** Materiał żyły (ENM/adapter). */
export type SegmentConductor = 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN';

/**
 * Rodzaj odcinka SN → treść PL (D4). `OVERHEAD` ⇒ „napowietrzna" (nie surowy
 * enum); izolacje kablowe zostają oznaczeniem materiału (język inżynierski).
 * `UNKNOWN` ⇒ „nieokreślona" (uczciwy brak, nie angielskie „unknown").
 */
export function insulationLabelPl(insulation: SegmentInsulation): string {
  switch (insulation) {
    case 'OVERHEAD':
      return 'napowietrzna';
    case 'UNKNOWN':
      return 'nieokreślona';
    case 'XLPE':
    case 'EPR':
    case 'PVC':
    case 'PAPER':
      return insulation; // oznaczenie materiału izolacji — 1:1 w PL
  }
}

/** Materiał żyły → treść PL (D4). `UNKNOWN` ⇒ „nieokreślony". */
export function conductorLabelPl(conductor: SegmentConductor): string {
  switch (conductor) {
    case 'UNKNOWN':
      return 'nieokreślony';
    case 'Al':
    case 'Cu':
    case 'AlSt':
      return conductor; // oznaczenie materiału żyły — 1:1 w PL
  }
}

/**
 * Angielskie IDENTYFIKATORY enumów, które NIGDY nie mogą pojawić się surowo w
 * treści etykiety sceny (D4). Wyrocznia `noRawEnumTokensInLabels` dopasowuje na
 * granicach słów, więc np. „napowietrzna" nie fałszywie trafia. Oznaczenia
 * materiałów (XLPE/EPR/PVC/PAPER/Al/Cu/AlSt) są CELOWO poza listą — to
 * kanoniczne oznaczenia inżynierskie, nie surowe enumy.
 */
export const FORBIDDEN_RAW_ENUM_TOKENS: readonly string[] = [
  'OVERHEAD',
  'LINE_OVERHEAD',
  'UNKNOWN',
  'CABLE',
  'line_overhead',
  'cable_sn',
  'overhead_line_sn',
];

/** Regex granic słów dla wyroczni D4 (jedno źródło, żeby test i wyrocznia się nie rozjechały). */
export const FORBIDDEN_RAW_ENUM_RE = new RegExp(`\\b(${FORBIDDEN_RAW_ENUM_TOKENS.join('|')})\\b`);
