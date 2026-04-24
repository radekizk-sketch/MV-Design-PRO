/**
 * P20c — Power Flow Comparison Page (Porownanie rozplywu mocy)
 *
 * CANONICAL ALIGNMENT:
 * - P20c: Power Flow A/B Comparison
 * - AGENTS.md: NOT-A-SOLVER, no physics in UI
 * - 100% POLISH UI, READ-ONLY
 *
 * FEATURES:
 * - Run A/B selector (power flow runs)
 * - "Porownaj" button
 * - Tabs: Szyny - roznice, Galezie - roznice, Ranking problemow, Slad porownania
 * - Text filtering
 * - Default sort = backend (deterministic)
 * - No settings editing (read-only)
 */

import { useState, useMemo, useCallback } from 'react';
import { notify } from '../notifications/store';
import {
  createPowerFlowComparison,
  getPowerFlowComparisonTrace,
} from './api';
import type {
  PowerFlowComparisonResult,
  PowerFlowComparisonTrace,
  PowerFlowBusDiffRow,
  PowerFlowBranchDiffRow,
  PowerFlowRankingIssue,
  PowerFlowRunItem,
  PowerFlowComparisonTab,
  IssueSeverity,
} from './types';
import {
  COMPARISON_TAB_LABELS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
  ISSUE_CODE_LABELS,
  getDeltaColor,
  getVoltageDeltaColor,
} from './types';

// =============================================================================
// P20d: Export Types and Component
// =============================================================================

type ExportFormat = 'json' | 'docx' | 'pdf';

const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  json: 'JSON',
  docx: 'DOCX',
  pdf: 'PDF',
};

interface ComparisonExportButtonProps {
  comparisonId: string | null;
  disabled?: boolean;
}

/**
 * P20d: Export dropdown button for Power Flow comparison.
 * Polish labels, minimal footprint.
 */
