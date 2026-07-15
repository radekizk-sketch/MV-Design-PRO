/*
 * Adapter drzewa przebiegów (przestrzeń „Wyniki") — czyta ISTNIEJĄCE store'y
 * `ui/study-cases/runStore.ts` (przebiegi) i `ui/study-cases/store.ts`
 * (nazwy przypadków, read-only) i mapuje na hierarchię `WezelDrzewa[]`
 * (SPEC_UKLAD_PANELI §1.1: „Wyniki: hierarchia przebiegów" = przypadek → przebiegi).
 *
 * Źródło danych: `ExecutionRun` (`ui/study-cases/types.ts:234-243`: id,
 * study_case_id, analysis_type, status, started_at) z
 * `useExecutionRunsStore.runs` (`ui/study-cases/runStore.ts:38,81` — pole
 * stanu `runs: ExecutionRun[]`). Etykiety: `ANALYSIS_TYPE_LABELS` i
 * `RUN_STATUS_LABELS` (`ui/study-cases/types.ts:270-289`). Nazwa grupy
 * (przypadku) z `useSortedCases()` (`ui/study-cases/store.ts:372-375`).
 *
 * Liczniki {blokady, ostrzeżenia}: `RunStatus === 'FAILED'` → 1 blokada na
 * liściu przebiegu (jedyny jednoznaczny sygnał problemu w `ExecutionRun` —
 * `ui/study-cases/types.ts:229` `RunStatus`); brak sygnału ostrzeżenia w
 * modelu przebiegu, więc `ostrzezenia` jest zawsze 0.
 *
 * TODO-KARTA (ograniczenie danych, nie mapowania): `useExecutionRunsStore`
 * trzyma listę `runs` WYŁĄCZNIE dla `activeStudyCaseId` (jeden przypadek na
 * raz — `runStore.ts:29-30,84-92`), nie pełną historię wszystkich
 * przypadków projektu. Funkcja mapująca poniżej jest ogólna (grupuje
 * dowolną listę `ExecutionRun[]` po `study_case_id`) i zadziała poprawnie
 * dla pełnej hierarzchii, gdy tylko dane wielu przypadków będą dostępne
 * jednocześnie (np. po agregacji w karcie integracyjnej / rozszerzeniu
 * store'a) — dziś hook `useRunsTree` zwraca hierarchię ograniczoną do
 * aktywnego przypadku, zgodnie z tym, co store faktycznie przechowuje.
 */

import { useMemo } from 'react';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { ANALYSIS_TYPE_LABELS, RUN_STATUS_LABELS } from '../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSortedCases } from '../../../ui/study-cases/store';
import { LICZNIKI_ZERO, type WezelDrzewa } from '../treeModel';

function etykietaPrzebiegu(run: ExecutionRun): string {
  return `${ANALYSIS_TYPE_LABELS[run.analysis_type]} — ${RUN_STATUS_LABELS[run.status]}`;
}

function przebiegLisc(run: ExecutionRun): WezelDrzewa {
  return {
    id: run.id,
    etykietaPL: etykietaPrzebiegu(run),
    ikona: 'przebieg',
    liczniki: run.status === 'FAILED' ? { blokady: 1, ostrzezenia: 0 } : LICZNIKI_ZERO,
    dzieci: [],
    trybMin: 'basic',
  };
}

/** Mapowanie czyste (bez React) — testowalne fixture'ami o kształcie `ExecutionRun`. */
export function mapowaniePrzebiegowDoDrzewa(
  runs: ExecutionRun[],
  nazwyPrzypadkow: ReadonlyMap<string, string>,
): WezelDrzewa[] {
  const wgPrzypadku = new Map<string, ExecutionRun[]>();
  for (const run of runs) {
    const lista = wgPrzypadku.get(run.study_case_id) ?? [];
    lista.push(run);
    wgPrzypadku.set(run.study_case_id, lista);
  }

  const grupy: WezelDrzewa[] = [];
  for (const [caseId, caseRuns] of wgPrzypadku) {
    const posortowane = [...caseRuns].sort((a, b) => {
      const czasA = a.started_at ?? '';
      const czasB = b.started_at ?? '';
      return czasA === czasB ? a.id.localeCompare(b.id) : czasA.localeCompare(czasB);
    });
    grupy.push({
      id: caseId,
      etykietaPL: nazwyPrzypadkow.get(caseId) ?? caseId,
      ikona: 'folder',
      liczniki: LICZNIKI_ZERO,
      dzieci: posortowane.map(przebiegLisc),
      trybMin: 'basic',
    });
  }
  grupy.sort((a, b) => a.etykietaPL.localeCompare(b.etykietaPL, 'pl'));
  return grupy;
}

/**
 * Adapter read-only: `runStore.ts` (`runs`, ograniczone do aktywnego
 * przypadku — patrz TODO-KARTA w komentarzu nagłówkowym) + nazwy przypadków
 * z `study-cases/store.ts`.
 */
export function useRunsTree(): WezelDrzewa[] {
  const runs = useExecutionRunsStore((s) => s.runs);
  const cases = useSortedCases();
  const nazwyPrzypadkow = useMemo(() => new Map(cases.map((c) => [c.id, c.name])), [cases]);
  return useMemo(() => mapowaniePrzebiegowDoDrzewa(runs, nazwyPrzypadkow), [runs, nazwyPrzypadkow]);
}
