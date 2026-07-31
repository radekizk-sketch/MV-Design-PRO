/**
 * Adapter: tlumaczy zmiany store'u stanu aplikacji i store'u przebiegow
 * obliczen na zdarzenia magistrali 'przypadek-aktywny' i 'wyniki-gotowe'.
 *
 * K6 / H-6 (R2) — JEDEN wyjatek od reguly „zero wolan API" ponizej: po
 * zdarzeniu 'wyniki-gotowe' adapter ponawia ISTNIEJACA akcje store'u
 * `useStudyCasesStore.loadActiveCase`, zeby chrom powloki (znacznik wynikow)
 * czytal stan SERWEROWY przypadku zamiast lokalnego przypuszczenia. Adapter
 * nadal nie ma wlasnego `fetch` ani wlasnej kopii danych.
 *
 * Zrodla store'ow (WYLACZNIE odczyt/subscribe — zero zapisu):
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
import { useStudyCasesStore } from '../../../ui/study-cases/store';
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

/**
 * K6 / H-6 (R2): po ZAKOŃCZONYM biegu chrom powłoki musi pokazywać stan
 * SERWEROWY przypadku, nie lokalne przypuszczenie. Znacznik „Wyniki: …"
 * (`shell/znacznikSwiezosci`) czyta `useStudyCasesStore.activeCase`
 * (`result_status` + `results_valid`), więc tuż po `wyniki-gotowe` ponawiamy
 * ISTNIEJĄCĄ akcję store'u `loadActiveCase` — to jedyne miejsce, w którym
 * ten adapter woła API, i robi to WYŁĄCZNIE przez akcję store'u (bez własnego
 * `fetch`, bez własnej kopii danych).
 *
 * Brak projektu w zasięgu (zimny start bez hydratacji) ⇒ nic nie robimy —
 * chrom zostaje przy ostatnim znanym stanie serwerowym, nie zgaduje.
 */
function odswiezAktywnyPrzypadek(): void {
  const przypadki = useStudyCasesStore.getState();
  const projectId = przypadki.projectId ?? useAppStateStore.getState().activeProjectId;
  if (!projectId) {
    return;
  }
  void przypadki.loadActiveCase(projectId);
}

/**
 * DEFEKT NAPRAWIONY (K6, pomiar biegiem e2e): warunkiem emisji byla ZMIANA
 * `runStatus` na 'DONE' w chwili, gdy rekord przebiegu byl juz w `runs`.
 * `createAndExecuteRun` ustawia jednak 'DONE' PRZED przeladowaniem listy
 * (`loadRuns` jest awaitowany dopiero po wykonaniu), wiec dla PIERWSZEGO biegu
 * przypadku lista byla jeszcze pusta — adapter wychodzil bez emisji, a gdy
 * `runs` sie doladowalo, `runStatus` juz sie nie zmienial. Efekt: 'wyniki-gotowe'
 * dla pierwszego biegu NIE POWSTAWALO (znaczniki swiezosci i odswiezenie
 * przypadku nie dostawaly sygnalu).
 *
 * Warunkiem jest teraz STAN, nie przejscie: „bieg DONE, znany w rejestrze,
 * jeszcze nieogloszony". Deduplikacje zapewnia zapamietany identyfikator —
 * dokladnie jedno zdarzenie na przebieg (kryterium §7.2 karty E15.1 bez zmian).
 */
function startRunStoreAdapter(): () => void {
  let ostatniOgloszonyRunId: string | null = null;
  try {
    useExecutionRunsStore.getState();
  } catch (err) {
    ostrzezRaz('[ui2/events] caseAdapter: store runStore niedostepny — adapter no-op', err);
    return () => {};
  }

  try {
    return useExecutionRunsStore.subscribe((stan) => {
      if (stan.runStatus !== 'DONE' || !stan.activeRunId) {
        // Wyjscie ze stanu DONE (nowy bieg, reset) zwalnia blokade deduplikacji.
        ostatniOgloszonyRunId = null;
        return;
      }
      if (stan.activeRunId === ostatniOgloszonyRunId) {
        return;
      }
      const przebieg = stan.runs.find((run) => run.id === stan.activeRunId);
      if (!przebieg) {
        // Rekord jeszcze nie doladowany — ogloszenie nastapi przy kolejnej
        // zmianie store'u (np. po `loadRuns`), bez zgadywania `przypadekId`.
        return;
      }
      ostatniOgloszonyRunId = przebieg.id;
      emituj({ typ: 'wyniki-gotowe', runId: przebieg.id, przypadekId: przebieg.study_case_id });
      odswiezAktywnyPrzypadek();
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
