/**
 * P11b — Results Inspector Page (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md: RESULT_VIEW mode, Polish labels
 * - ui_canonical_parity.md: Deterministic tables, result freshness
 * - sld_rules.md: Result overlay as separate layer
 * - AGENTS.md: NOT-A-SOLVER, no physics in UI
 *
 * FEATURES:
 * - Run selector (Projekt → Przypadek → Run)
 * - Result status bar (FRESH/OUTDATED/NONE)
 * - Tabs: Szyny, Gałęzie, Zwarcia (SC only), Ślad obliczeń
 * - Sortable, filterable tables
 * - SLD overlay toggle
 * - Inspector panel (read-only property grid) - Canonical parity
 *
 * 100% POLISH UI
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  useResultsInspectorStore,
  useFilteredBusResults,
  useFilteredBranchResults,
  useHasShortCircuitResults,
} from './store';
import type { ResultsInspectorTab, BusResultRow, BranchResultRow, ShortCircuitRow } from './types';
import {
  RESULTS_TAB_LABELS,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_SEVERITY,
  FLAG_LABELS,
  SOLVER_KIND_LABELS,
} from './types';
import { VerdictBadge } from '../protection-coordination/ResultsTables';
import { calculateShortCircuitVerdict, formatMargin } from './shortCircuitVerdict';
import { useSelectionStore } from '../selection';
import type { ElementType } from '../types';
import { InspectorPanel } from '../inspector';
import { ResultsExport } from './ResultsExport';
import { EmbeddedSldWorkspace } from './EmbeddedSldWorkspace';
import { resolveAvailableResultsTabs } from './viewState';
import { TraceViewerContainer } from '../proof';
import {
  formatProofPackRef,
  getAnalysisCaseLabel,
  getCompletenessDisplayLabel,
  getCompletenessTone,
  getReproducibilitySummary,
  mergeAnalysisCaseContexts,
} from './analysisCaseContextView';
import {
  ANALYSIS_COMPLETENESS_BADGE_CLASS,
  ANALYSIS_COMPLETENESS_LABELS,
  QUALITY_GATE_BADGE_CLASS,
  QUALITY_GATE_LABELS,
  type AnalysisCaseContext,
} from '../shared/analysisCaseContext';

// =============================================================================
// Helper Functions
// =============================================================================

function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatFlags(flags: string[]): string {
  if (flags.length === 0) return '';
  return flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(', ');
}

function getStatusBadgeClass(severity: 'info' | 'success' | 'warning'): string {
  switch (severity) {
    case 'success':
      return 'bg-emerald-100 text-emerald-700';
    case 'warning':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

interface ResultStatusBarProps {
  resultState: string;
  solverKind: string;
  runId: string;
  createdAt: string;
  analysisCaseContext?: AnalysisCaseContext | null;
}

function ResultStatusBar({
  resultState,
  solverKind,
  runId,
  createdAt,
  analysisCaseContext,
}: ResultStatusBarProps) {
  const statusLabel = RESULT_STATUS_LABELS[resultState] ?? resultState;
  const severity = RESULT_STATUS_SEVERITY[resultState] ?? 'info';
  const solverLabel = SOLVER_KIND_LABELS[solverKind] ?? solverKind;
  const caseLabel = getAnalysisCaseLabel(analysisCaseContext);
  const completenessLabel = getCompletenessDisplayLabel(analysisCaseContext);
  const completenessTone = getCompletenessTone(analysisCaseContext?.completeness ?? completenessLabel);
  const proofPackRef = formatProofPackRef(analysisCaseContext?.proof_pack_ref ?? null);
  const reproducibilitySummary = getReproducibilitySummary(analysisCaseContext);

  const formattedDate = useMemo(() => {
    try {
      return new Date(createdAt).toLocaleString('pl-PL');
    } catch {
      return createdAt;
    }
  }, [createdAt]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-slate-200 bg-white p-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className={`rounded px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(severity)}`}
          >
            {statusLabel}
          </span>
          <span className="text-sm text-slate-600">
            <span className="font-medium">Typ analizy:</span> {solverLabel}
          </span>
          {caseLabel && (
            <span className="text-sm text-slate-600" data-testid="results-status-case-context">
              <span className="font-medium">Przypadek:</span> {caseLabel}
            </span>
          )}
          {completenessLabel && (
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(completenessTone)}`}
              data-testid="results-status-completeness"
            >
              Kompletnosc: {completenessLabel}
            </span>
          )}
          <span className="text-sm text-slate-600">
            <span className="font-medium">Uruchomienie:</span> {runId.substring(0, 8)}...
          </span>
        </div>
        {(proofPackRef || reproducibilitySummary) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {proofPackRef && (
              <span data-testid="results-status-proof-pack">
                <span className="font-medium text-slate-600">Pakiet uzasadnienia:</span> {proofPackRef}
              </span>
            )}
            {reproducibilitySummary && (
              <span data-testid="results-status-reproducibility">
                <span className="font-medium text-slate-600">
                  {reproducibilitySummary.label}:
                </span>{' '}
                {reproducibilitySummary.value}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="text-sm text-slate-500">{formattedDate}</span>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">Ładowanie...</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-slate-500">
      <p>{message}</p>
    </div>
  );
}

function ContextBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-all text-sm text-slate-800">{value}</div>
    </div>
  );
}

function AnalysisCaseContextPanel({
  context,
}: {
  context: AnalysisCaseContext | null | undefined;
}) {
  if (!context) {
    return null;
  }

  const completenessLabel =
    ANALYSIS_COMPLETENESS_LABELS[context.completeness] ?? context.completeness;
  const completenessTone =
    ANALYSIS_COMPLETENESS_BADGE_CLASS[context.completeness] ??
    ANALYSIS_COMPLETENESS_BADGE_CLASS.partial;
  const qualityGateLabel = QUALITY_GATE_LABELS[context.quality_gate] ?? context.quality_gate;
  const qualityGateTone =
    QUALITY_GATE_BADGE_CLASS[context.quality_gate] ?? QUALITY_GATE_BADGE_CLASS.G2;
  const reproducibility = context.reproducibility ?? {};
  const applicability =
    context.applicability_scope.length > 0
      ? context.applicability_scope.join(', ')
      : 'Brak zakresu';

  return (
    <section className="mt-4 space-y-4 rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            analysis_case_context
          </div>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">
            Kontekst przypadku obliczeniowego
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <ContextBadge label={`Kompletnosc: ${completenessLabel}`} tone={completenessTone} />
          <ContextBadge label={qualityGateLabel} tone={qualityGateTone} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ContextField
          label="Rodzaj przypadku"
          value={context.rodzaj_przypadku ?? context.case_kind ?? 'Brak'}
        />
        <ContextField label="Case ref" value={context.case_ref} />
        <ContextField label="Run ref" value={context.run_ref} />
        <ContextField label="Migawka" value={context.snapshot_ref ?? 'Brak'} />
        <ContextField label="Proof pack" value={context.proof_pack_ref} />
        <ContextField label="Zakres" value={applicability} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ContextField label="Solver" value={reproducibility.solver_family ?? 'Brak'} />
        <ContextField
          label="Wersja solvera"
          value={reproducibility.solver_version ?? 'Brak'}
        />
        <ContextField label="Metoda" value={reproducibility.method_version ?? 'Brak'} />
        <ContextField
          label="Kontrakt wynikow"
          value={reproducibility.results_contract_version ?? 'Brak'}
        />
        <ContextField
          label="Kontrakt pola"
          value={reproducibility.bay_contract_version ?? 'Brak'}
        />
        <ContextField
          label="Snapshot katalogow"
          value={reproducibility.catalog_snapshot_ref ?? 'Brak'}
        />
        <ContextField
          label="Schemat katalogow"
          value={reproducibility.catalog_schema_version ?? 'Brak'}
        />
        <ContextField
          label="Polityka tolerancji"
          value={reproducibility.tolerance_policy_ref ?? 'Brak'}
        />
        <ContextField
          label="Polityka zaokraglen"
          value={reproducibility.rounding_policy_ref ?? 'Brak'}
        />
      </div>

      {context.missing_prerequisites.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-semibold">Brakujace warunki wejsciowe</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {context.missing_prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Bus Results Table (Szyny)
// =============================================================================

interface BusResultsTableProps {
  selectedRowId: string | null;
  onRowSelect: (row: BusResultRow) => void;
}

function BusResultsTable({ selectedRowId, onRowSelect }: BusResultsTableProps) {
  const { busResults, isLoadingBuses, loadBusResults, searchQuery, setSearchQuery } =
    useResultsInspectorStore();
  const filteredRows = useFilteredBusResults();

  useEffect(() => {
    if (!busResults) {
      loadBusResults();
    }
  }, [busResults, loadBusResults]);

  if (isLoadingBuses) return <LoadingSpinner />;
  if (!busResults || busResults.rows.length === 0) {
    return <EmptyState message="Brak wyników węzłowych dla tego obliczenia." />;
  }

  return (
    <div data-testid="results-table-buses">
      <div className="mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtruj po nazwie lub ID..."
          aria-label="Filtruj wyniki węzłowe"
          data-testid="results-search-input"
          className="w-full max-w-md rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-sm" data-testid="results-table">
          <thead className="bg-slate-50">
            <tr data-testid="results-table-header">
              <th data-testid="col-header-name" className="px-3 py-2 text-left font-semibold text-slate-700">Nazwa</th>
              <th data-testid="col-header-id" className="px-3 py-2 text-left font-semibold text-slate-700">ID węzła</th>
              <th data-testid="col-header-un_kv" className="px-3 py-2 text-right font-semibold text-slate-700">Un [kV]</th>
              <th data-testid="col-header-u_kv" className="px-3 py-2 text-right font-semibold text-slate-700">U [kV]</th>
              <th data-testid="col-header-u_pu" className="px-3 py-2 text-right font-semibold text-slate-700">U [pu]</th>
              <th data-testid="col-header-angle_deg" className="px-3 py-2 text-right font-semibold text-slate-700">Kąt [°]</th>
              <th data-testid="col-header-flags" className="px-3 py-2 text-left font-semibold text-slate-700">Flagi</th>
            </tr>
          </thead>
          <tbody data-testid="results-table-body">
            {filteredRows.map((row) => (
              <tr
                key={row.bus_id}
                data-testid={`results-row-${row.bus_id}`}
                onClick={() => onRowSelect(row)}
                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                  selectedRowId === row.bus_id
                    ? 'bg-blue-50 hover:bg-blue-100'
                    : 'hover:bg-slate-50'
                }`}
                aria-selected={selectedRowId === row.bus_id}
                role="row"
              >
                <td data-testid={`cell-name-${row.bus_id}`} className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                <td data-testid={`cell-id-${row.bus_id}`} className="px-3 py-2 text-slate-600">{row.bus_id.substring(0, 8)}...</td>
                <td data-testid={`cell-un_kv-${row.bus_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.un_kv, 1)}</td>
                <td data-testid={`cell-u_kv-${row.bus_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.u_kv)}</td>
                <td data-testid={`cell-u_pu-${row.bus_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.u_pu, 4)}</td>
                <td data-testid={`cell-angle_deg-${row.bus_id}`} className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.angle_deg, 2)}
                </td>
                <td data-testid={`cell-flags-${row.bus_id}`} className="px-3 py-2">
                  {row.flags.length > 0 && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      {formatFlags(row.flags)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500" data-testid="results-row-count">
        Wyświetlono {filteredRows.length} z {busResults.rows.length} wierszy
      </p>
    </div>
  );
}

// =============================================================================
// Branch Results Table (Gałęzie)
// =============================================================================

interface BranchResultsTableProps {
  selectedRowId: string | null;
  onRowSelect: (row: BranchResultRow) => void;
}

function BranchResultsTable({ selectedRowId, onRowSelect }: BranchResultsTableProps) {
  const { branchResults, isLoadingBranches, loadBranchResults, searchQuery, setSearchQuery } =
    useResultsInspectorStore();
  const filteredRows = useFilteredBranchResults();

  useEffect(() => {
    if (!branchResults) {
      loadBranchResults();
    }
  }, [branchResults, loadBranchResults]);

  if (isLoadingBranches) return <LoadingSpinner />;
  if (!branchResults || branchResults.rows.length === 0) {
    return <EmptyState message="Brak wyników gałęziowych dla tego obliczenia." />;
  }

  return (
    <div data-testid="results-table-branches">
      <div className="mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtruj po nazwie, ID lub węźle..."
          aria-label="Filtruj wyniki gałęziowe"
          data-testid="results-search-input"
          className="w-full max-w-md rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-sm" data-testid="results-table">
          <thead className="bg-slate-50">
            <tr data-testid="results-table-header">
              <th data-testid="col-header-name" className="px-3 py-2 text-left font-semibold text-slate-700">Nazwa</th>
              <th data-testid="col-header-from_bus" className="px-3 py-2 text-left font-semibold text-slate-700">Od węzła</th>
              <th data-testid="col-header-to_bus" className="px-3 py-2 text-left font-semibold text-slate-700">Do węzła</th>
              <th data-testid="col-header-i_a" className="px-3 py-2 text-right font-semibold text-slate-700">I [A]</th>
              <th data-testid="col-header-p_mw" className="px-3 py-2 text-right font-semibold text-slate-700">P [MW]</th>
              <th data-testid="col-header-q_mvar" className="px-3 py-2 text-right font-semibold text-slate-700">Q [Mvar]</th>
              <th data-testid="col-header-s_mva" className="px-3 py-2 text-right font-semibold text-slate-700">S [MVA]</th>
              <th data-testid="col-header-loading_pct" className="px-3 py-2 text-right font-semibold text-slate-700">Obciążenie [%]</th>
              <th data-testid="col-header-flags" className="px-3 py-2 text-left font-semibold text-slate-700">Flagi</th>
            </tr>
          </thead>
          <tbody data-testid="results-table-body">
            {filteredRows.map((row) => (
              <tr
                key={row.branch_id}
                data-testid={`results-row-${row.branch_id}`}
                onClick={() => onRowSelect(row)}
                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                  selectedRowId === row.branch_id
                    ? 'bg-blue-50 hover:bg-blue-100'
                    : 'hover:bg-slate-50'
                }`}
                aria-selected={selectedRowId === row.branch_id}
                role="row"
              >
                <td data-testid={`cell-name-${row.branch_id}`} className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                <td data-testid={`cell-from_bus-${row.branch_id}`} className="px-3 py-2 text-slate-600">{row.from_bus.substring(0, 8)}...</td>
                <td data-testid={`cell-to_bus-${row.branch_id}`} className="px-3 py-2 text-slate-600">{row.to_bus.substring(0, 8)}...</td>
                <td data-testid={`cell-i_a-${row.branch_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.i_a, 1)}</td>
                <td data-testid={`cell-p_mw-${row.branch_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.p_mw)}</td>
                <td data-testid={`cell-q_mvar-${row.branch_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.q_mvar)}</td>
                <td data-testid={`cell-s_mva-${row.branch_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.s_mva)}</td>
                <td data-testid={`cell-loading_pct-${row.branch_id}`} className="px-3 py-2 text-right">
                  <span
                    className={
                      row.loading_pct !== null && row.loading_pct > 100
                        ? 'font-semibold text-rose-600'
                        : row.loading_pct !== null && row.loading_pct > 80
                          ? 'text-amber-600'
                          : 'text-slate-600'
                    }
                  >
                    {formatNumber(row.loading_pct, 1)}
                  </span>
                </td>
                <td data-testid={`cell-flags-${row.branch_id}`} className="px-3 py-2">
                  {row.flags.length > 0 && (
                    <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                      {formatFlags(row.flags)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500" data-testid="results-row-count">
        Wyświetlono {filteredRows.length} z {branchResults.rows.length} wierszy
      </p>
    </div>
  );
}

// =============================================================================
// Short-Circuit Results Table (Zwarcia)
// =============================================================================

interface ShortCircuitResultsTableProps {
  selectedRowId: string | null;
  onRowSelect: (row: ShortCircuitRow) => void;
}

function ShortCircuitResultsTable({ selectedRowId, onRowSelect }: ShortCircuitResultsTableProps) {
  const { shortCircuitResults, isLoadingShortCircuit, loadShortCircuitResults } =
    useResultsInspectorStore();

  useEffect(() => {
    if (!shortCircuitResults) {
      loadShortCircuitResults();
    }
  }, [shortCircuitResults, loadShortCircuitResults]);

  if (isLoadingShortCircuit) return <LoadingSpinner />;
  if (!shortCircuitResults || shortCircuitResults.rows.length === 0) {
    return <EmptyState message="Brak wyników zwarciowych dla tego obliczenia." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200" data-testid="results-table-short-circuit">
      <table className="min-w-full text-sm" data-testid="results-table">
        <thead className="bg-slate-50">
          <tr data-testid="results-table-header">
            <th data-testid="col-header-target" className="px-3 py-2 text-left font-semibold text-slate-700">Węzeł zwarcia</th>
            <th data-testid="col-header-fault_type" className="px-3 py-2 text-left font-semibold text-slate-700">Rodzaj zwarcia</th>
            <th data-testid="col-header-ikss_ka" className="px-3 py-2 text-right font-semibold text-slate-700">Ik'' [kA]</th>
            <th data-testid="col-header-ip_ka" className="px-3 py-2 text-right font-semibold text-slate-700">ip [kA]</th>
            <th data-testid="col-header-ith_ka" className="px-3 py-2 text-right font-semibold text-slate-700">Ith [kA]</th>
            <th data-testid="col-header-sk_mva" className="px-3 py-2 text-right font-semibold text-slate-700">Sk'' [MVA]</th>
            <th data-testid="col-header-icu_ka" className="px-3 py-2 text-right font-semibold text-slate-700">Icu [kA]</th>
            <th data-testid="col-header-margin" className="px-3 py-2 text-right font-semibold text-slate-700">Margines</th>
            <th data-testid="col-header-verdict" className="px-3 py-2 text-center font-semibold text-slate-700">Werdykt</th>
          </tr>
        </thead>
        <tbody data-testid="results-table-body">
          {shortCircuitResults.rows.map((row) => {
            const icu_ka = (row as ShortCircuitRow & { icu_ka?: number | null }).icu_ka ?? null;
            const verdictResult = calculateShortCircuitVerdict(row.ikss_ka, icu_ka);

            return (
              <tr
                key={row.target_id}
                data-testid={`results-row-${row.target_id}`}
                onClick={() => onRowSelect(row)}
                className={`border-t border-slate-100 cursor-pointer transition-colors ${
                  selectedRowId === row.target_id
                    ? 'bg-blue-50 hover:bg-blue-100'
                    : 'hover:bg-slate-50'
                }`}
                aria-selected={selectedRowId === row.target_id}
                role="row"
              >
                <td data-testid={`cell-target-${row.target_id}`} className="px-3 py-2 font-medium text-slate-800">
                  {row.target_name ?? row.target_id.substring(0, 8)}
                </td>
                <td data-testid={`cell-fault_type-${row.target_id}`} className="px-3 py-2 text-slate-600">{row.fault_type ?? '—'}</td>
                <td data-testid={`cell-ikss_ka-${row.target_id}`} className="px-3 py-2 text-right font-semibold text-slate-800">
                  {formatNumber(row.ikss_ka)}
                </td>
                <td data-testid={`cell-ip_ka-${row.target_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.ip_ka)}</td>
                <td data-testid={`cell-ith_ka-${row.target_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.ith_ka)}</td>
                <td data-testid={`cell-sk_mva-${row.target_id}`} className="px-3 py-2 text-right text-slate-600">{formatNumber(row.sk_mva, 1)}</td>
                <td data-testid={`cell-icu_ka-${row.target_id}`} className="px-3 py-2 text-right text-slate-600">
                  {icu_ka !== null ? formatNumber(icu_ka) : <span className="text-slate-400 text-xs">Brak danych</span>}
                </td>
                <td data-testid={`cell-margin-${row.target_id}`} className="px-3 py-2 text-right font-mono text-sm">
                  <span className={
                    verdictResult.margin_pct === null
                      ? 'text-slate-400'
                      : verdictResult.margin_pct > 15
                        ? 'text-emerald-600'
                        : verdictResult.margin_pct >= 0
                          ? 'text-amber-600'
                          : 'text-rose-600 font-semibold'
                  }>
                    {formatMargin(verdictResult.margin_pct)}
                  </span>
                </td>
                <td data-testid={`cell-verdict-${row.target_id}`} className="px-3 py-2 text-center">
                  <VerdictBadge
                    verdict={verdictResult.verdict}
                    notesPl={verdictResult.notes}
                    recommendationPl={verdictResult.recommendation}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Selected Result Row Types (for InspectorPanel integration)
// =============================================================================

type SelectedResultRow =
  | { type: 'bus'; data: BusResultRow }
  | { type: 'branch'; data: BranchResultRow }
  | { type: 'short_circuit'; data: ShortCircuitRow }
  | null;

/**
 * Mapuje dane wiersza wyniku do formatu InspectorPanel.
 */
