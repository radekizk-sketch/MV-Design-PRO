/*
 * Publiczny interfejs pulpitu instalacji OZE (ui2/oze/pulpit, karta P47).
 * Werdykty i klasa modułu pochodzą wyłącznie z solvera (ui/ncrfg-tests/api);
 * warstwa tylko agreguje i prezentuje (NOT-A-SOLVER).
 */

export { PulpitOze } from './PulpitOze';
export type { PulpitOzeProps } from './PulpitOze';
export { KartaModulu } from './KartaModulu';
export type { KartaModuluProps } from './KartaModulu';
export { SekcjaZgodnosci } from './SekcjaZgodnosci';
export type { SekcjaZgodnosciProps } from './SekcjaZgodnosci';
export {
  zbudujPozycje,
  daneModulu,
  zgodnoscModulu,
  pracaMagazynu,
} from './pulpitModel';
export type {
  StatusPulpitu,
  PozycjaModulu,
  OdnosnikKatalogowy,
  DaneModulu,
  ZgodnoscModulu,
  PracaMagazynu,
} from './pulpitModel';
export { PULPIT_STRINGS } from './strings';
