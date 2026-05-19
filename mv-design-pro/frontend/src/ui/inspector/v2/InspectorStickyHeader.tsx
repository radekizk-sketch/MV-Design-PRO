/**
 * InspectorStickyHeader — sticky header inspectora (PR-7).
 *
 * Brief 2 §5 pkt 1: nazwa + typ + status kompletności + status zasilania +
 * status obliczeń + szybkie akcje.
 */

import type { CalculationStatus } from '../../shared/formatPolishValue';
import { POLISH_STATUS_LABEL } from '../../shared/formatPolishValue';

export type CompletenessStatus = 'complete' | 'partial' | 'missing' | 'n_a';
export type EnergizationStatus = 'energized' | 'dead' | 'unknown' | 'fault';

export interface StickyHeaderQuickAction {
  readonly id: string;
  readonly labelPl: string;
  readonly disabled?: boolean;
  readonly disabledReasonPl?: string;
  readonly onClick: () => void;
}

export interface StickyHeaderProps {
  readonly elementName: string;
  readonly elementTypeLabelPl: string;
  readonly completeness: CompletenessStatus;
  readonly energization?: EnergizationStatus;
  readonly calculationStatus?: CalculationStatus;
  readonly quickActions?: readonly StickyHeaderQuickAction[];
}

const COMPLETENESS_LABEL: Record<CompletenessStatus, string> = {
  complete: 'kompletne',
  partial: 'do sprawdzenia',
  missing: 'do konfiguracji',
  n_a: 'nie dotyczy',
};

const COMPLETENESS_COLOR: Record<CompletenessStatus, string> = {
  complete: 'text-status-ok',
  partial: 'text-status-warn',
  missing: 'text-status-error',
  n_a: 'text-scada-muted',
};

const ENERGIZATION_LABEL: Record<EnergizationStatus, string> = {
  energized: 'pod napięciem',
  dead: 'bez napięcia',
  unknown: 'stan nieznany',
  fault: 'awaria',
};

const ENERGIZATION_COLOR: Record<EnergizationStatus, string> = {
  energized: 'text-scada-energized',
  dead: 'text-scada-dead',
  unknown: 'text-scada-muted',
  fault: 'text-scada-alarm',
};

export function InspectorStickyHeader(props: StickyHeaderProps): JSX.Element {
  const {
    elementName, elementTypeLabelPl,
    completeness, energization, calculationStatus,
    quickActions = [],
  } = props;

  return (
    <div
      data-testid="inspector-sticky-header"
      className="sticky top-0 z-10 shrink-0 border-b border-scada-border bg-scada-surface px-3 py-2"
    >
      {/* Nazwa + typ */}
      <div className="flex items-baseline gap-2">
        <h2 className="truncate text-base font-semibold text-scada-text" title={elementName}>
          {elementName}
        </h2>
        <span className="text-xs text-scada-muted">{elementTypeLabelPl}</span>
      </div>

      {/* Statusy w jednej linijce */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span data-testid="status-completeness" className={COMPLETENESS_COLOR[completeness]}>
          ● {COMPLETENESS_LABEL[completeness]}
        </span>
        {energization && (
          <span data-testid="status-energization" className={ENERGIZATION_COLOR[energization]}>
            {ENERGIZATION_LABEL[energization]}
          </span>
        )}
        {calculationStatus && (
          <span data-testid="status-calculation" className="text-scada-muted">
            obliczenia: {POLISH_STATUS_LABEL[calculationStatus]}
          </span>
        )}
      </div>

      {/* Szybkie akcje */}
      {quickActions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quickActions.map((a) => (
            <button
              key={a.id}
              data-testid={`quick-action-${a.id}`}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              title={a.disabled ? a.disabledReasonPl : undefined}
              className={
                'rounded border border-scada-border px-2 py-1 text-xs '
                + (a.disabled
                  ? 'cursor-not-allowed bg-scada-panel text-scada-muted'
                  : 'bg-scada-panel-raised text-scada-text hover:bg-scada-active')
              }
            >
              {a.labelPl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
