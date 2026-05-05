/**
 * P20b/P22 — Power Flow Results Inspector Page
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish UI
 * - READ-ONLY: No physics, no mutations
 * - RESULT_VIEW mode
 *
 * Main page for viewing power flow analysis results (single run).
 * Tabs: Szyny, Galezie, Podsumowanie, Slad obliczen, Interpretacja (P22)
 */

import { useEffect, useMemo } from 'react';
import { notify } from '../notifications/store';
import {
  usePowerFlowResultsStore,
  useFilteredBusResults,
  useFilteredBranchResults,
  useIsAnyLoading,
} from './store';
import type {
  PowerFlowBusResult,
  PowerFlowBranchResult,
  PowerFlowIterationTrace,
  VoltageFinding,
  BranchLoadingFinding,
  InterpretationRankedItem,
  FindingSeverity,
} from './types';
import {
  POWER_FLOW_TAB_LABELS,
  RESULT_STATUS_LABELS,
  RESULT_STATUS_SEVERITY,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
} from './types';
import { useState } from 'react';
import { VerdictBadge } from '../protection-coordination/ResultsTables';
import type { CoordinationVerdict } from '../protection-coordination/types';
import { NormativeLabels } from '../shared/normativeLabels';
import {
  formatProofPackRef,
  getAnalysisCaseLabel,
  getCompletenessDisplayLabel,
  getCompletenessTone,
  getReproducibilitySummary,
  mergeAnalysisCaseContexts,
} from '../results-inspector/analysisCaseContextView';
import {
  ANALYSIS_COMPLETENESS_BADGE_CLASS,
  ANALYSIS_COMPLETENESS_LABELS,
  QUALITY_GATE_BADGE_CLASS,
  QUALITY_GATE_LABELS,
  type AnalysisCaseContext,
} from '../shared/analysisCaseContext';

// =============================================================================
// P20d: Export Types and Component
// =============================================================================

type ExportFormat = 'json' | 'docx' | 'pdf';

const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  json: 'JSON',
  docx: 'DOCX',
  pdf: 'PDF',
};

interface ExportButtonProps {
  runId: string | null;
  disabled?: boolean;
  /** UI-10: Werdykt ogólny - gdy PASS, przycisk jest wyróżniony */
  overallVerdict?: CoordinationVerdict | null;
}

/**
 * P20d: Export dropdown button for Power Flow results.
 * Polish labels, minimal footprint.
 * UI-10: Podświetlenie przycisku gdy werdykt to PASS.
 */
