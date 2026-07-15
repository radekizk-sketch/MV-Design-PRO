/**
 * Adapter: tlumaczy zmiany store'u stanu aplikacji i store'u przebiegow
 * obliczen na zdarzenia magistrali 'przypadek-aktywny' i 'wyniki-gotowe'.
 *
 * Zrodla store'ow (WYLACZNIE odczyt/subscribe — zero zapisu, zero wolan API):
 *
 * 1. frontend/src/ui/app-state/store.ts — useAppStateStore.activeCaseId
 *    -> 'przypadek-aktywny'.przypadekId.
 *    Wybor uzasadnienie: to jest KANONICZNY store aktywnego przypadku — czytaja
 *    z niego m.in. ActiveCaseBar (ui/active-case-bar/ActiveCaseBar.tsx, przez
 *    useActiveCaseName/useHasActiveCase/useCanCalculate z app-state) oraz
 *    CaseConfigPage/StudyCaseList. `useExecutionRunsStore.activeStudyCaseId`
 *    (study-cases/runStore.ts) jest odrebnym polem sluzacym WYLACZNIE do
 *    skopowania historii przebiegow (run history) danego przypadku i nie jest
 *    uzywane jako globalny kontekst aktywnego przypadku w powloce.
 *
 * 2. frontend/src/ui/study-cases/runStore.ts — useExecutionRunsStore
 *    .{activeRunId, runStatus, runs} -> 'wyniki-gotowe', gdy `runStatus`
 *    przechodzi w 'DONE'. `przypadekId` pobierany jest z pola `study_case_id`
 *    REKORDU PRZEBIEGU (ExecutionRun.study_case_id) odnalezionego w `runs` po
 *    `activeRunId` — to jedyne pole autorytatywnie wiazace przebieg z jego
 *    przypadkiem (nie z transientnym `activeStudyCaseId`, ktory jest jedynie
 *    zakresem widoku historii i teoretycznie moze byc niezsynchronizowany).
 *    Jesli rekord przebiegu nie zostanie odnaleziony w `runs` — zdarzenie NIE
 *    jest emitowane (brak zgadywania, patrz karta §6).
 */

import { useAppStateStore } from '../../../ui/app-state/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { emituj } from '../bus';

let ostrzezonoRaz = false;
function ostrzezRaz(komunikat: string, err: unknown): void {
  if (ostrzezonoRaz) {
    return;
  }
  ostrzezonoRaz = true;
  console.warn(komunikat, err);
}

function startAppStateAdapter(): () => void {
  let ostatniPrzypadek: string | null;
  try {
    ostatniPrzypadek = useAppStateStore.getState().activeCaseId;
  } catch (err) {
    ostrzezRaz('[ui2/events] caseAdapter: store app-state niedostepny — adapter no-op', err);
    return () => {};
  }

  try {
    return useAppStateStore.subscribe((stan) => {
      if (stan.activeCaseId === ostatniPrzypadek) {
        return;
      }
      ostatniPrzypadek = stan.activeCaseId;
      // Wyczyszczenie aktywnego przypadku (np. zmiana projektu) -> brak emisji
      // (przypadek brzegowy §4 karty: "brak projektu — adaptery nie emituja").
      if (stan.activeCaseId) {
        emituj({ typ: 'przypadek-aktywny', przypadekId: stan.activeCaseId });
      }
    });
  } catch (err) {
    ostrzezRaz('[ui2/events] caseAdapter: subskrypcja app-state niedostepna — adapter no-op', err);
    return () => {};
  }
}

function startRunStoreAdapter(): () => void {
  let ostatniStatus: string | null;
  try {
    ostatniStatus = useExecutionRunsStore.getState().runStatus;
  } catch (err) {
    ostrzezRaz('[ui2/events] caseAdapter: store runStore niedostepny — adapter no-op', err);
    return () => {};
  }

  try {
    return useExecutionRunsStore.subscribe((stan) => {
      if (stan.runStatus === ostatniStatus) {
        return;
      }
      ostatniStatus = stan.runStatus;
      if (stan.runStatus !== 'DONE' || !stan.activeRunId) {
        return;
      }
      const przebieg = stan.runs.find((run) => run.id === stan.activeRunId);
      if (!przebieg) {
        return;
      }
      emituj({ typ: 'wyniki-gotowe', runId: przebieg.id, przypadekId: przebieg.study_case_id });
    });
  } catch (err) {
    ostrzezRaz('[ui2/events] caseAdapter: subskrypcja runStore niedostepna — adapter no-op', err);
    return () => {};
  }
}

/**
 * Uruchamia oba pod-adaptery (app-state + runStore) -> magistrala. Wywolac raz
 * przy starcie powloki. Zwraca funkcje odsubskrybowania obu.
 */
export function startCaseAdapter(): () => void {
  const zatrzymajAppState = startAppStateAdapter();
  const zatrzymajRunStore = startRunStoreAdapter();
  return () => {
    zatrzymajAppState();
    zatrzymajRunStore();
  };
}
