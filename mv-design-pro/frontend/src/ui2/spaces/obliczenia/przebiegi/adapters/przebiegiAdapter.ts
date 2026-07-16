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
 * TODO-KARTA (ograniczenia — brak źródła w typach read-only, karta §2 „NIE zgaduj"):
 * 1. `runStore.runs` niesie przebiegi WYŁĄCZNIE dla `activeStudyCaseId`
 *    (`runStore.ts:87-97`) — pole ustawiane przez INNE komponenty (np.
 *    `ui/sld/SldAnalysisLauncher.tsx:205`), nie przez ten adapter (adapter jest
 *    read-only — karta §2). Ten sam udokumentowany kompromis co
 *    `ui2/spaces/projekt/pulpitAdapter.ts` TODO-KARTA #3: jeżeli `activeStudyCaseId`
 *    różni się od aktywnego przypadku w `app-state`, lista może być pusta albo
 *    dotyczyć innego przypadku niż wskazuje pasek aktywnego przypadku. Naprawa
 *    (np. jawna synchronizacja) wymagałaby wywołania akcji zmieniającej globalny
 *    kontekst współdzielony z innymi oknami — poza zakresem plików tej karty.
 * 2. „Rewizja modelu" (kolumna tabeli, karta §1) NIE jest polem `ExecutionRun`
 *    (`types.ts:234-243` — brak `revision`; pole `revision` istnieje wyłącznie na
 *    `StudyCase`, `types.ts:97`, i opisuje BIEŻĄCĄ rewizję przypadku, nie rewizję
 *    z chwili liczenia danego przebiegu) → renderowana jako „wkrótce" (karta §2).
 * 3. „Wartości parametrów wejściowych solvera" (surowe liczby) NIE są niesione
 *    przez `ExecutionRun` — dostępny jest wyłącznie `solver_input_hash` (odcisk
 *    SHA-256, dowód odtwarzalności WHITE BOX bez ekspozycji wartości) →
 *    renderowane jako „wkrótce".
 */

import { useState } from 'react';
import type { ExecutionRun, RunStatus } from '../../../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useBusEvent } from '../../../../events';
import { etykietaAnalizy, etykietaStatusu, formatCzasTrwania, PRZEBIEGI_STRINGS } from '../strings';

// ---------------------------------------------------------------------------
// Modele widoku (projekcja read-only)
// ---------------------------------------------------------------------------

/** Stan okna (karta §3): brak aktywnego przypadku / ładowanie / błąd / lista. */
export type StanPrzebiegow = 'brak-przypadku' | 'ladowanie' | 'blad' | 'lista';

/** Wiersz listy przebiegów — projekcja `ExecutionRun` na etykiety PL. */
export interface PrzebiegWiersz {
  id: string;
  przypadekId: string;
  analiza: string;
  status: RunStatus;
  statusLabel: string;
  poczatekISO: string | null;
  koniecISO: string | null;
  czasTrwania: string;
  odcisk: string;
  blad: string | null;
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
    status: r.status,
    statusLabel: etykietaStatusu(r.status),
    poczatekISO: r.started_at,
    koniecISO: r.finished_at,
    czasTrwania: formatCzasTrwania(r.started_at, r.finished_at),
    odcisk: r.solver_input_hash,
    blad: r.error_message,
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
