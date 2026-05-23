/**
 * FIX-06 — Coordination Analysis Component
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: Analysis layer (interpretation only)
 * - 100% Polish UI labels
 *
 * FEATURES:
 * - Display coordination results between curves
 * - Show time margins
 * - Status indicators (coordinated, margin low, not coordinated)
 * - Recommendations in Polish
 */

import { useMemo } from 'react';

import type { CoordinationResult, ProtectionCurve, CoordinationStatus } from './types';
import { PROTECTION_CURVES_LABELS, COORDINATION_STATUS_COLORS } from './types';

// =============================================================================
// Types
// =============================================================================

interface CoordinationAnalysisProps {
  /** Coordination results from backend */
  results: CoordinationResult[];
  /** All curves (for name lookup) */
  curves: ProtectionCurve[];
  /** Loading state */
  loading?: boolean;
}

// =============================================================================
// Status Badge Component
// =============================================================================

interface StatusBadgeProps {
  status: CoordinationStatus;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const labels = PROTECTION_CURVES_LABELS.status;
  const colorClass = COORDINATION_STATUS_COLORS[status];

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {labels[status]}
    </span>
  );
}

// =============================================================================
// Coordination Row Component
// =============================================================================

interface CoordinationRowProps {
  result: CoordinationResult;
  upstreamName: string;
  downstreamName: string;
}

function CoordinationRow({ result, upstreamName, downstreamName }: CoordinationRowProps) {
  const labels = PROTECTION_CURVES_LABELS.coordination;

  const formatTime = (time: number) => {
    if (time >= 999) return '-';
    if (time >= 1) return `${time.toFixed(2)} s`;
    return `${(time * 1000).toFixed(0)} ms`;
  };

  const formatMargin = (margin: number) => {
    if (margin >= 999) return '-';
    if (margin >= 1) return `${margin.toFixed(2)} s`;
    return `${(margin * 1000).toFixed(0)} ms`;
  };

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{labels.downstream}:</span>
          <span className="font-medium text-slate-900">{downstreamName}</span>
          <svg
            className="h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
          <span className="text-sm text-slate-500">{labels.upstream}:</span>
          <span className="font-medium text-slate-900">{upstreamName}</span>
        </div>
        <StatusBadge status={result.status} />
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <span className="text-slate-500">{labels.margin}:</span>
          <span className={`ml-2 font-mono font-medium ${
            result.status === 'COORDINATED'
              ? 'text-emerald-600'
              : result.status === 'MARGIN_LOW'
              ? 'text-amber-600'
              : 'text-rose-600'
          }`}>
            {formatMargin(result.margin_s)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">{labels.minMargin}:</span>
          <span className="ml-2 font-mono text-slate-700">
            {formatMargin(result.min_required_margin_s)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">t<sub>down</sub>:</span>
          <span className="ml-2 font-mono text-slate-700">
            {formatTime(result.downstream_trip_time_s)}
          </span>
        </div>
        <div>
          <span className="text-slate-500">t<sub>up</sub>:</span>
          <span className="ml-2 font-mono text-slate-700">
            {formatTime(result.upstream_trip_time_s)}
          </span>
        </div>
      </div>

      {/* Analysis current */}
      <div className="mt-2 text-xs text-slate-500">
        Analiza przy I = {result.analysis_current_a.toFixed(0)} A
      </div>

      {/* Recommendation */}
      {result.recommendation_pl && (
        <div className={`mt-3 rounded p-2 text-sm ${
          result.status === 'COORDINATED'
            ? 'bg-emerald-50 text-emerald-700'
            : result.status === 'MARGIN_LOW'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        }`}>
          <span className="font-medium">{labels.recommendation}:</span>{' '}
          {result.recommendation_pl}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState() {
  const labels = PROTECTION_CURVES_LABELS.coordination;

  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-slate-500"
      data-testid="empty-state-coordination"
    >
      <svg
        className="mb-4 h-12 w-12 text-slate-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
        />
      </svg>
      <p>{labels.noData}</p>
      <p className="mt-1 text-xs text-slate-400">
        Dodaj co najmniej dwie krzywe, aby przeprowadzic analize koordynacji
      </p>
      <a
        href="#protection-library"
        data-testid="empty-state-coordination-cta"
        className="mt-3 text-sm font-semibold text-amber-500 underline hover:text-amber-400"
      >
        Dodaj krzywą zabezpieczenia →
      </a>
    </div>
  );
}

// =============================================================================
// Loading State Component
// =============================================================================

function LoadingState() {
  const labels = PROTECTION_CURVES_LABELS.messages;

  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      <span className="ml-3 text-sm text-slate-500">{labels.loading}</span>
    </div>
  );
}

// =============================================================================
// Summary Component
// =============================================================================

interface CoordinationSummaryProps {
  results: CoordinationResult[];
}

function CoordinationSummary({ results }: CoordinationSummaryProps) {
  const counts = useMemo(() => {
    return results.reduce(
      (acc, r) => {
        acc[r.status]++;
        return acc;
      },
      {
        COORDINATED: 0,
        MARGIN_LOW: 0,
        NOT_COORDINATED: 0,
        UNKNOWN: 0,
      } as Record<CoordinationStatus, number>
    );
  }, [results]);

  const total = results.length;
  const coordinated = counts.COORDINATED;
  const issues = counts.MARGIN_LOW + counts.NOT_COORDINATED;

  return (
    <div className="grid grid-cols-3 gap-4 rounded border border-slate-200 bg-white p-4">
      <div className="text-center">
        <div className="text-2xl font-semibold text-slate-900">{total}</div>
        <div className="text-xs text-slate-500">Par do analizy</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-semibold text-emerald-600">{coordinated}</div>
        <div className="text-xs text-slate-500">Skoordynowane</div>
      </div>
      <div className="text-center">
        <div className={`text-2xl font-semibold ${issues > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
          {issues}
        </div>
        <div className="text-xs text-slate-500">Problemy</div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CoordinationAnalysis({
  results,
  curves,
  loading = false,
}: CoordinationAnalysisProps) {
  const labels = PROTECTION_CURVES_LABELS.coordination;

  // Create name lookup map
  const nameMap = useMemo(() => {
    const map = new Map<string, string>();
    curves.forEach((c) => map.set(c.id, c.name_pl));
    return map;
  }, [curves]);

  const getCurveName = (id: string) => nameMap.get(id) ?? id;

  // Sort results: problems first
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const order: Record<CoordinationStatus, number> = {
        NOT_COORDINATED: 0,
        MARGIN_LOW: 1,
        UNKNOWN: 2,
        COORDINATED: 3,
      };
      return order[a.status] - order[b.status];
    });
  }, [results]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
      </div>

      {/* Loading state */}
      {loading && <LoadingState />}

      {/* Empty state */}
      {!loading && results.length === 0 && <EmptyState />}

      {/* Results */}
      {!loading && results.length > 0 && (
        <>
          {/* Summary */}
          <CoordinationSummary results={results} />

          {/* Results list */}
          <div className="space-y-3">
            {sortedResults.map((result) => (
              <CoordinationRow
                key={`${result.downstream_curve_id}-${result.upstream_curve_id}`}
                result={result}
                upstreamName={getCurveName(result.upstream_curve_id)}
                downstreamName={getCurveName(result.downstream_curve_id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
