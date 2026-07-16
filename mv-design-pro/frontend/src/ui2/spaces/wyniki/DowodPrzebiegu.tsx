/**
 * Kontener zakładki „Dowód obliczeń" (scalenie U3 #3, zarządca) — spina okno
 * E9.1 (`PrzegladDowodu`, sterowane propsami) ze źródłem śladu WHITE BOX:
 * `useResultsInspectorStore` (`extendedTrace.white_box_trace`, `input_hash`,
 * akcje `selectRun`/`loadExtendedTrace` — `ui/results-inspector/store.ts:191,340`).
 * Ładowanie LENIWE: dopiero przy otwarciu zakładki; działa dla każdego rodzaju
 * przebiegu (ślad rozszerzony jest per analysis-run). Zero fizyki, read-only.
 *
 * TODO-KARTA (E9.x): fokus kroku wg wskazanego elementu (`selection_index`
 * z ExtendedTrace) — okno E9.1 nie przyjmuje jeszcze kroku startowego.
 */
import { useEffect } from 'react';

import type { AdvancementMode } from '../../shell/modeModel';
import { PrzegladDowodu } from '../../wyniki/dowod';
import { useAppStateStore } from '../../../ui/app-state';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { ANALYSIS_TYPE_LABELS } from '../../../ui/study-cases/types';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';

export interface DowodPrzebieguProps {
  trybZaawansowania: AdvancementMode;
}

export function DowodPrzebiegu({ trybZaawansowania }: DowodPrzebieguProps) {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const selectedRunId = useResultsInspectorStore((s) => s.selectedRunId);
  const slad = useResultsInspectorStore((s) => s.extendedTrace);
  const ladowanie = useResultsInspectorStore((s) => s.isLoadingTrace || s.isLoadingIndex);

  // Leniwe ładowanie śladu przy otwarciu zakładki (idempotentnie).
  useEffect(() => {
    if (!activeRunId) return;
    const store = useResultsInspectorStore.getState();
    void (async () => {
      if (store.selectedRunId !== activeRunId) {
        await store.selectRun(activeRunId);
      }
      const stan = useResultsInspectorStore.getState();
      if (stan.extendedTrace == null && !stan.isLoadingTrace) {
        await stan.loadExtendedTrace();
      }
    })();
  }, [activeRunId]);

  const przebieg = activeRunId ? przebiegi.find((r) => r.id === activeRunId) : undefined;
  const analizaPL = przebieg ? ANALYSIS_TYPE_LABELS[przebieg.analysis_type] : T.dowodBezPrzebiegu;
  const kroki = selectedRunId === activeRunId ? slad?.white_box_trace ?? [] : [];

  return (
    <PrzegladDowodu
      analizaPL={analizaPL}
      kroki={kroki}
      inputHash={selectedRunId === activeRunId ? slad?.input_hash : undefined}
      trybZaawansowania={trybZaawansowania}
      ladowanie={ladowanie}
    />
  );
}
