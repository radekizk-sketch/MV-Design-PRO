/**
 * Batch Execution Panel -- PR-21
 *
 * Main panel for batch job management within a Study Case.
 * Shows batch list, create button, status badges, and detail view.
 *
 * 100% Polish UI. No project codenames.
 * Gating: respects readiness/eligibility from backend.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { useBatchExecutionStore } from './store';
import type { BatchJob, BatchJobStatus } from './types';
import { BATCH_STATUS_LABELS, BATCH_STATUS_STYLES } from './types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: BatchJobStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = React.memo(({ status }) => {
  const style = BATCH_STATUS_STYLES[status];
  const label = BATCH_STATUS_LABELS[status];

  return (
    <span
      data-testid={`batch-status-${status}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
    >
      {label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

interface BatchRowProps {
  batch: BatchJob;
  isSelected: boolean;
  onSelect: (batchId: string) => void;
  onExecute: (batchId: string) => void;
}

const BatchRow: React.FC<BatchRowProps> = React.memo(
  ({ batch, isSelected, onSelect, onExecute }) => {
    const handleClick = useCallback(() => {
      onSelect(batch.batch_id);
    }, [batch.batch_id, onSelect]);

    const handleExecute = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onExecute(batch.batch_id);
      },
      [batch.batch_id, onExecute]
    );

    const formattedDate = useMemo(() => {
      const d = new Date(batch.created_at);
      return d.toLocaleString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }, [batch.created_at]);

    return (
      <div
        data-testid={`batch-row-${batch.batch_id}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-blue-50 border border-blue-200'
            : 'hover:bg-slate-50 border border-transparent'
        }`}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 truncate">
              {batch.batch_input_hash.slice(0, 12)}
            </span>
            <StatusBadge status={batch.status as BatchJobStatus} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>{batch.analysis_type}</span>
            <span>{'\u00B7'}</span>
            <span>
              {batch.scenario_ids.length}{' '}
              {batch.scenario_ids.length === 1 ? 'scenariusz' : 'scenariuszy'}
            </span>
            <span>{'\u00B7'}</span>
            <span>{formattedDate}</span>
          </div>
        </div>

        {batch.status === 'PENDING' && (
          <button
            data-testid={`batch-execute-${batch.batch_id}`}
            onClick={handleExecute}
            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors flex-shrink-0"
          >
            Wykonaj
          </button>
        )}
      </div>
    );
  }
);

BatchRow.displayName = 'BatchRow';

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

interface BatchDetailProps {
  batch: BatchJob;
}

const BatchDetail: React.FC<BatchDetailProps> = React.memo(({ batch }) => {
  return (
    <div
      data-testid="batch-detail"
      className="border-t border-slate-200 pt-3 mt-2"
    >
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
        Szczegoly zadania wsadowego
      </h4>

      <div className="space-y-2">
        {/* Global info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-500">Typ analizy:</span>
          <span className="font-medium">{batch.analysis_type}</span>
          <span className="text-slate-500">Status:</span>
          <StatusBadge status={batch.status as BatchJobStatus} />
          <span className="text-slate-500">Hash wejscia:</span>
          <span className="font-mono text-slate-600 truncate">
            {batch.batch_input_hash.slice(0, 24)}...
          </span>
          <span className="text-slate-500">Liczba scenariuszy:</span>
          <span className="font-medium">{batch.scenario_ids.length}</span>
          <span className="text-slate-500">Liczba przebiegow:</span>
          <span className="font-medium">{batch.run_ids.length}</span>
        </div>

        {/* Scenario list */}
        <div>
          <h5 className="text-[11px] font-semibold text-slate-500 uppercase mb-1">
            Scenariusze
          </h5>
          <div className="space-y-1">
            {batch.scenario_ids.map((sid, idx) => (
              <div
                key={sid}
                className="flex items-center gap-2 text-xs text-slate-600"
              >
                <span className="text-slate-400 w-5 text-right">{idx + 1}.</span>
                <span className="font-mono truncate">{sid.slice(0, 12)}...</span>
                {batch.run_ids[idx] && (
                  <span className="text-emerald-600 text-[10px]">
                    {'\u2713'} przebieg: {batch.run_ids[idx].slice(0, 8)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Errors */}
        {batch.errors.length > 0 && (
          <div>
            <h5 className="text-[11px] font-semibold text-rose-500 uppercase mb-1">
              Bledy
            </h5>
            <div className="space-y-1">
              {batch.errors.map((err, idx) => (
                <div
                  key={idx}
                  className="text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded"
                >
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

BatchDetail.displayName = 'BatchDetail';

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export interface BatchPanelProps {
  studyCaseId: string | null;
}

export const BatchPanel: React.FC<BatchPanelProps> = React.memo(
  ({ studyCaseId }) => {
    const {
      batches,
      selectedBatchId,
      selectedBatch,
      isLoading,
      isExecuting,
      error,
      loadBatches,
      selectBatch,
      executeBatch,
      clearError,
    } = useBatchExecutionStore();

    useEffect(() => {
      if (studyCaseId) {
        loadBatches(studyCaseId);
      }
    }, [studyCaseId, loadBatches]);

    const handleSelect = useCallback(
      (batchId: string) => {
        selectBatch(batchId === selectedBatchId ? null : batchId);
      },
      [selectBatch, selectedBatchId]
    );

    const handleExecute = useCallback(
      (batchId: string) => {
        executeBatch(batchId);
      },
      [executeBatch]
    );

    if (!studyCaseId) {
      return (
        <div
          data-testid="batch-panel-empty"
          className="p-4 text-sm text-slate-400 text-center"
        >
          Wybierz wariant pracy
        </div>
      );
    }

    return (
      <div data-testid="batch-panel" className="flex flex-col gap-2 p-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Uruchomienia zbiorcze
          </h3>
          {isLoading && (
            <span className="text-[10px] text-slate-400 animate-pulse">
              Ladowanie...
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            data-testid="batch-panel-error"
            className="flex items-center justify-between text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded"
          >
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-600 ml-2"
            >
              {'\u2715'}
            </button>
          </div>
        )}

        {/* Executing indicator */}
        {isExecuting && (
          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded animate-pulse">
            Wykonywanie zadania wsadowego...
          </div>
        )}

        {/* Batch list */}
        {batches.length === 0 && !isLoading ? (
          <div className="text-xs text-slate-400 text-center py-4">
            Brak zadan wsadowych
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {batches.map((batch) => (
              <BatchRow
                key={batch.batch_id}
                batch={batch}
                isSelected={batch.batch_id === selectedBatchId}
                onSelect={handleSelect}
                onExecute={handleExecute}
              />
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selectedBatch && <BatchDetail batch={selectedBatch} />}
      </div>
    );
  }
);

BatchPanel.displayName = 'BatchPanel';
