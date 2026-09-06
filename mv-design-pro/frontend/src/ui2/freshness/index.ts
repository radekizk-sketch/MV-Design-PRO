/**
 * Kontrakt świeżości wyników (E15.2) — publiczne API modułu.
 * Kontrakt: docs/uiux/karty/U1_E15_2_SWIEZOSC.md.
 */

export type { StanSwiezosci, OpisSwiezosci } from './freshnessModel';
export { useSwiezoscWynikow } from './useSwiezoscWynikow';
export { opisSwiezosci, BRAK_WYNIKOW_LABEL, NIEAKTUALNE_BEZ_PARY_LABEL } from './opisSwiezosci';

// V12K-264: odpowiedz na „ktora zmiana uniewaznila wynik" — dziennik zmian modelu.
export { PanelCoSieZmienilo } from './PanelCoSieZmienilo';
export type { PanelCoSieZmieniloProps } from './PanelCoSieZmienilo';
export { ListaZmianOdBiegu } from './ListaZmianOdBiegu';
export type { ListaZmianOdBieguProps } from './ListaZmianOdBiegu';
export { pobierzDziennikZmian, podsumowaniePl } from './dziennikApi';
export type { DziennikZmian, WpisDziennika } from './dziennikApi';
export { useSwiezoscNaglowka } from './useSwiezoscNaglowka';
export type { SwiezoscNaglowka } from './useSwiezoscNaglowka';
