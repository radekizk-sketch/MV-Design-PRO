/*
 * Adapter drzewa przypadków obliczeniowych (przestrzeń „Obliczenia") — czyta
 * ISTNIEJĄCY store `ui/study-cases/store.ts` (read-only) i mapuje na płaską
 * listę `WezelDrzewa[]` (SPEC_UKLAD_PANELI §1.1: „Obliczenia: lista przypadków" —
 * bez zagnieżdżenia, `dzieci: []`).
 *
 * Źródło danych: `StudyCaseListItem` (`ui/study-cases/types.ts:105-114`: id,
 * name, result_status, results_valid, is_active, updated_at), lista
 * posortowana wg `useSortedCases()` (`ui/study-cases/store.ts:372-375`,
 * sortowanie `localeCompare('pl')` po `name` — determinizm porządku).
 *
 * Liczniki {blokady, ostrzeżenia}: gotowość (`ReadinessMatrix`/`ReadinessIssue`)
 * dotyczy MODELU, nie pojedynczego przypadku (przypadek przechowuje wyłącznie
 * konfigurację obliczeń — Case Immutability Rule, `CLAUDE.md`). Brak w
 * `StudyCaseListItem` pola wiążącego przypadek z liczbą blokad/ostrzeżeń per
 * przypadek — liczniki są więc zawsze zerowe (deterministycznie, bez
 * zgadywania) do czasu wskazania takiego pola przez kartę integracyjną.
 */

import { useMemo } from 'react';
import type { StudyCaseListItem } from '../../../ui/study-cases/types';
import { useSortedCases } from '../../../ui/study-cases/store';
import { LICZNIKI_ZERO, type WezelDrzewa } from '../treeModel';

/** Mapowanie czyste (bez React) — testowalne fixture'ami o kształcie `StudyCaseListItem`. */
export function mapowaniePrzypadkowDoDrzewa(cases: StudyCaseListItem[]): WezelDrzewa[] {
  return cases.map((c) => ({
    id: c.id,
    etykietaPL: c.name,
    ikona: 'przypadek',
    liczniki: LICZNIKI_ZERO,
    dzieci: [],
    trybMin: 'basic',
  }));
}

/** Adapter read-only: `ui/study-cases/store.ts` (`useSortedCases`). */
export function useCasesTree(): WezelDrzewa[] {
  const cases = useSortedCases();
  return useMemo(() => mapowaniePrzypadkowDoDrzewa(cases), [cases]);
}
