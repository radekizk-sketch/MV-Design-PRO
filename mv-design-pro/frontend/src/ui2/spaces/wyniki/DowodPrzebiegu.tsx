/**
 * Kontener zakładki „Dowód obliczeń" (scalenie U3 #3, zarządca) — spina okno
 * E9.1 (`PrzegladDowodu`, sterowane propsami) ze źródłem śladu WHITE BOX:
 * `useResultsInspectorStore` (`extendedTrace.white_box_trace`, `input_hash`,
 * akcje `selectRun`/`loadExtendedTrace` — `ui/results-inspector/store.ts:191,340`).
 * Ładowanie LENIWE: dopiero przy otwarciu zakładki; działa dla każdego rodzaju
 * przebiegu (ślad rozszerzony jest per analysis-run). Zero fizyki, read-only.
 *
 * R3-C: opcjonalny `wskazanyRunId` wybiera KONKRETNY przebieg (deep-link
 * z kontekstem `setWynikiTab('dowod', runId)` — np. kolumna A/B porównania);
 * brak wskazania = aktywny przebieg (zachowanie 1:1). Ślad wskazanego przebiegu
 * jest realnie pobieralny po run_id (`GET /analysis-runs/{id}/results/trace`,
 * `ui/results-inspector/api.ts:115`). Przebieg spoza rejestru aktywnego
 * przypadku dostaje uczciwą etykietę ogólną (zero zgadywania nazwy analizy).
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
  /**
   * Konkretny przebieg do wywodu (R3-C — dowód kolumny A/B porównania).
   * `null`/pominięty = aktywny przebieg (dotychczasowe zachowanie 1:1).
   */
  wskazanyRunId?: string | null;
}

export function DowodPrzebiegu({ trybZaawansowania, wskazanyRunId = null }: DowodPrzebieguProps) {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const selectedRunId = useResultsInspectorStore((s) => s.selectedRunId);
  const slad = useResultsInspectorStore((s) => s.extendedTrace);
  const ladowanie = useResultsInspectorStore((s) => s.isLoadingTrace || s.isLoadingIndex);

  // Przebieg wywodu: wskazany (deep-link R3-C) przed aktywnym.
  const runId = wskazanyRunId ?? activeRunId;

  // Leniwe ładowanie śladu przy otwarciu zakładki (idempotentnie).
  useEffect(() => {
    if (!runId) return;
    const store = useResultsInspectorStore.getState();
    void (async () => {
      if (store.selectedRunId !== runId) {
        await store.selectRun(runId);
      }
      const stan = useResultsInspectorStore.getState();
      if (stan.extendedTrace == null && !stan.isLoadingTrace) {
        await stan.loadExtendedTrace();
      }
    })();
  }, [runId]);

  const przebieg = runId ? przebiegi.find((r) => r.id === runId) : undefined;
  const analizaPL = przebieg ? ANALYSIS_TYPE_LABELS[przebieg.analysis_type] : T.dowodBezPrzebiegu;
  const kroki = selectedRunId === runId ? slad?.white_box_trace ?? [] : [];

  return (
    <PrzegladDowodu
      analizaPL={analizaPL}
      kroki={kroki}
      inputHash={selectedRunId === runId ? slad?.input_hash : undefined}
      trybZaawansowania={trybZaawansowania}
      ladowanie={ladowanie}
    />
  );
}
