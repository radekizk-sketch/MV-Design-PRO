/*
 * Publiczny interfejs okna „Praca wyspowa" (ochrona LoM, ui2/oze/lom, karta U4
 * P46). Warstwa prezentacji: statusy, okna normatywne i werdykty pochodzą
 * wyłącznie z backendu (NOT-A-SOLVER). Nazwy adapterów/formaterów sufiksowane
 * `Lom`, bo barrel OZE robi `export *` — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranLom } from './EkranLom';
export type { EkranLomProps } from './EkranLom';
export {
  KOLUMNY_LOM,
  KLUCZ_WIERSZA_LOM,
  mapujWierszLom,
  naWierszeLom,
  naZalozeniaLom,
} from './lomModel';
export {
  LOM_STRINGS,
  STATUS_LOM_PL,
  statusLomPL,
  istotnoscLom,
  fmtNastawaLom,
  fmtOknoLom,
} from './strings';
export type { IstotnoscTaguLom } from './strings';
