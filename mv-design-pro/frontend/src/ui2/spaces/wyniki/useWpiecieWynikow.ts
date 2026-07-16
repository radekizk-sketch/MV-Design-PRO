/**
 * Wpięcie store'ów wyników w nową powłokę (scalenia U3 #1–#2 — zamyka
 * TODO-KARTA E8.1/E8.2 „populacja store'u"): okna wyników (TabelaSzyn,
 * EkranZwarc) czytają store'y wyłącznie do odczytu, a ładowanie danych
 * uruchamia ta warstwa integracyjna — dokładnie te same akcje store'ów,
 * które w starym wejściu wołały okna inspektorów:
 * - rozpływ: `selectRun` + `loadResults` (`ui/power-flow-results/store.ts:109-184`),
 * - zwarcia: `selectRun` + `loadShortCircuitResults`
 *   (`ui/results-inspector/store.ts:191-224,313-335`).
 * Zero nowych ścieżek API.
 *
 * Rodzaj analizy przebiegu pochodzi z rejestru przebiegów
 * (`useExecutionRunsStore.runs[].analysis_type` — `ui/study-cases/types.ts:237`);
 * ładujemy wyłącznie przebiegi zakończone („DONE"): rozpływ dla „LOAD_FLOW",
 * zwarcia dla typów „SC_*".
 */
import { useEffect } from 'react';

import { subskrybuj } from '../../events';
import { useAppStateStore } from '../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';

type RodzajWyniku = 'rozplyw' | 'zwarcie' | null;

function rodzajPrzebiegu(przebieg: ExecutionRun | undefined): RodzajWyniku {
  if (!przebieg || przebieg.status !== 'DONE') return null;
  if (przebieg.analysis_type === 'LOAD_FLOW') return 'rozplyw';
  if (przebieg.analysis_type.startsWith('SC_')) return 'zwarcie';
  return null;
}

function rodzajWyniku(runId: string | null): RodzajWyniku {
  if (!runId) return null;
  return rodzajPrzebiegu(useExecutionRunsStore.getState().runs.find((r) => r.id === runId));
}

async function zaladujRozplyw(runId: string): Promise<void> {
  const store = usePowerFlowResultsStore.getState();
  if (store.selectedRunId === runId && store.results != null) return;
  await store.selectRun(runId);
  await usePowerFlowResultsStore.getState().loadResults();
}

async function zaladujZwarcia(runId: string): Promise<void> {
  const store = useResultsInspectorStore.getState();
  if (store.selectedRunId === runId && store.shortCircuitResults != null) return;
  await store.selectRun(runId);
  await useResultsInspectorStore.getState().loadShortCircuitResults();
}

function zaladujWynik(runId: string): void {
  const rodzaj = rodzajWyniku(runId);
  if (rodzaj === 'rozplyw') void zaladujRozplyw(runId);
  if (rodzaj === 'zwarcie') void zaladujZwarcia(runId);
}

/**
 * Hook integracyjny: ładuje wynik aktywnego przebiegu przy montażu oraz na
 * zdarzenie magistrali `wyniki-gotowe`. Zwraca rodzaj wyniku aktywnego
 * przebiegu (do wyboru zakładki startowej warsztatu wyników).
 */
export function useWpiecieWynikow(): { aktywnyRodzaj: RodzajWyniku } {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const aktywnyRodzaj =
    activeRunId == null ? null : rodzajPrzebiegu(przebiegi.find((r) => r.id === activeRunId));

  // Montaż: aktywny zakończony przebieg → załaduj (idempotentnie).
  useEffect(() => {
    if (activeRunId) zaladujWynik(activeRunId);
  }, [activeRunId]);

  // Nowe wyniki na magistrali: ładuj wg rodzaju analizy przebiegu.
  useEffect(() => subskrybuj('wyniki-gotowe', (zdarzenie) => zaladujWynik(zdarzenie.runId)), []);

  return { aktywnyRodzaj };
}