function mapResultRowToInspectorData(row: SelectedResultRow) {
  if (!row) return null;

  switch (row.type) {
    case 'bus':
      return {
        type: 'bus' as const,
        data: {
          bus_id: row.data.bus_id,
          name: row.data.name,
          un_kv: row.data.un_kv,
          u_kv: row.data.u_kv,
          u_pu: row.data.u_pu,
          angle_deg: row.data.angle_deg,
          flags: row.data.flags,
        },
      };
    case 'branch':
      return {
        type: 'branch' as const,
        data: {
          branch_id: row.data.branch_id,
          name: row.data.name,
          from_bus: row.data.from_bus,
          to_bus: row.data.to_bus,
          i_a: row.data.i_a,
          p_mw: row.data.p_mw,
          q_mvar: row.data.q_mvar,
          s_mva: row.data.s_mva,
          loading_pct: row.data.loading_pct,
          flags: row.data.flags,
        },
      };
    case 'short_circuit':
      return {
        type: 'short_circuit' as const,
        data: {
          target_id: row.data.target_id,
          target_name: row.data.target_name,
          fault_type: row.data.fault_type,
          ikss_ka: row.data.ikss_ka,
          ip_ka: row.data.ip_ka,
          ith_ka: row.data.ith_ka,
          sk_mva: row.data.sk_mva,
        },
      };
  }
}

