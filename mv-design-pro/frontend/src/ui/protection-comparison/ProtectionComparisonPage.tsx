/**
 * P15b — Protection Comparison Page (Porównanie zabezpieczeń)
 *
 * CANONICAL ALIGNMENT:
 * - P15b: Protection Selectivity Comparison (A/B)
 * - AGENTS.md: NOT-A-SOLVER, no physics in UI
 * - 100% POLISH UI, READ-ONLY
 *
 * FEATURES:
 * - Run A/B selector (protection runs)
 * - "Porównaj" button
 * - Tabs: Różnice, Ranking problemów, Ślad porównania
 * - Text filtering
 * - Default sort = backend (deterministic)
 * - No settings editing (read-only)
 */

import { useState, useMemo, useCallback } from 'react';
import {
  createProtectionComparison,
  getProtectionComparisonTrace,
} from './api';
import type {
  ProtectionComparisonResult,
  ProtectionComparisonTrace,
  ProtectionComparisonRow,
  RankingIssue,
  ProtectionRunItem,
  ProtectionStateChange,
  IssueSeverity,
} from './types';
import {
  STATE_CHANGE_LABELS,
  STATE_CHANGE_COLORS,
  SEVERITY_LABELS,
  SEVERITY_COLORS,
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

function formatTime(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  // Format as milliseconds if < 1s, otherwise seconds
  if (Math.abs(value) < 1) {
    return `${(value * 1000).toFixed(1)} ms`;
  }
  return `${value.toFixed(3)} s`;
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
  runs: ProtectionRunItem[];
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
          return (
            <option key={run.run_id} value={run.run_id}>
              Zabezpieczenia [{truncateId(run.protection_case_id)}] — {date}
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
      <span className="ml-3 text-slate-600">Porównuję...</span>
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
// Differences Table (Różnice)
// =============================================================================

interface DifferencesTableProps {
  rows: ProtectionComparisonRow[];
  filter: string;
  showOnlyChanges: boolean;
}

function DifferencesTable({ rows, filter, showOnlyChanges }: DifferencesTableProps) {
  const filtered = useMemo(() => {
    let result = rows;

    // Filter by text
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(
        (row) =>
          row.protected_element_ref.toLowerCase().includes(lowerFilter) ||
          row.fault_target_id.toLowerCase().includes(lowerFilter) ||
          row.device_id_a.toLowerCase().includes(lowerFilter) ||
          row.device_id_b.toLowerCase().includes(lowerFilter)
      );
    }

    // Filter only changes
    if (showOnlyChanges) {
      result = result.filter((row) => row.state_change !== 'NO_CHANGE');
    }

    return result;
  }, [rows, filter, showOnlyChanges]);

  if (filtered.length === 0) {
    return <EmptyState message="Brak różnic do wyświetlenia." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Element chroniony
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Punkt zwarcia
            </th>
            <th className="px-3 py-2 text-center font-semibold text-slate-700">
              Stan A
            </th>
            <th className="px-3 py-2 text-center font-semibold text-slate-700">
              Stan B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              t [s] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              t [s] — B
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              Δt
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              I [A] — A
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-700">
              I [A] — B
            </th>
            <th className="px-3 py-2 text-left font-semibold text-slate-700">
              Zmiana
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row, idx) => {
            const stateChange = row.state_change as ProtectionStateChange;
            return (
              <tr
                key={`${row.protected_element_ref}-${row.fault_target_id}-${idx}`}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-3 py-2 font-medium text-slate-800">
                  {truncateId(row.protected_element_ref)}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {truncateId(row.fault_target_id)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.trip_state_a === 'TRIPS'
                        ? 'bg-green-100 text-green-700'
                        : row.trip_state_a === 'NO_TRIP'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {row.trip_state_a}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.trip_state_b === 'TRIPS'
                        ? 'bg-green-100 text-green-700'
                        : row.trip_state_b === 'NO_TRIP'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {row.trip_state_b}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatTime(row.t_trip_s_a)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatTime(row.t_trip_s_b)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">
                  {formatTime(row.delta_t_s)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.i_fault_a_a, 0)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatNumber(row.i_fault_a_b, 0)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${STATE_CHANGE_COLORS[stateChange]}`}
                  >
                    {STATE_CHANGE_LABELS[stateChange]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-3 py-2 text-xs text-slate-500">
        Wyświetlono {filtered.length} z {rows.length} wierszy
      </p>
    </div>
  );
}

// =============================================================================
// Ranking Table (Ranking problemów)
// =============================================================================

interface RankingTableProps {
  ranking: RankingIssue[];
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
    return <EmptyState message="Kontrola zabezpieczeń nie wskazuje zagadnień technicznych." />;
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
              Punkt zwarcia
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
                  {issue.issue_code}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {truncateId(issue.element_ref)}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {truncateId(issue.fault_target_id)}
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
        Wyświetlono {filtered.length} z {ranking.length} problemów
      </p>
    </div>
  );
}

// =============================================================================
// Trace Panel (Ślad porównania)
// =============================================================================

interface TracePanelProps {
  trace: ProtectionComparisonTrace | null;
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
          Ślad porównania nie został jeszcze załadowany.
        </p>
        <button
          type="button"
          onClick={onLoad}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Załaduj ślad
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
            <dt className="text-slate-500">ID porównania</dt>
            <dd className="font-mono text-slate-800">{trace.comparison_id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Data utworzenia</dt>
            <dd className="text-slate-800">
              {new Date(trace.created_at).toLocaleString('pl-PL')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Fingerprint biblioteki A</dt>
            <dd className="font-mono text-xs text-slate-800">
              {trace.library_fingerprint_a || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Fingerprint biblioteki B</dt>
            <dd className="font-mono text-xs text-slate-800">
              {trace.library_fingerprint_b || '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Steps */}
      <div className="rounded border border-slate-200">
        <h4 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
          Kroki porównania
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
                    Wejścia
                  </p>
                  <pre className="rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {JSON.stringify(step.inputs, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-500">
                    Wyjścia
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
  summary: ProtectionComparisonResult['summary'];
}

function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <div className="rounded border border-slate-200 bg-white p-4 text-center">
        <p className="text-2xl font-bold text-slate-800">{summary.total_rows}</p>
        <p className="text-xs text-slate-500">Porównań</p>
      </div>
      <div className="rounded border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-2xl font-bold text-red-700">
          {summary.trip_to_no_trip_count}
        </p>
        <p className="text-xs text-red-600">Utrata zadziałania</p>
      </div>
      <div className="rounded border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-2xl font-bold text-green-700">
          {summary.no_trip_to_trip_count}
        </p>
        <p className="text-xs text-green-600">Nowe zadziałania</p>
      </div>
      <div className="rounded border border-amber-200 bg-amber-50 p-4 text-center">
        <p className="text-2xl font-bold text-amber-700">
          {summary.invalid_change_count}
        </p>
        <p className="text-xs text-amber-600">Nieprawidłowe</p>
      </div>
      <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-2xl font-bold text-slate-700">
          {summary.no_change_count}
        </p>
        <p className="text-xs text-slate-500">Bez zmian</p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Protection Comparison Page
// =============================================================================

type TabId = 'DIFFERENCES' | 'RANKING' | 'TRACE';

const TABS: { id: TabId; label: string }[] = [
  { id: 'DIFFERENCES', label: 'Różnice' },
  { id: 'RANKING', label: 'Ranking problemów' },
  { id: 'TRACE', label: 'Ślad porównania' },
];

interface ProtectionComparisonPageProps {
  protectionRuns: ProtectionRunItem[];
  onClose?: () => void;
}

export function ProtectionComparisonPage({
  protectionRuns,
  onClose,
}: ProtectionComparisonPageProps) {
  const [runAId, setRunAId] = useState<string | null>(null);
  const [runBId, setRunBId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ProtectionComparisonResult | null>(
    null
  );
  const [trace, setTrace] = useState<ProtectionComparisonTrace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTraceLoading, setIsTraceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('DIFFERENCES');

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
    setTrace(null);

    try {
      const result = await createProtectionComparison(runAId, runBId);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setIsLoading(false);
    }
  }, [runAId, runBId]);

  const handleLoadTrace = useCallback(async () => {
    if (!comparison) return;

    setIsTraceLoading(true);
    try {
      const traceData = await getProtectionComparisonTrace(comparison.comparison_id);
      setTrace(traceData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Błąd ładowania śladu porównania'
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
                P15b — Porównanie zabezpieczeń
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Porównanie analiz zabezpieczeń
              </h1>
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
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Run Selectors */}
        <div className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Wybierz uruchomienia do porownania
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <RunSelector
              label="Uruchomienie A (wzorzec)"
              runs={protectionRuns}
              selectedRunId={runAId}
              onChange={setRunAId}
            />
            <RunSelector
              label="Uruchomienie B (porownanie)"
              runs={protectionRuns}
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
              {isLoading ? 'Porównuję...' : 'Porównaj'}
            </button>
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
          <div className="mt-6 space-y-6">
            {/* Summary */}
            <SummaryPanel summary={comparison.summary} />

            {/* Filter and Options */}
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="text"
                placeholder="Filtruj..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded border border-slate-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showOnlyChanges}
                  onChange={(e) => setShowOnlyChanges(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Pokaż tylko zmiany
              </label>
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
              {activeTab === 'DIFFERENCES' && (
                <DifferencesTable
                  rows={comparison.rows}
                  filter={filter}
                  showOnlyChanges={showOnlyChanges}
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

export default ProtectionComparisonPage;
