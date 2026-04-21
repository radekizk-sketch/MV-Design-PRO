import React, { useMemo } from 'react';
import type { BranchPointV1 } from './core/layoutResult';
import { computeBayLayout } from './core/bayRenderer';
import { JunctionDot } from './symbols/JunctionDot';
import {
  BRANCH_LINE_STROKE_WIDTH,
  OVERHEAD_DASH_ARRAY,
  POWER_ARROW_SIZE,
  STATION_FIELD_OFFSET_X,
} from './IndustrialAesthetics';
import { CANONICAL_VOLTAGE_COLORS } from './sldCanonicalStyle';
import {
  DEFAULT_FIELD_BLOCK_PALETTE,
  StationBlockLayoutSvg,
} from '../field/StationBlockLayoutSvg';

export interface BranchRendererProps {
  branch: BranchPointV1;
  color?: string;
  showTechnicalLabels?: boolean;
}

export const BranchRenderer: React.FC<BranchRendererProps> = ({
  branch,
  color = CANONICAL_VOLTAGE_COLORS.SN,
  showTechnicalLabels = false,
}) => {
  const { position } = branch;
  const dashArray = branch.branchLine.isOverhead ? OVERHEAD_DASH_ARRAY : undefined;
  const block = branch.detail ?? null;

  const bounds = useMemo(
    () => ({
      x: position.x + STATION_FIELD_OFFSET_X - 18,
      y: position.y - 10,
      width: 78,
      height: 96,
    }),
    [position.x, position.y],
  );

  const layout = useMemo(
    () => (block ? computeBayLayout(block, bounds) : null),
    [block, bounds],
  );
  if (!block || !layout) {
    return null;
  }
  const bay = layout.bays[0];
  const busbarEntryX = layout.busbarGeometry.x1 - 10;
  const branchEndX = bay.cableExitPoint.x + 210;
  const dropY = bay.cableExitPoint.y + 64;

  return (
    <g data-sld-role="branch-point" data-branch-id={branch.branchId}>
      <JunctionDot x={position.x} y={position.y} color={color} />
      <line
        x1={position.x}
        y1={position.y}
        x2={busbarEntryX}
        y2={layout.busbarGeometry.y}
        stroke={color}
        strokeWidth={BRANCH_LINE_STROKE_WIDTH}
        strokeLinecap="round"
      />

      <StationBlockLayoutSvg
        detail={block}
        layout={layout}
        palette={{
          ...DEFAULT_FIELD_BLOCK_PALETTE,
          busbar: color,
          connection: color,
          cableMarker: color,
        }}
        resolveDeviceVisual={(deviceId) => {
          if (deviceId.endsWith('-01-ds')) {
            return { label: branch.branchApparatus.designation };
          }
          if (deviceId.endsWith('-02-head')) {
            return { label: branch.physicalLocationId };
          }
          return null;
        }}
        showBusSectionLabels={false}
        showBusbarEndCaps={false}
        showFieldLabels={false}
        showCableExitMarkers={false}
      />

      <line
        x1={bay.cableExitPoint.x}
        y1={bay.cableExitPoint.y}
        x2={branchEndX}
        y2={bay.cableExitPoint.y}
        stroke={color}
        strokeWidth={BRANCH_LINE_STROKE_WIDTH}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
      <line
        x1={branchEndX}
        y1={bay.cableExitPoint.y}
        x2={branchEndX}
        y2={dropY}
        stroke={color}
        strokeWidth={BRANCH_LINE_STROKE_WIDTH}
        strokeDasharray={dashArray}
      />

      <JunctionDot x={branchEndX} y={bay.cableExitPoint.y} color={color} />
      <JunctionDot x={branchEndX} y={dropY} color={color} />

      <polygon
        points={`0,-${POWER_ARROW_SIZE / 2} ${POWER_ARROW_SIZE},0 0,${POWER_ARROW_SIZE / 2}`}
        fill={color}
        transform={`translate(${bay.cableExitPoint.x + 48},${bay.cableExitPoint.y})`}
      />

      <text
        x={bounds.x + bounds.width / 2}
        y={bounds.y - 12}
        textAnchor="middle"
        className="sld-label-iec-designation"
      >
        {branch.branchApparatus.designation}
      </text>
      <text
        x={bounds.x + bounds.width / 2}
        y={bounds.y + bounds.height + 18}
        textAnchor="middle"
        className="sld-label-params"
      >
        Pole {branch.physicalLocation}
      </text>

      <rect
        x={bay.cableExitPoint.x + 20}
        y={bay.cableExitPoint.y - 18}
        width={164}
        height={showTechnicalLabels ? 38 : 30}
        className="sld-param-box"
      />
      <text
        x={bay.cableExitPoint.x + 24}
        y={bay.cableExitPoint.y - 6}
        className="sld-label-segment"
      >
        {branch.branchLine.designation}
      </text>
      <text
        x={bay.cableExitPoint.x + 24}
        y={bay.cableExitPoint.y + 8}
        className="sld-label-params"
      >
        {branch.branchLine.cableType} • {branch.branchLine.lengthKm.toFixed(3)} km
      </text>
      {showTechnicalLabels && (
        <text
          x={bay.cableExitPoint.x + 24}
          y={bay.cableExitPoint.y + 20}
          className="sld-label-params"
        >
          R={branch.branchLine.resistance_ohm.toFixed(3)}Ω X={branch.branchLine.reactance_ohm.toFixed(3)}Ω
        </text>
      )}
    </g>
  );
};
