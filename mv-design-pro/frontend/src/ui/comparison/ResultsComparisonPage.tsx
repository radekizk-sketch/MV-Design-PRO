/**
 * P11c — Results Comparison Page (A/B Compare)
 *
 * CANONICAL ALIGNMENT:
 * - CASE_COMPARISON_UI_CONTRACT.md: Case A vs B comparison UI
 * - RESULTS_BROWSER_CONTRACT.md: Run selection and filtering
 * - ui_canonical_parity.md: Deterministic tables, Polish labels
 * - AGENTS.md: NOT-A-SOLVER, no physics in UI
 *
 * FEATURES:
 * - Run A/B selector
 * - Validation: same project, same analysis type
 * - Comparison tables: Szyny (buses), Gałęzie (branches), Zwarcia (SC)
 * - Delta columns: value_a, value_b, delta, delta_%
 * - Status change: IMPROVED, REGRESSED, NO_CHANGE
 * - 100% POLISH UI, READ-ONLY
 */

import { useState, useMemo, useCallback } from 'react';
import { compareRuns } from './api';
import type {
  RunComparisonResult,
  RunHistoryItem,
  NodeVoltageComparison,
  BranchPowerComparison,
  NumericDelta,
  ComparisonStatusChange,
} from './types';
import {
  COMPARISON_STATUS_LABELS,
  COMPARISON_STATUS_COLORS,
} from './types';

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

function getStatusChange(delta: NumericDelta): ComparisonStatusChange {
  if (delta.sign === 0) return 'NO_CHANGE';

  // Simple heuristic: negative delta is improvement for most metrics
  // (except losses, which should be positive)
  // For now, we'll use generic classification:
  // - Positive delta with small magnitude (<1%) = NO_CHANGE
  // - Negative delta = IMPROVED (lower is better for most metrics)
  // - Positive delta = REGRESSED (higher is worse)

  if (delta.percent !== null && Math.abs(delta.percent) < 1.0) {
    return 'NO_CHANGE';
  }

  return delta.sign < 0 ? 'IMPROVED' : 'REGRESSED';
}

// =============================================================================
// Sub-Components
// =============================================================================

