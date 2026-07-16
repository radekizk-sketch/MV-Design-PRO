/**
 * Publiczne API modułu Katalog (ui2 · Model sieci → zakładka Katalog).
 * Wpięcie zakładki do warsztatu należy do zarządcy (poza granicą tej karty).
 */

export { KatalogPanel } from './KatalogPanel';
export type { KatalogPanelProps } from './KatalogPanel';
export { KartaTechniczna } from './KartaTechniczna';
export type { KartaTechnicznaProps } from './KartaTechniczna';
export { GdzieUzyty, filtrujUzycia } from './GdzieUzyty';
export type { GdzieUzytyProps } from './GdzieUzyty';
export { ParametrRow, formatujWartosc } from './ParametrRow';
export {
  KATEGORIE,
  metadanaKategorii,
  poleParametrow,
  pobierzTypy,
  producenci,
  filtrujPozycje,
} from './adapters/katalogAdapter';
export type { MetadanaKategorii } from './adapters/katalogAdapter';
export {
  DEFINICJE_PARAMETROW,
  definicjaParametru,
  LICZBA_DEFINICJI,
} from './parametryDefinicje';
export {
  STRINGS,
  ETYKIETY_KATEGORII,
  ETYKIETY_RODZAJU_APARATU,
  ETYKIETY_RODZAJU_FALOWNIKA,
  ETYKIETY_WERYFIKACJI,
  ETYKIETY_STATUSU_KATALOGU,
} from './strings';
export type {
  KategoriaId,
  KatalogPozycja,
  DefinicjaParametru,
  ElementUzycia,
  LadowaczTypow,
  TypWartosci,
} from './types';
