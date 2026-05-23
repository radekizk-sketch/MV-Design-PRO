/**
 * routerPureHelpers — pozostałe pure helpery WorkspaceSurfaceRouter
 * (Phase 0 #11 cd. - szósta fala decompose).
 *
 * Generator krzywych IEC 60255 SI, audit proof status, resolveLatestCompletedRun.
 */

import type { ExecutionRun } from '../study-cases/types';
import type { Audit2ProofPackResponse } from '../network-build/station-der';

export interface AuditProofPackStatus {
  readonly label: string;
  readonly className: string;
}

export function auditProofPackStatus(data: Audit2ProofPackResponse): AuditProofPackStatus {
  if (data.proof_count <= 0) {
    return {
      label: 'Brak dowodów do oceny',
      className: 'text-amber-700',
    };
  }
  return data.all_pass
    ? { label: 'Weryfikacja pozytywna', className: 'text-emerald-700' }
    : { label: 'Wymaga sprawdzenia', className: 'text-rose-700' };
}

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

export interface CurvePoint {
  current_a: number;
  current_multiple: number;
  time_s: number;
}

/**
 * IEC 60255-151 Standard Inverse: t = TMS × 0.14 / (M^0.02 - 1)
 *
 * Stałe per krzywa SI: k=0.14, α=0.02. Wartość czasu cap'owana na 60 s
 * dla bardzo niskich krotności.
 */
export function generateIec60255SiCurvePoints(
  pickupCurrentA: number,
  tms: number,
): CurvePoint[] {
  const ratios = [1.05, 1.5, 2, 3, 5, 10, 20, 50, 100];
  return ratios.map((m) => {
    const denom = Math.pow(m, 0.02) - 1;
    const time = denom > 0 ? (tms * 0.14) / denom : 60;
    return {
      current_a: pickupCurrentA * m,
      current_multiple: m,
      time_s: Math.min(time, 60),
    };
  });
}
