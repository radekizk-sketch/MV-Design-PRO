/**
 * SLD Results Overlay Component
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § B: Results as Overlay (never modifies model)
 * - sld_rules.md § C.2: RESULT_VIEW mode
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * FEATURES:
 * - Renders result values on SLD elements
 * - Voltage labels on buses
 * - Current/loading labels on branches
 * - Loading color-coding (green/yellow/red)
 * - Highlight active selected element
 * - Respects result_status (FRESH/OUTDATED)
 *
 * RULES:
 * - READ-ONLY: No model mutations
 * - Overlay is pointer-events-none (passthrough clicks)
 * - Uses existing result data from store
 */

import { useMemo } from 'react';
import type { AnySldSymbol, Position } from '../sld-editor/types';
import type { ViewportState } from './types';
import { useResultsInspectorStore } from '../results-inspector/store';
import { buildOverlayPositionMaps, getLoadingColorClass, getLoadingBgClass } from './overlayUtils';
import { LegendPanel } from './LegendPanel';
import {
  classifyVoltage,
  getVoltageTextColor,
  getVoltageBgColor,
  getEvStatusBadgeClass,
  getEvStatusLabel,
} from './voltageColorScale';

// =============================================================================
// Formatters (deterministic)
// =============================================================================

function formatVoltage(value: number | undefined, unit: 'kV' | 'pu'): string {
  if (value === undefined) return '';
  if (unit === 'pu') {
    return `${value.toFixed(4)} pu`;
  }
  return `${value.toFixed(2)} kV`;
}

function formatCurrent(value: number | undefined): string {
  if (value === undefined) return '';
  return `${value.toFixed(1)} A`;
}

function formatLoading(value: number | undefined): string {
  if (value === undefined) return '';
  return `${value.toFixed(1)}%`;
}

function formatPower(p: number | undefined, q: number | undefined): string {
  if (p === undefined && q === undefined) return '';
  const pStr = p !== undefined ? `${p.toFixed(2)} MW` : '';
  const qStr = q !== undefined ? `${q.toFixed(2)} Mvar` : '';
  if (pStr && qStr) return `${pStr}, ${qStr}`;
  return pStr || qStr;
}

function formatShortCircuit(ikss: number | undefined): string {
  if (ikss === undefined) return '';
  return `Ik''=${ikss.toFixed(2)} kA`;
}

// =============================================================================
// Node Label Component
// =============================================================================

interface NodeLabelProps {
  nodeId: string;
  position: Position;
  voltage?: { kv?: number; pu?: number };
  shortCircuit?: { ikss_ka?: number; sk_mva?: number };
  evStatus?: string;
  isOutdated: boolean;
  isSelected: boolean;
}

