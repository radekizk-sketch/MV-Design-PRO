/**
 * FIX-03 — Results Comparison Component
 *
 * CANONICAL ALIGNMENT:
 * - compare/types.ts: Comparison patterns
 * - ui_canonical_parity.md: Case comparison like Canonical
 * - 100% Polish UI
 *
 * FEATURES:
 * - Run A vs Run B comparison
 * - Delta calculation (Δ values)
 * - Status highlighting (changed/added/removed)
 * - Show only changes filter
 */

import { useState, useMemo, useEffect } from 'react';
import type {
  RunHeaderCompare,
  BusVoltageRow,
  BranchFlowRow,
  ComparisonStatus,
} from './types';
import {
  RESULTS_BROWSER_LABELS,
  COMPARISON_STATUS_LABELS,
  COMPARISON_STATUS_COLORS,
} from './types';
import { fetchBusVoltages, fetchBranchFlows } from './api';

// =============================================================================
// Types
// =============================================================================

interface ResultsComparisonProps {
  /** Available runs for comparison */
  availableRuns: RunHeaderCompare[];
  /** Pre-selected run IDs */
  selectedRunIds: string[];
  /** Close handler */
  onClose: () => void;
}

interface BusComparisonRow {
  bus_id: string;
  bus_name: string;
  voltage_pu_a: number | null;
  voltage_pu_b: number | null;
  delta_voltage_pu: number | null;
  angle_deg_a: number | null;
  angle_deg_b: number | null;
  delta_angle_deg: number | null;
  status: ComparisonStatus;
}

interface BranchComparisonRow {
  branch_id: string;
  branch_name: string;
  loading_pct_a: number | null;
  loading_pct_b: number | null;
  delta_loading_pct: number | null;
  current_ka_a: number | null;
  current_ka_b: number | null;
  delta_current_ka: number | null;
  status: ComparisonStatus;
}

// =============================================================================
// Helper Functions
// =============================================================================

function computeBusComparisons(
  busesA: BusVoltageRow[],
  busesB: BusVoltageRow[]
): BusComparisonRow[] {
  const mapA = new Map(busesA.map((b) => [b.bus_id, b]));
  const mapB = new Map(busesB.map((b) => [b.bus_id, b]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const rows: BusComparisonRow[] = [];

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);

    let status: ComparisonStatus;
    if (!a) {
      status = 'ONLY_IN_B';
    } else if (!b) {
      status = 'ONLY_IN_A';
    } else {
      // Check if values changed (using small tolerance)
      const voltageChanged = Math.abs((a.voltage_pu ?? 0) - (b.voltage_pu ?? 0)) > 0.0001;
      const angleChanged = Math.abs((a.angle_deg ?? 0) - (b.angle_deg ?? 0)) > 0.01;
      status = voltageChanged || angleChanged ? 'CHANGED' : 'IDENTICAL';
    }

    rows.push({
      bus_id: id,
      bus_name: a?.bus_name ?? b?.bus_name ?? id,
      voltage_pu_a: a?.voltage_pu ?? null,
      voltage_pu_b: b?.voltage_pu ?? null,
      delta_voltage_pu:
        a && b ? (b.voltage_pu ?? 0) - (a.voltage_pu ?? 0) : null,
      angle_deg_a: a?.angle_deg ?? null,
      angle_deg_b: b?.angle_deg ?? null,
      delta_angle_deg:
        a && b ? (b.angle_deg ?? 0) - (a.angle_deg ?? 0) : null,
      status,
    });
  }

  // Sort: ONLY_IN_A, ONLY_IN_B, CHANGED, IDENTICAL
  const statusOrder: Record<ComparisonStatus, number> = {
    ONLY_IN_A: 0,
    ONLY_IN_B: 1,
    CHANGED: 2,
    IDENTICAL: 3,
  };

  return rows.sort((a, b) => {
    const statusCmp = statusOrder[a.status] - statusOrder[b.status];
    if (statusCmp !== 0) return statusCmp;
    return a.bus_id.localeCompare(b.bus_id);
  });
}

