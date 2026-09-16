/*
 * Adapter okna „Przebiegi obliczeń" (przestrzeń „Obliczenia", W-503, karta E7.2).
 * Czyta WYŁĄCZNIE istniejący store przebiegów (`useExecutionRunsStore`, read-only)
 * i mapuje go na model widoku. Odświeżenie listy po zdarzeniu magistrali woła
 * ISTNIEJĄCĄ akcję store'u (`loadRuns`) — zero wołań `fetch`/API bezpośrednio
 * z tego pliku (karta §2 „read-only runStore"; `loadRuns` samo woła
 * `api.listRuns`, `runStore.ts:144-154`). Zero fizyki, zero mutacji NetworkModelu.
 *
 * ŹRÓDŁA DANYCH — read-only (mapowanie plik:linia — karta §2):
 * - Lista przebiegów aktywnego przypadku: `useExecutionRunsStore.runs`
 *   (`runStore.ts:40`, `ExecutionRun[]`) → `PrzebiegWiersz` (pola `types.ts:234-243`:
 *   id, analysis_type, solver_input_hash, status, started_at, finished_at,
 *   error_message). Rekord przebiegu niesie WSZYSTKIE pola potrzebne do
 *   szczegółów — brak potrzeby dodatkowego pobrania (inaczej niż
 *   `przypadkiAdapter.usePelnePrzypadki`, gdzie streszczenie i pełny rekord
 *   różnią się kształtem).
 * - Stan ładowania / błędu: `isLoadingRuns` (`runStore.ts:48`), `runError`
 *   (`runStore.ts:52`).
 *
 * STAN FAKTYCZNY (TODO-UI2 §1 p. 10, poprzednie ograniczenia #1/#2/#3):
 * 1. `runStore.runs` niesie przebiegi WYŁĄCZNIE dla `activeStudyCaseId`
 *    (`runStore.ts:87-97`) — ALE synchronizacja tego pola z aktywnym przypadkiem
 *    powłoki (`app-state.activeCaseId`) JUŻ ISTNIEJE: `useHydratacjaPowloki.ts`
 *    (`ui2/shell/useHydratacjaPowloki.ts:123-126`, wołany z `AppRoot.tsx` na
 *    KAŻDĄ zmianę `activeCaseId`, nie tylko zimny start) woła
 *    `przebiegi.setActiveStudyCaseId(caseId)`, gdy różni się od bieżącego —
 *    ta sama JEDNA akcja co dawny (nieistniejący dziś) `SldAnalysisLauncher`.
 *    Poprzednia treść tego akapitu (jawna synchronizacja „poza zakresem")
 *    powstała PRZED kartą K6/H-6, która to domknęła — sam adapter POZOSTAJE
 *    read-only, nic tu nie trzeba dopisywać.
 * 2. „Rewizja modelu" JEST teraz polem `ExecutionRun.model_revision` (koperta
 *    rewizji CV-2, `backend/src/enm/canonical_analysis.py::to_execution_dict`,
 *    `api/execution_runs.py::RunResponse` — addytywne, `null` dla biegów sprzed
 *    rejestru koperty) — renderowana jako liczba albo, dla biegów sprzed
 *    koperty, jawny stan „brak w rekordzie" (NIE „wkrótce": kontrakt istnieje,
 *    ta konkretna wartość po prostu nie została zapisana).
 * 3. „Wartości parametrów wejściowych solvera" (surowe liczby) NADAL nie są
 *    niesione przez `ExecutionRun` — WYŁĄCZNIE `solver_input_hash` (odcisk
 *    SHA-256, dowód odtwarzalności WHITE BOX bez ekspozycji wartości), i to
 *    jest OSTATECZNY kształt kontraktu (odtwarzalność przez odcisk, nie przez
 *    zrzut surowych parametrów) — kontrolka bez dostawcy jest fantomem
 *    (dyrektywa właściciela „zero fabrykacji"), więc sekcja „wkrótce" z tym
 *    wierszem jest SKASOWANA, nie relabelowana.
 */

import { useState } from 'react';
import type {
  ExecutionAnalysisType,
  ExecutionRun,
  RunStatus,
} from '../../../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useBusEvent } from '../../../../events';
import { etykietaAnalizy, etykietaStatusu, formatCzasTrwania, PRZEBIEGI_STRINGS } from '../strings';

// ---------------------------------------------------------------------------
// Modele widoku (projekcja read-only)
// ---------------------------------------------------------------------------

/** Stan okna (karta §3): brak aktywnego przypadku / ładowanie / błąd / lista. */
export type StanPrzebiegow = 'brak-przypadku' | 'ladowanie' | 'blad' | 'lista';

/**
 * Rodzaj przebiegu — wskazuje właściwą zakładkę wyników w „Następnym kroku"
 * (F-E4). Klasyfikacja 1:1 z `useWpiecieWynikow` (`ui2/spaces/wyniki/
 * useWpiecieWynikow.ts:28-33`): rozpływ dla „LOAD_FLOW", zwarcie dla „SC_*",
 * pozostałe rodzaje → „inny" (brak dedykowanej zakładki wyników).
 */
export type RodzajPrzebiegu = 'rozplyw' | 'zwarcie' | 'inny';

