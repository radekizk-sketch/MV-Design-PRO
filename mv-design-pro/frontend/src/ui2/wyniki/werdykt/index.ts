/* Publiczny wycinek ekranu „Werdykt projektowy" (karta F-K3, etap E7). */
export { EkranWerdyktu } from './EkranWerdyktu';
export { fetchWerdyktProjektowy } from './api';
export type {
  PozycjaWerdyktu,
  PodsumowanieWerdyktu,
  StanKryterium,
  WerdyktResponse,
  WpisZakresu,
  ZrodloKryterium,
  ZrodloWerdyktu,
} from './api';
export {
  klasaStanu,
  przyczynaPL,
  rodzajPrzekroczeniaKryterium,
  stanPL,
  stanZrodlaPL,
  typElementuKryterium,
  werdyktOpisPL,
  werdyktPL,
  zakresOcenyPL,
  zrodloPL,
} from './werdyktModel';
export { WERDYKT_STRINGS } from './strings';
