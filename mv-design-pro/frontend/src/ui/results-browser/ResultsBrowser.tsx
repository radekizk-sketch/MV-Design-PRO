/**
 * FIX-03 — Results Browser Main Component
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Deterministic tables, result views
 * - 100% Polish UI
 *
 * FEATURES:
 * - View mode selector (tabs)
 * - Tabular results display
 * - Filtering and sorting
 * - Export (CSV/Excel/PDF)
 * - Run comparison
 * - Convergence/White-Box trace
 */

import { useEffect, useState, useCallback } from 'react';
import {
  useResultsBrowserStore,
  useIsAnyLoading,
  useFilteredBusVoltages,
  useFilteredBranchFlows,
  useFilteredLosses,
  useFilteredViolations,
  useViolationSummary,
  useCanCompare,
} from './store';
import type { ResultsViewMode, SortConfig, FilterState, ColumnDef } from './types';
import {
  RESULTS_BROWSER_LABELS,
  VIEW_MODE_LABELS,
  BUS_VOLTAGES_COLUMNS,
  BRANCH_FLOWS_COLUMNS,
  LOSSES_COLUMNS,
  VIOLATIONS_COLUMNS,
  CONVERGENCE_COLUMNS,
} from './types';
import { ResultsTable, RowCountFooter } from './ResultsTable';
import { ResultsFilters, ViolationQuickFilters } from './ResultsFilters';
import { ResultsExport } from './ResultsExport';
import { ResultsComparison } from './ResultsComparison';

// =============================================================================
// Types
// =============================================================================

interface ResultsBrowserProps {
  /** Project ID */
  projectId: string;
  /** Case ID */
  caseId: string;
  /** Run ID (optional - uses latest if not provided) */
  runId?: string;
  /** Project name (for export headers) */
  projectName?: string;
  /** Case name (for export headers) */
  caseName?: string;
  /** Close handler (optional) */
  onClose?: () => void;
}

// =============================================================================
// View Mode Selector
// =============================================================================

interface ViewModeSelectorProps {
  modes: ResultsViewMode[];
  current: ResultsViewMode;
  onChange: (mode: ResultsViewMode) => void;
}

function ViewModeSelector({ modes, current, onChange }: ViewModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            current === mode
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-current={current === mode ? 'true' : undefined}
        >
          {VIEW_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Loading Spinner
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">{RESULTS_BROWSER_LABELS.messages.loading}</span>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-500">
      <svg className="mb-4 h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p>{message}</p>
    </div>
  );
}

// =============================================================================
// Error State
// =============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1">
          <p className="font-medium text-rose-700">Błąd</p>
          <p className="mt-1 text-sm text-rose-600">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-sm font-medium text-rose-700 hover:text-rose-800"
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Violations Summary Card
// =============================================================================