function NodeLabel({
  nodeId,
  position,
  voltage,
  shortCircuit,
  evStatus,
  isOutdated,
  isSelected,
}: NodeLabelProps) {
  const hasVoltage = voltage && (voltage.kv !== undefined || voltage.pu !== undefined);
  const hasShortCircuit = shortCircuit && shortCircuit.ikss_ka !== undefined;
  const hasEvStatus = evStatus && evStatus !== 'PASS';

  if (!hasVoltage && !hasShortCircuit && !hasEvStatus) return null;

  const voltageLevel = classifyVoltage(voltage?.pu);
  const voltageTextClass = getVoltageTextColor(voltageLevel);

  const borderClass = isSelected
    ? 'border-blue-500 ring-2 ring-blue-300'
    : isOutdated
      ? 'border-slate-300'
      : 'border-blue-200';

  const bgClass = isOutdated
    ? 'bg-slate-100 opacity-60'
    : hasVoltage
      ? getVoltageBgColor(voltageLevel)
      : 'bg-blue-50';

  return (
    <div
      data-testid={`sld-overlay-node-${nodeId}`}
      className={`pointer-events-none absolute z-10 rounded border px-1.5 py-0.5 text-xs shadow-sm ${borderClass} ${bgClass}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y - 28}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {hasVoltage && (
        <span className={voltageTextClass}>
          {formatVoltage(voltage.kv, 'kV')}
          {voltage.pu !== undefined && (
            <span className="ml-1 opacity-80">({formatVoltage(voltage.pu, 'pu')})</span>
          )}
        </span>
      )}
      {hasShortCircuit && (
        <span className="ml-2 font-semibold text-rose-700">
          {formatShortCircuit(shortCircuit.ikss_ka)}
        </span>
      )}
      {hasEvStatus && (
        <span
          data-testid={`sld-overlay-ev-${nodeId}`}
          className={`ml-1.5 inline-block rounded border px-1 text-[10px] ${getEvStatusBadgeClass(evStatus)}`}
        >
          {getEvStatusLabel(evStatus)}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Branch Label Component
// =============================================================================

interface BranchLabelProps {
  branchId: string;
  position: Position;
  current?: number;
  loading?: number;
  power?: { p?: number; q?: number };
  evStatus?: string;
  isOutdated: boolean;
  isSelected: boolean;
}

function BranchLabel({
  branchId,
  position,
  current,
  loading,
  power,
  evStatus,
  isOutdated,
  isSelected,
}: BranchLabelProps) {
  const hasCurrent = current !== undefined;
  const hasLoading = loading !== undefined;
  const hasPower = power && (power.p !== undefined || power.q !== undefined);
  const hasEvStatus = evStatus && evStatus !== 'PASS';

  if (!hasCurrent && !hasLoading && !hasPower && !hasEvStatus) return null;

  const loadingColorClass = getLoadingColorClass(loading);
  const loadingBgClass = getLoadingBgClass(loading);

  const borderClass = isSelected
    ? 'ring-2 ring-blue-300'
    : '';

  const bgClass = isOutdated ? 'bg-slate-100 border-slate-300 opacity-60' : loadingBgClass;

  return (
    <div
      data-testid={`sld-overlay-branch-${branchId}`}
      className={`pointer-events-none absolute z-10 rounded border px-1.5 py-0.5 text-xs shadow-sm ${bgClass} ${borderClass}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="flex items-center gap-2">
        {hasCurrent && <span className="text-slate-700">{formatCurrent(current)}</span>}
        {hasLoading && (
          <span className={loadingColorClass}>{formatLoading(loading)}</span>
        )}
        {hasEvStatus && (
          <span
            data-testid={`sld-overlay-ev-${branchId}`}
            className={`inline-block rounded border px-1 text-[10px] ${getEvStatusBadgeClass(evStatus)}`}
          >
            {getEvStatusLabel(evStatus)}
          </span>
        )}
      </div>
      {hasPower && (
        <div className="text-slate-600">{formatPower(power.p, power.q)}</div>
      )}
    </div>
  );
}

// =============================================================================
// Results Overlay Container
// =============================================================================

export interface ResultsOverlayProps {
  /** SLD symbols for position mapping */
  symbols: AnySldSymbol[];

  /** Current viewport state */
  viewport: ViewportState;

  /** Currently selected element ID */
  selectedElementId?: string | null;

  /** Force visibility (overrides store) */
  visible?: boolean;
}

/**
 * SLD Results Overlay.
 * Renders result values as labels on SLD elements.
 */
export function ResultsOverlay({
  symbols,
  viewport,
  selectedElementId,
  visible,
}: ResultsOverlayProps) {
  // Get overlay data from store
  const { sldOverlay, overlayVisible } = useResultsInspectorStore();

  // Determine visibility
  const isVisible = visible !== undefined ? visible : overlayVisible;

  // Check if results are outdated
  const isOutdated = useMemo(
    () => sldOverlay?.result_status === 'OUTDATED',
    [sldOverlay?.result_status]
  );

  // Build position maps from symbols
  const { nodePositions, branchPositions } = useMemo(
    () => buildOverlayPositionMaps(symbols, viewport),
    [symbols, viewport]
  );

  // Build node labels
  const nodeLabels = useMemo(() => {
    if (!sldOverlay || !isVisible) return [];

    return sldOverlay.nodes
      .map((node) => {
        const position = nodePositions.get(node.node_id);
        if (!position) return null;

        return {
          nodeId: node.node_id,
          position,
          voltage: {
            kv: node.u_kv,
            pu: node.u_pu,
          },
          shortCircuit: {
            ikss_ka: node.ikss_ka,
            sk_mva: node.sk_mva,
          },
          evStatus: node.ev_status ?? node.voltage_status,
          isSelected: selectedElementId === node.node_id,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [sldOverlay, nodePositions, isVisible, selectedElementId]);

  // Build branch labels
  const branchLabels = useMemo(() => {
    if (!sldOverlay || !isVisible) return [];

    return sldOverlay.branches
      .map((branch) => {
        const position = branchPositions.get(branch.branch_id);
        if (!position) return null;

        return {
          branchId: branch.branch_id,
          position,
          current: branch.i_a,
          loading: branch.loading_pct,
          power: {
            p: branch.p_mw,
            q: branch.q_mvar,
          },
          evStatus: branch.ev_status,
          isSelected: selectedElementId === branch.branch_id,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [sldOverlay, branchPositions, isVisible, selectedElementId]);

  // Don't render if not visible or no data
  if (!isVisible || !sldOverlay) return null;

  return (
    <div
      data-testid="sld-results-overlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Outdated warning badge */}
      {isOutdated && (
        <div
          data-testid="sld-overlay-outdated-warning"
          className="absolute left-2 top-2 z-20 rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs text-amber-800"
        >
          Wyniki nieaktualne
        </div>
      )}

      {/* Node labels */}
      {nodeLabels.map((label) => (
        <NodeLabel
          key={label.nodeId}
          nodeId={label.nodeId}
          position={label.position}
          voltage={label.voltage}
          shortCircuit={label.shortCircuit}
          evStatus={label.evStatus}
          isOutdated={isOutdated}
          isSelected={label.isSelected}
        />
      ))}

      {/* Branch labels */}
      {branchLabels.map((label) => (
        <BranchLabel
          key={label.branchId}
          branchId={label.branchId}
          position={label.position}
          current={label.current}
          loading={label.loading}
          power={label.power}
          evStatus={label.evStatus}
          isOutdated={isOutdated}
          isSelected={label.isSelected}
        />
      ))}

      {/* Legend panel */}
      <LegendPanel overlay={sldOverlay} />
    </div>
  );
}
