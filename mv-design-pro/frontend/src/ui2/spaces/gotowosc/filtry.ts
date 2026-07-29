/*
 * Filtry listy problemów gotowości (karta E6.1 §1: „filtry (waga/gałąź/typ)",
 * W-402 audytu: „filtry wg wagi/typu/gałęzi"). Czyste funkcje — operują na
 * `ProblemGotowosci[]` (grupowanieCelow.ts), zero Reacta.
 *
 * Interpretacja pojęć karty (jawna, nie domysł milczący — `ReadinessIssue`
 * nie niesie osobnego pola „typ elementu" ani „gałąź sieci"):
 *   „waga"   -> `WagaProblemu` (BLOKADA/OSTRZEZENIE) — wprost z modelu.
 *   „typ"    -> `CelGotowosci` — kategoria/cel problemu (jedyna kategoryzacja
 *               dostępna w danych źródłowych; sekcje panelu = typy).
 *   „gałąź"  -> wyszukiwanie tekstowe po referencji elementu (`elementRef`) —
 *               jedyny identyfikator obiektu sieci niesiony przez
 *               `ReadinessIssue`; dopasowanie podłańcuchowe, bez rozróżniania
 *               rodzaju elementu (id nie koduje typu w sposób niezawodny).
 */

import type { CelGotowosci, ProblemGotowosci, WagaProblemu } from './grupowanieCelow';

/** Stan filtrów listy problemów. `null`/pusty string = brak ograniczenia. */
export interface FiltryGotowosci {
  waga: WagaProblemu | null;
  cel: CelGotowosci | null;
  fraza: string;
}

/** Filtry początkowe — brak ograniczeń (pokazuje wszystkie problemy). */
export const FILTRY_PUSTE: FiltryGotowosci = {
  waga: null,
  cel: null,
  fraza: '',
};

/** Czy filtry są w stanie początkowym (brak aktywnego ograniczenia). */
export function czyFiltrPusty(filtry: FiltryGotowosci): boolean {
  return filtry.waga === null && filtry.cel === null && filtry.fraza.trim() === '';
}

function pasujeFraza(problem: ProblemGotowosci, fraza: string): boolean {
  const znormalizowana = fraza.trim().toLowerCase();
  if (znormalizowana === '') return true;
  const ref = (problem.elementRef ?? '').toLowerCase();
  return ref.includes(znormalizowana);
}

/** Filtruje listę problemów wg wagi + celu + frazy (koniunkcja wszystkich ustawionych). */
export function filtrujProblemy(
  problemy: ProblemGotowosci[],
  filtry: FiltryGotowosci,
): ProblemGotowosci[] {
  return problemy.filter((p) => {
    if (filtry.waga !== null && p.waga !== filtry.waga) return false;
    if (filtry.cel !== null && p.cel !== filtry.cel) return false;
    if (!pasujeFraza(p, filtry.fraza)) return false;
    return true;
  });
}
