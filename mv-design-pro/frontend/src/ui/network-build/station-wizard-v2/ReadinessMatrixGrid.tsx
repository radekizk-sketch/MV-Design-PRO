/**
 * ReadinessMatrixGrid — wizualizacja 29-osiowej macierzy gotowości
 * (krok 17 Kreatora). Konsumuje `readinessMatrixContract.ts`.
 */
import { clsx } from 'clsx';

import {
  buildReadinessMatrix,
  summarizeReadiness,
  type ReadinessAxisState,
  type ReadinessStatus,
} from './readinessMatrixContract';

export interface ReadinessMatrixGridProps {
  /** Stany wszystkich 29 osi. */
  readonly states: readonly ReadinessAxisState[];
  /** Callback przy kliknięciu osi. */
  readonly onAxisClick?: (axisId: string) => void;
  /** Tryb gęstości. */
  readonly density?: 'compact' | 'comfortable';
}

const STATUS_STYLES: Record<ReadinessStatus, { bg: string; text: string; label: string }> = {
  ready:     { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300', label: 'Gotowe' },
  partial:   { bg: 'bg-amber-500/15 border-amber-500/40',     text: 'text-amber-300',   label: 'Częściowe' },
  blocked:   { bg: 'bg-red-500/15 border-red-500/40',          text: 'text-red-300',     label: 'Zablokowane' },
  no_module: { bg: 'bg-gray-500/15 border-gray-500/40',        text: 'text-gray-400',    label: 'Brak modułu' },
};

const STATUS_DOT: Record<ReadinessStatus, string> = {
  ready: '●',
  partial: '◐',
  blocked: '✕',
  no_module: '∅',
};

export function ReadinessMatrixGrid(props: ReadinessMatrixGridProps): JSX.Element {
  const { states, onAxisClick, density = 'compact' } = props;
  const matrix = buildReadinessMatrix();
  const summary = summarizeReadiness(states);
  const statesByAxis = new Map(states.map((s) => [s.axisId, s]));

  // Grupowanie per kategoria.
  const categoriesMap = new Map<string, typeof matrix[number][]>();
  for (const axis of matrix) {
    const arr = categoriesMap.get(axis.category) ?? [];
    arr.push(axis);
    categoriesMap.set(axis.category, arr);
  }

  return (
    <div
      data-testid="readiness-matrix-grid"
      data-density={density}
      className={clsx(
        'flex h-full flex-col overflow-auto',
        density === 'compact' ? 'p-3' : 'p-4',
      )}
    >
      {/* Header — overall summary */}
      <div
        data-testid="readiness-summary"
        className="mb-3 grid grid-cols-5 gap-2 rounded-lg border border-[#1a2a3a] bg-[#0a1420] p-3"
      >
        <SummaryCard
          label="Łącznie osi"
          value={summary.totalAxes}
          tone="neutral"
        />
        <SummaryCard
          label="Gotowe"
          value={summary.readyCount}
          tone="success"
        />
        <SummaryCard
          label="Częściowe"
          value={summary.partialCount}
          tone="warning"
        />
        <SummaryCard
          label="Zablokowane"
          value={summary.blockedCount}
          tone="error"
        />
        <SummaryCard
          label="Postęp"
          value={`${summary.overallReadinessPct.toFixed(0)}%`}
          tone={summary.overallReadinessPct >= 90 ? 'success' : summary.overallReadinessPct >= 50 ? 'warning' : 'error'}
        />
      </div>

      {/* Status flags */}
      <div className="mb-3 flex flex-wrap gap-2">
        <FlagChip
          label="Obliczenia"
          active={summary.canRunAllAnalyses}
          activeText="Można uruchomić wszystkie"
          inactiveText="Brakuje danych / modułu"
        />
        <FlagChip
          label="Raport OSD"
          active={summary.canGenerateOsdReport}
          activeText="Można wygenerować"
          inactiveText="Brakuje krytycznych wejść"
        />
      </div>

      {/* Grid per kategoria */}
      <div className="flex flex-col gap-3">
        {Array.from(categoriesMap.entries()).map(([category, axes]) => (
          <section
            key={category}
            data-testid={`readiness-category-${category}`}
            className="rounded-md border border-[#1a2a3a] bg-[#080e18]"
          >
            <header className="border-b border-[#1a2a3a] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a6a8a]">
              {category}
              <span className="ml-2 text-[#2a4a6a]">({axes.length} {axes.length === 1 ? 'oś' : 'osie'})</span>
            </header>
            <div className={clsx(
              'grid gap-1.5 p-2',
              density === 'compact' ? 'grid-cols-2' : 'grid-cols-3',
            )}>
              {axes.map((axis) => {
                const state = statesByAxis.get(axis.id);
                const status: ReadinessStatus = state?.status ?? 'blocked';
                const styles = STATUS_STYLES[status];
                return (
                  <button
                    key={axis.id}
                    type="button"
                    data-testid={`readiness-axis-${axis.id}`}
                    data-status={status}
                    data-source={axis.source}
                    aria-label={`${axis.labelPl}: ${styles.label}`}
                    onClick={() => onAxisClick?.(axis.id)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded border px-2 py-1.5 text-left transition-colors',
                      styles.bg,
                      'hover:brightness-125',
                    )}
                  >
                    <span className={clsx('text-sm', styles.text)} aria-hidden>
                      {STATUS_DOT[status]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-scada-text">
                      {axis.labelPl}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SummaryCard(props: {
  readonly label: string;
  readonly value: string | number;
  readonly tone: 'success' | 'warning' | 'error' | 'neutral';
}) {
  const toneClass = {
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    error: 'text-red-300',
    neutral: 'text-scada-text',
  }[props.tone];
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-[#4a6a8a]">{props.label}</span>
      <span className={clsx('text-lg font-bold', toneClass)}>{props.value}</span>
    </div>
  );
}

function FlagChip(props: {
  readonly label: string;
  readonly active: boolean;
  readonly activeText: string;
  readonly inactiveText: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-semibold',
        props.active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/30 bg-red-500/10 text-red-300',
      )}
    >
      <span aria-hidden>{props.active ? '✓' : '✕'}</span>
      <span className="text-[#8a9aaa]">{props.label}:</span>
      <span>{props.active ? props.activeText : props.inactiveText}</span>
    </span>
  );
}
