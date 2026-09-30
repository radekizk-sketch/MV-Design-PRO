/*
 * Publiczny interfejs okna „Walidacja modelu falownika" (ui2/oze/frt, karta U4 P38).
 * Warstwa prezentacji: trajektorie, pola solvera i rekord oceny pochodzą wyłącznie
 * z backendu (NOT-A-SOLVER); okno nie wystawia werdyktu FRT. Nazwy adapterów sufiksowane `Frt`, bo barrel OZE robi `export *`
 * — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranFrt } from './EkranFrt';
export type { EkranFrtProps } from './EkranFrt';
export { WykresTrajektoriiChart } from './WykresTrajektoriiChart';
export { SekcjaSekwencjiZapadow } from './SekcjaSekwencjiZapadow';
export type { SekcjaSekwencjiZapadowProps } from './SekcjaSekwencjiZapadow';
export {
  opcjeModulowFrt,
  opcjeOperatorowFrt,
  punktyTrajektoriiFrt,
  punktyObwiedniFrt,
  napiecieSkrajneFrt,
  kolumnyTabeliFrt,
  wierszeTabeliFrt,
  kolumnyAudytuFrt,
  wierszeAudytuFrt,
  komorkiAudytuFrt,
} from './frtModel';
export type {
  OpcjaModuluFrt,
  OpcjaOperatoraFrt,
  PunktTrajektoriiWykresu,
  PunktObwiedniWykresu,
  PolaSolveraFrt,
} from './frtModel';
export {
  kolumnyTabeliSekwencji,
  wierszeTabeliSekwencji,
  kolumnyAudytuSekwencji,
  wierszeAudytuSekwencji,
} from './sekwencjaModel';
export { FRT_STRINGS } from './strings';