function computeBranchComparisons(
  branchesA: BranchFlowRow[],
  branchesB: BranchFlowRow[]
): BranchComparisonRow[] {
  const mapA = new Map(branchesA.map((b) => [b.branch_id, b]));
  const mapB = new Map(branchesB.map((b) => [b.branch_id, b]));
  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  const rows: BranchComparisonRow[] = [];

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);

    let status: ComparisonStatus;
    if (!a) {
      status = 'ONLY_IN_B';
    } else if (!b) {
      status = 'ONLY_IN_A';
    } else {
      const loadingChanged = Math.abs((a.loading_pct ?? 0) - (b.loading_pct ?? 0)) > 0.1;
      const currentChanged = Math.abs((a.current_ka ?? 0) - (b.current_ka ?? 0)) > 0.001;
      status = loadingChanged || currentChanged ? 'CHANGED' : 'IDENTICAL';
    }

    rows.push({
      branch_id: id,
      branch_name: a?.branch_name ?? b?.branch_name ?? id,
      loading_pct_a: a?.loading_pct ?? null,
      loading_pct_b: b?.loading_pct ?? null,
      delta_loading_pct:
        a && b ? (b.loading_pct ?? 0) - (a.loading_pct ?? 0) : null,
      current_ka_a: a?.current_ka ?? null,
      current_ka_b: b?.current_ka ?? null,
      delta_current_ka:
        a && b ? (b.current_ka ?? 0) - (a.current_ka ?? 0) : null,
      status,
    });
  }

  const statusOrder: Record<ComparisonStatus, number> = {
    ONLY_IN_A: 0,
    ONLY_IN_B: 1,
    CHANGED: 2,
    IDENTICAL: 3,
  };

  return rows.sort((a, b) => {
    const statusCmp = statusOrder[a.status] - statusOrder[b.status];
    if (statusCmp !== 0) return statusCmp;
    return a.branch_id.localeCompare(b.branch_id);
  });
}

function formatNumber(value: number | null, decimals = 4): string {
  if (value === null) return '—';
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDelta(value: number | null, decimals = 4): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return prefix + formatNumber(value, decimals);
}

// =============================================================================
// Sub-Components
// =============================================================================

interface RunSelectorProps {
  label: string;
  runs: RunHeaderCompare[];
  selectedRunId: string | null;
  onChange: (runId: string) => void;
  excludeRunId?: string | null;
}

