/*
 * Adapter odczytu (tylko odczyt) z istniejących store'ów do powłoki W-110.
 * Powłoka NIE woła API i NIE trzyma kopii danych domenowych — konsumuje
 * `ui/app-state`, `ui/study-cases`, migawkę modelu (karta E1.1 §3).
 *
 * JEDNA PRAWDA WSKAŹNIKÓW CHROMU (karta K6 / H-6). Każdy wskaźnik ma dokładnie
 * jedno źródło, to samo, którego używa właściwa przestrzeń:
 * - „Model: zwalidowany" i „Gotowość: …" → `useSnapshotStore.readiness`
 *   przez `spaces/gotowosc/adapters/gotowoscAdapter.podsumujGotowosc`
 *   (R1: dawne źródło `readinessLiveStore` miało `ready: true` w stanie
 *   początkowym i NIGDY nie było odświeżane — pasek kłamał „zwalidowany"),
 * - „Wyniki: …" → `useStudyCasesStore.activeCase` (stan serwerowy przypadku,
 *   odświeżany po każdym zakończonym biegu — R2, `events/adapters/caseAdapter`)
 *   ZESTAWIONY z parą rewizji: rewizją modelu, na której policzono ostatni
 *   zakończony bieg przypadku (`analysis_case_context.rewizja_modelu`), i bieżącą
 *   rewizją migawki. Sam `result_status` nie wystarcza — dług V12K-309 poz. 2:
 *   edycja modelu PO biegu nie przechodzi przez unieważnienie przypadku, więc
 *   chip trwał na „aktualne" przy modelu nowszym niż wynik,
 * - „Model: rew. n" → rewizja migawki podana przez powłokę (R5: martwy fallback
 *   `readinessLiveStore.lastRevision` usunięty — nikt go nie zasilał),
 * - „Wersja modelu" → `snapshot.header.hash_sha256` (R4: dawne źródło
 *   `appState.enmHashChain` nie miało żywego settera),
 * - „Przebieg: …" → etykieta ostatniego zakończonego przebiegu podana przez
 *   powłokę z rejestru przebiegów (R3).
 */

import { useMemo } from 'react';

import {
  useActiveCaseName,
  useActiveProjectId,
  useAppStateStore,
} from '../../ui/app-state';
import { useCasesCount, useStudyCasesStore } from '../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import { ANALYSIS_TYPE_LABELS, type ExecutionRun } from '../../ui/study-cases/types';
import { calculationScopeDisplayName } from '../../ui/shell/publicNames';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useAnalysisRunContract } from '../../ui/workspace/analysisRunContract';
import { usePodsumowanieGotowosci } from '../spaces/gotowosc/adapters/gotowoscAdapter';
import { formatCzas } from '../spaces/obliczenia/przebiegi/strings';
import { znacznikSwiezosci, type ZnacznikSwiezosci } from './znacznikSwiezosci';

export type BackendStatus = 'connected' | 'connecting' | 'error';

export interface ShellCaseInfo {
  projectPresent: boolean;
  /** Nazwa aktywnego projektu (chip paska przypadku — kontrakt E1.7c). */
  projectName: string | null;
  caseName: string | null;
  caseCount: number;
  /**
   * Znacznik świeżości wyników aktywnego przypadku (karta K4/D1). Źródła:
   * `useStudyCasesStore.activeCase` (result_status + results_valid) ORAZ para
   * rewizji — wyniku (kontrakt ostatniego zakończonego biegu przypadku) i modelu
   * (migawka). Sam status serwerowy nie rozstrzyga świeżości (V12K-309 poz. 2).
   */
  znacznikWynikow: ZnacznikSwiezosci;
  modelValidated: boolean;
  /**
   * Gotowość została policzona (`podsumujGotowosc().ustalona`). `false` = odczyt
   * gotowości padł — chip nie ma prawa mówić „brak uwag" (V12K-309 poz. 1).
   */
  readinessGotowoscUstalona: boolean;
  readinessWarnings: number;
  readinessBlockers: number;
}

