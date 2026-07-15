/**
 * Kontrakt świeżości wyników (E15.2) — publiczne API modułu.
 * Kontrakt: docs/uiux/karty/U1_E15_2_SWIEZOSC.md.
 */

export type { StanSwiezosci, OpisSwiezosci } from './freshnessModel';
export { useSwiezoscWynikow } from './useSwiezoscWynikow';
export { opisSwiezosci, BRAK_WYNIKOW_LABEL, NIEAKTUALNE_BEZ_PARY_LABEL } from './opisSwiezosci';
