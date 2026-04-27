/**
 * RunListView — cross-case execution run list (Pakiet H).
 *
 * Scope: WSZYSTKIE runy (across cases), z filtrami case/data/status/ProofType.
 * RÓŻNICA od `study-cases/RunHistoryPanel`: tamten jest per-case, ten jest cross-case.
 *
 * White box: deterministic — sortowanie DESC po created_at, tie-break po run_id ASC.
 * Filtracja jest pure function, łatwo testowalna.
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import {
  PROOF_TYPE_LABELS_PL,
  RUN_STATUS_LABELS_PL,
  filterRuns,
  sortRunsDescByDate,
} from './runListTypes';
import type {
  ProofType,
  RunListEntry,
  RunListFilter,
  RunStatus,
} from './runListTypes';

export interface RunListViewProps {
  runs: ReadonlyArray<RunListEntry>;
  /** Opcjonalna lista case'ów do filtra — sortowana wg display order */
  availableCases?: ReadonlyArray<{ id: string; name: string }>;
  /** Klik wiersza → przekazanie run_id (np. nawigacja do TraceViewer) */
  onRunClick?: (runId: string) => void;
}

const STATUS_COLORS: Readonly<Record<RunStatus, string>> = Object.freeze({
  success: 'text-green-300',
  failed: 'text-red-300',
  running: 'text-yellow-300',
  cancelled: 'text-scada-muted',
});

export function RunListView({ runs, availableCases, onRunClick }: RunListViewProps) {
  const [filter, setFilter] = useState<RunListFilter>({});

  const filteredAndSorted = useMemo(() => {
    return sortRunsDescByDate(filterRuns(runs, filter));
  }, [runs, filter]);

  const updateFilter = useCallback(
    <K extends keyof RunListFilter>(key: K, value: RunListFilter[K]) => {
      setFilter((prev) => {
        const next = { ...prev };
        if (value === '' || value === undefined || value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
        return next;
      });
    },
    [],
  );

  const proofTypes: ProofType[] = Object.keys(PROOF_TYPE_LABELS_PL) as ProofType[];
  const statuses: RunStatus[] = ['success', 'failed', 'running', 'cancelled'];

  return (
    <div
      data-testid="run-list-view"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text border border-scada-border"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historia uruchomień (przekrojowo)</h3>
        <span className="text-xs text-scada-muted" data-testid="run-list-count">
          {filteredAndSorted.length} / {runs.length} runów
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs" data-testid="run-list-filters">
        {availableCases && availableCases.length > 0 && (
          <label className="flex items-center gap-1">
            Przypadek:
            <select
              value={filter.case_id ?? ''}
              onChange={(e) => updateFilter('case_id', e.target.value || undefined)}
              className="bg-scada-bg border border-scada-border px-1"
              data-testid="run-filter-case"
            >
              <option value="">Wszystkie</option>
              {availableCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-1">
          Typ proof:
          <select
            value={filter.proof_type ?? ''}
            onChange={(e) =>
              updateFilter('proof_type', (e.target.value || undefined) as ProofType | undefined)
            }
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="run-filter-proof-type"
          >
            <option value="">Wszystkie</option>
            {proofTypes.map((t) => (
              <option key={t} value={t}>
                {PROOF_TYPE_LABELS_PL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          Status:
          <select
            value={filter.status ?? ''}
            onChange={(e) =>
              updateFilter('status', (e.target.value || undefined) as RunStatus | undefined)
            }
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="run-filter-status"
          >
            <option value="">Wszystkie</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {RUN_STATUS_LABELS_PL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          Od:
          <input
            type="date"
            value={filter.from_date ?? ''}
            onChange={(e) => updateFilter('from_date', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="run-filter-from-date"
          />
        </label>

        <label className="flex items-center gap-1">
          Do:
          <input
            type="date"
            value={filter.to_date ?? ''}
            onChange={(e) => updateFilter('to_date', e.target.value || undefined)}
            className="bg-scada-bg border border-scada-border px-1"
            data-testid="run-filter-to-date"
          />
        </label>
      </div>

      {filteredAndSorted.length === 0 ? (
        <p className="text-xs text-scada-muted" data-testid="run-list-empty">
          Brak runów spełniających filtry.
        </p>
      ) : (
        <table className="w-full text-xs" data-testid="run-list-table">
          <thead>
            <tr className="text-scada-muted">
              <th className="text-left">Data</th>
              <th className="text-left">Przypadek</th>
              <th className="text-left">Typ proof</th>
              <th className="text-left">Status</th>
              <th className="text-left">Czas [s]</th>
              <th className="text-left">Hash</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((r) => (
              <tr
                key={r.run_id}
                data-testid={`run-row-${r.run_id}`}
                onClick={() => onRunClick?.(r.run_id)}
                className={clsx(
                  'border-t border-scada-border',
                  onRunClick && 'cursor-pointer hover:bg-scada-hover-nav',
                )}
              >
                <td>{r.created_at}</td>
                <td>{r.case_name}</td>
                <td>{PROOF_TYPE_LABELS_PL[r.proof_type]}</td>
                <td className={STATUS_COLORS[r.status]} data-testid={`run-status-${r.run_id}`}>
                  {RUN_STATUS_LABELS_PL[r.status]}
                </td>
                <td>{r.duration_s.toFixed(2)}</td>
                <td>
                  <code>{r.hash_prefix ?? '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
