/*
 * Okno „Przebiegi obliczeń" (W-503, karta E7.2) — publiczne API modułu.
 * Zastępuje most `MostHistoriiPrzebiegow` (podmiana w rejestrze legacy =
 * karta integracyjna zarządcy).
 */

export { PrzebiegiPanel, type PrzebiegiPanelProps } from './PrzebiegiPanel';
export { WierszPrzebiegu } from './WierszPrzebiegu';
export { SzczegolyPrzebiegu } from './SzczegolyPrzebiegu';
export { PRZEBIEGI_STRINGS, formatCzas, formatCzasTrwania, formatOdcisk } from './strings';
export {
  mapujWiersze,
  useStanPrzebiegow,
  useWierszePrzebiegow,
  useOdswiezaniePrzebiegow,
  type PrzebiegWiersz,
  type StanPrzebiegow,
} from './adapters/przebiegiAdapter';
