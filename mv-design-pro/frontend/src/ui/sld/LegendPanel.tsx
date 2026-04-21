/**
 * SLD Legend Panel Component
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - ui_canonical_parity.md: Canonical-like presentation
 * - SLD_UI_ARCHITECTURE.md § 4.4: Legend visibility requirements
 *
 * FEATURES:
 * - Shows legend for result overlay values
 * - Displays value ranges (min/max) from current data
 * - Loading color scale indicator
 * - Polish labels and terminology
 *
 * RULES:
 * - READ-ONLY: No model mutations
 * - Only visible when overlay is active
 * - No backend changes, uses existing overlay data
 */

import { useMemo } from 'react';
import type { SldResultOverlay } from '../results-inspector/types';
import {
  calculateOverlayRanges,
  formatVoltagePuRange,
  formatVoltageKvRange,
  formatCurrentRange,
  formatLoadingRange,
  formatPowerMwRange,
  formatPowerMvarRange,
  formatIkssRange,
  type OverlayRanges,
} from './scale';

// =============================================================================
// Legend Item Definitions
// =============================================================================

interface LegendItem {
  id: string;
  label: string;
  unit: string;
  description: string;
  rangeKey: keyof OverlayRanges;
  formatRange: (range: OverlayRanges[keyof OverlayRanges]) => string;
}

/**
 * Legend items for node values.
 */
const NODE_LEGEND_ITEMS: LegendItem[] = [
  {
    id: 'voltage_pu',
    label: 'Napięcie',
    unit: 'p.u.',
    description: 'Napięcie węzłowe względne',
    rangeKey: 'voltage_pu',
    formatRange: formatVoltagePuRange,
  },
  {
    id: 'voltage_kv',
    label: 'Napięcie',
    unit: 'kV',
    description: 'Napięcie węzłowe bezwzględne',
    rangeKey: 'voltage_kv',
    formatRange: formatVoltageKvRange,
  },
  {
    id: 'ikss',
    label: "Ik''",
    unit: 'kA',
    description: 'Prąd zwarciowy początkowy',
    rangeKey: 'ikss_ka',
    formatRange: formatIkssRange,
  },
];

/**
 * Legend items for branch values.
 */
const BRANCH_LEGEND_ITEMS: LegendItem[] = [
  {
    id: 'current',
    label: 'Prąd',
    unit: 'A',
    description: 'Prąd gałęziowy',
    rangeKey: 'current_a',
    formatRange: formatCurrentRange,
  },
  {
    id: 'loading',
    label: 'Obciążenie',
    unit: '%',
    description: 'Obciążenie elementu',
    rangeKey: 'loading_pct',
    formatRange: formatLoadingRange,
  },
  {
    id: 'power_p',
    label: 'Moc czynna',
    unit: 'MW',
    description: 'Moc czynna P',
    rangeKey: 'power_mw',
    formatRange: formatPowerMwRange,
  },
  {
    id: 'power_q',
    label: 'Moc bierna',
    unit: 'Mvar',
    description: 'Moc bierna Q',
    rangeKey: 'power_mvar',
    formatRange: formatPowerMvarRange,
  },
];

// =============================================================================
// Loading Color Scale Component
// =============================================================================

function LoadingColorScale() {
  return (
    <div data-testid="sld-legend-loading-scale" className="mt-2">
      <div className="mb-1 text-xs font-medium text-slate-700">Skala obciążenia:</div>
      <div className="flex items-center gap-1 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm bg-emerald-500" />
          <span className="text-slate-600">0–80%</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <div className="h-3 w-3 rounded-sm bg-amber-500" />
          <span className="text-slate-600">80–100%</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <div className="h-3 w-3 rounded-sm bg-rose-500" />
          <span className="text-slate-600">&gt;100%</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Legend Row Component
// =============================================================================

interface LegendRowProps {
  item: LegendItem;
  ranges: OverlayRanges;
}

function LegendRow({ item, ranges }: LegendRowProps) {
  const range = ranges[item.rangeKey];
  const rangeText = item.formatRange(range);

  // Skip items with no data
  if (!range) return null;

  return (
    <tr data-testid={`sld-legend-row-${item.id}`} className="border-t border-slate-200">
      <td className="py-1 pr-2 text-slate-700 font-medium">{item.label}</td>
      <td className="py-1 pr-2 text-slate-500">[{item.unit}]</td>
      <td className="py-1 text-slate-600 font-mono text-right">{rangeText}</td>
    </tr>
  );
}

// =============================================================================
// Legend Panel Component
// =============================================================================

export interface LegendPanelProps {
  /** Overlay data for range calculation */
  overlay: SldResultOverlay | null;
}

/**
 * SLD Legend Panel.
 * Displays legend with value descriptions and ranges.
 */
export function LegendPanel({ overlay }: LegendPanelProps) {
  // Calculate ranges from overlay data
  const ranges = useMemo(() => calculateOverlayRanges(overlay), [overlay]);

  // Check if we have any data to show
  const hasNodeData = ranges.voltage_pu || ranges.voltage_kv || ranges.ikss_ka;
  const hasBranchData =
    ranges.current_a || ranges.loading_pct || ranges.power_mw || ranges.power_mvar;

  if (!hasNodeData && !hasBranchData) {
    return null;
  }

  return (
    <div
      data-testid="sld-legend-panel"
      className="absolute bottom-3 right-3 z-20 rounded-lg border border-slate-300 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
      style={{ minWidth: '240px', maxWidth: '320px' }}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h3
          data-testid="sld-legend-title"
          className="text-sm font-semibold text-slate-800"
        >
          Legenda
        </h3>
      </div>

      {/* Node values section */}
      {hasNodeData && (
        <div data-testid="sld-legend-nodes-section" className="mb-3">
          <div className="mb-1 text-xs font-medium text-blue-700 uppercase tracking-wide">
            Węzły
          </div>
          <table className="w-full text-xs">
            <tbody>
              {NODE_LEGEND_ITEMS.map((item) => (
                <LegendRow key={item.id} item={item} ranges={ranges} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch values section */}
      {hasBranchData && (
        <div data-testid="sld-legend-branches-section">
          <div className="mb-1 text-xs font-medium text-emerald-700 uppercase tracking-wide">
            Gałęzie
          </div>
          <table className="w-full text-xs">
            <tbody>
              {BRANCH_LEGEND_ITEMS.map((item) => (
                <LegendRow key={item.id} item={item} ranges={ranges} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loading color scale */}
      {ranges.loading_pct && <LoadingColorScale />}
    </div>
  );
}
