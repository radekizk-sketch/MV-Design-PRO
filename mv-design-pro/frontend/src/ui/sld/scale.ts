/**
 * SLD Overlay Scale Utilities
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * FEATURES:
 * - Calculates min/max ranges from overlay data
 * - Deterministic rounding and formatting
 * - Pure functions only
 *
 * RULES:
 * - READ-ONLY: No model mutations
 * - No backend changes, uses existing overlay data
 * - Polish labels for UI
 */

import type { SldResultOverlay, SldOverlayNode, SldOverlayBranch } from '../results-inspector/types';

// =============================================================================
// Range Types
// =============================================================================

/**
 * Value range with min/max.
 */
export interface ValueRange {
  min: number;
  max: number;
  count: number;
}

/**
 * All computed ranges from overlay data.
 */
export interface OverlayRanges {
  voltage_pu: ValueRange | null;
  voltage_kv: ValueRange | null;
  current_a: ValueRange | null;
  loading_pct: ValueRange | null;
  power_mw: ValueRange | null;
  power_mvar: ValueRange | null;
  ikss_ka: ValueRange | null;
}

// =============================================================================
// Range Calculation Functions
// =============================================================================

/**
 * Calculate min/max from array of values.
 * Filters out undefined/null values.
 *
 * @param values - Array of optional numbers
 * @returns ValueRange or null if no valid values
 */
function calculateRange(values: (number | undefined | null)[]): ValueRange | null {
  const valid = values.filter((v): v is number => v !== undefined && v !== null);
  if (valid.length === 0) return null;

  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
    count: valid.length,
  };
}

/**
 * Extract voltage ranges from nodes.
 */
function getVoltageRanges(nodes: SldOverlayNode[]): {
  voltage_pu: ValueRange | null;
  voltage_kv: ValueRange | null;
} {
  return {
    voltage_pu: calculateRange(nodes.map((n) => n.u_pu)),
    voltage_kv: calculateRange(nodes.map((n) => n.u_kv)),
  };
}

/**
 * Extract short-circuit ranges from nodes.
 */
function getShortCircuitRanges(nodes: SldOverlayNode[]): {
  ikss_ka: ValueRange | null;
} {
  return {
    ikss_ka: calculateRange(nodes.map((n) => n.ikss_ka)),
  };
}

/**
 * Extract branch ranges.
 */
function getBranchRanges(branches: SldOverlayBranch[]): {
  current_a: ValueRange | null;
  loading_pct: ValueRange | null;
  power_mw: ValueRange | null;
  power_mvar: ValueRange | null;
} {
  return {
    current_a: calculateRange(branches.map((b) => b.i_a)),
    loading_pct: calculateRange(branches.map((b) => b.loading_pct)),
    power_mw: calculateRange(branches.map((b) => b.p_mw)),
    power_mvar: calculateRange(branches.map((b) => b.q_mvar)),
  };
}

/**
 * Calculate all ranges from overlay data.
 *
 * @param overlay - SLD result overlay data
 * @returns All computed ranges
 */
export function calculateOverlayRanges(overlay: SldResultOverlay | null): OverlayRanges {
  if (!overlay) {
    return {
      voltage_pu: null,
      voltage_kv: null,
      current_a: null,
      loading_pct: null,
      power_mw: null,
      power_mvar: null,
      ikss_ka: null,
    };
  }

  const voltageRanges = getVoltageRanges(overlay.nodes);
  const shortCircuitRanges = getShortCircuitRanges(overlay.nodes);
  const branchRanges = getBranchRanges(overlay.branches);

  return {
    ...voltageRanges,
    ...shortCircuitRanges,
    ...branchRanges,
  };
}

// =============================================================================
// Format Functions for Ranges
// =============================================================================

/**
 * Round to specified precision (deterministic).
 */
function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Format range as string with unit.
 *
 * @param range - Value range
 * @param precision - Decimal places
 * @param unit - Unit suffix
 * @returns Formatted range string
 */
export function formatRange(
  range: ValueRange | null,
  precision: number,
  unit: string
): string {
  if (!range) return '—';

  const minStr = roundToPrecision(range.min, precision).toFixed(precision);
  const maxStr = roundToPrecision(range.max, precision).toFixed(precision);

  if (range.min === range.max) {
    return `${minStr} ${unit}`;
  }

  return `${minStr}–${maxStr} ${unit}`;
}

/**
 * Format voltage p.u. range.
 */
export function formatVoltagePuRange(range: ValueRange | null): string {
  return formatRange(range, 4, 'p.u.');
}

/**
 * Format voltage kV range.
 */
export function formatVoltageKvRange(range: ValueRange | null): string {
  return formatRange(range, 2, 'kV');
}

/**
 * Format current range.
 */
export function formatCurrentRange(range: ValueRange | null): string {
  return formatRange(range, 1, 'A');
}

/**
 * Format loading range.
 */
export function formatLoadingRange(range: ValueRange | null): string {
  return formatRange(range, 1, '%');
}

/**
 * Format power MW range.
 */
export function formatPowerMwRange(range: ValueRange | null): string {
  return formatRange(range, 2, 'MW');
}

/**
 * Format power Mvar range.
 */
export function formatPowerMvarRange(range: ValueRange | null): string {
  return formatRange(range, 2, 'Mvar');
}

/**
 * Format short-circuit current range.
 */
export function formatIkssRange(range: ValueRange | null): string {
  return formatRange(range, 2, 'kA');
}
