/**
 * Wpięcie store'ów wyników w powłokę (scalenia U3 #1–#2): okna wyników
 * (TabelaSzyn, EkranZwarc) czytają store'y wyłącznie do odczytu, a ładowanie
 * danych uruchamia ta warstwa integracyjna — dokładnie te same akcje store'ów,
 * które w starym wejściu wołały okna inspektorów:
 * - rozpływ: `selectRun` + `loadResults` (`ui/power-flow-results/store.ts:109-184`),
 * - zwarcia: `selectRun` + `loadShortCircuitResults`
 *   (`ui/results-inspector/store.ts:191-224,313-335`).
 * Zero nowych ścieżek API.
 *
 * Bieg każdej rodziny pochodzi z magazynu kontekstu wyniku (karta K8,
 * `ui2/wyniki/kontekst`): aktywny bieg rodziny „rozpływ" (LOAD_FLOW) i „zwarcie"
 * (SC_*), wyłącznie przebiegi zakończone („DONE").
 */
import { useEffect } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useResultsInspectorStore } from '../../../ui/results-inspector/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import {
  useAktywnyRunId,
  useBiegOgladany,
  useRunIdOgladany,
  rodzinaAnalizy,
} from '../../wyniki/kontekst/kontekstWyniku';

type RodzajWyniku = 'rozplyw' | 'zwarcie' | null;

/** Zakładka warsztatu, która współdzieli magazyn inspektora wyników (ślad dowodu). */
const ZAKLADKA_DOWODU = 'dowod';

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

/**
 * Hook integracyjny (karta K8): ładuje do magazynów okien wyników AKTYWNY bieg każdej
 * rodziny z magazynu kontekstu wyniku — rozpływ do `usePowerFlowResultsStore`, zwarcie do
 * `useResultsInspectorStore` — przy montażu, przy każdej zmianie aktywnego biegu rodziny
 * (wybór w panelu, na pasku, na ekranie, z adresu, zakończenie biegu) i przy zmianie
 * zakładki (`ponowKlucz`: magazyn inspektora wyników współdzieli „Dowód obliczeń", więc po
 * powrocie na „Zwarcia" wynik aktywnego biegu zwarciowego jest odtwarzany). Ładowanie
 * idempotentne. Zwraca rodzaj wyniku biegu OGLĄDANEGO (zakładka startowa warsztatu) oraz
 * predykat synchronizacji rejestru przebiegów z aktywnym zakresem obliczeń — dopóki
 * rejestr nie jest zsynchronizowany, rodzaj `null` NIE znaczy „brak przebiegu".
 */
export function useWpiecieWynikow(ponowKlucz: string | null = null): {
  aktywnyRodzaj: RodzajWyniku;
  rejestrZsynchronizowany: boolean;
  /** Bieg wskazany (adres), którego rejestr jeszcze nie zna — start nieustalony. */
  biegOczekujacy: boolean;
} {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const rejestrCaseId = useExecutionRunsStore((s) => s.activeStudyCaseId);
  const isLoadingRuns = useExecutionRunsStore((s) => s.isLoadingRuns);
  const rozplywRunId = useAktywnyRunId('rozplyw');
  const zwarcieRunId = useAktywnyRunId('zwarcie');
  const ogladany = useBiegOgladany();
  const runIdOgladany = useRunIdOgladany();
  // Rejestr przebiegów jest ZSYNCHRONIZOWANY z aktywnym zakresem obliczeń, gdy
  // został wczytany dla tego zakresu i nie trwa jego wczytywanie. Bez zakresu
  // nie ma rejestru do wczytania (stan ustalony natychmiast). Przed hydratacją
  // K2 po zimnym starcie (`useHydratacjaPowloki`: projekt → zakresy → rejestr)
  // rejestr należy jeszcze do poprzedniego kontekstu (albo do żadnego) — rodzaj
  // biegu oglądanego jest wtedy NIEUSTALONY, a nie „brak przebiegu".
  const rejestrZsynchronizowany =
    activeCaseId == null || (rejestrCaseId === activeCaseId && !isLoadingRuns);
  // Bieg OCZEKUJĄCY (wskazany adresem, rejestr jeszcze go nie zna) ma rodzinę NIEUSTALONĄ:
  // rodzaj poprzednio oglądanego biegu nie może wybrać zakładki startowej, bo po
  // dołożeniu biegu do rejestru zakładka przeskoczyłaby pod kursorem (klasa K3-A4).
  const biegOczekujacy = runIdOgladany != null && ogladany?.id !== runIdOgladany;
  const rodzina = ogladany && !biegOczekujacy ? rodzinaAnalizy(ogladany.analysis_type) : null;
  const aktywnyRodzaj: RodzajWyniku =
    rodzina === 'rozplyw' ? 'rozplyw' : rodzina === 'zwarcie' ? 'zwarcie' : null;

  // INTENCJA (K2, defekt H-0): po zimnym starcie rejestr przebiegów hydratuje z serwera
  // PO montażu tego hooka — aktywny bieg rodziny pojawia się później i efekt go ładuje.
  useEffect(() => {
    if (rozplywRunId) void zaladujRozplyw(rozplywRunId);
  }, [rozplywRunId, ponowKlucz]);
  // Zakładka „Dowód obliczeń" trzyma w magazynie inspektora wyników ślad biegu
  // OGLĄDANEGO (dowolnej rodziny) — ładowanie biegu zwarciowego w tym czasie nadpisałoby
  // go (wyścig dwóch `selectRun`); wynik zwarcia wraca przy wyjściu z zakładki.
  useEffect(() => {
    if (zwarcieRunId && ponowKlucz !== ZAKLADKA_DOWODU) void zaladujZwarcia(zwarcieRunId);
  }, [zwarcieRunId, ponowKlucz]);

  return {
    aktywnyRodzaj,
    rejestrZsynchronizowany,
    biegOczekujacy,
  };
}
