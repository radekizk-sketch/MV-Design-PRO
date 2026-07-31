/*
 * Uruchomienie obliczenia (przestrzeń „Obliczenia", karta K6 / H-5 dźwignia 2).
 *
 * JEDNA prawda wykonania przebiegu dla całej powłoki. Ciało zostało WYNIESIONE
 * 1:1 z `useLegacyOrchestrator.handleCalculate` (zero nowej semantyki, zero
 * nowych torów backendu) i sparametryzowane RODZAJEM analizy, aby:
 *   1. przycisk „Uruchom obliczenie" w przestrzeni „Obliczenia" mógł wybrać
 *      rodzaj (zwarcie SC_3F / rozpływ LOAD_FLOW),
 *   2. stany zerowe ekranów wyników („brak przebiegu") mogły uruchomić
 *      DOKŁADNIE ten sam tor zamiast prowadzić w ślepy zaułek,
 *   3. `handleCalculate` (menu, pasek tytułowy, wyszukiwarka poleceń) dalej
 *      korzystało z rodzaju wynikającego z `activeAnalysisType` — teraz przez
 *      delegację do tej funkcji, bez drugiej kopii logiki.
 *
 * Tor (bez zmian względem ekstrakcji): walidacja aktywnego zakresu → bramka
 * gotowości (blokady) → `createAndExecuteRun` (POST /api/study-cases/{id}/runs
 * + POST /api/runs/{id}/execute) → oczekiwanie na stan terminalny (pollRunStatus)
 * → kontrola zdrowia przebiegu → status wyników + migawka → przejście do wyników.
 *
 * ZERO fizyki, ZERO mutacji NetworkModelu — wyłącznie istniejące akcje store'ów
 * i istniejące endpointy.
 */

import { useCallback, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionAnalysisType, ExecutionRun } from '../../../ui/study-cases/types';
import { navigateToResults } from '../../../ui/navigation';
import { notify } from '../../../ui/notifications/store';
import { sanitizePublicReadinessMessage } from '../../../ui/shared/publicReadinessMessage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type AnalysisRunHealth = {
  status?: string | null;
  result_status?: string | null;
  results_valid?: boolean | null;
  error_message?: string | null;
  not_found?: boolean | null;
};

export function isFailedAnalysisRun(
  run?: ExecutionRun | null,
  health?: AnalysisRunHealth | null,
): boolean {
  const executionStatus = run?.status?.toUpperCase();
  const canonicalStatus = health?.status?.toUpperCase();
  const resultStatus = health?.result_status?.toUpperCase();

  return executionStatus === 'FAILED'
    || canonicalStatus === 'FAILED'
    || resultStatus === 'FAILED';
}

export function isTerminalExecutionRun(run: ExecutionRun): boolean {
  return run.status === 'DONE' || run.status === 'FAILED';
}

export async function fetchAnalysisRunHealth(runId: string): Promise<AnalysisRunHealth | null> {
  try {
    const response = await fetch(`/api/analysis-runs/${runId}`);
    if (response.status === 404) {
      return {
        status: 'NOT_FOUND',
        result_status: 'NONE',
        results_valid: false,
        error_message: 'RUN_NOT_FOUND',
        not_found: true,
      };
    }
    if (!response.ok) {
      return null;
    }
    return {
      ...((await response.json()) as AnalysisRunHealth),
      not_found: false,
    };
  } catch {
    return null;
  }
}

export function analysisRunFailureMessage(): string {
  return 'Obliczenia nie zakończyły się wynikiem. Sprawdź konfigurację układu i dane katalogowe.';
}

export async function waitForExecutionRunTerminalState(
  initialRun: ExecutionRun,
  pollRunStatus: (runId: string) => Promise<ExecutionRun>,
): Promise<ExecutionRun> {
  let current = initialRun;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (isTerminalExecutionRun(current)) {
      return current;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    current = await pollRunStatus(current.id);
  }
  return current;
}