/** Klasyfikuje typ analizy na rodzaj wyniku (bez zgadywania — parytet z warsztatem wyników). */
export function rodzajPrzebiegu(analysisType: ExecutionAnalysisType): RodzajPrzebiegu {
  if (analysisType === 'LOAD_FLOW') return 'rozplyw';
  if (analysisType.startsWith('SC_')) return 'zwarcie';
  return 'inny';
}

/** Wiersz listy przebiegów — projekcja `ExecutionRun` na etykiety PL. */
export interface PrzebiegWiersz {
  id: string;
  przypadekId: string;
  analiza: string;
  rodzaj: RodzajPrzebiegu;
  status: RunStatus;
  statusLabel: string;
  poczatekISO: string | null;
  koniecISO: string | null;
  czasTrwania: string;
  odcisk: string;
  blad: string | null;
  /** Rewizja modelu, na której policzono bieg (koperta CV-2); `null` = bieg sprzed rejestru koperty. */
  rewizjaModelu: number | null;
}

// ---------------------------------------------------------------------------
// Mapowania czyste (bez React)
// ---------------------------------------------------------------------------

/** Mapuje rekordy `ExecutionRun` na wiersze widoku (kolejność zachowana ze store'u). */
export function mapujWiersze(runs: ExecutionRun[]): PrzebiegWiersz[] {
  return runs.map((r) => ({
    id: r.id,
    przypadekId: r.study_case_id,
    analiza: etykietaAnalizy(r.analysis_type),
    rodzaj: rodzajPrzebiegu(r.analysis_type),
    status: r.status,
    statusLabel: etykietaStatusu(r.status),
    poczatekISO: r.started_at,
    koniecISO: r.finished_at,
    czasTrwania: formatCzasTrwania(r.started_at, r.finished_at),
    odcisk: r.solver_input_hash,
    blad: r.error_message,
    rewizjaModelu: r.model_revision ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Hooki read-only (spięcie ze store'em)
// ---------------------------------------------------------------------------

/**
 * Stan okna: brak przypadku → gdy `activeStudyCaseId` nieustawiony; ładowanie/
 * błąd → WYŁĄCZNIE przy pustej liście (pierwsze pobranie); inaczej lista.
 * Odświeżenie po `wyniki-gotowe` przechodzi przez `isLoadingRuns=true`
 * (`loadRuns`, `runStore.ts:145`) — utrzymanie stanu 'lista' przy niepustych
 * `runs` gwarantuje odświeżenie BEZ remountu tabeli (karta §3 kryterium 2;
 * selekcja lokalna zachowana).
 */
export function useStanPrzebiegow(): StanPrzebiegow {
  const przypadekId = useExecutionRunsStore((s) => s.activeStudyCaseId);
  const ladowanie = useExecutionRunsStore((s) => s.isLoadingRuns);
  const blad = useExecutionRunsStore((s) => s.runError);
  const pusto = useExecutionRunsStore((s) => s.runs.length === 0);
  if (!przypadekId) return 'brak-przypadku';
  if (ladowanie && pusto) return 'ladowanie';
  if (blad && pusto) return 'blad';
  return 'lista';
}

/** Wiersze przebiegów aktywnego przypadku (kolejność ze store'u — karta §2). */
export function useWierszePrzebiegow(): PrzebiegWiersz[] {
  const runs = useExecutionRunsStore((s) => s.runs);
  return mapujWiersze(runs);
}

/**
 * Reakcja na żywo (karta §3 kryterium 2): `wyniki-gotowe` dla AKTYWNIE śledzonego
 * przypadku (`activeStudyCaseId`) odświeża listę przez ISTNIEJĄCĄ akcję
 * `loadRuns` (ponowne, autorytatywne pobranie — bez zgadywania stanu z samego
 * zdarzenia magistrali). Zdarzenie dla INNEGO przypadku jest ignorowane (lista
 * pozostaje zakresem `activeStudyCaseId` — TODO-KARTA #1). `wyniki-niewazne`
 * nie zmienia danych (status przebiegu w `ExecutionRun` nie zależy od rewizji
 * modelu) — wyłącznie aktualizuje ogłoszenie ARIA-live (WHITE BOX transparentność).
 * Zwraca bieżącą treść ogłoszenia do wyrenderowania w `aria-live` (wzorzec
 * `PanelGotowosci`, `ui2/spaces/gotowosc/PanelGotowosci.tsx:70-75`).
 */
export function useOdswiezaniePrzebiegow(): string {
  const [ogloszenie, setOgloszenie] = useState('');

  useBusEvent('wyniki-gotowe', (zdarzenie) => {
    const aktywny = useExecutionRunsStore.getState().activeStudyCaseId;
    if (aktywny && zdarzenie.przypadekId === aktywny) {
      useExecutionRunsStore.getState().loadRuns(aktywny);
      setOgloszenie(PRZEBIEGI_STRINGS.ariaWynikiGotowe);
    }
  });

  useBusEvent('wyniki-niewazne', (zdarzenie) => {
    setOgloszenie(PRZEBIEGI_STRINGS.ariaWynikiNiewazne(zdarzenie.rev));
  });

  return ogloszenie;
}
