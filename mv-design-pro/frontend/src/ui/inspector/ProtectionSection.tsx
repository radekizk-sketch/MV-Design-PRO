/**
 * P16a/P16b/P16c — Protection Section Component (READ-ONLY)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Canonical-like protection visualization
 * - sld_rules.md § G.1: Synchronizacja selection SLD ↔ Tree ↔ Inspector
 * - ANSI/IEEE C37.2: Device function numbers
 *
 * FEATURES:
 * - Wyswietla przypisane zabezpieczenia dla wybranego elementu
 * - SETPOINT jako zrodlo prawdy (np. "3×In", "0,8×Un")
 * - COMPUTED (A/V) tylko gdy dostepne dane bazowe
 * - Format PF/CANONICAL: "50 I>>: 3×In (≈ 1509 A), T=0,1 s"
 * - Read-only: brak edycji
 * - Zwijalna sekcja
 *
 * ŹRÓDŁO DANYCH (Audyt E, E-5): realny read model `protection-view`
 * (przez useProtectionAssignment → useProtectionView). Brak przypisania
 * dla elementu ⇒ uczciwy stan zerowy. ZERO fizyki w UI.
 *
 * 100% POLISH UI
 */

import { useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useProtectionAssignment } from '../protection';
import type { ElementProtectionAssignment, ProtectionSettingsSummary } from '../protection';
import type { ProtectionFunctionSummary } from '../protection';
import {
  PROTECTION_DEVICE_KIND_LABELS,
  PROTECTION_STATUS_LABELS,
  PROTECTION_STATUS_COLORS,
} from '../protection';
import { formatProtectionFunction, formatNumberPl } from './formatProtection';
import { ItCurvePanel } from '../protection-curves';

// =============================================================================
// Types
// =============================================================================

interface ProtectionSectionProps {
  /** ID elementu sieci */
  elementId: string | null | undefined;

  /** Czy sekcja jest domyślnie zwinięta */
  defaultCollapsed?: boolean;

  /** Dodatkowe klasy CSS */
  className?: string;
}

// =============================================================================
// ProtectionSection Component
// =============================================================================

/**
 * Sekcja zabezpieczeń w inspektorze.
 *
 * Wyświetla przypisane urządzenia zabezpieczeniowe dla wybranego elementu.
 * Read-only — brak edycji.
 *
 * @example
 * ```tsx
 * <ProtectionSection elementId={selectedElement?.id} />
 * ```
 */