// =============================================================================
// Main Results Inspector Page
// =============================================================================

interface ResultsInspectorPageProps {
  runId?: string;
  forcedTab?: ResultsInspectorTab;
  onClose?: () => void;
}

export function ResultsInspectorPage({ runId, forcedTab, onClose }: ResultsInspectorPageProps) {
  const {
    selectedRunId,
    resultsIndex,
    activeTab,
    setActiveTab,
    selectRun,
    isLoadingIndex,
    error,
    overlayVisible,
    toggleOverlay,
  } = useResultsInspectorStore();

  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const globalSelectedElement = useSelectionStore((state) => state.selectedElement);
  const hasShortCircuit = useHasShortCircuitResults();

  // Filtered results for export
  const filteredBusRows = useFilteredBusResults();
  const filteredBranchRows = useFilteredBranchResults();

  // Local state for selected result row
  const [selectedResultRow, setSelectedResultRow] = useState<SelectedResultRow>(null);

  // Select run on mount if provided
  useEffect(() => {
    if (runId && runId !== selectedRunId) {
      selectRun(runId);
    }
  }, [runId, selectedRunId, selectRun]);

  useEffect(() => {
    if (forcedTab && activeTab !== forcedTab) {
      setActiveTab(forcedTab);
    }
  }, [forcedTab, activeTab, setActiveTab, resultsIndex]);

  // Clear selection when switching tabs
  useEffect(() => {
    setSelectedResultRow(null);
  }, [activeTab]);

  // PROJECT_TREE_PARITY_V1: Sync selection from Tree/URL to Results Table
  // When globalSelectedElement changes (e.g., from Tree click), find matching row
  const {
    busResults,
    branchResults,
    shortCircuitResults,
    extendedTrace,
    runSnapshot,
    isLoadingTrace,
    loadBusResults,
    loadBranchResults,
    loadShortCircuitResults,
    loadExtendedTrace,
    loadRunSnapshot,
  } = useResultsInspectorStore();

  useEffect(() => {
    if (!resultsIndex) {
      return;
    }

    if (!busResults) {
      void loadBusResults();
    }
    if (!branchResults) {
      void loadBranchResults();
    }
    if (hasShortCircuit && !shortCircuitResults) {
      void loadShortCircuitResults();
    }
    if (!runSnapshot) {
      void loadRunSnapshot();
    }
  }, [
    resultsIndex,
    busResults,
    branchResults,
    shortCircuitResults,
    runSnapshot,
    hasShortCircuit,
    loadBranchResults,
    loadBusResults,
    loadRunSnapshot,
    loadShortCircuitResults,
  ]);

  // Load trace when TRACE tab is active
  useEffect(() => {
    if (activeTab === 'TRACE' && !extendedTrace && !isLoadingTrace) {
      loadExtendedTrace();
    }
  }, [activeTab, extendedTrace, isLoadingTrace, loadExtendedTrace]);

  useEffect(() => {
    if (!globalSelectedElement) {
      return;
    }

    const { id, type } = globalSelectedElement;

    // Try to find matching row in current results
    if (type === 'Bus' && busResults?.rows) {
      const matchingRow = busResults.rows.find((row) => row.bus_id === id);
      if (matchingRow) {
        setSelectedResultRow({ type: 'bus', data: matchingRow });
        setActiveTab('BUSES');
        return;
      }
      // Also check short circuit (target is a Bus)
      if (shortCircuitResults?.rows) {
        const scRow = shortCircuitResults.rows.find((row) => row.target_id === id);
        if (scRow) {
          setSelectedResultRow({ type: 'short_circuit', data: scRow });
          setActiveTab('SHORT_CIRCUIT');
          return;
        }
      }
    }

    if ((type === 'LineBranch' || type === 'TransformerBranch') && branchResults?.rows) {
      const matchingRow = branchResults.rows.find((row) => row.branch_id === id);
      if (matchingRow) {
        setSelectedResultRow({ type: 'branch', data: matchingRow });
        setActiveTab('BRANCHES');
        return;
      }
    }
  }, [globalSelectedElement, busResults, branchResults, shortCircuitResults, setActiveTab]);

  // Handle bus row selection
  const handleBusRowSelect = useCallback((row: BusResultRow) => {
    setSelectedResultRow({ type: 'bus', data: row });
    // Update global selection store (Bus type is already an ElementType)
    selectElement({
      id: row.bus_id,
      type: 'Bus' as ElementType,
      name: row.name,
    });
    centerSldOnElement(row.bus_id);
  }, [centerSldOnElement, selectElement]);

  // Handle branch row selection
  const handleBranchRowSelect = useCallback((row: BranchResultRow) => {
    setSelectedResultRow({ type: 'branch', data: row });
    // Update global selection store (LineBranch as default branch type)
    selectElement({
      id: row.branch_id,
      type: 'LineBranch' as ElementType,
      name: row.name,
    });
    centerSldOnElement(row.branch_id);
  }, [centerSldOnElement, selectElement]);

  // Handle short-circuit row selection
  const handleShortCircuitRowSelect = useCallback((row: ShortCircuitRow) => {
    setSelectedResultRow({ type: 'short_circuit', data: row });
    // Update global selection store (target is a Bus)
    selectElement({
      id: row.target_id,
      type: 'Bus' as ElementType,
      name: row.target_name ?? row.target_id,
    });
    centerSldOnElement(row.target_id);
  }, [centerSldOnElement, selectElement]);

  // Close inspector panel
  const handleCloseInspector = useCallback(() => {
    setSelectedResultRow(null);
    selectElement(null);
    centerSldOnElement(null);
  }, [centerSldOnElement, selectElement]);

  // Get selected row ID for highlighting
  const getSelectedRowId = (): string | null => {
    if (!selectedResultRow) return null;
    switch (selectedResultRow.type) {
      case 'bus':
        return selectedResultRow.data.bus_id;
      case 'branch':
        return selectedResultRow.data.branch_id;
      case 'short_circuit':
        return selectedResultRow.data.target_id;
    }
  };

  const traceSelectionId = useMemo(() => {
    if (!selectedResultRow) return null;
    switch (selectedResultRow.type) {
      case 'bus':
        return selectedResultRow.data.element_id ?? selectedResultRow.data.bus_id;
      case 'branch':
        return selectedResultRow.data.element_id ?? selectedResultRow.data.branch_id;
      case 'short_circuit':
        return selectedResultRow.data.element_id ?? selectedResultRow.data.target_id;
    }
  }, [selectedResultRow]);

  const traceSelectionToStepMap = useMemo(() => {
    const mapping = new Map<string, number>();
    if (!extendedTrace?.selection_index) {
      return mapping;
    }
    Object.entries(extendedTrace.selection_index).forEach(([selectionId, stepIndex]) => {
      if (typeof stepIndex === 'number' && stepIndex >= 0) {
        mapping.set(selectionId, stepIndex);
      }
    });
    return mapping;
  }, [extendedTrace]);

  // Available tabs based on analysis type
  const availableTabs: ResultsInspectorTab[] = useMemo(() => {
    return resolveAvailableResultsTabs(forcedTab, hasShortCircuit);
  }, [forcedTab, hasShortCircuit]);

  // Error display
  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <p className="font-semibold">Błąd</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!runId && !selectedRunId) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded border border-slate-200 bg-white p-6 text-slate-700">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Wyniki i ślad obliczeń
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">
              Brak wybranego uruchomienia
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Wybierz wykonane obliczenie w widoku wyników albo uruchom analizę dla aktywnego
              przypadku, aby otworzyć dane tabelaryczne i ślad obliczeń.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoadingIndex || !resultsIndex) {
    return (
      <div className="min-h-screen bg-slate-100">
        <LoadingSpinner />
      </div>
    );
  }

  const { run_header } = resultsIndex;
  const analysisCaseContext = mergeAnalysisCaseContexts(
    resultsIndex.analysis_case_context,
    run_header.analysis_case_context,
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {forcedTab === 'TRACE' ? 'Ślad obliczeń' : 'Przeglądarka wyników'}
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                {forcedTab === 'TRACE' ? 'Przebieg obliczeń analizy' : 'Wyniki analizy'}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <ResultsExport
                exportData={{
                  activeTab,
                  busRows: filteredBusRows,
                  branchRows: filteredBranchRows,
                  shortCircuitRows: shortCircuitResults?.rows ?? [],
                  runHeader: run_header,
                }}
              />
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Tylko do odczytu
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Zamknij przeglądarkę wyników"
                  className="rounded border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Zamknij
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Status bar */}
        <ResultStatusBar
          resultState={run_header.result_state}
          solverKind={run_header.solver_kind}
          runId={run_header.run_id}
          createdAt={run_header.created_at}
          analysisCaseContext={analysisCaseContext}
        />
        <AnalysisCaseContextPanel context={analysisCaseContext} />

        {/* Overlay toggle */}
        <div className="mt-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={overlayVisible}
              onChange={(e) => toggleOverlay(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Pokaż nakładkę wyników na SLD
          </label>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2 border-b border-slate-200">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-label={`Zakładka ${RESULTS_TAB_LABELS[tab]}`}
              className={`px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {RESULTS_TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <EmbeddedSldWorkspace runHeader={run_header} />
        </div>

        {/* Content grid with table/proof and inspector */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Tab content */}
          <div className="lg:col-span-2 rounded border border-slate-200 bg-white p-4" data-testid="results-table-container">
            {activeTab === 'BUSES' && (
              <BusResultsTable
                selectedRowId={getSelectedRowId()}
                onRowSelect={handleBusRowSelect}
              />
            )}
            {activeTab === 'BRANCHES' && (
              <BranchResultsTable
                selectedRowId={getSelectedRowId()}
                onRowSelect={handleBranchRowSelect}
              />
            )}
            {activeTab === 'SHORT_CIRCUIT' && (
              <ShortCircuitResultsTable
                selectedRowId={getSelectedRowId()}
                onRowSelect={handleShortCircuitRowSelect}
              />
            )}
            {activeTab === 'TRACE' && (
              <TraceViewerContainer
                trace={extendedTrace}
                isLoading={isLoadingTrace}
                selectionId={traceSelectionId}
                selectionToTraceMap={traceSelectionToStepMap}
              />
            )}
          </div>

          {/* Inspector panel (Canonical-style read-only property grid) */}
          <div className="lg:col-span-1" data-testid="results-inspector-container">
            <InspectorPanel
              selectedRow={mapResultRowToInspectorData(selectedResultRow)}
              onClose={handleCloseInspector}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