function ViolationsSummaryCard() {
  const { high, warn, info, total } = useViolationSummary();

  if (total === 0) {
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">{RESULTS_BROWSER_LABELS.messages.no_violations}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Podsumowanie naruszeń</h3>
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-slate-900">{total}</div>
          <div className="text-xs text-slate-500">Razem</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-rose-600">{high}</div>
          <div className="text-xs text-slate-500">Istotne</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-amber-600">{warn}</div>
          <div className="text-xs text-slate-500">Ostrzeżenia</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-500">{info}</div>
          <div className="text-xs text-slate-500">Informacje</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// White-Box Trace Viewer (Simplified)
// =============================================================================

function WhiteBoxTraceViewer() {
  const { convergence, isLoadingConvergence } = useResultsBrowserStore();

  if (isLoadingConvergence) return <LoadingSpinner />;

  if (convergence.length === 0) {
    return <EmptyState message="Brak danych śladu obliczeń." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Podsumowanie zbieżności</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Liczba iteracji:</span>{' '}
            <span className="font-semibold">{convergence.length}</span>
          </div>
          <div>
            <span className="text-slate-500">Końcowa norma Δ:</span>{' '}
            <span className="font-mono font-semibold">
              {convergence[convergence.length - 1]?.norm_mismatch.toExponential(4) ?? '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Status:</span>{' '}
            {convergence[convergence.length - 1]?.converged ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                ZBIEŻNY
              </span>
            ) : (
              <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                NIEZBIEŻNY
              </span>
            )}
          </div>
        </div>
      </div>

      <ResultsTable
        data={convergence as unknown as Record<string, unknown>[]}
        columns={CONVERGENCE_COLUMNS as unknown as ColumnDef<Record<string, unknown>>[]}
        sortConfig={null}
        onSort={() => {}}
        getRowKey={(row) => String((row as { iteration: number }).iteration)}
        testId="convergence-table"
      />
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ResultsBrowser({
  projectId,
  caseId,
  runId,
  projectName,
  caseName,
  onClose,
}: ResultsBrowserProps) {
  // Store state
  const {
    viewMode,
    setViewMode,
    setContext,
    filters,
    setFilters,
    sortConfig,
    setSortConfig,
    selectedRunIds,
    toggleRunSelection,
    availableRuns,
    loadAvailableRuns,
    loadCurrentViewData,
    error,
    runId: currentRunId,
  } = useResultsBrowserStore();

  const isLoading = useIsAnyLoading();
  const canCompare = useCanCompare();

  // Filtered data
  const filteredBusVoltages = useFilteredBusVoltages();
  const filteredBranchFlows = useFilteredBranchFlows();
  const filteredLosses = useFilteredLosses();
  const filteredViolations = useFilteredViolations();
  const violationSummary = useViolationSummary();

  // Local state
  const [showComparison, setShowComparison] = useState(false);

  // Initialize context
  useEffect(() => {
    if (projectId && caseId && runId) {
      setContext(projectId, caseId, runId);
      loadAvailableRuns();
    }
  }, [projectId, caseId, runId, setContext, loadAvailableRuns]);

  // Available view modes
  const viewModes: ResultsViewMode[] = [
    'bus_voltages',
    'branch_flows',
    'losses',
    'violations',
    'convergence',
    'white_box',
  ];

  // Handle filter change
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, [setFilters]);

  // Handle sort change
  const handleSortChange = useCallback((config: SortConfig) => {
    setSortConfig(config);
  }, [setSortConfig]);

  // Handle retry
  const handleRetry = useCallback(() => {
    loadCurrentViewData();
  }, [loadCurrentViewData]);

  // Get current data and columns based on view mode
  const getCurrentViewContent = () => {
    switch (viewMode) {
      case 'bus_voltages':
        return {
          data: filteredBusVoltages,
          columns: BUS_VOLTAGES_COLUMNS,
          total: useResultsBrowserStore.getState().busVoltages.length,
          getRowKey: (row: { bus_id: string }) => row.bus_id,
        };

      case 'branch_flows':
        return {
          data: filteredBranchFlows,
          columns: BRANCH_FLOWS_COLUMNS,
          total: useResultsBrowserStore.getState().branchFlows.length,
          getRowKey: (row: { branch_id: string }) => row.branch_id,
        };

      case 'losses':
        return {
          data: filteredLosses,
          columns: LOSSES_COLUMNS,
          total: useResultsBrowserStore.getState().losses.length,
          getRowKey: (row: { branch_id: string }) => row.branch_id,
        };

      case 'violations':
        return {
          data: filteredViolations,
          columns: VIOLATIONS_COLUMNS,
          total: useResultsBrowserStore.getState().violations.length,
          getRowKey: (row: { element_id: string }) => row.element_id,
        };

      case 'convergence':
      case 'white_box':
      default:
        return null; // Special handling
    }
  };

  const viewContent = getCurrentViewContent();

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {RESULTS_BROWSER_LABELS.subtitle}
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                {RESULTS_BROWSER_LABELS.title}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Compare button */}
              <button
                type="button"
                onClick={() => setShowComparison(true)}
                disabled={!canCompare && selectedRunIds.length < 2}
                className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {RESULTS_BROWSER_LABELS.actions.compare}
                {selectedRunIds.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {selectedRunIds.length}
                  </span>
                )}
              </button>

              {/* Export button */}
              {viewContent && currentRunId && (
                <ResultsExport
                  data={viewContent.data as unknown as Record<string, unknown>[]}
                  columns={viewContent.columns as unknown as ColumnDef<Record<string, unknown>>[]}
                  viewMode={viewMode}
                  runId={currentRunId}
                  projectName={projectName}
                  caseName={caseName}
                />
              )}

              {/* Read-only badge */}
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Tylko do odczytu
              </div>

              {/* Close button */}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {RESULTS_BROWSER_LABELS.actions.close}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* View mode selector */}
        <div className="mb-6">
          <ViewModeSelector
            modes={viewModes}
            current={viewMode}
            onChange={setViewMode}
          />
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={handleRetry} />
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-4">
            {/* Violations summary (only for violations view) */}
            {viewMode === 'violations' && <ViolationsSummaryCard />}

            {/* Filters */}
            {viewContent && (
              <div className="rounded border border-slate-200 bg-white p-4">
                <ResultsFilters
                  filters={filters}
                  onChange={handleFilterChange}
                  viewMode={viewMode}
                />

                {/* Quick filters for violations */}
                {viewMode === 'violations' && (
                  <div className="mt-3">
                    <ViolationQuickFilters
                      currentFilter={filters.statusFilter}
                      onChange={(severity) => handleFilterChange({ ...filters, statusFilter: severity })}
                      counts={violationSummary}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Table content */}
            <div className="rounded border border-slate-200 bg-white p-4">
              {viewMode === 'white_box' || viewMode === 'convergence' ? (
                <WhiteBoxTraceViewer />
              ) : viewContent ? (
                <>
                  {viewContent.data.length === 0 ? (
                    <EmptyState message={RESULTS_BROWSER_LABELS.messages.no_data} />
                  ) : (
                    <>
                      <ResultsTable
                        data={viewContent.data as unknown as Record<string, unknown>[]}
                        columns={viewContent.columns as unknown as ColumnDef<Record<string, unknown>>[]}
                        sortConfig={sortConfig}
                        onSort={handleSortChange}
                        getRowKey={viewContent.getRowKey as (row: Record<string, unknown>) => string}
                        showCheckboxes={false}
                        selectedRowIds={selectedRunIds}
                        onRowCheckboxChange={toggleRunSelection}
                        testId={`results-table-${viewMode}`}
                      />
                      <RowCountFooter
                        shown={viewContent.data.length}
                        total={viewContent.total}
                      />
                    </>
                  )}
                </>
              ) : (
                <EmptyState message={RESULTS_BROWSER_LABELS.messages.no_data} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Comparison modal */}
      {showComparison && (
        <ResultsComparison
          availableRuns={availableRuns}
          selectedRunIds={selectedRunIds}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
}
