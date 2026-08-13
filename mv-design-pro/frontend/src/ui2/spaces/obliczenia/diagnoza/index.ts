/*
 * Powierzchnia „Diagnoza przebiegu" (przestrzeń „Obliczenia", decyzja D7)
 * — publiczne API modułu.
 */

export { PanelDiagnozy, type PanelDiagnozyProps } from './PanelDiagnozy';
export {
  DIAGNOZA_STRINGS,
  formatIteracjeZLimitem,
  formatLiczbe,
  formatWartoscJednostkowa,
} from './strings';
export {
  ETYKIETY_DOSTEPNOSCI,
  ETYKIETY_WAGI,
  ZDANIA_DIAGNOZY_PRZEBIEGU,
  ZDANIA_PRZYCZYN_PRZERWANIA,
  ZDANIA_REGUL,
  etykietaDostepnosci,
  etykietaWagi,
  zdaniaBlokad,
  zdanieDiagnozy,
  zdaniePrzyczyny,
  zdanieReguly,
} from './kodyDiagnozy';
export {
  pobierzDiagnostykeModelu,
  pobierzDiagnozePrzebiegu,
  pobierzPreflight,
  type DiagnostykaOdpowiedz,
  type DiagnozaPrzebieguOdpowiedz,
  type IteracjaPrzebiegu,
  type KontrolaPrzedObliczeniem,
  type PreflightOdpowiedz,
  type ProblemModelu,
} from './diagnozaApi';
export {
  najnowszyBieg,
  useDaneDiagnozy,
  type DaneDiagnozy,
  type StanDiagnozy,
} from './adapters/diagnozaAdapter';
