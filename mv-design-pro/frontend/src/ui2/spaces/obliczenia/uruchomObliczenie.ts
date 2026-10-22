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
 * → kontrola zdrowia przebiegu → status wyników + migawka → sygnał gotowości
 * wyniku BEZ nawigacji.
 *
 * S9-11 (W-4, naprawa u źródła; zaostrzenie S9-3/W-3): bieg NIE nawiguje WCALE.
 * Projektant zostaje tam, gdzie jest — na schemacie nakładka wynikowa odświeża
 * się sama (karta K8: zakończony bieg staje się aktywnym biegiem swojej rodziny
 * w magazynie kontekstu wyniku → orkiestrator pobiera `results/v1`), a komunikat końcowy mówi, gdzie wynik czeka. Wejście na wyniki
 * pozostaje OSIĄGALNE wyłącznie jawnym klikiem (nawigacja przestrzeni, pas
 * „następny krok", deep-linki K3 `#analysis?run=…`). Poprzedni kompromis S9-3
 * („skok tylko z niezmienionego miejsca pracy") nadal wyrywał projektanta ze
 * schematu w NAJCZĘSTSZYM scenariuszu — bieg bez ruchu myszy — i dlatego został
 * zastąpiony brakiem skoku; klasa „odroczona nawigacja depcząca wybór
 * użytkownika" (W-3) znika w tym torze strukturalnie, co przypina test
 * `shell/__tests__/nawigacjaAutomatyczna.inwariant.test.ts`.
 *
 * ZERO fizyki, ZERO mutacji NetworkModelu — wyłącznie istniejące akcje store'ów
 * i istniejące endpointy.
 */

import { useCallback, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useKontekstWynikuStore } from '../../wyniki/kontekst/kontekstWyniku';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionAnalysisType, ExecutionRun } from '../../../ui/study-cases/types';
import { czyStanKoncowyBiegu } from '../../../ui/study-cases/types';
import { ODSTEP_ODPYTYWANIA_BIEGU_MS, cancelRun } from '../../../ui/study-cases/api';
import { notify } from '../../../ui/notifications/store';
import { sanitizePublicReadinessMessage } from '../../../ui/shared/publicReadinessMessage';
import type { ReadinessInfo } from '../../../types/enm';

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
  return czyStanKoncowyBiegu(run.status);
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

/**
 * Jedyny komunikat końca udanego biegu (S9-11 / W-4): bieg NIE wyrywa
 * projektanta z bieżącej pracy — sygnalizuje gotowość wyniku i mówi, gdzie on
 * czeka. Na schemacie nakładka wynikowa odświeża się sama (most S9-2).
 */
export const KOMUNIKAT_BIEG_WYNIKI_CZEKAJA =
  'Obliczenie zakończone. Wyniki czekają w przestrzeni „Wyniki i dowody".';

/** Komunikat biegu anulowanego przez użytkownika (stan CANCELLED, bez wyniku). */
export const KOMUNIKAT_BIEG_ANULOWANY = 'Obliczenie anulowane — bieg nie ma wyniku.';

/**
 * Odpytuj stan biegu do stanu końcowego (DONE/FAILED/CANCELLED) — bez limitu prób
 * (karta DYNAMIKA-W-TLE): `POST …/execute` wraca z 202 od razu, a bieg liczy się w
 * tle tak długo, jak trwa (zwarcie sieci 50 stacji — dziesiątki sekund); dawny limit
 * 24 × 750 ms przerywał odpytywanie po 18 s i zostawiał projektanta z komunikatem
 * „nadal wykonywane" bez wyniku. Stan końcowy jest gwarantowany przez wykonawcę
 * (zakończenie, odmowa, anulowanie, zamknięcie biegu osieroconego po restarcie).
 */
export async function waitForExecutionRunTerminalState(
  initialRun: ExecutionRun,
  pollRunStatus: (runId: string) => Promise<ExecutionRun>,
  czekaj: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => window.setTimeout(resolve, ms)),
): Promise<ExecutionRun> {
  let current = initialRun;
  while (!isTerminalExecutionRun(current)) {
    await czekaj(ODSTEP_ODPYTYWANIA_BIEGU_MS);
    current = await pollRunStatus(current.id);
  }
  return current;
}

/** Przyczyna, dla której obliczenia nie mogą wystartować (rodzaj + zdanie dla projektanta). */
export interface BlokadaObliczen {
  rodzaj: 'BRAK_ZAKRESU' | 'BLOKADA_GOTOWOSCI';
  komunikat: string;
}

/**
 * JEDYNY predykat dostępności obliczeń (karta K1 POWLOKA, zasada „predykaty
 * parami"): przycisk „Oblicz" paska projektu pokazuje tę przyczynę jako powód
 * niedostępności, a `uruchomObliczenie` odmawia startu DOKŁADNIE z tego samego
 * powodu i tym samym zdaniem. Dwa niezależne warunki mogłyby się rozjechać —
 * przycisk aktywny, a bieg odmówiony (albo odwrotnie).
 *
 * `readiness === null` (gotowość jeszcze nie odczytana) NIE blokuje — tak jak
 * dotąd w torze wykonania: bramkę stawia dopiero ODCZYTANA blokada.
 */
