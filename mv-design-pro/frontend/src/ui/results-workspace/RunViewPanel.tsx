/**
 * Run View Panel — PR-22
 *
 * Central panel for RUN mode: global metrics + per-element table.
 * Displays results from the selected run with navigation to SLD overlay.
 *
 * INVARIANTS:
 * - No physics calculations
 * - No model mutations
 * - Polish labels only
 * - Deterministic rendering (no Date.now, no Math.random)
 */

import { useCallback } from 'react';

import { useSelectedRunDetail } from './store';
import { useResultsInspectorStore } from '../results-inspector/store';
import { ResultsExport } from '../results-inspector/ResultsExport';
import { ROUTES, navigateTo } from '../navigation';
import { useSelectionStore } from '../selection';
import { resolveSelectedElementFromSnapshot } from '../selection/resolveElementSelection';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useAppStateStore } from '../app-state/store';
import type { RunStatusValue } from './types';
import { RUN_STATUS_LABELS, RUN_STATUS_STYLES, getAnalysisTypeLabel } from './types';
import { LoadFlowRunSection } from './LoadFlowRunSection';

/**
 * Global metric card display.
 */
interface MetricItem {
  label: string;
  value: string;
  unit: string;
}

export function RunViewPanel() {
  const selectedRun = useSelectedRunDetail();
  const resultsIndex = useResultsInspectorStore((s) => s.resultsIndex);
  const busResults = useResultsInspectorStore((s) => s.busResults);
  const branchResults = useResultsInspectorStore((s) => s.branchResults);
  const shortCircuitResults = useResultsInspectorStore((s) => s.shortCircuitResults);
  const runSnapshot = useResultsInspectorStore((s) => s.runSnapshot);
  const isLoadingBuses = useResultsInspectorStore((s) => s.isLoadingBuses);
  const isLoadingBranches = useResultsInspectorStore((s) => s.isLoadingBranches);
  const isLoadingShortCircuit = useResultsInspectorStore((s) => s.isLoadingShortCircuit);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const selectedElement = useSelectionStore((s) => s.selectedElement);
  const activeProjectName = useAppStateStore((s) => s.activeProjectName);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);

  const handleSelectResultElement = useCallback(
    (elementId: string, fallbackName: string) => {
      const resolvedElement = resolveSelectedElementFromSnapshot(
        runSnapshot ?? snapshot,
        elementId,
        fallbackName,
      );
      selectElement(resolvedElement);
      centerSldOnElement(elementId);
    },
    [centerSldOnElement, selectElement, runSnapshot, snapshot],
  );

  const canOpenTrace = selectedRun?.status === 'DONE';
  const exportTab =
    shortCircuitResults?.rows.length
      ? 'SHORT_CIRCUIT'
      : branchResults?.rows.length
      ? 'BRANCHES'
      : 'BUSES';
  const hasResultRows =
    Boolean(busResults?.rows.length) ||
    Boolean(branchResults?.rows.length) ||
    Boolean(shortCircuitResults?.rows.length);
  const isAnyResultsLoading =
    isLoadingBuses || isLoadingBranches || isLoadingShortCircuit;

  if (!selectedRun) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-slate-400 text-sm"
        data-testid="run-view-empty"
      >
        Wybierz obliczenie z panelu bocznego
      </div>
    );
  }

  const statusStyles = RUN_STATUS_STYLES[selectedRun.status as RunStatusValue] ?? RUN_STATUS_STYLES.PENDING;

  return (
    <div className="flex-1 overflow-y-auto p-4" data-testid="run-view-panel">
      {/* Run info header */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-lg font-semibold text-slate-800">
            {getAnalysisTypeLabel(selectedRun.analysis_type)}
          </h2>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusStyles.bg} ${statusStyles.text} ${statusStyles.border}`}
          >
            {RUN_STATUS_LABELS[selectedRun.status as RunStatusValue] ?? selectedRun.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>
            <span className="font-medium">Utworzono:</span>{' '}
            {selectedRun.created_at.slice(0, 19).replace('T', ' ')}
          </div>
          {selectedRun.finished_at && (
            <div>
              <span className="font-medium">Zakończono:</span>{' '}
              {selectedRun.finished_at.slice(0, 19).replace('T', ' ')}
            </div>
          )}
          <div className="font-mono">
            <span className="font-medium font-sans">Hash:</span>{' '}
            {selectedRun.solver_input_hash.slice(0, 16)}
          </div>
        </div>

        {selectedRun.error_message && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">
            {selectedRun.error_message}
          </div>
        )}
      </div>

      <section
        className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4"
        data-testid="run-action-bar"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Przejścia dla bieżącego uruchomienia</h3>
            <p className="mt-1 text-xs text-slate-500">
              Ten sam kontekst runu i zaznaczenia prowadzi do modelu, śladu obliczeń i raportu.
            </p>
            {selectedElement && (
              <p className="mt-2 text-xs text-slate-600" data-testid="run-selected-element-summary">
                Zaznaczony element: <span className="font-semibold">{selectedElement.name}</span> ({selectedElement.type})
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateTo(ROUTES.SLD)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              data-testid="run-open-model"
            >
              Powrót do modelu
            </button>
            <button
              type="button"
              onClick={() => navigateTo(ROUTES.PROOF)}
              disabled={!canOpenTrace}
              className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              data-testid="run-open-proof"
            >
              White Box
            </button>
            {resultsIndex?.run_header && (
              <ResultsExport
                exportData={{
                  activeTab: exportTab,
                  busRows: busResults?.rows ?? [],
                  branchRows: branchResults?.rows ?? [],
                  shortCircuitRows: shortCircuitResults?.rows ?? [],
                  runHeader: resultsIndex.run_header,
                  projectName: activeProjectName ?? undefined,
                  caseName: activeCaseName ?? undefined,
                }}
              />
            )}
          </div>
        </div>
      </section>

      {/* Load Flow specific section */}
      {selectedRun.analysis_type === 'LOAD_FLOW' && (
        <LoadFlowRunSection runId={selectedRun.run_id} />
      )}

      {/* SC/Generic section — shown only for non-LOAD_FLOW analysis types */}
      {selectedRun.analysis_type !== 'LOAD_FLOW' && (
        <>
          {/* Global Metrics (from short-circuit results if available) */}
          {shortCircuitResults && shortCircuitResults.rows.length > 0 && (
            <section className="mb-6" data-testid="run-global-metrics">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Metryki globalne
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {shortCircuitResults.rows.slice(0, 1).map((row) => {
                  const metrics: MetricItem[] = [];
                  if (row.ikss_ka != null) {
                    metrics.push({ label: "Ik''", value: row.ikss_ka.toFixed(3), unit: 'kA' });
                  }
                  if (row.ip_ka != null) {
                    metrics.push({ label: 'ip', value: row.ip_ka.toFixed(3), unit: 'kA' });
                  }
                  if (row.ith_ka != null) {
                    metrics.push({ label: 'Ith', value: row.ith_ka.toFixed(3), unit: 'kA' });
                  }
                  if (row.sk_mva != null) {
                    metrics.push({ label: "Sk''", value: row.sk_mva.toFixed(1), unit: 'MVA' });
                  }
                  return metrics.map((m) => (
                    <MetricCard key={m.label} label={m.label} value={m.value} unit={m.unit} />
                  ));
                })}
              </div>
            </section>
          )}

          {/* Bus Results Table */}
          {isLoadingBuses ? (
            <LoadingIndicator text="Ładowanie wyników węzłowych..." />
          ) : (
            busResults &&
            busResults.rows.length > 0 && (
              <ResultsTable
                title="Szyny"
                testId="run-bus-table"
                columns={['Nazwa', 'Un [kV]', 'U [kV]', 'U [j.w.]']}
                onRowSelect={handleSelectResultElement}
                rows={busResults.rows.map((row) => ({
                  key: row.bus_id,
                  targetId: row.bus_id,
                  label: row.name,
                  cells: [
                    row.name,
                    row.un_kv.toFixed(1),
                    row.u_kv != null ? row.u_kv.toFixed(3) : '-',
                    row.u_pu != null ? row.u_pu.toFixed(4) : '-',
                  ],
                }))}
              />
            )
          )}

          {/* Branch Results Table */}
          {isLoadingBranches ? (
            <LoadingIndicator text="Ładowanie wyników gałęziowych..." />
          ) : (
            branchResults &&
            branchResults.rows.length > 0 && (
              <ResultsTable
                title="Gałęzie"
                testId="run-branch-table"
                columns={['Nazwa', 'I [A]', 'P [MW]', 'Q [Mvar]', 'Obciążenie [%]']}
                onRowSelect={handleSelectResultElement}
                rows={branchResults.rows.map((row) => ({
                  key: row.branch_id,
                  targetId: row.branch_id,
                  label: row.name,
                  cells: [
                    row.name,
                    row.i_a != null ? row.i_a.toFixed(1) : '-',
                    row.p_mw != null ? row.p_mw.toFixed(3) : '-',
                    row.q_mvar != null ? row.q_mvar.toFixed(3) : '-',
                    row.loading_pct != null ? row.loading_pct.toFixed(1) : '-',
                  ],
                }))}
              />
            )
          )}

          {/* Short Circuit Results Table */}
          {isLoadingShortCircuit ? (
            <LoadingIndicator text="Ładowanie wyników zwarciowych..." />
          ) : (
            shortCircuitResults &&
            shortCircuitResults.rows.length > 0 && (
              <ResultsTable
                title="Zwarcia"
                testId="run-sc-table"
                columns={['Element', "Ik'' [kA]", 'ip [kA]', 'Ith [kA]', "Sk'' [MVA]"]}
                onRowSelect={handleSelectResultElement}
                rows={shortCircuitResults.rows.map((row) => ({
                  key: row.target_id,
                  targetId: row.target_id,
                  label: row.target_name ?? row.target_id,
                  cells: [
                    row.target_name ?? row.target_id,
                    row.ikss_ka != null ? row.ikss_ka.toFixed(3) : '-',
                    row.ip_ka != null ? row.ip_ka.toFixed(3) : '-',
                    row.ith_ka != null ? row.ith_ka.toFixed(3) : '-',
                    row.sk_mva != null ? row.sk_mva.toFixed(1) : '-',
                  ],
                }))}
              />
            )
          )}

          {/* No results message */}
          {!isLoadingBuses &&
            !isLoadingBranches &&
            !isLoadingShortCircuit &&
            !isAnyResultsLoading &&
            !hasResultRows &&
            selectedRun.status === 'DONE' && (
              <div className="text-center text-slate-400 text-sm py-8">
                Brak danych wynikowych dla tego obliczenia
              </div>
            )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Internal Components
// =============================================================================

function MetricCard({
  label,
  value,
  unit,
}: MetricItem) {
  return (
    <div className="bg-white border border-slate-200 rounded p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-slate-800">
        {value}
        <span className="text-xs text-slate-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function ResultsTable({
  title,
  testId,
  columns,
  rows,
  onRowSelect,
}: {
  title: string;
  testId: string;
  columns: string[];
  rows: Array<{
    key: string;
    cells: string[];
    targetId?: string;
    label?: string;
  }>;
  onRowSelect?: (targetId: string, fallbackName: string) => void;
}) {
  return (
    <section className="mb-6" data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {onRowSelect && (
        <p className="mb-2 text-[11px] text-slate-500">
          Kliknij wiersz, aby wskazac element w modelu i nakladce SLD.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border border-slate-200">
          <thead>
            <tr className="bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col}
                  className="text-left px-3 py-2 font-medium text-slate-600 border-b border-slate-200"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={`border-b border-slate-100 ${
                  row.targetId && onRowSelect ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-slate-50'
                }`}
                onClick={() => {
                  if (row.targetId && onRowSelect) {
                    onRowSelect(row.targetId, row.label ?? row.targetId);
                  }
                }}
              >
                {row.cells.map((cell, cidx) => (
                  <td
                    key={cidx}
                    className="px-3 py-1.5 text-slate-700 font-mono"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LoadingIndicator({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
      <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      {text}
    </div>
  );
}