/**
 * Uruchamia obliczenie WSKAZANEGO rodzaju dla aktywnego zakresu obliczeń.
 * Zwraca `true`, gdy przebieg zakończył się wynikiem (status DONE bez awarii).
 */
export async function uruchomObliczenie(analysisType: ExecutionAnalysisType): Promise<boolean> {
  const stanAplikacji = useAppStateStore.getState();
  const activeCaseId = stanAplikacji.activeCaseId;

  if (!activeCaseId) {
    notify('Wybierz aktywny zakres obliczeń.', 'error');
    return false;
  }

  const readiness = useSnapshotStore.getState().readiness;
  if (readiness && !readiness.ready) {
    const firstBlocker = readiness.blockers?.[0];
    notify(
      firstBlocker
        ? sanitizePublicReadinessMessage(firstBlocker.message_pl)
        : 'Dokończ konfigurację układu przed analizą.',
      'warning',
    );
    return false;
  }

  try {
    let caseIdForRun = activeCaseId;
    if (!isUuid(caseIdForRun)) {
      caseIdForRun = crypto.randomUUID();
      stanAplikacji.setActiveCase(
        caseIdForRun,
        stanAplikacji.activeCaseName ?? 'Zwarcie maksymalne IEC 60909',
        stanAplikacji.activeCaseKind ?? 'ShortCircuitCase',
        'NONE',
      );
    }
    const przebiegi = useExecutionRunsStore.getState();
    const createdRun = await przebiegi.createAndExecuteRun(caseIdForRun, {
      analysis_type: analysisType,
    });
    const run = await waitForExecutionRunTerminalState(
      createdRun,
      useExecutionRunsStore.getState().pollRunStatus,
    );
    const runHealth = await fetchAnalysisRunHealth(run.id);
    useAppStateStore.getState().setActiveRun(run.id);

    if (isFailedAnalysisRun(run, runHealth)) {
      useAppStateStore.getState().setActiveCaseResultStatus('NONE');
      notify(analysisRunFailureMessage(), 'error');
      return false;
    }

    if (run.status !== 'DONE') {
      useAppStateStore.getState().setActiveCaseResultStatus('NONE');
      notify(
        'Obliczenia są nadal wykonywane. Wyniki zostaną pokazane po zakończeniu solvera.',
        'info',
      );
      return false;
    }

    useAppStateStore.getState().setActiveCaseResultStatus('FRESH');
    try {
      const response = await fetch(`/api/analysis-runs/${run.id}/snapshot`);
      if (response.ok) {
        const payload = (await response.json()) as { snapshot_id?: unknown };
        if (typeof payload.snapshot_id === 'string' && payload.snapshot_id.trim()) {
          useAppStateStore.getState().setActiveSnapshot(payload.snapshot_id);
        }
      }
    } catch {
      // Wyniki pozostają dostępne; panel statusu pokaże brak wersji modelu, jeśli backend jej nie zwróci.
    }
    notify('Obliczenie zakończone. Otwieram wyniki.', 'success');
    navigateToResults({ runId: run.id });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd wykonania obliczeń';
    notify(message, 'error');
    return false;
  }
}

/**
 * Hook przycisku „Uruchom obliczenie" (i akcji stanów zerowych): ten sam tor
 * co wyżej + lokalny znacznik „w toku" na CAŁY czas biegu (tworzenie →
 * wykonanie → odpytywanie), bo store kończy `isExecutingRun` przed pollingiem.
 */
export function useUruchomObliczenie(): {
  uruchom: (analysisType: ExecutionAnalysisType) => void;
  wToku: boolean;
} {
  const [wToku, setWToku] = useState(false);
  const uruchom = useCallback((analysisType: ExecutionAnalysisType) => {
    setWToku(true);
    void uruchomObliczenie(analysisType).finally(() => setWToku(false));
  }, []);
  return { uruchom, wToku };
}