export function przyczynaBlokadyObliczen(
  activeCaseId: string | null,
  readiness: ReadinessInfo | null,
): BlokadaObliczen | null {
  if (!activeCaseId) {
    return { rodzaj: 'BRAK_ZAKRESU', komunikat: 'Wybierz aktywny zakres obliczeń.' };
  }
  if (readiness && !readiness.ready) {
    const pierwszaBlokada = readiness.blockers?.[0];
    return {
      rodzaj: 'BLOKADA_GOTOWOSCI',
      komunikat: pierwszaBlokada
        ? sanitizePublicReadinessMessage(pierwszaBlokada.message_pl)
        : 'Dokończ konfigurację układu przed analizą.',
    };
  }
  return null;
}

/** Hook przycisku „Oblicz": ta sama przyczyna co w `uruchomObliczenie` (stan bieżący). */
export function usePrzyczynaBlokadyObliczen(): BlokadaObliczen | null {
  const activeCaseId = useAppStateStore((stan) => stan.activeCaseId);
  const readiness = useSnapshotStore((stan) => stan.readiness);
  return przyczynaBlokadyObliczen(activeCaseId, readiness);
}

/**
 * Uruchamia obliczenie WSKAZANEGO rodzaju dla aktywnego zakresu obliczeń.
 * `solverInput` (opcjonalny) — jawne opcje biegu (np. metoda rozpływu);
 * przekazywany 1:1 do `POST /api/execution/study-cases/{id}/runs`
 * jako `solver_input` (pole `options` po stronie backendu, `enm/canonical_analysis.py`).
 * Brak = pusty obiekt, tak jak dotychczas (kontrakt `CreateRunRequest.solver_input`
 * ma domyślną wartość `{}` po stronie backendu).
 * Zwraca `true`, gdy przebieg zakończył się wynikiem (status DONE bez awarii).
 */
export async function uruchomObliczenie(
  analysisType: ExecutionAnalysisType,
  solverInput?: Record<string, unknown>,
  onBieg?: (bieg: ExecutionRun) => void,
): Promise<boolean> {
  const stanAplikacji = useAppStateStore.getState();
  const activeCaseId = stanAplikacji.activeCaseId;

  const blokada = przyczynaBlokadyObliczen(activeCaseId, useSnapshotStore.getState().readiness);
  if (blokada || !activeCaseId) {
    notify(
      blokada?.komunikat ?? 'Wybierz aktywny zakres obliczeń.',
      blokada?.rodzaj === 'BLOKADA_GOTOWOSCI' ? 'warning' : 'error',
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
      ...(solverInput !== undefined ? { solver_input: solverInput } : {}),
    });
    // Karta DYNAMIKA-W-TLE: bieg zlecony (202, QUEUED) — wołający zna jego identyfikator,
    // żeby móc go anulować w trakcie odpytywania.
    onBieg?.(createdRun);
    const run = await waitForExecutionRunTerminalState(
      createdRun,
      useExecutionRunsStore.getState().pollRunStatus,
    );
    const runHealth = await fetchAnalysisRunHealth(run.id);

    if (isFailedAnalysisRun(run, runHealth)) {
      useAppStateStore.getState().setActiveCaseResultStatus('NONE');
      notify(analysisRunFailureMessage(), 'error');
      return false;
    }

    if (run.status !== 'DONE') {
      // Jedyny stan końcowy poza DONE/FAILED to CANCELLED (anulowanie przez
      // użytkownika — decyzja, nie awaria).
      useAppStateStore.getState().setActiveCaseResultStatus('NONE');
      notify(KOMUNIKAT_BIEG_ANULOWANY, 'info');
      return false;
    }

    useAppStateStore.getState().setActiveCaseResultStatus('FRESH');
    // Karta K8: bieg z wynikiem staje się AKTYWNYM biegiem swojej rodziny i rodzina
    // staje się oglądaną — schemat, panel dolny, pasek stanu i ekrany pokazują go
    // jednocześnie (jedna akcja magazynu kontekstu wyniku, zero drugiej kopii).
    useKontekstWynikuStore.getState().wybierzBieg(run.id, 'bieg');
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
    // S9-11 / W-4: bieg zostawia projektanta TAM, GDZIE JEST — zero nawigacji.
    // `wybierzBieg` wyżej już związał świeży przebieg z powłoką: nakładka na
    // schemacie odświeża się sama (S9-2), a jawny klik w „Wyniki i dowody"
    // otwiera wyniki tego biegu (`mostTrasyPrzestrzeni` dokleja `?run=`).
    notify(KOMUNIKAT_BIEG_WYNIKI_CZEKAJA, 'success');
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
  uruchom: (analysisType: ExecutionAnalysisType, solverInput?: Record<string, unknown>) => void;
  /** Anuluj bieg w toku (karta DYNAMIKA-W-TLE): z kolejki od razu, w toku — w punkcie przerwania. */
  anuluj: () => void;
  wToku: boolean;
  /** Identyfikator biegu zleconego w tym uruchomieniu (do anulowania); `null` poza biegiem. */
  biegId: string | null;
} {
  const [wToku, setWToku] = useState(false);
  const [biegId, setBiegId] = useState<string | null>(null);
  const uruchom = useCallback(
    (analysisType: ExecutionAnalysisType, solverInput?: Record<string, unknown>) => {
      setWToku(true);
      setBiegId(null);
      void uruchomObliczenie(analysisType, solverInput, (bieg) => setBiegId(bieg.id)).finally(
        () => {
          setWToku(false);
          setBiegId(null);
        },
      );
    },
    [],
  );
  const anuluj = useCallback(() => {
    if (biegId === null) return;
    void cancelRun(biegId).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : 'Nie udało się anulować obliczenia', 'error');
    });
  }, [biegId]);
  return { uruchom, anuluj, wToku, biegId };
}
