/**
 * Workspace Header — PR-22
 *
 * Contextual header showing study case, analysis type, status,
 * gating indicators, hashes, and active mode selector.
 *
 * INVARIANTS:
 * - No physics calculations
 * - No model mutations
 * - Polish labels only
 */

import { useResultsWorkspaceStore } from './store';
import { useAppStateStore } from '../app-state/store';
import { ROUTES } from '../navigation';
import type { WorkspaceMode } from './types';
import {
  WORKSPACE_MODE_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_STYLES,
  getAnalysisTypeLabel,
} from './types';
import type { RunStatusValue } from './types';

const MODES: WorkspaceMode[] = ['RUN', 'BATCH', 'COMPARE'];

export function WorkspaceHeader() {
  const mode = useResultsWorkspaceStore((s) => s.mode);
  const setMode = useResultsWorkspaceStore((s) => s.setMode);
  const projection = useResultsWorkspaceStore((s) => s.projection);
  const selectedRunId = useResultsWorkspaceStore((s) => s.selectedRunId);

  const caseName = useAppStateStore((s) => s.activeCaseName);
  const resultStatus = useAppStateStore((s) => s.activeCaseResultStatus);

  // Find selected run for hash display
  const selectedRun = projection?.runs.find((r) => r.run_id === selectedRunId);

  return (
    <header
      className="border-b border-slate-200 bg-white px-4 py-3"
      data-testid="workspace-header"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-slate-700">
          Wyniki i analiza
        </span>
        {projection && (
          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-blue-700">
            {projection.runs.length} obliczen / {projection.batches.length} wsadow / {projection.comparisons.length} porownan
          </span>
        )}
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
          Jeden przeplyw od wyboru runu do nakladki SLD
        </span>
      </div>

      {/* Top row: context info */}
      <div className="flex items-center gap-4 text-sm mb-2">
        <button
          type="button"
          onClick={() => {
            window.location.hash = ROUTES.SLD.hash;
          }}
          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Powrot do edytora
        </button>
        <span className="font-medium text-slate-700">
          {caseName ?? 'Brak aktywnego przypadku'}
        </span>

        {selectedRun && (
          <>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">
              {getAnalysisTypeLabel(selectedRun.analysis_type)}
            </span>
            <StatusBadge status={selectedRun.status as RunStatusValue} />
          </>
        )}

        {selectedRun && (
          <span
            className="text-xs text-slate-400 font-mono ml-auto"
            title="Hash danych wejściowych solvera"
          >
            {selectedRun.solver_input_hash.slice(0, 12)}...
          </span>
        )}

        {projection?.deterministic_hash && (
          <span
            className="text-xs text-slate-400 font-mono"
            title="Hash deterministyczny projekcji"
          >
            #{projection.deterministic_hash.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Bottom row: mode tabs */}
      <div className="flex gap-1" role="tablist" aria-label="Tryb przestrzeni roboczej">
        {MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              mode === m
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => setMode(m)}
            data-testid={`workspace-mode-${m.toLowerCase()}`}
          >
            {WORKSPACE_MODE_LABELS[m]}
          </button>
        ))}

        {/* Result status indicator */}
        <span className="ml-auto text-xs text-slate-500 self-center">
          {resultStatus === 'FRESH'
            ? 'Wyniki aktualne'
            : resultStatus === 'OUTDATED'
              ? 'Wyniki nieaktualne'
              : 'Brak wyników'}
        </span>
      </div>
    </header>
  );
}

// =============================================================================
// StatusBadge (internal)
// =============================================================================

function StatusBadge({ status }: { status: RunStatusValue }) {
  const styles = RUN_STATUS_STYLES[status] ?? RUN_STATUS_STYLES.PENDING;
  const label = RUN_STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles.bg} ${styles.text} ${styles.border}`}
    >
      {label}
    </span>
  );
}
