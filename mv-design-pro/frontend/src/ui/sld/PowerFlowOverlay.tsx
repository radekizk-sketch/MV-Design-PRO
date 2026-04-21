/**
 * PowerFlowOverlay — Warstwa nakładki wyników przepływu mocy na SLD
 *
 * CANONICAL: IEC 61082 / CANONICAL power flow result overlay
 *
 * FEATURES:
 * - Direction arrows (strzałki kierunku przepływu mocy)
 * - Voltage heatmap (kolorowanie węzłów wg napięcia)
 * - Current labels (etykiety prądowe na połączeniach)
 * - Violation markers (markery naruszeń napięciowych/prądowych)
 *
 * RULES:
 * - Pure overlay — NO mutation of model or layout
 * - Deterministic — same results → same rendering
 * - Uses CANONICAL_SLD_STYLES tokens
 */

import React, { useMemo } from 'react';
import { POWER_ARROW_SIZE } from './IndustrialAesthetics';
import { CANONICAL_SLD_STYLES, CANONICAL_VOLTAGE_COLORS } from './sldCanonicalStyle';

// =============================================================================
// TYPES
// =============================================================================

/** Power flow result for a single branch/connection */
export interface BranchFlowResult {
  /** Branch/connection ID */
  branchId: string;
  /** Active power [MW] — positive = from→to direction */
  activePower_MW: number;
  /** Reactive power [Mvar] */
  reactivePower_Mvar: number;
  /** Current magnitude [A] */
  current_A: number;
  /** Loading percentage [%] */
  loading_pct: number;
  /** Midpoint position on SLD for label placement */
  midpoint: { x: number; y: number };
  /** Direction vector (normalized) for arrow */
  direction: { dx: number; dy: number };
}

/** Voltage result for a single node/bus */
export interface NodeVoltageResult {
  /** Node/bus ID */
  nodeId: string;
  /** Voltage magnitude [p.u.] */
  voltage_pu: number;
  /** Voltage magnitude [kV] */
  voltage_kV: number;
  /** Position on SLD */
  position: { x: number; y: number };
  /** Is this a violation? */
  violation: boolean;
  /** Violation type */
  violationType?: 'undervoltage' | 'overvoltage';
}

export interface PowerFlowOverlayProps {
  /** Branch flow results */
  branchFlows: BranchFlowResult[];
  /** Node voltage results */
  nodeVoltages: NodeVoltageResult[];
  /** Show direction arrows */
  showArrows?: boolean;
  /** Show voltage heatmap */
  showHeatmap?: boolean;
  /** Show current labels */
  showCurrentLabels?: boolean;
  /** Show violation markers */
  showViolations?: boolean;
}

// =============================================================================
// HELPER — Voltage heatmap color
// =============================================================================

function voltageHeatmapColor(voltage_pu: number): string {
  if (voltage_pu < 0.95) return '#DC2626'; // red — undervoltage
  if (voltage_pu > 1.05) return '#D97706'; // amber — overvoltage
  return '#10B981'; // green — normal
}

function loadingColor(loading_pct: number): string {
  if (loading_pct > 100) return '#DC2626'; // red — overloaded
  if (loading_pct > 80) return '#D97706'; // amber — high loading
  return CANONICAL_SLD_STYLES.powerArrow.loadColor;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Power flow direction arrow */
const FlowArrow: React.FC<{
  x: number;
  y: number;
  dx: number;
  dy: number;
  isGeneration: boolean;
  size?: number;
}> = ({ x, y, dx, dy, isGeneration, size = POWER_ARROW_SIZE }) => {
  // Calculate rotation angle from direction
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const color = isGeneration
    ? CANONICAL_SLD_STYLES.powerArrow.generationColor
    : CANONICAL_SLD_STYLES.powerArrow.loadColor;

  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      <polygon
        points={`${size},0 ${-size / 2},${size / 2} ${-size / 2},${-size / 2}`}
        fill={color}
        stroke="none"
        className="sld-power-arrow"
        data-testid={`power-flow-arrow-${Math.round(x)}-${Math.round(y)}`}
      />
    </g>
  );
};

/** Voltage heatmap ring around node */
const VoltageHeatmapRing: React.FC<{
  x: number;
  y: number;
  voltage_pu: number;
  violation: boolean;
}> = ({ x, y, voltage_pu, violation }) => {
  const color = voltageHeatmapColor(voltage_pu);
  const radius = violation ? 14 : 10;

  return (
    <circle
      cx={x}
      cy={y}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={violation ? 2.5 : 1.5}
      strokeDasharray={violation ? '3 2' : 'none'}
      opacity={violation ? 0.9 : 0.6}
      className={violation ? 'sld-violation-marker sld-violation-pulse' : ''}
      data-testid={`voltage-heatmap-${Math.round(x)}-${Math.round(y)}`}
    />
  );
};

