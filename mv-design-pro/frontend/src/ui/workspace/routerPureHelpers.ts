/**
 * routerPureHelpers — pozostałe pure helpery WorkspaceSurfaceRouter
 * (Phase 0 #11 cd. - szósta fala decompose).
 *
 * Generator krzywych IEC 60255 SI, audit proof status, resolveLatestCompletedRun.
 */

import type { ExecutionRun } from '../study-cases/types';
import { ANALYSIS_TYPE_LABELS } from '../study-cases/types';
import { calculationScopeDisplayName } from '../shell/publicNames';
import { formatDateTime } from './routerDisplayHelpers';

export function displayScopeLabel(
  value: string | null | undefined,
  id: string | null | undefined = null,
): string {
  return calculationScopeDisplayName(value, id);
}

export function resolveRunLabel(
  runId: string | null | undefined,
  runs: ExecutionRun[],
): string {
  if (!runId) return 'Nie wybrano obliczenia';
  const run = runs.find((item) => item.id === runId);
  if (!run) return 'Aktywne obliczenie';
  const typeLabel = ANALYSIS_TYPE_LABELS[run.analysis_type] ?? run.analysis_type;
  const dateLabel = formatDateTime(run.finished_at ?? run.started_at);
  return `${typeLabel} · ${dateLabel}`;
}

// `auditProofPackStatus` (werdykt pakietu z flagi `all_pass`) usunięty w karcie
// WERDYKT-MIGRACJA-190 — pakiet pokazuje etykiety rekordów W dowodów (`PakietDowodowRozszerzen`).

export function resolveLatestCompletedRun(runs: ExecutionRun[]): ExecutionRun | null {
  return runs
    .filter((run) => run.status === 'DONE')
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.finished_at ?? left.started_at ?? 0).getTime();
      const rightTime = new Date(right.finished_at ?? right.started_at ?? 0).getTime();
      return rightTime - leftTime;
    })[0] ?? null;
}

// generateIec60255SiCurvePoints + CurvePoint USUNIĘTE w karcie F-E5b:
// fizyka krzywej IEC 60255 (t = TMS·0,14/(M^0,02−1)) nie należy do warstwy
// prezentacji. Krzywe TCC dostarcza backend przez `protection-coordination/api.ts`.