export interface ShellStatusInfo {
  backend: BackendStatus;
  modelRevision: number | null;
  lastRunLabel: string | null;
  /** Odcisk SHA-256 migawki modelu — „Wersja modelu" w pasku stanu (R4). */
  wersjaModelu: string | null;
}

/** Skróty ślad/odcisk do prezentacji (strefa techniczna). */
export function shortFingerprint(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Read-only informacje o aktywnym przypadku i gotowości (z istniejących store'ów). */
export function useShellCaseInfo(): ShellCaseInfo {
  const projectId = useActiveProjectId();
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const caseId = useAppStateStore((state) => state.activeCaseId);
  const rawCaseName = useActiveCaseName();
  // Publiczna nazwa zakresu obliczeń (sanitizer nazw z dawnej ramy — E1.7c).
  const caseName = rawCaseName ? calculationScopeDisplayName(rawCaseName, caseId) : null;
  const caseCount = useCasesCount();
  const activeCase = useStudyCasesStore((state) => state.activeCase);
  const gotowosc = usePodsumowanieGotowosci();
  const rewizje = useRewizjeSwiezosci(activeCase?.id ?? caseId);

  const projectPresent = projectId != null;

  return {
    projectPresent,
    projectName: projectName ?? null,
    caseName,
    caseCount,
    znacznikWynikow: znacznikSwiezosci(activeCase, rewizje),
    modelValidated: projectPresent && gotowosc.ready,
    readinessGotowoscUstalona: gotowosc.ustalona,
    readinessWarnings: gotowosc.ostrzezenia,
    readinessBlockers: gotowosc.blokady,
  };
}

// ---------------------------------------------------------------------------
// Para rewizji dla znacznika świeżości (V12K-309 poz. 2)
// ---------------------------------------------------------------------------

/**
 * Ostatni ZAKOŃCZONY przebieg NALEŻĄCY DO PODANEGO PRZYPADKU. Filtr po
 * `study_case_id` jest konieczny: rejestr przebiegów bywa zasilony historią
 * innego zakresu (`setActiveStudyCaseId` przełącza go asynchronicznie), a
 * rewizja cudzego biegu nie opisuje świeżości TEGO wyniku.
 */
export function ostatniZakonczonyPrzebiegPrzypadku(
  runs: ExecutionRun[],
  caseId: string | null,
): ExecutionRun | null {
  if (!caseId) return null;
  return ostatniZakonczonyPrzebieg(runs.filter((run) => run.study_case_id === caseId));
}

/**
 * Para rewizji „wynik ↔ model" dla chipu świeżości.
 *
 * WYJĄTEK od reguły „powłoka nie woła API" — ten sam, który
 * `events/adapters/caseAdapter` zrobił dla `loadActiveCase` (R2) i z tego samego
 * powodu: liczba, która rozstrzyga świeżość, istnieje WYŁĄCZNIE w kontrakcie
 * przebiegu na serwerze. Odczyt idzie przez ISTNIEJĄCY, współdzielony hook
 * `useAnalysisRunContract` (ten sam, z którego korzysta znacznik świeżości
 * nagłówków analiz — `ui2/freshness/useSwiezoscNaglowka`), z jego pamięcią
 * podręczną per przebieg; powłoka nie ma własnego `fetch` ani własnej kopii.
 * Alternatywą byłoby zgadywanie rewizji wyniku — a zgadywanie jest zakazane.
 *
 * S9-11 / W-5 (spłata długu S9-3-DLUG-W5): rewizja bieżącego modelu pochodzi z
 * JEDNEGO źródła — `useSnapshotStore.rewizjaBiezacegoModelu` — które przeżywa
 * wgranie PODGLĄDU PRZEBIEGU (`setAnalysisRunSnapshot` go nie dotyka) i jest
 * zasilane każdą odpowiedzią opisującą bieżący model (operacje domenowe,
 * refresh, odczyt gotowości przy zimnym wejściu na link przebiegu). To samo
 * pole czyta znacznik nagłówka ekranów wyników (`useSwiezoscNaglowka`) — dwa
 * wskaźniki nie mogą już mówić sprzecznie (predykaty parami; przypięte testem
 * `freshness/__tests__/jednaPrawdaStanuWynikow.test.tsx`). `null` = rewizja
 * nieznana → chip uczciwie „nieustalone", nigdy „aktualne".
 */
function useRewizjeSwiezosci(caseId: string | null): {
  rewizjaWyniku: number | null;
  rewizjaModelu: number | null;
} {
  const runs = useExecutionRunsStore((state) => state.runs);
  const rewizjaModelu = useSnapshotStore((state) => state.rewizjaBiezacegoModelu);
  const przebieg = useMemo(
    () => ostatniZakonczonyPrzebiegPrzypadku(runs, caseId),
    [runs, caseId],
  );
  const { data } = useAnalysisRunContract(przebieg?.id ?? null);

  return {
    rewizjaWyniku: data?.analysisCaseContext?.rewizjaModelu ?? null,
    rewizjaModelu,
  };
}

// ---------------------------------------------------------------------------
// Etykieta ostatniego przebiegu (K6 / H-6 R3) — rejestr przebiegów, nie override
// ---------------------------------------------------------------------------

/**
 * Ostatni ZAKOŃCZONY przebieg z rejestru (`useExecutionRunsStore.runs`).
 * Porządek deterministyczny: najpóźniejszy znacznik zakończenia (fallback:
 * rozpoczęcia), remis rozstrzyga identyfikator — ten sam zestaw przebiegów
 * zawsze daje tę samą etykietę (Determinism Rule).
 */
export function ostatniZakonczonyPrzebieg(runs: ExecutionRun[]): ExecutionRun | null {
  const zakonczone = runs.filter((run) => run.status === 'DONE');
  if (zakonczone.length === 0) return null;
  return zakonczone.reduce((najlepszy, kandydat) => {
    const a = kandydat.finished_at ?? kandydat.started_at ?? '';
    const b = najlepszy.finished_at ?? najlepszy.started_at ?? '';
    if (a !== b) return a > b ? kandydat : najlepszy;
    return kandydat.id > najlepszy.id ? kandydat : najlepszy;
  });
}

/** Etykieta paska stanu: „{analiza PL} · {czas}" albo `null` (brak przebiegu). */
export function etykietaPrzebiegu(run: ExecutionRun | null): string | null {
  if (!run) return null;
  return `${ANALYSIS_TYPE_LABELS[run.analysis_type]} · ${formatCzas(run.finished_at ?? run.started_at)}`;
}

/** Hook powłoki: etykieta ostatniego zakończonego przebiegu (read-only). */
export function useEtykietaOstatniegoPrzebiegu(): string | null {
  const runs = useExecutionRunsStore((state) => state.runs);
  return etykietaPrzebiegu(ostatniZakonczonyPrzebieg(runs));
}

/**
 * Read-only informacje paska stanu. `backend`, `modelRevision` i `lastRunLabel`
 * podaje powłoka (AppRoot — rewizja migawki i rejestr przebiegów); „Wersja
 * modelu" pochodzi wprost z odcisku migawki (R4), z możliwością nadpisania
 * w scenach testowych/harnessie.
 */
export function useShellStatusInfo(override?: Partial<ShellStatusInfo>): ShellStatusInfo {
  const hashMigawki = useSnapshotStore((state) => state.snapshot?.header?.hash_sha256 ?? null);

  return {
    backend: override?.backend ?? 'connected',
    modelRevision: override?.modelRevision ?? null,
    lastRunLabel: override?.lastRunLabel ?? null,
    wersjaModelu: override?.wersjaModelu ?? hashMigawki,
  };
}
