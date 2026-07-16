/**
 * Wpięcie store'u wyników rozpływu w nową powłokę (scalenie U3 #1 — zamyka
 * TODO-KARTA E8.1 „populacja store'u"): TabelaSzyn czyta wyłącznie
 * `usePowerFlowResultsStore` (read-only), a ładowanie danych uruchamia
 * ta warstwa integracyjna — dokładnie te same akcje store'u, które w starym
 * wejściu wołało okno inspektora rozpływu (`selectRun` + `loadResults`,
 * `ui/power-flow-results/store.ts:109-184`). Zero nowych ścieżek API.
 *
 * Rodzaj analizy przebiegu pochodzi z rejestru przebiegów
 * (`useExecutionRunsStore.runs[].analysis_type` — `ui/study-cases/types.ts:237`);
 * ładujemy wyłącznie przebiegi „LOAD_FLOW" zakończone („DONE").
 */
import { useEffect } from 'react';

import { subskrybuj } from '../../events';
import { useAppStateStore } from '../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';

/** Czy wskazany przebieg to zakończony rozpływ mocy (wg rejestru przebiegów). */
function zakonczonyRozplyw(runId: string | null): boolean {
  if (!runId) return false;
  const przebieg = useExecutionRunsStore.getState().runs.find((r) => r.id === runId);
  return przebieg?.analysis_type === 'LOAD_FLOW' && przebieg.status === 'DONE';
}

async function zaladujRozplyw(runId: string): Promise<void> {
  const store = usePowerFlowResultsStore.getState();
  if (store.selectedRunId === runId && store.results != null) return;
  await store.selectRun(runId);
  await usePowerFlowResultsStore.getState().loadResults();
}

/**
 * Hook integracyjny: ładuje wynik rozpływu dla aktywnego przebiegu przy montażu
 * oraz na zdarzenie magistrali `wyniki-gotowe`. Zwraca, czy aktywny przebieg
 * jest zakończonym rozpływem (do wyboru zakładki startowej warsztatu).
 */
export function useWpiecieRozplywu(): { aktywnyRozplyw: boolean } {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const aktywnyRozplyw =
    activeRunId != null &&
    przebiegi.some((r) => r.id === activeRunId && r.analysis_type === 'LOAD_FLOW' && r.status === 'DONE');

  // Montaż: aktywny przebieg rozpływu → załaduj (idempotentnie).
  useEffect(() => {
    if (activeRunId && zakonczonyRozplyw(activeRunId)) {
      void zaladujRozplyw(activeRunId);
    }
  }, [activeRunId]);

  // Nowe wyniki na magistrali: ładuj tylko przebiegi rozpływu.
  useEffect(
    () =>
      subskrybuj('wyniki-gotowe', (zdarzenie) => {
        if (zakonczonyRozplyw(zdarzenie.runId)) {
          void zaladujRozplyw(zdarzenie.runId);
        }
      }),
    [],
  );

  return { aktywnyRozplyw };
}