function RunSelector({
  label,
  runs,
  selectedRunId,
  onChange,
  excludeRunId,
}: RunSelectorProps) {
  const availableRuns = excludeRunId
    ? runs.filter((r) => r.run_id !== excludeRunId)
    : runs;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <select
        value={selectedRunId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <option value="">Wybierz obliczenie...</option>
        {availableRuns.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.case_name ?? run.case_id.substring(0, 8)} — {new Date(run.created_at).toLocaleDateString('pl-PL')}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusBadge({ status }: { status: ComparisonStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COMPARISON_STATUS_COLORS[status]}`}
    >
      {COMPARISON_STATUS_LABELS[status]}
    </span>
  );
}

interface ComparisonSummaryProps {
  total: number;
  changed: number;
  onlyInA: number;
  onlyInB: number;
}

function ComparisonSummary({ total, changed, onlyInA, onlyInB }: ComparisonSummaryProps) {
  const identical = total - changed - onlyInA - onlyInB;

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-slate-500">Razem: {total}</span>
      <span className="text-emerald-600">Bez zmian: {identical}</span>
      <span className="text-amber-600">Zmienione: {changed}</span>
      {onlyInA > 0 && <span className="text-red-600">Tylko w A: {onlyInA}</span>}
      {onlyInB > 0 && <span className="text-green-600">Tylko w B: {onlyInB}</span>}
    </div>
  );
}

// =============================================================================
// Comparison Tab
// =============================================================================

type ComparisonTab = 'BUSES' | 'BRANCHES';

const COMPARISON_TAB_LABELS: Record<ComparisonTab, string> = {
  BUSES: 'Napięcia węzłowe',
  BRANCHES: 'Przepływy gałęziowe',
};

// =============================================================================
// Main Component
// =============================================================================

export function ResultsComparison({
  availableRuns,
  selectedRunIds,
  onClose,
}: ResultsComparisonProps) {
  // State
  const [runAId, setRunAId] = useState<string | null>(selectedRunIds[0] ?? null);
  const [runBId, setRunBId] = useState<string | null>(selectedRunIds[1] ?? null);
  const [activeTab, setActiveTab] = useState<ComparisonTab>('BUSES');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comparison data
  const [busComparisons, setBusComparisons] = useState<BusComparisonRow[]>([]);
  const [branchComparisons, setBranchComparisons] = useState<BranchComparisonRow[]>([]);

  // Load comparison data when runs are selected
  useEffect(() => {
    if (!runAId || !runBId) return;

    const loadComparison = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [busesA, busesB, branchesA, branchesB] = await Promise.all([
          fetchBusVoltages(runAId),
          fetchBusVoltages(runBId),
          fetchBranchFlows(runAId),
          fetchBranchFlows(runBId),
        ]);

        setBusComparisons(computeBusComparisons(busesA, busesB));
        setBranchComparisons(computeBranchComparisons(branchesA, branchesB));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Błąd wczytywania danych do porównania');
      } finally {
        setIsLoading(false);
      }
    };

    loadComparison();
  }, [runAId, runBId]);

  // Filtered data
  const filteredBusComparisons = useMemo(() => {
    if (!showOnlyChanges) return busComparisons;
    return busComparisons.filter((row) => row.status !== 'IDENTICAL');
  }, [busComparisons, showOnlyChanges]);

  const filteredBranchComparisons = useMemo(() => {
    if (!showOnlyChanges) return branchComparisons;
    return branchComparisons.filter((row) => row.status !== 'IDENTICAL');
  }, [branchComparisons, showOnlyChanges]);

  // Summary stats
  const busSummary = useMemo(() => ({
    total: busComparisons.length,
    changed: busComparisons.filter((r) => r.status === 'CHANGED').length,
    onlyInA: busComparisons.filter((r) => r.status === 'ONLY_IN_A').length,
    onlyInB: busComparisons.filter((r) => r.status === 'ONLY_IN_B').length,
  }), [busComparisons]);

  const branchSummary = useMemo(() => ({
    total: branchComparisons.length,
    changed: branchComparisons.filter((r) => r.status === 'CHANGED').length,
    onlyInA: branchComparisons.filter((r) => r.status === 'ONLY_IN_A').length,
    onlyInB: branchComparisons.filter((r) => r.status === 'ONLY_IN_B').length,
  }), [branchComparisons]);

  const currentSummary = activeTab === 'BUSES' ? busSummary : branchSummary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="results-comparison-modal">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {RESULTS_BROWSER_LABELS.comparison.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Zamknij"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Run selectors */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="grid grid-cols-2 gap-6">
            <RunSelector
              label={RESULTS_BROWSER_LABELS.comparison.run_a}
              runs={availableRuns}
              selectedRunId={runAId}
              onChange={setRunAId}
              excludeRunId={runBId}
            />
            <RunSelector
              label={RESULTS_BROWSER_LABELS.comparison.run_b}
              runs={availableRuns}
              selectedRunId={runBId}
              onChange={setRunBId}
              excludeRunId={runAId}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col overflow-hidden" style={{ height: 'calc(90vh - 200px)' }}>
          {/* Tabs and options */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
            <div className="flex gap-2">
              {(['BUSES', 'BRANCHES'] as ComparisonTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    activeTab === tab
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {COMPARISON_TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <ComparisonSummary {...currentSummary} />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyChanges}
                  onChange={(e) => setShowOnlyChanges(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                {RESULTS_BROWSER_LABELS.comparison.show_only_changes}
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
                <span className="ml-3 text-slate-600">Ładowanie...</span>
              </div>
            ) : error ? (
              <div className="rounded border border-rose-200 bg-rose-50 p-4 text-rose-700">
                {error}
              </div>
            ) : !runAId || !runBId ? (
              <div className="py-12 text-center text-slate-500">
                {RESULTS_BROWSER_LABELS.messages.select_runs_to_compare}
              </div>
            ) : activeTab === 'BUSES' ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Węzeł</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">U [p.u.] — A</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">U [p.u.] — B</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔU [p.u.]</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">δ [°] — A</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">δ [°] — B</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Δδ [°]</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBusComparisons.map((row) => (
                    <tr
                      key={row.bus_id}
                      className={`border-t border-slate-100 ${COMPARISON_STATUS_COLORS[row.status]}`}
                    >
                      <td className="px-3 py-2 font-medium">{row.bus_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.voltage_pu_a)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.voltage_pu_b)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatDelta(row.delta_voltage_pu)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.angle_deg_a, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.angle_deg_b, 2)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatDelta(row.delta_angle_deg, 2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Gałąź</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Obc. [%] — A</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Obc. [%] — B</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔObc. [%]</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">I [kA] — A</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">I [kA] — B</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔI [kA]</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBranchComparisons.map((row) => (
                    <tr
                      key={row.branch_id}
                      className={`border-t border-slate-100 ${COMPARISON_STATUS_COLORS[row.status]}`}
                    >
                      <td className="px-3 py-2 font-medium">{row.branch_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.loading_pct_a, 1)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.loading_pct_b, 1)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatDelta(row.delta_loading_pct, 1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.current_ka_a)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(row.current_ka_b)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatDelta(row.delta_current_ka)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
