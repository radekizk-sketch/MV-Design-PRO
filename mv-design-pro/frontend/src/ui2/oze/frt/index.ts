/*
 * Publiczny interfejs okna „Walidacja modelu falownika" (ui2/oze/frt, karta U4 P38).
 * Warstwa prezentacji: trajektorie, marginesy i werdykty pochodzą wyłącznie z backendu
 * (NOT-A-SOLVER). Nazwy adapterów sufiksowane `Frt`, bo barrel OZE robi `export *`
 * — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranFrt } from './EkranFrt';
export type { EkranFrtProps } from './EkranFrt';
export { WykresTrajektoriiChart } from './WykresTrajektoriiChart';
export {
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyTrajektoriiFrt,
  punktyObwiedniFrt,
  napiecieSkrajneFrt,
  kolumnyTabeliFrt,
  wierszeTabeliFrt,
  werdyktCalosciFrt,
} from './frtModel';
export type {
  OpcjaModuluFrt,
  OpcjaOperatoraFrt,
  PunktTrajektoriiWykresu,
  PunktObwiedniWykresu,
  IstotnoscFrt,
  WerdyktCalosciFrt,
} from './frtModel';
export { FRT_STRINGS } from './strings';
