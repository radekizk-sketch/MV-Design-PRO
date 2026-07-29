/**
 * Przestrzeń „Gotowość" (W-401/W-402, karta E6.1) — publiczne API modułu.
 */

export { PanelGotowosci } from './PanelGotowosci';
export type { PanelGotowosciProps } from './PanelGotowosci';

export { SekcjaCelu } from './SekcjaCelu';
export { WierszProblemu } from './WierszProblemu';
export { SekcjaZgodnosciReferencyjnej } from './SekcjaZgodnosciReferencyjnej';

export {
  grupujProblemyWgCelu,
  naProblemGotowosci,
  celDlaKodu,
  wagaZSeverity,
  ETYKIETA_CELU,
  KOLEJNOSC_CELOW,
} from './grupowanieCelow';
export type { CelGotowosci, GrupaCelu, ProblemGotowosci, WagaProblemu } from './grupowanieCelow';

export { filtrujProblemy, czyFiltrPusty, FILTRY_PUSTE } from './filtry';
export type { FiltryGotowosci } from './filtry';

export {
  useStanGotowosci,
  useProblemyGotowosci,
  polaczGotowosc,
} from './adapters/gotowoscAdapter';
export type { StanGotowosci } from './adapters/gotowoscAdapter';

export { GOTOWOSC_STRINGS } from './strings';
