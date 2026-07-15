/*
 * Adapter odczytu (tylko odczyt) z istniejących store'ów do powłoki W-110.
 * Powłoka NIE woła API i NIE trzyma kopii danych domenowych — konsumuje
 * `ui/app-state`, `ui/study-cases`, `ui/engineering-readiness` (karta E1.1 §3).
 *
 * Pola bez jednoznacznego źródła w zastanych store'ach (etykieta przebiegu,
 * dedykowany odcisk SHA-256 wyników) są przekazywane opcjonalnie z zewnątrz —
 * ich docelowe wpięcie to magistrala zdarzeń / kontrakt świeżości (E15.1/E15.2).
 * Oznaczono jako TODO-KARTA (patrz raport).
 */

import {
  useActiveCaseName,
  useActiveProjectId,
  useAppStateStore,
} from '../../ui/app-state';
import { useCasesCount } from '../../ui/study-cases/store';
import { useReadinessLiveStore } from '../../ui/engineering-readiness/readinessLiveStore';

export type BackendStatus = 'connected' | 'connecting' | 'error';

export type ResultFreshness = 'NONE' | 'FRESH' | 'OUTDATED';

export interface ShellCaseInfo {
  projectPresent: boolean;
  caseName: string | null;
  caseCount: number;
  resultStatus: ResultFreshness;
  modelValidated: boolean;
  readinessWarnings: number;
  readinessBlockers: number;
}

export interface ShellStatusInfo {
  backend: BackendStatus;
  modelRevision: number | null;
  lastRunLabel: string | null;
  resultsFingerprint: string | null;
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
  const caseName = useActiveCaseName();
  const caseCount = useCasesCount();
  const resultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const ready = useReadinessLiveStore((state) => state.ready);
  const blockers = useReadinessLiveStore((state) => state.bySeverity.BLOCKER);
  const warnings = useReadinessLiveStore((state) => state.bySeverity.IMPORTANT);

  const projectPresent = projectId != null;

  return {
    projectPresent,
    caseName,
    caseCount,
    resultStatus,
    modelValidated: projectPresent && ready,
    readinessWarnings: warnings,
    readinessBlockers: blockers,
  };
}

/**
 * Read-only informacje paska stanu. `backend`, `lastRunLabel` i
 * `resultsFingerprint` mogą być podane z zewnątrz (override) do czasu wpięcia
 * kontraktu świeżości; `modelRevision` pochodzi z rewizji gotowości.
 */
export function useShellStatusInfo(override?: Partial<ShellStatusInfo>): ShellStatusInfo {
  const modelRevision = useReadinessLiveStore((state) => state.lastRevision);
  const fingerprint = useAppStateStore((state) => state.enmHashChain?.semantic ?? null);

  return {
    backend: override?.backend ?? 'connected',
    modelRevision: override?.modelRevision ?? modelRevision,
    lastRunLabel: override?.lastRunLabel ?? null,
    resultsFingerprint: override?.resultsFingerprint ?? fingerprint,
  };
}
