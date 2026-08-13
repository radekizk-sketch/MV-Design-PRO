/*
 * Fixture'y modułu procesu — realny kształt `ProblemGotowosci`
 * (`ui2/spaces/gotowosc/grupowanieCelow.ts`) i sygnałów reguły NBA.
 */

import type { ProblemGotowosci } from '../../spaces/gotowosc/grupowanieCelow';
import type { SygnalyProcesu } from '../nastepnaAkcja';

export function problem(over: Partial<ProblemGotowosci> = {}): ProblemGotowosci {
  return {
    code: 'source.grid_supply_missing',
    waga: 'BLOKADA',
    elementRef: 'GPZ-1',
    opisPl: 'Brak źródła zasilania sieciowego (GPZ).',
    cel: 'zwarcia',
    fixAction: null,
    priorytetKanoniczny: 1,
    ...over,
  };
}

export function sygnaly(over: Partial<SygnalyProcesu> = {}): SygnalyProcesu {
  return {
    projektOtwarty: true,
    gotowoscUstalona: true,
    problemy: [],
    jestZakonczonyPrzebieg: false,
    wynikiAktualne: null,
    ...over,
  };
}
