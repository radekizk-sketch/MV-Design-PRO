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
export { SekcjaMagazynu } from './SekcjaMagazynu';
export type { SekcjaMagazynuProps } from './SekcjaMagazynu';
export { SekcjaSilySieci } from './SekcjaSilySieci';
export type { SekcjaSilySieciProps } from './SekcjaSilySieci';
export { SekcjaAdekwatnosciQ } from './SekcjaAdekwatnosciQ';
export type { SekcjaAdekwatnosciQProps } from './SekcjaAdekwatnosciQ';
export { SladAnalizy } from './SladAnalizy';
export type { SladAnalizyProps } from './SladAnalizy';
export {
  zbudujPozycje,
  daneModulu,
  zgodnoscModulu,
  pracaMagazynu,
  dopasujMagazyn,
  wybierzPrzebiegZwarciowy,
  wybierzPrzebiegRozplywu,
} from './pulpitModel';
export type {
  StatusPulpitu,
  PozycjaModulu,
  OdnosnikKatalogowy,
  DaneModulu,
  ZgodnoscModulu,
  PracaMagazynu,
  DopasowanieMagazynu,
} from './pulpitModel';
export { PULPIT_STRINGS } from './strings';
