/*
 * Publiczny interfejs pulpitu instalacji OZE (ui2/oze/pulpit, karta P47).
 * Klasyfikacja modułu, dowód certyfikatu i rekordy wymagań pochodzą wyłącznie z biegu
 * backendu (klient V2 `ui2/oze/ncrfg`); warstwa tylko zestawia i prezentuje (NOT-A-SOLVER).
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
  pracaMagazynu,
  dopasujMagazyn,
  wybierzPrzebiegZwarciowy,
  wybierzPrzebiegRozplywu,
} from './pulpitModel';
export type {
  PozycjaModulu,
  OdnosnikKatalogowy,
  DaneModulu,
  PracaMagazynu,
  DopasowanieMagazynu,
} from './pulpitModel';
export { PULPIT_STRINGS } from './strings';
