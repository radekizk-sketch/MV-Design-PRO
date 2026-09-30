/*
 * Publiczny interfejs okna „Macierz wymogów NC RfG per moduł" (ui2/oze/macierz, karta P39;
 * kontrakt V2 — karta AB-1a Pakiet D2). Rekordy oceny pochodzą wyłącznie z solvera przez
 * klienta `ui2/oze/ncrfg`; warstwa tylko prezentuje (NOT-A-SOLVER) — bez agregatów modułu,
 * bez liczników i bez map status → tekst.
 */

export { MacierzNcRfg } from './MacierzNcRfg';
export type { MacierzNcRfgProps } from './MacierzNcRfg';
export { SzczegolWerdyktu, nazwaRodzajuTwierdzenia } from './SzczegolWerdyktu';
export type { SzczegolWerdyktuProps } from './SzczegolWerdyktu';
export { PanelModulu } from './PanelModulu';
export type { PanelModuluProps } from './PanelModulu';
export { PodgladCertyfikatu } from './PodgladCertyfikatu';
export type { PodgladCertyfikatuProps } from './PodgladCertyfikatu';
export { SekcjaZgodnosciPrzekrojowej } from './SekcjaZgodnosciPrzekrojowej';
export type { SekcjaZgodnosciPrzekrojowejProps } from './SekcjaZgodnosciPrzekrojowej';
export {
  POLA_ZDOLNOSCI,
  etykietyObecne,
  formularzZWejscia,
  mapujMacierz,
  ocenaWymaganModulu,
  opisyModulow,
  rozwiazNapiecieKv,
  wynikModulu,
  zbudujModuly,
  zbudujWejscieModulu,
  zbudujZadanieCertyfikatu,
} from './macierzModel';
export type {
  BledyFormularza,
  EtykietaObecna,
  FormularzModulu,
  KomorkaMacierzy,
  OpisModulu,
  OpisModuluModelu,
  PochodzenieDanej,
  PoleZdolnosci,
  PowodBlokady,
  WierszMacierzy,
  WynikWejscia,
  ZdolnosciModulu,
} from './macierzModel';
export {
  nazwaModuluPrzekrojowego,
  rozwiazStanZgodnosciPrzekrojowej,
} from './zgodnoscPrzekrojowaModel';
export type { StanZgodnosciPrzekrojowej } from './zgodnoscPrzekrojowaModel';
export { MACIERZ_STRINGS } from './strings';
