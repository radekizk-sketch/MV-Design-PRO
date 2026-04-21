/**
 * SLD Switching State & Energization Legend
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § D: Visual state encoding
 * - CANONICAL parity: switching states and energization visualization
 *
 * FEATURES:
 * - Shows legend for switch states (OPEN/CLOSED/UNKNOWN)
 * - Shows legend for energization states (energized/not energized)
 * - CANONICAL-like symbol previews
 * - Polish labels and terminology
 *
 * RULES:
 * - READ-ONLY: No model mutations
 * - Always visible as base layer legend
 * - No backend changes, UI-only visualization
 */

import React from 'react';

// =============================================================================
// Switch State Legend Items
// =============================================================================

/**
 * Mini circuit breaker symbol for legend.
 */
const MiniCircuitBreaker: React.FC<{
  state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  stroke?: string;
}> = ({ state, stroke = '#1f2937' }) => {
  const isOpen = state === 'OPEN';
  const isUnknown = state === 'UNKNOWN';
  const dasharray = isUnknown ? '2,1' : undefined;

  return (
    <svg width="20" height="24" viewBox="0 0 100 120" className="inline-block">
      {/* Square with X */}
      <rect
        x="30"
        y="30"
        width="40"
        height="40"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeDasharray={dasharray}
      />
      <line x1="30" y1="30" x2="70" y2="70" stroke={stroke} strokeWidth="3" />
      <line x1="70" y1="30" x2="30" y2="70" stroke={stroke} strokeWidth="3" />
      {/* Top connection */}
      <line x1="50" y1="0" x2="50" y2="30" stroke={stroke} strokeWidth="4" />
      {/* Bottom connection - OPEN shows gap */}
      {isOpen ? (
        <>
          <line x1="50" y1="70" x2="50" y2="80" stroke={stroke} strokeWidth="4" />
          <line x1="50" y1="95" x2="50" y2="120" stroke={stroke} strokeWidth="4" />
          <line x1="45" y1="82" x2="55" y2="92" stroke={stroke} strokeWidth="3" />
        </>
      ) : (
        <line x1="50" y1="70" x2="50" y2="120" stroke={stroke} strokeWidth="4" />
      )}
    </svg>
  );
};

/**
 * Mini disconnector symbol for legend.
 */
const MiniDisconnector: React.FC<{
  state: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  stroke?: string;
}> = ({ state, stroke = '#1f2937' }) => {
  const isOpen = state === 'OPEN';
  const isUnknown = state === 'UNKNOWN';
  const dasharray = isUnknown ? '2,1' : undefined;

  return (
    <svg width="20" height="24" viewBox="0 0 100 100" className="inline-block">
      {/* Top connection */}
      <line x1="50" y1="0" x2="50" y2="35" stroke={stroke} strokeWidth="4" />
      {/* Bottom connection */}
      <line x1="50" y1="65" x2="50" y2="100" stroke={stroke} strokeWidth="4" />
      {/* Blade - OPEN: angled, CLOSED: vertical */}
      {isOpen ? (
        <line
          x1="50"
          y1="35"
          x2="75"
          y2="50"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={dasharray}
        />
      ) : (
        <line
          x1="50"
          y1="35"
          x2="50"
          y2="65"
          stroke={stroke}
          strokeWidth="4"
          strokeDasharray={dasharray}
        />
      )}
      {/* Contact points */}
      <circle cx="50" cy="35" r="5" fill={stroke} />
      <circle cx="50" cy="65" r="5" fill={stroke} />
    </svg>
  );
};

/**
 * Energization indicator bar for legend.
 */
const EnergizationBar: React.FC<{
  energized: boolean;
}> = ({ energized }) => {
  const stroke = energized ? '#1f2937' : '#9ca3af';
  const opacity = energized ? 1 : 0.6;

  return (
    <svg width="30" height="12" viewBox="0 0 100 40" className="inline-block">
      <line
        x1="5"
        y1="20"
        x2="95"
        y2="20"
        stroke={stroke}
        strokeWidth="6"
        opacity={opacity}
      />
    </svg>
  );
};

// =============================================================================
// Legend Panel Component
// =============================================================================

export interface SwitchingStateLegendProps {
  /** Whether to show the legend */
  visible?: boolean;
}

/**
 * SLD Switching State & Energization Legend Panel.
 * Displays base layer legend for switch states and energization.
 */
export function SwitchingStateLegend({ visible = true }: SwitchingStateLegendProps) {
  if (!visible) {
    return null;
  }

  return (
    <div
      data-testid="sld-switching-legend"
      className="absolute bottom-12 left-3 z-20 rounded-lg border border-slate-300 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
      style={{ minWidth: '200px', maxWidth: '280px' }}
    >
      {/* Header */}
      <div className="mb-2">
        <h3
          data-testid="sld-switching-legend-title"
          className="text-sm font-semibold text-slate-800"
        >
          Stany elementow
        </h3>
      </div>

      {/* Switch States Section */}
      <div data-testid="sld-legend-switch-states-section" className="mb-3">
        <div className="mb-1 text-xs font-medium text-orange-700 uppercase tracking-wide">
          Stany laczeniowe
        </div>
        <div className="space-y-1 text-xs">
          {/* CLOSED */}
          <div
            data-testid="sld-switch-state-closed-legend"
            className="flex items-center gap-2"
          >
            <MiniCircuitBreaker state="CLOSED" />
            <MiniDisconnector state="CLOSED" />
            <span className="text-slate-600">Zamkniety (CLOSED)</span>
          </div>
          {/* OPEN */}
          <div
            data-testid="sld-switch-state-open-legend"
            className="flex items-center gap-2"
          >
            <MiniCircuitBreaker state="OPEN" />
            <MiniDisconnector state="OPEN" />
            <span className="text-slate-600">Otwarty (OPEN)</span>
          </div>
          {/* UNKNOWN */}
          <div
            data-testid="sld-switch-state-unknown-legend"
            className="flex items-center gap-2"
          >
            <MiniCircuitBreaker state="UNKNOWN" stroke="#6b7280" />
            <MiniDisconnector state="UNKNOWN" stroke="#6b7280" />
            <span className="text-slate-500">Nieznany (UNKNOWN)</span>
          </div>
        </div>
      </div>

      {/* Energization Section */}
      <div data-testid="sld-legend-energization-section">
        <div className="mb-1 text-xs font-medium text-purple-700 uppercase tracking-wide">
          Stan zasilenia
        </div>
        <div className="space-y-1 text-xs">
          {/* Energized */}
          <div
            data-testid="sld-energized-true-legend"
            className="flex items-center gap-2"
          >
            <EnergizationBar energized={true} />
            <span className="text-slate-600">Zasilone (energized)</span>
          </div>
          {/* Not energized */}
          <div
            data-testid="sld-energized-false-legend"
            className="flex items-center gap-2"
          >
            <EnergizationBar energized={false} />
            <span className="text-slate-500">Niezasilone (de-energized)</span>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="mt-2 pt-2 border-t border-slate-200">
        <p className="text-xs text-slate-400 italic">
          Stan zasilenia wyznaczany na podstawie topologii i stanow laczeniowych.
        </p>
      </div>
    </div>
  );
}

export default SwitchingStateLegend;
