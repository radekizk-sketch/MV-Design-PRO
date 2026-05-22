/**
 * ResultStatusBar Component (Canonical-grade)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § B.2: Result freshness display
 * - SYSTEM_SPEC.md § 5: Explicit calculation trigger
 *
 * DISPLAYS:
 * - Current result status (NONE/FRESH/OUTDATED)
 * - PF-like status message
 * - Analysis type selector (SC 3F, SC 1F, Rozpływ mocy)
 * - [Oblicz] button (explicit calculation trigger)
 * - Last run timestamp and element count summary
 *
 * CANONICAL PARITY:
 * - NO auto-run on changes
 * - Explicit user action required
 * - Visual feedback per status
 * - Analysis type selection before calculation
 */

import { useState } from 'react';
import {
  useResultsStore,
  useIsCalculateEnabled,
  useResultStatusMessage,
} from './resultsStore';

/** Available analysis types for calculation dispatch. */
export type CalculationAnalysisType = 'SC_3F' | 'SC_1F' | 'LOAD_FLOW';

const ANALYSIS_TYPE_LABELS: Record<CalculationAnalysisType, string> = {
  SC_3F: 'Zwarcie 3F (IEC 60909)',
  SC_1F: 'Zwarcie 1F (IEC 60909)',
  LOAD_FLOW: 'Rozpływ mocy (Newton-Raphson)',
};

const ANALYSIS_TYPE_SHORT: Record<CalculationAnalysisType, string> = {
  SC_3F: 'Zwarcie 3F',
  SC_1F: 'Zwarcie 1F',
  LOAD_FLOW: 'Rozpływ mocy',
};

interface Props {
  onCalculate: (analysisType?: CalculationAnalysisType) => void;
  /** Element counts for summary display */
  elementCounts?: {
    buses: number;
    branches: number;
    transformers: number;
    sources: number;
    loads: number;
    generators: number;
  };
  /** Which analysis types are available (from readiness matrix) */
  availableAnalyses?: {
    short_circuit_3f: boolean;
    short_circuit_1f: boolean;
    load_flow: boolean;
  };
  className?: string;
}

/**
 * Status indicator badge styles per result status.
 */
function getStatusStyles(status: 'NONE' | 'FRESH' | 'OUTDATED'): string {
  switch (status) {
    case 'NONE':
      return 'bg-gray-100 text-gray-600 border-gray-300';
    case 'FRESH':
      return 'bg-green-100 text-green-700 border-green-300';
    case 'OUTDATED':
      return 'bg-yellow-100 text-yellow-700 border-yellow-400';
  }
}

/**
 * Status icon per result status.
 */
function StatusIcon({ status }: { status: 'NONE' | 'FRESH' | 'OUTDATED' }) {
  switch (status) {
    case 'NONE':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      );
    case 'FRESH':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'OUTDATED':
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
  }
}

/**
 * Map CalculationAnalysisType to availability key.
 */
function isAnalysisAvailable(
  analysisType: CalculationAnalysisType,
  available?: Props['availableAnalyses']
): boolean {
  if (!available) return true;
  switch (analysisType) {
    case 'SC_3F': return available.short_circuit_3f;
    case 'SC_1F': return available.short_circuit_1f;
    case 'LOAD_FLOW': return available.load_flow;
  }
}

export function ResultStatusBar({
  onCalculate,
  elementCounts,
  availableAnalyses,
  className = '',
}: Props) {
  const status = useResultsStore((state) => state.status);
  const isCalculating = useResultsStore((state) => state.isCalculating);
  const validationErrors = useResultsStore((state) => state.validationErrors);
  const lastResult = useResultsStore((state) => state.lastResult);
  const isCalculateEnabled = useIsCalculateEnabled();
  const { message } = useResultStatusMessage();
  const [selectedAnalysis, setSelectedAnalysis] = useState<CalculationAnalysisType>('SC_3F');

  const statusStyles = getStatusStyles(status);
  const analysisAvailable = isAnalysisAvailable(selectedAnalysis, availableAnalyses);
  const canRun = isCalculateEnabled && analysisAvailable;

  return (
    <div
      className={`border rounded bg-white ${className}`}
      data-testid="result-status-bar"
    >
      {/* Main bar */}
      <div className="flex items-center justify-between p-2">
        {/* Status indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${statusStyles}`}>
          <StatusIcon status={status} />
          <span className="text-sm font-medium">{message}</span>
        </div>

        {/* Analysis selector + Calculate button */}
        <div className="flex items-center gap-2">
          {validationErrors.length > 0 && (
            <span
              className="text-xs text-red-600"
              title={validationErrors.join('\n')}
              data-testid="validation-error-count"
            >
              {validationErrors.length} błąd/błędy
            </span>
          )}

          {/* Analysis type selector */}
          <select
            value={selectedAnalysis}
            onChange={(e) => setSelectedAnalysis(e.target.value as CalculationAnalysisType)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            data-testid="analysis-type-selector"
            disabled={isCalculating}
          >
            {(Object.keys(ANALYSIS_TYPE_LABELS) as CalculationAnalysisType[]).map((type) => (
              <option key={type} value={type} disabled={!isAnalysisAvailable(type, availableAnalyses)}>
                {ANALYSIS_TYPE_SHORT[type]}{!isAnalysisAvailable(type, availableAnalyses) ? ' (niedostępne)' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => onCalculate(selectedAnalysis)}
            disabled={!canRun}
            data-testid="calculate-button"
            className={`
              px-4 py-1.5 rounded font-medium text-sm transition-colors flex items-center gap-2
              ${
                canRun
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
            title={
              !canRun
                ? !analysisAvailable
                  ? `${ANALYSIS_TYPE_LABELS[selectedAnalysis]} — model nie spełnia wymagań`
                  : validationErrors.length > 0
                  ? 'Popraw błędy walidacji przed obliczeniem'
                  : isCalculating
                  ? 'Obliczenia w toku...'
                  : 'Uruchom obliczenia'
                : ANALYSIS_TYPE_LABELS[selectedAnalysis]
            }
          >
            {isCalculating ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Obliczam...
              </>
            ) : (
              'Oblicz'
            )}
          </button>
        </div>
      </div>

      {/* Summary footer — element counts + last run */}
      {(elementCounts || lastResult) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          {elementCounts && (
            <div className="flex items-center gap-3" data-testid="element-counts-summary">
              <span>Szyny: <span className="font-medium text-gray-700">{elementCounts.buses}</span></span>
              <span className="text-gray-300">|</span>
              <span>Gałęzie: <span className="font-medium text-gray-700">{elementCounts.branches}</span></span>
              <span className="text-gray-300">|</span>
              <span>Transformatory: <span className="font-medium text-gray-700">{elementCounts.transformers}</span></span>
              <span className="text-gray-300">|</span>
              <span>Zasilanie: <span className="font-medium text-gray-700">{elementCounts.sources}</span></span>
              <span className="text-gray-300">|</span>
              <span>Odbiory: <span className="font-medium text-gray-700">{elementCounts.loads}</span></span>
              {elementCounts.generators > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>OZE: <span className="font-medium text-gray-700">{elementCounts.generators}</span></span>
                </>
              )}
            </div>
          )}
          {lastResult && (
            <span data-testid="last-run-timestamp">
              Ostatnie obliczenia: {new Date(lastResult.timestamp).toLocaleString('pl-PL')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