/** Current label on branch */
const CurrentLabel: React.FC<{
  x: number;
  y: number;
  current_A: number;
  loading_pct: number;
}> = ({ x, y, current_A, loading_pct }) => {
  const color = loadingColor(loading_pct);
  const text = `${current_A.toFixed(1)} A`;

  return (
    <g data-testid={`current-label-${Math.round(x)}-${Math.round(y)}`}>
      {/* White background for readability */}
      <rect
        x={x - 24}
        y={y - 7}
        width={48}
        height={14}
        fill="white"
        opacity={0.85}
        rx={2}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="sld-label-flow"
        fill={color}
        fontSize={9}
      >
        {text}
      </text>
    </g>
  );
};

/** Violation marker with label */
const ViolationMarker: React.FC<{
  x: number;
  y: number;
  type: 'undervoltage' | 'overvoltage';
  voltage_pu: number;
}> = ({ x, y, type, voltage_pu }) => {
  const label = type === 'undervoltage' ? `${voltage_pu.toFixed(3)} pu ▼` : `${voltage_pu.toFixed(3)} pu ▲`;

  return (
    <g data-testid={`violation-marker-${Math.round(x)}-${Math.round(y)}`}>
      {/* Background */}
      <rect
        x={x + 16}
        y={y - 8}
        width={70}
        height={16}
        fill={type === 'undervoltage' ? '#FEE2E2' : '#FEF3C7'}
        stroke={type === 'undervoltage' ? '#DC2626' : '#D97706'}
        strokeWidth={1}
        rx={3}
        opacity={0.9}
      />
      {/* Label */}
      <text
        x={x + 51}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fontWeight={600}
        fontFamily="'JetBrains Mono', monospace"
        fill={type === 'undervoltage' ? '#DC2626' : '#D97706'}
      >
        {label}
      </text>
    </g>
  );
};

// =============================================================================
// MAIN OVERLAY COMPONENT
// =============================================================================

export const PowerFlowOverlay: React.FC<PowerFlowOverlayProps> = ({
  branchFlows,
  nodeVoltages,
  showArrows = true,
  showHeatmap = true,
  showCurrentLabels = true,
  showViolations = true,
}) => {
  // Deterministic sort
  const sortedFlows = useMemo(
    () => [...branchFlows].sort((a, b) => a.branchId.localeCompare(b.branchId)),
    [branchFlows]
  );

  const sortedVoltages = useMemo(
    () => [...nodeVoltages].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    [nodeVoltages]
  );

  const violations = useMemo(
    () => sortedVoltages.filter((v) => v.violation && v.violationType),
    [sortedVoltages]
  );

  return (
    <g data-sld-role="power-flow-overlay" data-testid="power-flow-overlay">
      {/* Layer 1: Voltage heatmap rings (below arrows) */}
      {showHeatmap && (
        <g data-sld-role="voltage-heatmap-layer">
          {sortedVoltages.map((v) => (
            <VoltageHeatmapRing
              key={`heatmap-${v.nodeId}`}
              x={v.position.x}
              y={v.position.y}
              voltage_pu={v.voltage_pu}
              violation={v.violation}
            />
          ))}
        </g>
      )}

      {/* Layer 2: Power flow arrows */}
      {showArrows && (
        <g data-sld-role="power-flow-arrows-layer">
          {sortedFlows.map((f) => (
            <FlowArrow
              key={`arrow-${f.branchId}`}
              x={f.midpoint.x}
              y={f.midpoint.y}
              dx={f.direction.dx}
              dy={f.direction.dy}
              isGeneration={f.activePower_MW < 0}
            />
          ))}
        </g>
      )}

      {/* Layer 3: Current labels */}
      {showCurrentLabels && (
        <g data-sld-role="current-labels-layer">
          {sortedFlows.map((f) => (
            <CurrentLabel
              key={`current-${f.branchId}`}
              x={f.midpoint.x}
              y={f.midpoint.y + 16}
              current_A={f.current_A}
              loading_pct={f.loading_pct}
            />
          ))}
        </g>
      )}

      {/* Layer 4: Violation markers */}
      {showViolations && (
        <g data-sld-role="violation-markers-layer">
          {violations.map((v) => (
            <ViolationMarker
              key={`violation-${v.nodeId}`}
              x={v.position.x}
              y={v.position.y}
              type={v.violationType!}
              voltage_pu={v.voltage_pu}
            />
          ))}
        </g>
      )}
    </g>
  );
};

/**
 * CANONICAL voltage color helper for SLD overlays.
 * Maps kV to CANONICAL voltage color (WN/SN/nN).
 */
export function getOverlayVoltageColor(kV: number): string {
  if (kV >= 110) return CANONICAL_VOLTAGE_COLORS.WN;
  if (kV >= 6) return CANONICAL_VOLTAGE_COLORS.SN;
  if (kV > 0) return CANONICAL_VOLTAGE_COLORS.nN;
  return CANONICAL_VOLTAGE_COLORS.default;
}

export default PowerFlowOverlay;
