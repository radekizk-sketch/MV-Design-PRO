/*
 * Publiczny interfejs okna „Odpowiedź na polecenia OSD" (ui2/oze/osd, karta P40).
 * Warstwa prezentacji: nastawy, napięcia i straty pochodzą wyłącznie z backendu
 * (NOT-A-SOLVER). Nazwy adapterów sufiksowane `Osd`, bo barrel OZE robi `export *`
 * — sufiks zapobiega kolizji nazw (TS2308).
 */

export { EkranOsd } from './EkranOsd';
export type { EkranOsdProps } from './EkranOsd';
export {
  opcjeZrodel,
  poleParametrowOsd,
  kartyPorownaniaOsd,
  kolumnyTabeliOsd,
  wierszeTabeliOsd,
  krokiSladuOsd,
} from './osdModel';
export type {
  OpcjaZrodlaOsd,
  PoleParametruOsd,
  KartaPorownaniaOsd,
} from './osdModel';
export { OSD_STRINGS, etykietaPoleceniaOsd } from './strings';