function ExportButton({ runId, disabled, overallVerdict }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (!runId) return;

    setIsExporting(true);
    setIsOpen(false);

    try {
      // Build export URL
      const baseUrl = `/api/power-flow-runs/${runId}/export/${format}`;

      // Trigger download via fetch + blob
      const response = await fetch(baseUrl);
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `power_flow_run_${runId.substring(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      notify(`Błąd eksportu: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // UI-10: Highlight button when verdict is PASS
  const isSuccess = overallVerdict === 'PASS';
  const buttonBaseClass = isSuccess
    ? 'flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300 ring-offset-1 animate-pulse disabled:cursor-not-allowed disabled:bg-slate-300 disabled:ring-0 disabled:animate-none'
    : 'flex items-center gap-2 rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting || !runId}
        className={buttonBaseClass}
        title={isSuccess ? 'Werdykt pozytywny - zalecany eksport raportu' : undefined}
      >
        {isExporting ? 'Eksportuje...' : 'Eksportuj raport'}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded border border-slate-200 bg-white shadow-lg">
          {(Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => handleExport(format)}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {EXPORT_FORMAT_LABELS[format]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
// UI-01/UI-02: Voltage and Loading Verdict Functions
// =============================================================================

/**
 * UI-01: Oblicza werdykt operacyjny dla napięcia szyny.
 * Werdykt zawiera: STATUS + DLACZEGO + CO DALEJ
 *
 * Kryteria:
 * - PASS (OK): 0.95 ≤ U_pu ≤ 1.05
 * - MARGINAL (NA GRANICY): 0.90 ≤ U_pu < 0.95 lub 1.05 < U_pu ≤ 1.10
 * - FAIL (NIE OK): U_pu < 0.90 lub U_pu > 1.10
 *
 * Każdy werdykt zawiera:
 * - verdict: status (PASS/MARGINAL/FAIL)
 * - notes: DLACZEGO (przyczyna)
 * - recommendation: CO DALEJ (zalecenie operacyjne)
 */
function getVoltageVerdict(v_pu: number): {
  verdict: CoordinationVerdict;
  notes: string;
  recommendation: string;
} {
  const voltageLabels = NormativeLabels.voltage;

  if (v_pu >= 0.95 && v_pu <= 1.05) {
    return {
      verdict: 'PASS',
      notes: voltageLabels.statusDescriptions.pass,
      recommendation: voltageLabels.recommendations.pass,
    };
  }
  if ((v_pu >= 0.90 && v_pu < 0.95) || (v_pu > 1.05 && v_pu <= 1.10)) {
    const isLow = v_pu < 1.0;
    const deviationPct = Math.abs((v_pu - 1.0) * 100).toFixed(1);
    return {
      verdict: 'MARGINAL',
      notes: isLow
        ? voltageLabels.statusDescriptions.marginalLow(deviationPct)
        : voltageLabels.statusDescriptions.marginalHigh(deviationPct),
      recommendation: isLow
        ? voltageLabels.recommendations.marginalLow
        : voltageLabels.recommendations.marginalHigh,
    };
  }
  const isLow = v_pu < 1.0;
  return {
    verdict: 'FAIL',
    notes: isLow
      ? voltageLabels.statusDescriptions.failLow
      : voltageLabels.statusDescriptions.failHigh,
    recommendation: isLow
      ? voltageLabels.recommendations.failLow
      : voltageLabels.recommendations.failHigh,
  };
}

/**
 * UI-02: Oblicza werdykt operacyjny dla obciążenia gałęzi.
 * Werdykt zawiera: STATUS + DLACZEGO + CO DALEJ
 *
 * Kryteria (gdy dostępne loading_pct):
 * - PASS: obciążenie ≤ 80%
 * - MARGINAL: 80% < obciążenie ≤ 100%
 * - FAIL: obciążenie > 100%
 *
 * Uwaga: Jeśli brak danych obciążenia, używamy strat jako proxy.
 * Zgodnie z wymaganiami UI-02, dla braku danych:
 * - Werdykt = PASS (z zastrzeżeniem)
 * - DLACZEGO: informacja o braku danych
 * - CO DALEJ: zalecenie uzupełnienia danych
 */
function getBranchLoadingVerdict(
  loading_pct: number | null | undefined,
  losses_p_mw: number
): { verdict: CoordinationVerdict; notes: string; recommendation: string } {
  const branchLabels = NormativeLabels.branchLoading;

  // Jeśli brak danych obciążenia, szacujemy na podstawie strat
  if (loading_pct === null || loading_pct === undefined) {
    // Wysokie straty mogą wskazywać na przeciążenie (heurystyka)
    if (losses_p_mw > 0.1) {
      return {
        verdict: 'MARGINAL',
        notes: branchLabels.statusDescriptions.noDataHighLosses,
        recommendation: branchLabels.recommendations.noDataHighLosses,
      };
    }
    // Brak danych - werdykt PASS z zastrzeżeniem (zgodnie z wymaganiami UI-02)
    return {
      verdict: 'PASS',
      notes: branchLabels.statusDescriptions.noData,
      recommendation: branchLabels.recommendations.noData,
    };
  }

  // Pełne dane - ocena na podstawie loading_pct
  if (loading_pct <= 80) {
    return {
      verdict: 'PASS',
      notes: branchLabels.statusDescriptions.pass,
      recommendation: branchLabels.recommendations.pass,
    };
  }
  if (loading_pct <= 100) {
    return {
      verdict: 'MARGINAL',
      notes: branchLabels.statusDescriptions.marginal(loading_pct.toFixed(1)),
      recommendation: branchLabels.recommendations.marginal,
    };
  }
  return {
    verdict: 'FAIL',
    notes: branchLabels.statusDescriptions.fail(loading_pct.toFixed(1)),
    recommendation: branchLabels.recommendations.fail,
  };
}

// =============================================================================
// Sub-Components
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">{NormativeLabels.common.loading.default}</span>
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

  const reproducibility = context.reproducibility ?? {};
  const completenessLabel =
    ANALYSIS_COMPLETENESS_LABELS[context.completeness] ?? context.completeness;
  const completenessTone =
    ANALYSIS_COMPLETENESS_BADGE_CLASS[context.completeness] ??
    ANALYSIS_COMPLETENESS_BADGE_CLASS.partial;
  const qualityGateLabel = QUALITY_GATE_LABELS[context.quality_gate] ?? context.quality_gate;
  const qualityGateTone =
    QUALITY_GATE_BADGE_CLASS[context.quality_gate] ?? QUALITY_GATE_BADGE_CLASS.G2;
  const applicability =
    context.applicability_scope.length > 0
      ? context.applicability_scope.join(', ')
      : 'Brak zakresu';

  return (
    <section className="mt-4 space-y-4 rounded border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            kontekst_analizy
          </div>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">
            Kontekst uruchomienia rozpływu
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
        <ContextField label="Id przypadku" value={context.case_ref} />
        <ContextField label="Id uruchomienia" value={context.run_ref} />
        <ContextField label="Migawka" value={context.snapshot_ref ?? 'Brak'} />
        <ContextField label="Pakiet uzasadnienia" value={context.proof_pack_ref} />
        <ContextField label="Zakres" value={applicability} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ContextField label="Solver" value={reproducibility.solver_family ?? 'Brak'} />
        <ContextField
          label="Wersja solvera"
          value={reproducibility.solver_version ?? 'Brak'}
        />
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
// Result Status Bar
// =============================================================================

function ResultStatusBar() {
  const { runHeader, results, selectedRunId } = usePowerFlowResultsStore();
  const analysisCaseContext = mergeAnalysisCaseContexts(
    runHeader?.analysis_case_context,
    runHeader?.input_metadata?.analysis_case_context,
  );

  // Hooks must precede early return (Rules of Hooks)
  const formattedDate = useMemo(() => {
    if (!runHeader) return '—';
    try {
      return new Date(runHeader.created_at).toLocaleString('pl-PL');
    } catch {
      return runHeader.created_at;
    }
  }, [runHeader]);

  // UI-10: Calculate quick verdict for export button highlighting
  const overallVerdict = useMemo((): CoordinationVerdict | null => {
    if (!results || !results.converged) return null;
    const { summary, bus_results, branch_results } = results;
    // Quick check: if voltage range is within limits, consider it PASS
    const voltageOk = summary.min_v_pu >= 0.95 && summary.max_v_pu <= 1.05;
    if (!voltageOk) {
      // Check if any bus/branch has FAIL
      const hasFail = bus_results.some(b => getVoltageVerdict(b.v_pu).verdict === 'FAIL') ||
        branch_results.some(br => getBranchLoadingVerdict(null, br.losses_p_mw).verdict === 'FAIL');
      return hasFail ? 'FAIL' : 'MARGINAL';
    }
    return 'PASS';
  }, [results]);

  if (!runHeader) return null;

  const statusLabel = RESULT_STATUS_LABELS[runHeader.result_status] ?? runHeader.result_status;
  const severity = RESULT_STATUS_SEVERITY[runHeader.result_status] ?? 'info';
  const caseLabel = getAnalysisCaseLabel(analysisCaseContext);
  const completenessLabel = getCompletenessDisplayLabel(analysisCaseContext);
  const completenessTone = getCompletenessTone(analysisCaseContext?.completeness ?? completenessLabel);
  const proofPackRef = formatProofPackRef(analysisCaseContext?.proof_pack_ref ?? null);
  const reproducibilitySummary = getReproducibilitySummary(analysisCaseContext);
  const convergedLabel = results?.converged
    ? NormativeLabels.common.powerFlowLabels.converged
    : results?.converged === false
    ? NormativeLabels.common.powerFlowLabels.notConverged
    : '—';
  const iterationsLabel = results?.iterations_count ?? runHeader.iterations ?? '—';

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
            <span className="font-medium">{NormativeLabels.common.powerFlowLabels.analysisType}:</span>{' '}
            {NormativeLabels.common.powerFlowLabels.powerFlow}
          </span>
          {caseLabel && (
            <span className="text-sm text-slate-600" data-testid="power-flow-status-case-context">
              <span className="font-medium">Zakres obliczeń:</span> {caseLabel}
            </span>
          )}
          {completenessLabel && (
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(completenessTone)}`}
              data-testid="power-flow-status-completeness"
            >
              Kompletnosc: {completenessLabel}
            </span>
          )}
          <span className="text-sm text-slate-600">
            <span className="font-medium">{NormativeLabels.common.powerFlowLabels.convergenceStatus}:</span>{' '}
            <span className={results?.converged ? 'text-emerald-600' : 'text-rose-600'}>
              {convergedLabel}
            </span>
          </span>
          <span className="text-sm text-slate-600">
            <span className="font-medium">{NormativeLabels.common.powerFlowLabels.iterations}:</span>{' '}
            {iterationsLabel}
          </span>
          <span className="text-sm text-slate-600">
            <span className="font-medium">{NormativeLabels.common.powerFlowLabels.run}:</span>{' '}
            {runHeader.id.substring(0, 8)}...
          </span>
        </div>
        {(proofPackRef || reproducibilitySummary) && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {proofPackRef && (
              <span data-testid="power-flow-status-proof-pack">
                <span className="font-medium text-slate-600">Pakiet uzasadnienia:</span> {proofPackRef}
              </span>
            )}
            {reproducibilitySummary && (
              <span data-testid="power-flow-status-reproducibility">
                <span className="font-medium text-slate-600">
                  {reproducibilitySummary.label}:
                </span>{' '}
                {reproducibilitySummary.value}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-500">{formattedDate}</span>
        <ExportButton
          runId={selectedRunId || runHeader.id}
          disabled={!results}
          overallVerdict={overallVerdict}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Bus Results Table (Szyny)
// =============================================================================

function BusResultsTable() {
  const { results, isLoadingResults, loadResults, searchQuery, setSearchQuery } =
    usePowerFlowResultsStore();
  const filteredRows = useFilteredBusResults();

  useEffect(() => {
    if (!results) {
      loadResults();
    }
  }, [results, loadResults]);

  if (isLoadingResults) return <LoadingSpinner />;
  if (!results || results.bus_results.length === 0) {
    return <EmptyState message={NormativeLabels.common.emptyStates.noBusResults} />;
  }

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={NormativeLabels.common.filterPlaceholders.busId}
          aria-label="Filtruj wyniki węzłowe"
          className="w-full max-w-md rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.busId}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.voltage}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.angleDeg}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.powerActive}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.powerReactive}</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.status}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row: PowerFlowBusResult) => {
              const voltageResult = getVoltageVerdict(row.v_pu);
              return (
                <tr key={row.bus_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {row.bus_id.substring(0, 12)}...
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.v_pu, 4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.angle_deg, 2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.p_injected_mw, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.q_injected_mvar, 3)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <VerdictBadge
                      verdict={voltageResult.verdict}
                      notesPl={voltageResult.notes}
                      recommendationPl={voltageResult.recommendation}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {NormativeLabels.common.counters.displayed(filteredRows.length, results.bus_results.length)}
      </p>
    </div>
  );
}

// =============================================================================
// Branch Results Table (Galezie)
// =============================================================================

function BranchResultsTable() {
  const { results, isLoadingResults, loadResults, searchQuery, setSearchQuery } =
    usePowerFlowResultsStore();
  const filteredRows = useFilteredBranchResults();

  useEffect(() => {
    if (!results) {
      loadResults();
    }
  }, [results, loadResults]);

  if (isLoadingResults) return <LoadingSpinner />;
  if (!results || results.branch_results.length === 0) {
    return <EmptyState message={NormativeLabels.common.emptyStates.noBranchResults} />;
  }

  return (
    <div>
      <div className="mb-4">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={NormativeLabels.common.filterPlaceholders.branchId}
          aria-label="Filtruj wyniki gałęziowe"
          className="w-full max-w-md rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.branchId}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">P<sub>from</sub> [MW]</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Q<sub>from</sub> [Mvar]</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">P<sub>to</sub> [MW]</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Q<sub>to</sub> [Mvar]</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.lossesActive}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.lossesReactive}</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700">{NormativeLabels.common.tableHeaders.status}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row: PowerFlowBranchResult) => {
              // UI-02: Werdykt operacyjny dla obciążenia gałęzi (używamy strat jako proxy)
              const loadingResult = getBranchLoadingVerdict(null, row.losses_p_mw);
              return (
                <tr key={row.branch_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {row.branch_id.substring(0, 12)}...
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.p_from_mw, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.q_from_mvar, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.p_to_mw, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatNumber(row.q_to_mvar, 3)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-rose-600">
                    {formatNumber(row.losses_p_mw, 4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-rose-600">
                    {formatNumber(row.losses_q_mvar, 4)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <VerdictBadge
                      verdict={loadingResult.verdict}
                      notesPl={loadingResult.notes}
                      recommendationPl={loadingResult.recommendation}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {NormativeLabels.common.counters.displayed(filteredRows.length, results.branch_results.length)}
      </p>
    </div>
  );
}

// =============================================================================
// UI-05: Network Overall Verdict Calculation
// =============================================================================

interface NetworkProblem {
  type: 'voltage' | 'loading';
  element_id: string;
  description: string;
  severity: 'MARGINAL' | 'FAIL';
}

interface NetworkVerdictResult {
  verdict: CoordinationVerdict;
  problems: NetworkProblem[];
  recommendations: string[];
  stats: {
    busPass: number;
    busMarginal: number;
    busFail: number;
    branchPass: number;
    branchMarginal: number;
    branchFail: number;
  };
}

/**
 * UI-05: Oblicza ogólny werdykt sieci na podstawie wyników szyn i gałęzi.
 */
function calculateNetworkVerdict(
  busResults: PowerFlowBusResult[],
  branchResults: PowerFlowBranchResult[]
): NetworkVerdictResult {
  const problems: NetworkProblem[] = [];
  const recommendations: string[] = [];
  const stats = {
    busPass: 0,
    busMarginal: 0,
    busFail: 0,
    branchPass: 0,
    branchMarginal: 0,
    branchFail: 0,
  };

  // Analyze bus results
  for (const bus of busResults) {
    const result = getVoltageVerdict(bus.v_pu);
    if (result.verdict === 'PASS') {
      stats.busPass++;
    } else if (result.verdict === 'MARGINAL') {
      stats.busMarginal++;
      problems.push({
        type: 'voltage',
        element_id: bus.bus_id,
        description: `${NormativeLabels.terms.bus.charAt(0).toUpperCase() + NormativeLabels.terms.bus.slice(1)} ${bus.bus_id.substring(0, 8)}...: ${result.notes}`,
        severity: 'MARGINAL',
      });
    } else if (result.verdict === 'FAIL') {
      stats.busFail++;
      problems.push({
        type: 'voltage',
        element_id: bus.bus_id,
        description: `${NormativeLabels.terms.bus.charAt(0).toUpperCase() + NormativeLabels.terms.bus.slice(1)} ${bus.bus_id.substring(0, 8)}...: ${result.notes}`,
        severity: 'FAIL',
      });
    }
  }

  // Analyze branch results
  for (const branch of branchResults) {
    const result = getBranchLoadingVerdict(null, branch.losses_p_mw);
    if (result.verdict === 'PASS') {
      stats.branchPass++;
    } else if (result.verdict === 'MARGINAL') {
      stats.branchMarginal++;
      problems.push({
        type: 'loading',
        element_id: branch.branch_id,
        description: `${NormativeLabels.terms.branch.charAt(0).toUpperCase() + NormativeLabels.terms.branch.slice(1)} ${branch.branch_id.substring(0, 8)}...: ${result.notes}`, // ui-terminology-ignore
        severity: 'MARGINAL',
      });
    } else if (result.verdict === 'FAIL') {
      stats.branchFail++;
      problems.push({
        type: 'loading',
        element_id: branch.branch_id,
        description: `${NormativeLabels.terms.branch.charAt(0).toUpperCase() + NormativeLabels.terms.branch.slice(1)} ${branch.branch_id.substring(0, 8)}...: ${result.notes}`, // ui-terminology-ignore
        severity: 'FAIL',
      });
    }
  }

  // Generate recommendations
  const networkLabels = NormativeLabels.networkVerdict;
  if (stats.busFail > 0) {
    recommendations.push(networkLabels.systemRecommendations.busFail);
  }
  if (stats.busMarginal > 0) {
    recommendations.push(networkLabels.systemRecommendations.busMarginal);
  }
  if (stats.branchFail > 0) {
    recommendations.push(networkLabels.systemRecommendations.branchFail);
  }
  if (stats.branchMarginal > 0) {
    recommendations.push(networkLabels.systemRecommendations.branchMarginal);
  }

  // Determine overall verdict
  let verdict: CoordinationVerdict;
  if (stats.busFail > 0 || stats.branchFail > 0) {
    verdict = 'FAIL';
  } else if (stats.busMarginal > 0 || stats.branchMarginal > 0) {
    verdict = 'MARGINAL';
  } else {
    verdict = 'PASS';
  }

  return { verdict, problems, recommendations, stats };
}

// =============================================================================
// Summary Tab (Podsumowanie)
// =============================================================================

function SummaryTab() {
  const { results, isLoadingResults, loadResults } = usePowerFlowResultsStore();

  useEffect(() => {
    if (!results) {
      loadResults();
    }
  }, [results, loadResults]);

  // Hook must precede early return (Rules of Hooks)
  // UI-05: Calculate network verdict (empty arrays when results not yet loaded)
  const networkVerdict = useMemo(
    () => calculateNetworkVerdict(
      results?.bus_results ?? [],
      results?.branch_results ?? []
    ),
    [results]
  );

  if (isLoadingResults) return <LoadingSpinner />;
  if (!results) {
    return <EmptyState message={NormativeLabels.common.emptyStates.noResults} />;
  }

  const { summary, converged, iterations_count, tolerance_used, base_mva, slack_bus_id } = results;

  return (
    <div className="space-y-4">
      {/* UI-05: Overall network verdict */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{NormativeLabels.networkVerdict.title}</h3>
        <div className="flex items-center gap-4">
          <VerdictBadge
            verdict={networkVerdict.verdict}
            size="md"
            notesPl={
              networkVerdict.verdict === 'PASS'
                ? NormativeLabels.networkVerdict.overallDescriptions.pass
                : networkVerdict.verdict === 'MARGINAL'
                ? NormativeLabels.networkVerdict.overallDescriptions.marginal
                : NormativeLabels.networkVerdict.overallDescriptions.fail
            }
          />
          <div className="text-sm text-slate-600">
            <span className="font-medium text-emerald-600">{networkVerdict.stats.busPass + networkVerdict.stats.branchPass}</span> {NormativeLabels.networkVerdict.statsLabels.compliant},{' '}
            <span className="font-medium text-amber-600">{networkVerdict.stats.busMarginal + networkVerdict.stats.branchMarginal}</span> {NormativeLabels.networkVerdict.statsLabels.marginal},{' '}
            <span className="font-medium text-rose-600">{networkVerdict.stats.busFail + networkVerdict.stats.branchFail}</span> {NormativeLabels.networkVerdict.statsLabels.nonCompliant}
          </div>
        </div>
      </div>

      {/* UI-05: Problems list (if any) */}
      {networkVerdict.problems.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-800">{NormativeLabels.networkVerdict.problemsTitle(networkVerdict.problems.length)}</h3>
          <ul className="space-y-1 text-sm text-amber-700">
            {networkVerdict.problems.slice(0, 10).map((problem, idx) => (
              <li key={`${problem.element_id}-${idx}`} className="flex items-start gap-2">
                <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${problem.severity === 'FAIL' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                {problem.description}
              </li>
            ))}
            {networkVerdict.problems.length > 10 && (
              <li className="text-amber-500">{NormativeLabels.networkVerdict.moreProblems(networkVerdict.problems.length - 10)}</li>
            )}
          </ul>
        </div>
      )}

      {/* UI-05: Recommendations (if any) */}
      {networkVerdict.recommendations.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-blue-800">{NormativeLabels.networkVerdict.recommendationsTitle}</h3>
          <ul className="space-y-1 text-sm text-blue-700">
            {networkVerdict.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-500">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Convergence status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded border p-4 ${converged ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <div className={`text-sm font-medium ${converged ? 'text-emerald-700' : 'text-rose-700'}`}>
            {NormativeLabels.common.powerFlowLabels.convergenceTitle}
          </div>
          <div className={`mt-1 text-2xl font-bold ${converged ? 'text-emerald-900' : 'text-rose-900'}`}>
            {converged ? NormativeLabels.common.powerFlowLabels.converged : NormativeLabels.common.powerFlowLabels.notConverged}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-600">{NormativeLabels.common.powerFlowLabels.iterationsCount}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{iterations_count}</div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-600">{NormativeLabels.common.powerFlowLabels.tolerance}</div>
          <div className="mt-1 text-lg font-mono font-semibold text-slate-900">
            {tolerance_used.toExponential(2)}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-sm font-medium text-slate-600">{NormativeLabels.common.powerFlowLabels.baseMva}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{base_mva} MVA</div>
        </div>
      </div>

      {/* Losses and slack power */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{NormativeLabels.common.powerFlowLabels.lossesAndSlack}</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.totalLossesP}</div>
            <div className="text-lg font-mono font-semibold text-rose-700">
              {formatNumber(summary.total_losses_p_mw, 4)} MW
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.totalLossesQ}</div>
            <div className="text-lg font-mono font-semibold text-rose-700">
              {formatNumber(summary.total_losses_q_mvar, 4)} Mvar
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.slackP}</div>
            <div className="text-lg font-mono font-semibold text-slate-900">
              {formatNumber(summary.slack_p_mw, 3)} MW
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.slackQ}</div>
            <div className="text-lg font-mono font-semibold text-slate-900">
              {formatNumber(summary.slack_q_mvar, 3)} Mvar
            </div>
          </div>
        </div>
      </div>

      {/* Voltage range */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{NormativeLabels.common.powerFlowLabels.voltageRange}</h3>
        <div className="flex items-center gap-8">
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.minV}</div>
            <div className={`text-lg font-mono font-semibold ${summary.min_v_pu < 0.95 ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatNumber(summary.min_v_pu, 4)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{NormativeLabels.common.powerFlowLabels.maxV}</div>
            <div className={`text-lg font-mono font-semibold ${summary.max_v_pu > 1.05 ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatNumber(summary.max_v_pu, 4)}
            </div>
          </div>
        </div>
      </div>

      {/* Slack bus info */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{NormativeLabels.common.powerFlowLabels.slackBus}</h3>
        <div className="font-mono text-sm text-slate-600">{slack_bus_id}</div>
      </div>
    </div>
  );
}

// =============================================================================
// Trace Tab (Slad obliczen)
// =============================================================================

function TraceTab() {
  const { trace, isLoadingTrace, loadTrace } = usePowerFlowResultsStore();

  useEffect(() => {
    if (!trace) {
      loadTrace();
    }
  }, [trace, loadTrace]);

  if (isLoadingTrace) return <LoadingSpinner />;
  if (!trace || trace.iterations.length === 0) {
    return <EmptyState message="Brak sladu obliczen dla tego obliczenia." />;
  }

  return (
    <div className="space-y-4">
      {/* Trace metadata */}
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="font-medium text-slate-700">Wersja solvera:</span>{' '}
            <span className="text-slate-600">{trace.solver_version}</span>
          </div>
          <div>
            <span className="font-medium text-slate-700">Metoda startu:</span>{' '}
            <span className="text-slate-600">{trace.init_method === 'flat' ? 'Plaski' : trace.init_method}</span>
          </div>
          <div>
            <span className="font-medium text-slate-700">Tolerancja:</span>{' '}
            <span className="font-mono text-xs text-slate-600">{trace.tolerance.toExponential(2)}</span>
          </div>
          <div>
            <span className="font-medium text-slate-700">Max iteracji:</span>{' '}
            <span className="text-slate-600">{trace.max_iterations}</span>
          </div>
        </div>
      </div>

      {/* Bus classification */}
      <div className="rounded border border-slate-200 bg-white p-3">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Klasyfikacja wezlow</h4>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div>
            <span className="font-medium text-slate-600">Slack:</span>{' '}
            <span className="font-mono text-xs text-slate-500">{trace.slack_bus_id.substring(0, 12)}...</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">PQ ({trace.pq_bus_ids.length}):</span>{' '}
            <span className="text-slate-500">{trace.pq_bus_ids.length} wezlow</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">PV ({trace.pv_bus_ids.length}):</span>{' '}
            <span className="text-slate-500">{trace.pv_bus_ids.length} wezlow</span>
          </div>
        </div>
      </div>

      {/* Iterations table */}
      <div className="rounded border border-slate-200 bg-white">
        <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          Iteracje Newton-Raphson
        </h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">k</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Norma mismatch</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Max mismatch [pu]</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">PV→PQ</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {trace.iterations.map((iter: PowerFlowIterationTrace) => (
                <tr key={iter.k} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{iter.k}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {iter.norm_mismatch.toExponential(4)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {iter.max_mismatch_pu.toExponential(4)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {iter.pv_to_pq_switches && iter.pv_to_pq_switches.length > 0
                      ? `${iter.pv_to_pq_switches.length} przelaczenia`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {iter.cause_if_failed ? (
                      <span className="rounded bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                        {iter.cause_if_failed}
                      </span>
                    ) : (
                      <span className="text-emerald-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Final status */}
      <div className={`rounded border p-3 ${trace.converged ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${trace.converged ? 'text-emerald-700' : 'text-rose-700'}`}>
            Wynik koncowy:
          </span>
          <span className={`font-semibold ${trace.converged ? 'text-emerald-900' : 'text-rose-900'}`}>
            {trace.converged ? 'Zbiezny' : 'Niezbiezny'} po {trace.final_iterations_count} iteracjach
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// P22: Interpretation Tab (Interpretacja)
// =============================================================================

/**
 * Get CSS class for severity badge.
 */
function getSeverityBadgeClass(severity: FindingSeverity): string {
  return SEVERITY_COLORS[severity] ?? 'text-slate-600 bg-slate-100';
}

/**
 * P22: Interpretation Tab - READ-ONLY display of power flow interpretation.
 * Shows voltage findings, branch findings, and top issues ranking.
 */
function InterpretationTab() {
  const { interpretation, isLoadingInterpretation, loadInterpretation } = usePowerFlowResultsStore();

  useEffect(() => {
    if (!interpretation) {
      loadInterpretation();
    }
  }, [interpretation, loadInterpretation]);

  if (isLoadingInterpretation) return <LoadingSpinner />;
  if (!interpretation) {
    return <EmptyState message="Brak interpretacji dla tego obliczenia." />;
  }

  const { summary, voltage_findings, branch_findings, trace } = interpretation;

  return (
    <div className="space-y-6">
      {/* Summary section */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Podsumowanie interpretacji</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{summary.total_voltage_findings}</div>
            <div className="text-xs text-slate-500">Obserwacji napieciowych</div>
          </div>
          <div className="rounded border border-slate-200 p-3 text-center">
            <div className="text-2xl font-bold text-slate-900">{summary.total_branch_findings}</div>
            <div className="text-xs text-slate-500">Obserwacji galeziowych</div>
          </div>
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-center">
            <div className="text-2xl font-bold text-rose-700">{summary.high_count}</div>
            <div className="text-xs text-rose-600">Istotnych problemow</div>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{summary.warn_count}</div>
            <div className="text-xs text-amber-600">Ostrzezen</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="text-2xl font-bold text-slate-600">{summary.info_count}</div>
            <div className="text-xs text-slate-500">Informacji</div>
          </div>
        </div>
      </div>

      {/* Top Issues Ranking */}
      {summary.top_issues.length > 0 && (
        <div className="rounded border border-slate-200 bg-white">
          <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            Ranking najistotniejszych problemow (Top {summary.top_issues.length})
          </h4>
          <div className="divide-y divide-slate-100">
            {summary.top_issues.map((item: InterpretationRankedItem) => (
              <div key={`${item.element_type}-${item.element_id}`} className="flex items-center gap-4 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                  {item.rank}
                </div>
                <span className={`rounded px-2 py-1 text-xs font-semibold ${getSeverityBadgeClass(item.severity)}`}>
                  {SEVERITY_LABELS[item.severity]}
                </span>
                <span className="flex-1 text-sm text-slate-700">{item.description_pl}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voltage Findings */}
      <div className="rounded border border-slate-200 bg-white">
        <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          Obserwacje napieciowe ({voltage_findings.length})
        </h4>
        {voltage_findings.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Brak obserwacji napieciowych.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">ID szyny</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">V [pu]</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Odchylenie [%]</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Poziom</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Opis</th>
                </tr>
              </thead>
              <tbody>
                {voltage_findings.slice(0, 50).map((finding: VoltageFinding) => (
                  <tr key={finding.bus_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {finding.bus_id.substring(0, 12)}...
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {formatNumber(finding.v_pu, 4)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {formatNumber(finding.deviation_pct, 2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getSeverityBadgeClass(finding.severity)}`}>
                        {SEVERITY_LABELS[finding.severity]}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600" title={finding.description_pl}>
                      {finding.description_pl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {voltage_findings.length > 50 && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                Wyswietlono 50 z {voltage_findings.length} obserwacji
              </p>
            )}
          </div>
        )}
      </div>

      {/* Branch Findings */}
      <div className="rounded border border-slate-200 bg-white">
        <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          Obserwacje galeziowe ({branch_findings.length})
        </h4>
        {branch_findings.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Brak obserwacji galeziowych.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">ID galezi</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Straty P [kW]</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Straty Q [kvar]</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Poziom</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Opis</th>
                </tr>
              </thead>
              <tbody>
                {branch_findings.slice(0, 50).map((finding: BranchLoadingFinding) => (
                  <tr key={finding.branch_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {finding.branch_id.substring(0, 12)}...
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {formatNumber(finding.losses_p_mw * 1000, 2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {formatNumber(finding.losses_q_mvar * 1000, 2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getSeverityBadgeClass(finding.severity)}`}>
                        {SEVERITY_LABELS[finding.severity]}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-600" title={finding.description_pl}>
                      {finding.description_pl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {branch_findings.length > 50 && (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                Wyswietlono 50 z {branch_findings.length} obserwacji
              </p>
            )}
          </div>
        )}
      </div>

      {/* Trace Info */}
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Slad interpretacji (audit trail)</h4>
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div>
            <span className="font-medium text-slate-600">ID interpretacji:</span>{' '}
            <span className="font-mono text-slate-500">{trace.interpretation_id}</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">Wersja:</span>{' '}
            <span className="text-slate-500">{trace.interpretation_version}</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">Prog INFO (napiecie):</span>{' '}
            <span className="text-slate-500">&lt;{trace.thresholds.voltage_info_max_pct}%</span>
          </div>
          <div>
            <span className="font-medium text-slate-600">Prog WARN (napiecie):</span>{' '}
            <span className="text-slate-500">{trace.thresholds.voltage_info_max_pct}-{trace.thresholds.voltage_warn_max_pct}%</span>
          </div>
        </div>
        <div className="mt-3">
          <span className="text-xs font-medium text-slate-600">Zastosowane reguly:</span>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
            {trace.rules_applied.map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export function PowerFlowResultsInspectorPage() {
  const {
    activeTab,
    setActiveTab,
    overlayVisible,
    toggleOverlay,
    runHeader,
  } = usePowerFlowResultsStore();
  const analysisCaseContext = mergeAnalysisCaseContexts(
    runHeader?.analysis_case_context,
    runHeader?.input_metadata?.analysis_case_context,
  );

  const isLoading = useIsAnyLoading();

  return (
    <div className="flex h-full flex-col bg-slate-50 p-4">
      <ResultStatusBar />
      <AnalysisCaseContextPanel context={analysisCaseContext} />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          {(Object.entries(POWER_FLOW_TAB_LABELS) as [keyof typeof POWER_FLOW_TAB_LABELS, string][]).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overlayVisible}
            onChange={() => toggleOverlay()}
            className="h-4 w-4"
          />
          <span>{NormativeLabels.common.overlayLabels.showOnSld}</span>
        </label>
      </div>

      <div className="mt-4 flex-1 overflow-auto rounded border border-slate-200 bg-white p-4">
        {isLoading && <LoadingSpinner />}
        {!isLoading && activeTab === 'BUSES' && <BusResultsTable />}
        {!isLoading && activeTab === 'BRANCHES' && <BranchResultsTable />}
        {!isLoading && activeTab === 'SUMMARY' && <SummaryTab />}
        {!isLoading && activeTab === 'TRACE' && <TraceTab />}
        {!isLoading && activeTab === 'INTERPRETATION' && <InterpretationTab />}
      </div>
    </div>
  );
}
