/*
 * Publiczny interfejs okna „Krzywe zdolności P–Q" (ui2/oze/krzywe, karta P41).
 * Warstwa prezentacji: pokrycie, marginesy i werdykt pochodzą wyłącznie z backendu
 * (NOT-A-SOLVER). Nazwy adapterów sufiksowane `PQ`, bo barrel OZE robi `export *`
 * — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranKrzywych } from './EkranKrzywych';
export type { EkranKrzywychProps } from './EkranKrzywych';
export { WykresPQChart } from './WykresPQChart';
export {
  typMaKrzywaPQ,
  opcjeTypowPQ,
  opcjeOperatorowPQ,
  punktyWykresuPQ,
  kolumnyTabeliPQ,
  wierszeTabeliPQ,
  krokiSladuPQ,
  istotnoscWerdyktuPQ,
} from './krzyweModel';
export type { OpcjaTypuPQ, OpcjaOperatoraPQ, PunktWykresuPQ } from './krzyweModel';
export { KRZYWE_STRINGS } from './strings';