export function ProtectionSection({
  elementId,
  defaultCollapsed = false,
  className = '',
}: ProtectionSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { assignments, hasProtection, isLoading, error } = useProtectionAssignment(elementId);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Nie renderuj jeśli brak elementu, brak zabezpieczeń i brak sygnału
  // ładowania/błędu (uczciwy stan zerowy = sekcja się nie pokazuje).
  if (!elementId || (!hasProtection && !isLoading && !error)) {
    return null;
  }

  return (
    <div
      className={clsx('border-t border-gray-100', className)}
      data-testid="inspector-protection-section"
    >
      {/* Section Header */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-4 py-2 bg-amber-50 hover:bg-amber-100 transition-colors"
        data-testid="protection-section-toggle"
      >
        <span className="text-xs font-medium text-amber-800 flex items-center gap-2">
          {collapsed ? '[+]' : '[-]'} Zabezpieczenia
          {hasProtection && (
            <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded text-xs">
              {assignments.length}
            </span>
          )}
        </span>
        <span className="text-xs text-amber-600">
          {hasProtection ? `${assignments.length} urzadzen` : 'brak'}
        </span>
      </button>

      {/* Section Content */}
      {!collapsed && (
        <div className="px-4 py-3 bg-amber-50/50 space-y-3">
          {isLoading ? (
            <div className="text-xs text-gray-500 italic" data-testid="protection-section-loading">
              Ladowanie...
            </div>
          ) : error ? (
            <div className="text-xs text-red-600 italic" data-testid="protection-section-error">
              Nie udalo sie pobrac zabezpieczen: {error}
            </div>
          ) : hasProtection ? (
            assignments.map((assignment) => (
              <ProtectionAssignmentCard key={assignment.device_id} assignment={assignment} />
            ))
          ) : (
            <div className="text-xs text-gray-500 italic" data-testid="protection-section-empty">
              Brak przypisanych zabezpieczen dla tego elementu
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ProtectionAssignmentCard Component
// =============================================================================

interface ProtectionAssignmentCardProps {
  assignment: ElementProtectionAssignment;
}

function ProtectionAssignmentCard({ assignment }: ProtectionAssignmentCardProps) {
  const kindLabel = PROTECTION_DEVICE_KIND_LABELS[assignment.device_kind] ?? assignment.device_kind;
  const statusLabel = PROTECTION_STATUS_LABELS[assignment.status] ?? assignment.status;
  const statusColors = PROTECTION_STATUS_COLORS[assignment.status] ?? 'text-gray-600 bg-gray-50';

  return (
    <div
      className="bg-white border border-amber-200 rounded p-3 shadow-sm"
      data-testid={`protection-assignment-${assignment.device_id}`}
    >
      {/* Device header */}
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-sm text-gray-900">{assignment.device_name_pl}</div>
        <span className={clsx('px-2 py-0.5 rounded text-xs', statusColors)}>{statusLabel}</span>
      </div>

      {/* Device type */}
      <div className="text-xs text-gray-600 mb-2">{kindLabel}</div>

      {/* Settings summary (nowy model P16b) */}
      {assignment.settings_summary && (
        <SettingsSummaryView summary={assignment.settings_summary} />
      )}

      {/* Device ID (small) */}
      <div className="mt-2 text-xs text-gray-400 font-mono">ID: {assignment.device_id}</div>
    </div>
  );
}

// =============================================================================
// SettingsSummaryView Component (P16b: setpoint + computed)
// =============================================================================

interface SettingsSummaryViewProps {
  summary: ProtectionSettingsSummary;
}

function SettingsSummaryView({ summary }: SettingsSummaryViewProps) {
  if (!summary.functions || summary.functions.length === 0) {
    return <div className="text-xs text-gray-500 italic">Nastawy do konfiguracji</div>;
  }

  return (
    <div className="bg-gray-50 rounded p-2 space-y-2">
      <div className="text-xs font-medium text-gray-700 mb-1">Funkcje zabezpieczeniowe:</div>

      {summary.functions.map((func, index) => (
        <FunctionSummaryRow key={`${func.code}-${index}`} func={func} />
      ))}

      {/* Charakterystyka czasowa (jeśli wspólna) */}
      {summary.curve_type && (
        <div className="text-xs text-gray-600 pt-1 border-t border-gray-200">
          Charakterystyka: <span className="font-mono">{summary.curve_type}</span>
        </div>
      )}

      {/* Dane bazowe (jesli dostepne) */}
      {summary.base_values && (
        <div className="text-xs text-gray-500 pt-1 border-t border-gray-200">
          <span className="italic">Dane bazowe:</span>
          {summary.base_values.i_rated_a !== undefined && (
            <span className="ml-2">In={formatNumberPl(summary.base_values.i_rated_a, 0)} A</span>
          )}
          {summary.base_values.u_rated_kv !== undefined && (
            <span className="ml-2">Un={formatNumberPl(summary.base_values.u_rated_kv, 1)} kV</span>
          )}
          {summary.base_values.f_rated_hz !== undefined && (
            <span className="ml-2">fn={formatNumberPl(summary.base_values.f_rated_hz, 0)} Hz</span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FunctionSummaryRow Component (PF/CANONICAL style)
// =============================================================================

interface FunctionSummaryRowProps {
  func: ProtectionFunctionSummary;
}

/**
 * Wiersz funkcji zabezpieczeniowej w stylu PF/CANONICAL.
 *
 * FORMAT: "ANSI shortcut: setpoint (≈ computed), T=time s"
 *
 * @example
 * "50 I>>: 3×In (≈ 1509 A), T=0,1 s"
 * "51 I>: 1,2×In, T=1,0 s"
 * "27 U<: 0,8×Un, T=5 s"
 * "81U f<: 47,5 Hz, T=0,3 s"
 * "79 SPZ: Wlaczone, T=600 s"
 */
function FunctionSummaryRow({ func }: FunctionSummaryRowProps) {
  // Formatuj funkcje w stylu PF/CANONICAL
  const formatted = useMemo(() => formatProtectionFunction(func), [func]);

  return (
    <div
      className="text-xs border-l-2 border-amber-300 pl-2 py-1"
      data-testid={formatted.testId}
    >
      {/* Glowna linia: ANSI shortcut: setpoint (computed), T=time */}
      <div className="flex items-baseline gap-1 flex-wrap">
        {/* ANSI code */}
        <span className="font-mono font-semibold text-amber-800">
          {formatted.ansiCodes}
        </span>
        {/* Shortcut (I>>, U<, etc.) */}
        <span className="font-mono font-medium text-amber-700">
          {formatted.shortcut}:
        </span>
        {/* Setpoint (3×In, 0,8×Un, etc.) */}
        <span className="font-mono font-medium text-gray-900">
          {formatted.setpoint}
        </span>
        {/* Computed (opcjonalnie) */}
        {formatted.computed && (
          <span className="text-gray-500">{formatted.computed}</span>
        )}
        {/* Time delay (opcjonalnie) */}
        {formatted.time && (
          <span className="text-gray-600">, {formatted.time}</span>
        )}
      </div>

      {/* Charakterystyka (jesli specyficzna dla funkcji) */}
      {func.curve_type && (
        <div className="text-gray-500 mt-0.5">
          Krzywa: <span className="font-mono">{func.curve_type}</span>
        </div>
      )}

      {/* Notatki (np. dla SPZ) */}
      {formatted.notes && (
        <div className="text-gray-500 italic mt-0.5">{formatted.notes}</div>
      )}

      {/* Krzywa I-t z solvera IEC 60255 (Audyt E, E-4).
          Renderowana tylko gdy backend dostarczył krzywą LUB jawnie
          zgłosił brak danych — inaczej panel się nie pokazuje. */}
      {(func.it_curve != null || func.it_curve_missing_data != null) && (
        <ItCurvePanel
          itCurve={func.it_curve}
          itCurveMissingData={func.it_curve_missing_data}
          curveId={`${func.code}-${func.ansi.join('')}`}
        />
      )}
    </div>
  );
}

export default ProtectionSection;
