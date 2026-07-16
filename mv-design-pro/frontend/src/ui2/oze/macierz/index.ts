/*
 * Publiczny interfejs okna „Macierz wymogów NC RfG per moduł" (ui2/oze/macierz,
 * karta P39). Werdykty pochodzą wyłącznie z solvera (ui/ncrfg-tests/api);
 * warstwa tylko prezentuje (NOT-A-SOLVER).
 */

export { MacierzNcRfg } from './MacierzNcRfg';
export type { MacierzNcRfgProps } from './MacierzNcRfg';
export { SzczegolWerdyktu } from './SzczegolWerdyktu';
export type { SzczegolWerdyktuProps } from './SzczegolWerdyktu';
export { PanelModulu } from './PanelModulu';
export type { PanelModuluProps } from './PanelModulu';
export {
  zbudujModuly,
  zbudujWejscieModulu,
  mapujMacierz,
  podsumowanieModulu,
  podsumowanieProjektu,
  rozwiazNapiecieKv,
  rozwiazCertyfikat,
} from './macierzModel';
export type {
  PochodzenieDanej,
  PowodBlokady,
  ZdolnosciModulu,
  KluczZdolnosci,
  NumeryczneModulu,
  KluczNumeryczny,
  OpisModulu,
  StanKomorki,
  KomorkaMacierzy,
  WierszMacierzy,
  PodsumowanieModulu,
  PodsumowanieProjektu,
} from './macierzModel';
export { MACIERZ_STRINGS } from './strings';
