/**
 * Diagnostics Section Component (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Canonical-like diagnostics visualization
 * - sld_rules.md § G.1: Synchronizacja selection SLD ↔ Tree ↔ Inspector
 *
 * FEATURES:
 * - Wyswietla wyniki walidacji zabezpieczen dla wybranego elementu
 * - Color-coded severity: ERROR (red), WARN (amber), INFO (blue)
 * - Zwijalna sekcja
 *
 * STATUS: PLACEHOLDER (uzywa fixture data przez useSanityChecksByElement)
 *
 * 100% POLISH UI
 */

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { useSanityChecksByElement } from '../protection';
import {
  type ProtectionSanityCheckResult,
  SEVERITY_COLORS,
  SEVERITY_LABELS_PL,
  SANITY_CHECK_CODE_LABELS_PL,
} from '../protection';

// =============================================================================
// Types
// =============================================================================

interface DiagnosticsSectionProps {
  /** ID elementu sieci */
  elementId: string | null | undefined;

  /** Czy sekcja jest domyslnie zwinieta */
  defaultCollapsed?: boolean;

  /** Dodatkowe klasy CSS */
  className?: string;
}

// =============================================================================
// DiagnosticsSection Component
// =============================================================================

/**
 * Sekcja diagnostyki w inspektorze.
 *
 * Wyswietla wyniki walidacji zabezpieczen dla wybranego elementu.
 * Read-only — brak edycji.
 *
 * @example
 * ```tsx
 * <DiagnosticsSection elementId={selectedElement?.id} />
 * ```
 */
export function DiagnosticsSection({
  elementId,
  defaultCollapsed = false,
  className = '',
}: DiagnosticsSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { diagnostics, hasDiagnostics, isLoading } = useSanityChecksByElement(elementId);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Nie renderuj jesli brak elementu lub diagnostyki
  if (!elementId || (!hasDiagnostics && !isLoading)) {
    return null;
  }

  return (
    <div
      className={clsx('border-t border-gray-100', className)}
      data-testid="inspector-diagnostics-section"
    >
      {/* Section Header */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-4 py-2 bg-rose-50 hover:bg-rose-100 transition-colors"
        data-testid="diagnostics-section-toggle"
      >
        <span className="text-xs font-medium text-rose-800 flex items-center gap-2">
          {collapsed ? '[+]' : '[-]'} Diagnostyka
          {hasDiagnostics && diagnostics && (
            <>
              {diagnostics.error_count > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-200 text-rose-900 rounded text-xs">
                  {diagnostics.error_count} bledow
                </span>
              )}
              {diagnostics.warn_count > 0 && (
                <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded text-xs">
                  {diagnostics.warn_count} ostrzezen
                </span>
              )}
            </>
          )}
        </span>
        <span className="text-xs text-rose-600">
          {hasDiagnostics && diagnostics
            ? `${diagnostics.results.length} wynikow`
            : 'brak'}
        </span>
      </button>

      {/* Section Content */}
      {!collapsed && (
        <div className="px-4 py-3 bg-rose-50/50 space-y-2">
          {isLoading ? (
            <div className="text-xs text-gray-500 italic">Ladowanie...</div>
          ) : hasDiagnostics && diagnostics ? (
            diagnostics.results.map((result, index) => (
              <DiagnosticResultCard key={`${result.code}-${index}`} result={result} />
            ))
          ) : (
            <div className="text-xs text-gray-500 italic">
              Brak wynik?w diagnostyki
            </div>
          )}

          {/* Placeholder notice */}
          <div className="mt-2 pt-2 border-t border-rose-200">
            <div className="text-xs text-rose-700 italic flex items-center gap-1">
              <span>*</span>
              <span>Dane demonstracyjne (fixture)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DiagnosticResultCard Component
// =============================================================================

interface DiagnosticResultCardProps {
  result: ProtectionSanityCheckResult;
}

function DiagnosticResultCard({ result }: DiagnosticResultCardProps) {
  const colors = SEVERITY_COLORS[result.severity];
  const severityLabel = SEVERITY_LABELS_PL[result.severity];
  const codeLabel = SANITY_CHECK_CODE_LABELS_PL[result.code] || result.code;

  return (
    <div
      className={clsx(
        'rounded border p-2 shadow-sm',
        colors.bg,
        colors.border
      )}
      data-testid={`diagnostics-result-${result.code}`}
    >
      {/* Header with severity */}
      <div className="flex items-center justify-between mb-1">
        <span className={clsx('text-xs font-semibold', colors.text)}>
          {severityLabel}
        </span>
        {result.function_ansi && (
          <span className="text-xs text-gray-500 font-mono">
            ANSI {result.function_ansi}
          </span>
        )}
      </div>

      {/* Code label */}
      <div className="text-xs font-medium text-gray-800 mb-1">
        {codeLabel}
      </div>

      {/* Message */}
      <div className="text-xs text-gray-600">
        {result.message_pl}
      </div>

      {/* Evidence (if present) */}
      {result.evidence && Object.keys(result.evidence).length > 0 && (
        <div className="mt-1 pt-1 border-t border-gray-200">
          <div className="text-xs text-gray-500 font-mono">
            {Object.entries(result.evidence)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}

export default DiagnosticsSection;
