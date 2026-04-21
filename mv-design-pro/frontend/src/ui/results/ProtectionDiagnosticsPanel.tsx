/**
 * Protection Diagnostics Panel
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Canonical-like diagnostics list
 * - sld_rules.md § G.1: Synchronizacja SLD ↔ Inspector
 *
 * FEATURES:
 * - Lista wszystkich wynikow diagnostyki zabezpieczen
 * - Klik w wiersz = jump to element na SLD (selection + center + overlay)
 * - Filtr severity z URL persistence
 * - Sortowanie po severity i elemencie
 *
 * 100% POLISH UI
 */

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  useSanityChecks,
  type ProtectionSanityCheckResult,
  type DiagnosticsSeverityFilter,
  SEVERITY_COLORS,
  SEVERITY_LABELS_PL,
  SANITY_CHECK_CODE_LABELS_PL,
  matchesSeverityFilter,
  SEVERITY_FILTER_LABELS_PL,
} from '../protection';
import { useDiagnosticsStore } from '../sld/diagnosticsStore';
import { useSelectionStore } from '../selection/store';
import { updateUrlWithSelection } from '../navigation/urlState';
import type { SelectedElement } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface ProtectionDiagnosticsPanelProps {
  /** Project ID for data fetching */
  projectId: string;

  /** Diagram ID for data fetching */
  diagramId: string;

  /** Callback when user wants to switch to SLD view */
  onSwitchToSld?: () => void;

  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// DiagnosticsRow Component
// =============================================================================

interface DiagnosticsRowProps {
  result: ProtectionSanityCheckResult;
  onJumpToElement: (result: ProtectionSanityCheckResult) => void;
}

function DiagnosticsRow({ result, onJumpToElement }: DiagnosticsRowProps) {
  const colors = SEVERITY_COLORS[result.severity];
  const severityLabel = SEVERITY_LABELS_PL[result.severity];
  const codeLabel = SANITY_CHECK_CODE_LABELS_PL[result.code] || result.code;

  const handleClick = useCallback(() => {
    onJumpToElement(result);
  }, [result, onJumpToElement]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onJumpToElement(result);
      }
    },
    [result, onJumpToElement]
  );

  return (
    <tr
      data-testid={`protection-diagnostics-jump-${result.element_id}-${result.code}`}
      className={clsx(
        'cursor-pointer hover:bg-gray-50 transition-colors',
        'border-b border-gray-100 last:border-b-0'
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Przejdz do elementu ${result.element_id}: ${codeLabel}`}
    >
      {/* Severity indicator */}
      <td className="px-3 py-2 w-24">
        <span
          className={clsx(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            colors.bg,
            colors.text
          )}
        >
          {severityLabel}
        </span>
      </td>

      {/* Element ID */}
      <td className="px-3 py-2 text-sm text-gray-700 font-mono">
        {result.element_id}
      </td>

      {/* Code / Description */}
      <td className="px-3 py-2">
        <div className="text-sm font-medium text-gray-900">{codeLabel}</div>
        <div className="text-xs text-gray-500 mt-0.5">{result.message_pl}</div>
      </td>

      {/* ANSI function */}
      <td className="px-3 py-2 text-xs text-gray-500 font-mono text-right">
        {result.function_ansi || '-'}
      </td>

      {/* Jump icon */}
      <td className="px-3 py-2 w-10">
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Przejdz do elementu na SLD"
          aria-label="Przejdz do elementu"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          <svg
            className="w-4 h-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// =============================================================================
// ProtectionDiagnosticsPanel Component
// =============================================================================

/**
 * Panel diagnostyki zabezpieczen.
 *
 * Wyswietla liste wszystkich wynikow walidacji z mozliwoscia
 * przejscia do elementu na SLD.
 *
 * @example
 * ```tsx
 * <ProtectionDiagnosticsPanel
 *   projectId="demo-project"
 *   diagramId="demo-diagram"
 *   onSwitchToSld={() => setActiveTab('sld')}
 * />
 * ```
 */
export function ProtectionDiagnosticsPanel({
  projectId,
  diagramId,
  onSwitchToSld,
  className = '',
}: ProtectionDiagnosticsPanelProps) {
  // Get all sanity checks
  const { results, errorCount, warnCount, infoCount, hasResults, isLoading } =
    useSanityChecks(projectId, diagramId);

  // Diagnostics store for overlay control
  const diagnosticsFilter = useDiagnosticsStore((s) => s.diagnosticsFilter);
  const toggleDiagnostics = useDiagnosticsStore((s) => s.toggleDiagnostics);
  const setDiagnosticsFilter = useDiagnosticsStore((s) => s.setDiagnosticsFilter);

  // Selection store for element selection and centering
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  // Filter results based on current filter
  const filteredResults = useMemo(() => {
    return results.filter((r) => matchesSeverityFilter(r.severity, diagnosticsFilter));
  }, [results, diagnosticsFilter]);

  // Sort results: ERROR first, then WARN, then INFO, then by element_id
  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      const severityOrder = { ERROR: 0, WARN: 1, INFO: 2 };
      const aSev = severityOrder[a.severity];
      const bSev = severityOrder[b.severity];
      if (aSev !== bSev) return aSev - bSev;
      return a.element_id.localeCompare(b.element_id);
    });
  }, [filteredResults]);

  /**
   * Handle jump to element:
   * 1. Set selection
   * 2. Switch to SLD view
   * 3. Enable diagnostics overlay
   * 4. Set filter to show this result
   * 5. Center on element
   */
  const handleJumpToElement = useCallback(
    (result: ProtectionSanityCheckResult) => {
      // 1. Build selection element
      const element: SelectedElement = {
        id: result.element_id,
        type: result.element_type,
        name: result.element_id, // Fallback to ID
      };

      // 2. Select element
      selectElement(element);

      // 3. Sync selection to URL
      updateUrlWithSelection(element);

      // 4. Enable diagnostics overlay if not visible
      toggleDiagnostics(true);

      // 5. Adjust filter to ensure this result is visible
      // ERROR -> any filter shows it
      // WARN -> ERRORS_WARNS or ALL
      // INFO -> only ALL
      const requiredFilter: DiagnosticsSeverityFilter =
        result.severity === 'INFO'
          ? 'ALL'
          : result.severity === 'WARN'
          ? 'ERRORS_WARNS'
          : diagnosticsFilter; // ERROR is visible in all filters

      if (!matchesSeverityFilter(result.severity, diagnosticsFilter)) {
        setDiagnosticsFilter(requiredFilter);
      }

      // 6. Center SLD on element
      centerSldOnElement(element.id);

      // 7. Switch to SLD view if callback provided
      if (onSwitchToSld) {
        onSwitchToSld();
      }
    },
    [
      selectElement,
      toggleDiagnostics,
      diagnosticsFilter,
      setDiagnosticsFilter,
      centerSldOnElement,
      onSwitchToSld,
    ]
  );

  /**
   * Handle filter change.
   */
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDiagnosticsFilter(e.target.value as DiagnosticsSeverityFilter);
    },
    [setDiagnosticsFilter]
  );

  return (
    <div
      data-testid="protection-diagnostics-panel"
      className={clsx('flex flex-col h-full bg-white', className)}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Diagnostyka zabezpieczen
            </h3>
            <div className="flex items-center gap-3 mt-1 text-xs">
              {errorCount > 0 && (
                <span className="text-rose-600 font-medium">
                  {errorCount} bledow
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-amber-600 font-medium">
                  {warnCount} ostrzezen
                </span>
              )}
              {infoCount > 0 && (
                <span className="text-blue-600 font-medium">
                  {infoCount} informacji
                </span>
              )}
              {!hasResults && (
                <span className="text-gray-500 italic">Brak wynikow</span>
              )}
            </div>
          </div>

          {/* Filter dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="diag-filter" className="text-xs text-gray-500">
              Filtr:
            </label>
            <select
              id="diag-filter"
              value={diagnosticsFilter}
              onChange={handleFilterChange}
              className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
              data-testid="diag-url-sync"
            >
              {Object.entries(SEVERITY_FILTER_LABELS_PL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm italic">
            Ladowanie...
          </div>
        ) : !hasResults ? (
          <div className="p-4 text-center text-gray-500 text-sm italic">
            Brak wynikow diagnostyki
          </div>
        ) : sortedResults.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm italic">
            Brak wynikow dla wybranego filtru
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Element</th>
                <th className="px-3 py-2 font-medium">Opis</th>
                <th className="px-3 py-2 font-medium text-right">ANSI</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, index) => (
                <DiagnosticsRow
                  key={`${result.element_id}-${result.code}-${index}`}
                  result={result}
                  onJumpToElement={handleJumpToElement}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with fixture notice */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 italic flex items-center gap-1">
          <span>*</span>
          <span>Dane demonstracyjne (fixture)</span>
        </div>
      </div>
    </div>
  );
}

export default ProtectionDiagnosticsPanel;
