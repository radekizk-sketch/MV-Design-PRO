/**
 * WorkflowStatusBadge (R55) — badge 7-stanowego statusu przepływu obliczeniowego.
 *
 * Używany w:
 *   - Aktywnym pasku przypadku (active-case-bar) — stan bieżącego przypadku
 *   - Panelu gotowości (E-04) — przycisk blokady
 *   - Tabeli przypadków (E-01) — kolumna statusu
 *
 * Stany:
 *   idle       → szary, brak aktywności
 *   blocked    → bursztynowy, brakujące dane
 *   ready      → niebieski, gotowe do obliczeń
 *   running    → pulsujący niebieski, obliczenia w toku
 *   calculated → zielony, wyniki aktualne
 *   stale      → pomarańczowy, wyniki nieaktualne
 *   error      → czerwony, błąd obliczeń
 */

import { clsx } from 'clsx';
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_STATUS_SHORT,
  WORKFLOW_STATUS_COLOR,
  type WorkflowCalculationStatus,
} from './formatPolishValue';

export interface WorkflowStatusBadgeProps {
  status: WorkflowCalculationStatus;
  /** Skrócona forma etykiety (do wąskich kontenerów). Domyślnie false (pełna). */
  short?: boolean;
  /** Klasy CSS nadpisujące. */
  className?: string;
  /** data-testid dla testów. */
  testId?: string;
}

/**
 * Badge inline statusu przepływu obliczeniowego.
 *
 * Nie zawiera logiki biznesowej — czysta prezentacja.
 */
export function WorkflowStatusBadge({
  status,
  short = false,
  className,
  testId,
}: WorkflowStatusBadgeProps) {
  const label = short ? WORKFLOW_STATUS_SHORT[status] : WORKFLOW_STATUS_LABEL[status];
  const colorClass = WORKFLOW_STATUS_COLOR[status];

  return (
    <span
      data-testid={testId ?? 'workflow-status-badge'}
      data-status={status}
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        colorClass,
        className,
      )}
    >
      {label}
    </span>
  );
}
