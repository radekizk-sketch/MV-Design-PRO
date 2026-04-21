/**
 * SLD Overlay Utilities
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * FEATURES:
 * - Maps symbol positions to screen coordinates
 * - Applies viewport transformation (pan/zoom)
 * - Deterministic coordinate calculation
 *
 * RULES:
 * - READ-ONLY: No model mutations
 * - Pure functions only
 */

import type { AnySldSymbol, Position } from '../sld-editor/types';
import type { ViewportState } from './types';

/**
 * Map a symbol position to screen coordinates.
 * Applies viewport transformation (pan + zoom).
 *
 * @param position - Symbol position in canvas coordinates
 * @param viewport - Current viewport state
 * @returns Screen position in pixels
 */
export function mapPositionToScreen(
  position: Position,
  viewport: ViewportState
): Position {
  return {
    x: position.x * viewport.zoom + viewport.offsetX,
    y: position.y * viewport.zoom + viewport.offsetY,
  };
}

/**
 * Build position maps for overlay from symbols.
 * Returns Maps keyed by elementId (for result matching).
 *
 * @param symbols - Array of SLD symbols
 * @param viewport - Current viewport state
 * @returns Maps for nodes and branches
 */
export function buildOverlayPositionMaps(
  symbols: AnySldSymbol[],
  viewport: ViewportState
): {
  nodePositions: Map<string, Position>;
  branchPositions: Map<string, Position>;
} {
  const nodePositions = new Map<string, Position>();
  const branchPositions = new Map<string, Position>();

  for (const symbol of symbols) {
    const screenPos = mapPositionToScreen(symbol.position, viewport);

    switch (symbol.elementType) {
      case 'Bus':
        // Nodes map by elementId
        nodePositions.set(symbol.elementId, screenPos);
        break;
      case 'LineBranch':
      case 'TransformerBranch':
        // Branches map by elementId
        branchPositions.set(symbol.elementId, screenPos);
        break;
      case 'Source':
      case 'Load':
        // Sources and loads also can have results - treat as nodes
        nodePositions.set(symbol.elementId, screenPos);
        break;
      default:
        // Switches don't typically have result overlay
        break;
    }
  }

  return { nodePositions, branchPositions };
}

/**
 * Format number with fixed decimals (deterministic).
 *
 * @param value - Number to format
 * @param decimals - Number of decimal places
 * @param unit - Optional unit suffix
 * @returns Formatted string
 */
export function formatValue(
  value: number | undefined | null,
  decimals: number,
  unit?: string
): string {
  if (value === undefined || value === null) return '';
  const formatted = value.toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Format voltage value.
 */
export function formatVoltageKv(value: number | undefined | null): string {
  return formatValue(value, 2, 'kV');
}

/**
 * Format voltage per-unit value.
 */
export function formatVoltagePu(value: number | undefined | null): string {
  return formatValue(value, 4, 'pu');
}

/**
 * Format current value.
 */
export function formatCurrentA(value: number | undefined | null): string {
  return formatValue(value, 1, 'A');
}

/**
 * Format short-circuit current (kA).
 */
export function formatCurrentKa(value: number | undefined | null): string {
  return formatValue(value, 2, 'kA');
}

/**
 * Format power value (MW or Mvar).
 */
export function formatPowerMw(value: number | undefined | null): string {
  return formatValue(value, 2, 'MW');
}

export function formatPowerMvar(value: number | undefined | null): string {
  return formatValue(value, 2, 'Mvar');
}

/**
 * Format loading percentage.
 */
export function formatLoadingPct(value: number | undefined | null): string {
  return formatValue(value, 1, '%');
}

/**
 * Get loading color class based on percentage.
 * - 0-80%: Green (normal)
 * - 80-100%: Yellow (warning)
 * - >100%: Red (overloaded)
 */
export function getLoadingColorClass(loading: number | undefined): string {
  if (loading === undefined) return 'text-slate-600';
  if (loading > 100) return 'text-rose-600 font-semibold';
  if (loading > 80) return 'text-amber-600';
  return 'text-emerald-600';
}

/**
 * Get loading background class.
 */
export function getLoadingBgClass(loading: number | undefined): string {
  if (loading === undefined) return 'bg-slate-50 border-slate-200';
  if (loading > 100) return 'bg-rose-50 border-rose-300';
  if (loading > 80) return 'bg-amber-50 border-amber-300';
  return 'bg-emerald-50 border-emerald-300';
}
