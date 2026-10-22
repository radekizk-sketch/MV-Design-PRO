/*
 * Adapter odczytu (tylko odczyt) z istniejących store'ów do powłoki W-110.
 * Powłoka NIE woła API i NIE trzyma kopii danych domenowych — konsumuje
 * `ui/app-state`, `ui/study-cases`, migawkę modelu (karta E1.1 §3).
 *
 * JEDNA PRAWDA WSKAŹNIKÓW CHROMU (karta K6 / H-6). Każdy wskaźnik ma dokładnie
 * jedno źródło, to samo, którego używa właściwa przestrzeń:
 * - „Gotowość: …" (pasek stanu — jedyne miejsce gotowości w chromie od karty
 *   K1 POWLOKA; dawny chip „Model: zwalidowany" skasowany jako powtórzenie) →
 *   `useSnapshotStore.readiness`
 *   przez `spaces/gotowosc/adapters/gotowoscAdapter.podsumujGotowosc`
 *   (R1: dawne źródło `readinessLiveStore` miało `ready: true` w stanie
 *   początkowym i NIGDY nie było odświeżane — pasek kłamał „zwalidowany"),
 * - „Wyniki: …" → `useStudyCasesStore.activeCase` (stan serwerowy przypadku,
 *   odświeżany po każdym zakończonym biegu — R2, `events/adapters/caseAdapter`).
 *   CV-2-W: `result_status` przypadku jest WYPROWADZANY po stronie backendu z
 *   jego biegów i koperty rewizji, więc niesie prawdę także wtedy, gdy model
 *   pojechał dalej po biegu — dług V12K-309 poz. 2 (chip trwał na „aktualne"
 *   przy modelu nowszym niż wynik) zamknięty U ŹRÓDŁA, a nie drugą derywacją
 *   w powłoce. Werdykt przychodzi razem z przyczyną po polsku i listą zmian,
 *   które unieważniły wynik,
 * - „Model: rew. n" → rewizja migawki podana przez powłokę (R5: martwy fallback
 *   `readinessLiveStore.lastRevision` usunięty — nikt go nie zasilał),
 * - „Wersja modelu" → `snapshot.header.hash_sha256` (R4: dawne źródło
 *   `appState.enmHashChain` nie miało żywego settera),
 * - biegi wyników na pasku stanu → magazyn kontekstu wyniku
 *   (`ui2/wyniki/kontekst`, karta K8): AKTYWNY bieg KAŻDEJ rodziny analizy, ten sam,
 *   który pokazują schemat, panel dolny, inspektor, „Dowody" i ekrany pełne. Dawna
 *   etykieta „ostatni zakończony przebieg" (R3) była czwartym, niezależnym źródłem
 *   „który bieg" i została skasowana (wada Z-14).
 */

import {
  useActiveCaseName,
  useActiveProjectId,
  useAppStateStore,
} from '../../ui/app-state';
import { useStudyCasesStore } from '../../ui/study-cases/store';
import { useExecutionRunsStore } from '../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { calculationScopeDisplayName } from '../../ui/shell/publicNames';
import { etykietaAnalizy, etykietaStatusu } from '../spaces/obliczenia/przebiegi/strings';
import { znacznikSwiezosci, type ZnacznikSwiezosci } from './znacznikSwiezosci';
import type { StanBiegu } from './StatusBar';

export type BackendStatus = 'connected' | 'connecting' | 'error';

export interface ShellCaseInfo {
  projectPresent: boolean;
  /** Nazwa aktywnego projektu (chip paska przypadku — kontrakt E1.7c). */
  projectName: string | null;
  caseName: string | null;
  /**
   * Znacznik świeżości wyników aktywnego przypadku (karta K4/D1). JEDNO źródło:
   * werdykt serwera na `useStudyCasesStore.activeCase` (status + przyczyna PL +
   * para rewizji + lista zmian), wyprowadzony z biegów przypadku (CV-2-W).
   */
  znacznikWynikow: ZnacznikSwiezosci;
}

export interface ShellStatusInfo {
  backend: BackendStatus;
  modelRevision: number | null;
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
  const activeCase = useStudyCasesStore((state) => state.activeCase);

  return {
    projectPresent: projectId != null,
    projectName: projectName ?? null,
    caseName,
    znacznikWynikow: znacznikSwiezosci(activeCase),
  };
}

/**
 * Stan trwającego biegu z rejestru przebiegów (§9 kontraktu UIUX: stan obliczeń
 * widoczny globalnie). JEDNO źródło dla przycisku „Oblicz" i paska stanu:
 * `isCreatingRun || isExecutingRun` (to samo co `useIsRunInProgress`), rodzaj
 * analizy zlecony w `createAndExecuteRun`, stan z odpytywania biegu.
 */
export function useStanBiegu(): StanBiegu {
  const trwa = useExecutionRunsStore((state) => state.isCreatingRun || state.isExecutingRun);
  const analiza = useExecutionRunsStore((state) => state.trwajacaAnaliza);
  const stan = useExecutionRunsStore((state) => state.runStatus);
  return {
    trwa,
    analiza: trwa && analiza ? etykietaAnalizy(analiza) : null,
    stan: trwa && stan ? etykietaStatusu(stan) : null,
  };
}

/**
 * Read-only informacje paska stanu. `backend` i `modelRevision` podaje powłoka
 * (AppRoot — rewizja migawki); „Wersja
 * modelu" pochodzi wprost z odcisku migawki (R4), z możliwością nadpisania
 * w scenach testowych/harnessie.
 */
export function useShellStatusInfo(override?: Partial<ShellStatusInfo>): ShellStatusInfo {
  const hashMigawki = useSnapshotStore((state) => state.snapshot?.header?.hash_sha256 ?? null);

  return {
    backend: override?.backend ?? 'connected',
    modelRevision: override?.modelRevision ?? null,
    wersjaModelu: override?.wersjaModelu ?? hashMigawki,
  };
}
