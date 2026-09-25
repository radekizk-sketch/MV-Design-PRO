/* Publiczny wycinek ekranu „Ocena techniczna wyników" (karta B-02 / W3-E). */
export { EkranOceny } from './EkranOceny';
export type { EkranOcenyProps } from './EkranOceny';
export { fetchOcenaTechniczna } from './api';
export type {
  LicznikiOceny,
  OcenaElementu,
  OdpowiedzOceny,
  PodsumowanieKryteriow,
  PozycjaOceny,
  RodzajElementuOceny,
  StanKryterium,
  WarunekKryterium,
  WpisZakresu,
  WynikOceny,
  ZrodloKryterium,
  ZrodloOceny,
} from './api';
export {
  czyBrakWynikow,
  fmtLiczba,
  fmtMargines,
  fmtOdniesienie,
  grupyZWynikami,
  klasaWyniku,
  pozycjeBezPodstaw,
  rodzajPrzekroczeniaKryterium,
  stanPrzebieguPL,
  typElementuKryterium,
  wynikPL,
  zrodloPL,
} from './model';
export { OCENA_STRINGS } from './strings';