function ComparisonExportButton({ comparisonId, disabled }: ComparisonExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (!comparisonId) return;

    setIsExporting(true);
    setIsOpen(false);

    try {
      // Build export URL
      const baseUrl = `/api/power-flow-comparisons/${comparisonId}/export/${format}`;

      // Trigger download via fetch + blob
      const response = await fetch(baseUrl);
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `power_flow_comparison_${comparisonId.substring(0, 8)}.${format}`;
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting || !comparisonId}
        className="flex items-center gap-2 rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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

function formatNumber(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDelta(value: number, decimals = 4): string {
  const formatted = formatNumber(value, decimals);
  if (value > 0) return `+${formatted}`;
  return formatted;
}

function truncateId(id: string, maxLength = 12): string {
  if (id.length <= maxLength) return id;
  return `${id.substring(0, maxLength)}...`;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface RunSelectorProps {
  label: string;
  runs: PowerFlowRunItem[];
  selectedRunId: string | null;
  onChange: (runId: string) => void;
}

function RunSelector({ label, runs, selectedRunId, onChange }: RunSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <select
        value={selectedRunId || ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <option value="">— Wybierz obliczenia —</option>
        {runs.map((run) => {
          const date = new Date(run.created_at).toLocaleString('pl-PL');
          const convergence = run.converged ? 'Zbiezny' : 'Niezbiezny';
          return (
            <option key={run.id} value={run.id}>
              PF [{truncateId(run.operating_case_id)}] — {date} — {convergence}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">Porownuje...</span>
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

// =============================================================================
// Bus Differences Table (Szyny - roznice)
// =============================================================================

interface BusDifferencesTableProps {
  rows: PowerFlowBusDiffRow[];
  filter: string;
}

function BusDifferencesTable({ rows, filter }: BusDifferencesTableProps) {
  const filtered = useMemo(() => {
    if (!filter) return rows;
    const lowerFilter = filter.toLowerCase();
    return rows.filter((row) =>
      row.bus_id.toLowerCase().includes(lowerFilter)
    );
  }, [rows, filter]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak roznic szyn do wyswietlenia." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              ID szyny
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              V [pu] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              V [pu] — B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              ΔV [pu]
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Kat [deg] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Kat [deg] — B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              ΔKat [deg]
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => {
            const voltageDeltaClass = getVoltageDeltaColor(row.delta_v_pu);
            return (
              <tr
                key={`${row.bus_id}-${idx}`}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-3 py-2 font-medium text-slate-800">
                  {row.bus_id}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.v_pu_a)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.v_pu_b)}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${voltageDeltaClass || getDeltaColor(row.delta_v_pu, 0.001)}`}>
                  {formatDelta(row.delta_v_pu)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.angle_deg_a, 2)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.angle_deg_b, 2)}
                </td>
                <td className={`px-3 py-2 text-right ${getDeltaColor(row.delta_angle_deg, 0.1)}`}>
                  {formatDelta(row.delta_angle_deg, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-3 py-2 text-xs text-slate-500">
        Wyswietlono {filtered.length} z {rows.length} szyn
      </p>
    </div>
  );
}

// =============================================================================
// Branch Differences Table (Galezie - roznice)
// =============================================================================

interface BranchDifferencesTableProps {
  rows: PowerFlowBranchDiffRow[];
  filter: string;
}

function BranchDifferencesTable({ rows, filter }: BranchDifferencesTableProps) {
  const filtered = useMemo(() => {
    if (!filter) return rows;
    const lowerFilter = filter.toLowerCase();
    return rows.filter((row) =>
      row.branch_id.toLowerCase().includes(lowerFilter)
    );
  }, [rows, filter]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak roznic galezi do wyswietlenia." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              ID galezi
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Straty P [MW] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Straty P [MW] — B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              ΔStraty P [MW]
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              P_from [MW] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              P_from [MW] — B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              ΔP_from [MW]
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => (
            <tr
              key={`${row.branch_id}-${idx}`}
              className="border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="px-3 py-2 font-medium text-slate-800">
                {row.branch_id}
              </td>
              <td className="px-3 py-2 text-right text-rose-600">
                {formatNumber(row.losses_p_mw_a, 3)}
              </td>
              <td className="px-3 py-2 text-right text-rose-600">
                {formatNumber(row.losses_p_mw_b, 3)}
              </td>
              <td className={`px-3 py-2 text-right ${getDeltaColor(row.delta_losses_p_mw, 0.001)}`}>
                {formatDelta(row.delta_losses_p_mw, 3)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(row.p_from_mw_a, 3)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(row.p_from_mw_b, 3)}
              </td>
              <td className={`px-3 py-2 text-right ${getDeltaColor(row.delta_p_from_mw, 0.01)}`}>
                {formatDelta(row.delta_p_from_mw, 3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-3 py-2 text-xs text-slate-500">
        Wyswietlono {filtered.length} z {rows.length} galezi
      </p>
    </div>
  );
}

// =============================================================================
// Ranking Table (Ranking problemow)
// =============================================================================

interface RankingTableProps {
  ranking: PowerFlowRankingIssue[];
  filter: string;
}

function RankingTable({ ranking, filter }: RankingTableProps) {
  const filtered = useMemo(() => {
    if (!filter) return ranking;
    const lowerFilter = filter.toLowerCase();
    return ranking.filter(
      (issue) =>
        issue.element_ref.toLowerCase().includes(lowerFilter) ||
        issue.description_pl.toLowerCase().includes(lowerFilter) ||
        issue.issue_code.toLowerCase().includes(lowerFilter)
    );
  }, [ranking, filter]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak problemow do wyswietlenia." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-center font-semibold text-slate-700">
              Priorytet
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Kod
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Element
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Opis
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((issue, idx) => {
            const severity = issue.severity as IssueSeverity;
            return (
              <tr
                key={`${issue.issue_code}-${issue.element_ref}-${idx}`}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[severity]}`}
                  >
                    {SEVERITY_LABELS[severity]}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {ISSUE_CODE_LABELS[issue.issue_code] || issue.issue_code}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {issue.element_ref}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {issue.description_pl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-3 py-2 text-xs text-slate-500">
        Wyswietlono {filtered.length} z {ranking.length} problemow
      </p>
    </div>
  );
}

// =============================================================================
// Trace Panel (Slad porownania)
// =============================================================================

interface TracePanelProps {
  trace: PowerFlowComparisonTrace | null;
  isLoading: boolean;
  onLoad: () => void;
}

function TracePanel({ trace, isLoading, onLoad }: TracePanelProps) {
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <p className="mb-4 text-slate-500">
          Slad porownania nie zostal jeszcze zaladowany.
        </p>
        <button
          type="button"
          onClick={onLoad}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Zaladuj slad
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Metadane</h4>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">ID porownania</dt>
            <dd className="font-mono text-slate-800">{trace.comparison_id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Data utworzenia</dt>
            <dd className="text-slate-800">
              {new Date(trace.created_at).toLocaleString('pl-PL')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Input hash A</dt>
            <dd className="font-mono text-xs text-slate-800">
              {truncateId(trace.input_hash_a, 16)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Input hash B</dt>
            <dd className="font-mono text-xs text-slate-800">
              {truncateId(trace.input_hash_b, 16)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Thresholds */}
      <div className="rounded border border-slate-200 bg-slate-50 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">
          Progi rankingowe (jawne)
        </h4>
        <dl className="grid gap-2 text-sm md:grid-cols-3">
          {Object.entries(trace.ranking_thresholds).map(([key, value]) => (
            <div key={key}>
              <dt className="text-slate-500">{key}</dt>
              <dd className="font-mono text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Steps */}
      <div className="rounded border border-slate-200">
        <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          Kroki porownania
        </h4>
        <div className="divide-y divide-slate-100">
          {trace.steps.map((step, idx) => (
            <div key={`${step.step}-${idx}`} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                  {idx + 1}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-800">
                  {step.step}
                </span>
              </div>
              <p className="mb-2 text-sm text-slate-600">{step.description_pl}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-500">
                    Wejscia
                  </p>
                  <pre className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {JSON.stringify(step.inputs, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-500">
                    Wyjscia
                  </p>
                  <pre className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {JSON.stringify(step.outputs, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Summary Panel
// =============================================================================

interface SummaryPanelProps {
  summary: PowerFlowComparisonResult['summary'];
}

function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="rounded border border-slate-200 bg-white p-4 text-center">
        <p className="text-2xl font-bold text-slate-800">{summary.total_buses}</p>
        <p className="text-xs text-slate-500">Szyn</p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-4 text-center">
        <p className="text-2xl font-bold text-slate-800">{summary.total_branches}</p>
        <p className="text-xs text-slate-500">Galezi</p>
      </div>
      <div className={`rounded border p-4 text-center ${
        summary.converged_a && summary.converged_b
          ? 'border-green-200 bg-green-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <p className={`text-lg font-bold ${
          summary.converged_a && summary.converged_b ? 'text-green-700' : 'text-amber-700'
        }`}>
          {summary.converged_a ? 'OK' : 'X'} / {summary.converged_b ? 'OK' : 'X'}
        </p>
        <p className={`text-xs ${
          summary.converged_a && summary.converged_b ? 'text-green-600' : 'text-amber-600'
        }`}>
          Zbieznosc A/B
        </p>
      </div>
      <div className={`rounded border p-4 text-center ${
        summary.delta_total_losses_p_mw > 0.01
          ? 'border-rose-200 bg-rose-50'
          : summary.delta_total_losses_p_mw < -0.01
          ? 'border-green-200 bg-green-50'
          : 'border-slate-200 bg-slate-50'
      }`}>
        <p className={`text-lg font-bold ${getDeltaColor(summary.delta_total_losses_p_mw, 0.01)}`}>
          {formatDelta(summary.delta_total_losses_p_mw, 3)} MW
        </p>
        <p className="text-xs text-slate-500">ΔStraty calkowite</p>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-2xl font-bold text-slate-700">{summary.total_issues}</p>
        <p className="text-xs text-slate-500">Problemow</p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Power Flow Comparison Page
// =============================================================================

const TABS: { id: PowerFlowComparisonTab; label: string }[] = [
  { id: 'BUSES', label: COMPARISON_TAB_LABELS.BUSES },
  { id: 'BRANCHES', label: COMPARISON_TAB_LABELS.BRANCHES },
  { id: 'RANKING', label: COMPARISON_TAB_LABELS.RANKING },
  { id: 'TRACE', label: COMPARISON_TAB_LABELS.TRACE },
];

interface PowerFlowComparisonPageProps {
  powerFlowRuns: PowerFlowRunItem[];
  onClose?: () => void;
}

export function PowerFlowComparisonPage({
  powerFlowRuns,
  onClose,
}: PowerFlowComparisonPageProps) {
  const [runAId, setRunAId] = useState<string | null>(null);
  const [runBId, setRunBId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<PowerFlowComparisonResult | null>(
    null
  );
  const [trace, setTrace] = useState<PowerFlowComparisonTrace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<PowerFlowComparisonTab>('BUSES');

  const handleCompare = useCallback(async () => {
    if (!runAId || !runBId) {
      setError('Wybierz oba uruchomienia (A i B), aby wykonac porownanie.');
      return;
    }

    if (runAId === runBId) {
      setError('Obliczenia A i obliczenia B muszą być różne.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setComparison(null);
    setTrace(null);

    try {
      const result = await createPowerFlowComparison(runAId, runBId);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany blad');
    } finally {
      setIsLoading(false);
    }
  }, [runAId, runBId]);

  const handleLoadTrace = useCallback(async () => {
    if (!comparison) return;

    setIsTraceLoading(true);
    try {
      const traceData = await getPowerFlowComparisonTrace(comparison.comparison_id);
      setTrace(traceData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Blad ladowania sladu porownania'
      );
    } finally {
      setIsTraceLoading(false);
    }
  }, [comparison]);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                P20c — Porownanie rozplywu mocy
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Porownanie analiz rozplywu mocy
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {comparison && (
                <ComparisonExportButton comparisonId={comparison.comparison_id} />
              )}
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Tylko do odczytu
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Zamknij porownanie"
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
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Run Selectors */}
        <div className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Wybierz uruchomienia do porownania
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <RunSelector
              label="Obliczenia A (wzorzec)"
              runs={powerFlowRuns}
              selectedRunId={runAId}
              onChange={setRunAId}
            />
            <RunSelector
              label="Obliczenia B (porównanie)"
              runs={powerFlowRuns}
              selectedRunId={runBId}
              onChange={setRunBId}
            />
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={handleCompare}
              disabled={!runAId || !runBId || isLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isLoading ? 'Porownuje...' : 'Porownaj'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <p className="font-semibold">Blad</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingSpinner />}

        {/* Comparison Results */}
        {comparison && !isLoading && (
          <div className="mt-6 space-y-6">
            {/* Summary */}
            <SummaryPanel summary={comparison.summary} />

            {/* Filter */}
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Filtruj..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === tab.id
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="rounded border border-slate-200 bg-white p-4">
              {activeTab === 'BUSES' && (
                <BusDifferencesTable
                  rows={comparison.bus_diffs}
                  filter={filter}
                />
              )}
              {activeTab === 'BRANCHES' && (
                <BranchDifferencesTable
                  rows={comparison.branch_diffs}
                  filter={filter}
                />
              )}
              {activeTab === 'RANKING' && (
                <RankingTable ranking={comparison.ranking} filter={filter} />
              )}
              {activeTab === 'TRACE' && (
                <TracePanel
                  trace={trace}
                  isLoading={isTraceLoading}
                  onLoad={handleLoadTrace}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PowerFlowComparisonPage;
