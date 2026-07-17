/*
 * Publiczny interfejs okna „Wniosek OSD" (ui2/oze/wniosek, karta W-707 / E13).
 * Warstwa prezentacji: wszystkie wielkości i werdykty pochodzą wyłącznie
 * z backendu (NOT-A-SOLVER). Nazwy sufiksowane `Wniosek`, bo barrel OZE robi
 * `export *` — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranWniosku } from './EkranWniosku';
export type { EkranWnioskuProps } from './EkranWniosku';
export {
  przebiegiRozplywu,
  przebiegiZwarciowe,
  domyslnyPrzebieg,
  powodBlokadyWniosku,
  zbudujZadanieWniosku,
} from './model';
export type {
  WejscieWniosku,
  IdentyfikacjaFormularza,
  ParametryZadaniaWniosku,
} from './model';
export {
  WNIOSEK_STRINGS,
  STATUS_WALIDACJI_WNIOSEK_PL,
  statusWalidacjiWniosekPL,
  fmtLiczbaWniosku,
  fmtZJednostkaWniosku,
  nazwaPlikuWniosku,
} from './strings';
