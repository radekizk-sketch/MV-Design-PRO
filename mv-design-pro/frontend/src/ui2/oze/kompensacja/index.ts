/*
 * Publiczny interfejs okna „Dobór kompensacji" (ui2/oze/kompensacja, karta P42 / D8).
 * Warstwa prezentacji: wielkości, werdykty i powody pochodzą wyłącznie z backendu
 * (NOT-A-SOLVER). Nazwy adapterów/stringów sufiksowane `Kompensacji`/`Komp`, bo
 * barrel OZE robi `export *` — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranKompensacji } from './EkranKompensacji';
export type { EkranKompensacjiProps } from './EkranKompensacji';
export {
  kolumnyTabeliKompensacji,
  wierszeTabeliKompensacji,
  krokiSladuKompensacji,
  werdyktKompPL,
} from './kompensacjaModel';
export {
  KOMPENSACJA_STRINGS,
  fmtLiczbaKomp,
  fmtCosfiKomp,
  fmtMvarKomp,
  fmtKvKomp,
} from './strings';