interface RunSelectorProps {
  label: string;
  runs: RunHistoryItem[];
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
        <option value="">— Wybierz obliczenie —</option>
        {runs.map((run) => {
          const date = new Date(run.created_at).toLocaleString('pl-PL');
          const solverLabel = run.solver_kind === 'PF' ? 'Rozpływ' : run.solver_kind === 'short_circuit_sn' ? 'Zwarcie' : run.solver_kind;
          return (
            <option key={run.run_id} value={run.run_id}>
              {solverLabel} [{run.case_name}] — {date}
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
      <span className="ml-3 text-slate-600">Ładowanie porównania...</span>
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
// Bus Comparison Table (Szyny — różnice)
// =============================================================================

interface BusComparisonTableProps {
  comparisons: NodeVoltageComparison[];
  showOnlyChanges: boolean;
}

function BusComparisonTable({ comparisons, showOnlyChanges }: BusComparisonTableProps) {
  const filtered = useMemo(() => {
    if (!showOnlyChanges) return comparisons;
    return comparisons.filter((c) => c.u_pu_delta.sign !== 0);
  }, [comparisons, showOnlyChanges]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak różnic w napięciach węzłowych." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">ID węzła</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">U [kV] — A</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">U [kV] — B</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔU [kV]</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔU [%]</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">U [pu] — A</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">U [pu] — B</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔU [pu]</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((comp) => {
            const status = getStatusChange(comp.u_pu_delta);
            return (
              <tr key={comp.bus_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">
                  {comp.bus_id.substring(0, 8)}...
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(comp.u_kv_delta.value_a)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(comp.u_kv_delta.value_b)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">
                  {formatNumber(comp.u_kv_delta.delta)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {comp.u_kv_delta.percent !== null ? formatNumber(comp.u_kv_delta.percent, 2) : '—'}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(comp.u_pu_delta.value_a, 4)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(comp.u_pu_delta.value_b, 4)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">
                  {formatNumber(comp.u_pu_delta.delta, 4)}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${COMPARISON_STATUS_COLORS[status]}`}>
                    {COMPARISON_STATUS_LABELS[status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-3 text-xs text-slate-500">
        Wyświetlono {filtered.length} z {comparisons.length} węzłów
      </p>
    </div>
  );
}

// =============================================================================
// Branch Comparison Table (Gałęzie — różnice)
// =============================================================================

interface BranchComparisonTableProps {
  comparisons: BranchPowerComparison[];
  showOnlyChanges: boolean;
}

function BranchComparisonTable({ comparisons, showOnlyChanges }: BranchComparisonTableProps) {
  const filtered = useMemo(() => {
    if (!showOnlyChanges) return comparisons;
    return comparisons.filter((c) => c.p_mw_delta.sign !== 0 || c.q_mvar_delta.sign !== 0);
  }, [comparisons, showOnlyChanges]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak różnic w przepływach mocy gałęziowych." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">ID gałęzi</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">P [MW] — A</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">P [MW] — B</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔP [MW]</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔP [%]</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">Q [Mvar] — A</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">Q [Mvar] — B</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔQ [Mvar]</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">ΔQ [%]</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((comp) => (
            <tr key={comp.branch_id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-800">
                {comp.branch_id.substring(0, 8)}...
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(comp.p_mw_delta.value_a)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(comp.p_mw_delta.value_b)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">
                {formatNumber(comp.p_mw_delta.delta)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {comp.p_mw_delta.percent !== null ? formatNumber(comp.p_mw_delta.percent, 2) : '—'}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(comp.q_mvar_delta.value_a)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {formatNumber(comp.q_mvar_delta.value_b)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">
                {formatNumber(comp.q_mvar_delta.delta)}
              </td>
              <td className="px-3 py-2 text-right text-slate-600">
                {comp.q_mvar_delta.percent !== null ? formatNumber(comp.q_mvar_delta.percent, 2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-3 text-xs text-slate-500">
        Wyświetlono {filtered.length} z {comparisons.length} gałęzi
      </p>
    </div>
  );
}

// =============================================================================
// Main Results Comparison Page
// =============================================================================

interface ResultsComparisonPageProps {
  runHistory: RunHistoryItem[];
  onClose?: () => void;
}

export function ResultsComparisonPage({ runHistory, onClose }: ResultsComparisonPageProps) {
  const [runAId, setRunAId] = useState<string | null>(null);
  const [runBId, setRunBId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<RunComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'BUSES' | 'BRANCHES'>('BUSES');

  const handleCompare = useCallback(async () => {
    if (!runAId || !runBId) {
      setError('Wybierz oba uruchomienia (A i B), aby wykonac porownanie.');
      return;
    }

    if (runAId === runBId) {
      setError('Uruchomienie A i uruchomienie B musza byc rozne.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setComparison(null);

    try {
      const result = await compareRuns(runAId, runBId);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setIsLoading(false);
    }
  }, [runAId, runBId]);

  const isPowerFlow = comparison?.power_flow !== null && comparison?.power_flow !== undefined;
  const isShortCircuit = comparison?.short_circuit !== null && comparison?.short_circuit !== undefined;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Porównanie wyników
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">Porównanie A/B</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Tylko do odczytu
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Zamknij porównanie"
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
        {/* Run Selectors */}
        <div className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Wybierz uruchomienia do porownania</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <RunSelector
              label="Uruchomienie A (wzorzec)"
              runs={runHistory}
              selectedRunId={runAId}
              onChange={setRunAId}
            />
            <RunSelector
              label="Uruchomienie B (porownanie)"
              runs={runHistory}
              selectedRunId={runBId}
              onChange={setRunBId}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleCompare}
              disabled={!runAId || !runBId || isLoading}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Porównuję...' : 'Porównaj'}
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showOnlyChanges}
                onChange={(e) => setShowOnlyChanges(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Pokaż tylko różnice
            </label>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <p className="font-semibold">Błąd</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingSpinner />}

        {/* Comparison Results */}
        {comparison && !isLoading && (
          <div className="mt-6">
            {/* Tabs */}
            {isPowerFlow && (
              <>
                <div className="flex gap-2 border-b border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('BUSES')}
                    className={`px-4 py-2 text-sm font-medium ${
                      activeTab === 'BUSES'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Szyny — różnice
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BRANCHES')}
                    className={`px-4 py-2 text-sm font-medium ${
                      activeTab === 'BRANCHES'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Gałęzie — różnice
                  </button>
                </div>

                {/* Tab Content */}
                <div className="mt-6 rounded border border-slate-200 bg-white p-4">
                  {activeTab === 'BUSES' && (
                    <BusComparisonTable
                      comparisons={comparison.power_flow?.bus_voltages || []}
                      showOnlyChanges={showOnlyChanges}
                    />
                  )}
                  {activeTab === 'BRANCHES' && (
                    <BranchComparisonTable
                      comparisons={comparison.power_flow?.branch_powers || []}
                      showOnlyChanges={showOnlyChanges}
                    />
                  )}
                </div>
              </>
            )}

            {/* Short Circuit Comparison (simplified - just show deltas) */}
            {isShortCircuit && comparison.short_circuit && (
              <div className="mt-6 rounded border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-lg font-semibold text-slate-900">Zwarcia — różnice</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-slate-700">ΔIk'' [kA]</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {formatNumber(comparison.short_circuit.ikss_delta.delta, 3)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">ΔSk'' [MVA]</p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {formatNumber(comparison.short_circuit.sk_delta.delta, 1)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
