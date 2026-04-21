import React from 'react';
import type {
  TrunkNodeAnnotationV1,
  TrunkSegmentAnnotationV1,
} from './core/layoutResult';
import { JunctionDot } from './symbols/JunctionDot';
import {
  TRUNK_STROKE_WIDTH,
  OVERHEAD_DASH_ARRAY,
  GRID_BASE,
} from './IndustrialAesthetics';
import { CANONICAL_VOLTAGE_COLORS } from './sldCanonicalStyle';

export interface TrunkSpineRendererProps {
  nodes: readonly TrunkNodeAnnotationV1[];
  segments: readonly TrunkSegmentAnnotationV1[];
  trunkId?: string;
  color?: string;
  showTechnicalLabels?: boolean;
}

/**
 * GPZ busbar width calculation (the ONLY real SN busbar in the network).
 * Width scales with number of line fields (pola liniowe) connected to GPZ.
 * Minimum 200px, grows by GRID_BASE*4 per additional field.
 */
function gpzBusbarWidth(fieldCount: number): number {
  const minWidth = 200;
  const perField = GRID_BASE * 4;
  return Math.max(minWidth, 120 + fieldCount * perField);
}

export const TrunkSpineRenderer: React.FC<TrunkSpineRendererProps> = ({
  nodes,
  segments,
  trunkId = 'M1',
  color = CANONICAL_VOLTAGE_COLORS.SN,
  showTechnicalLabels = false,
}) => {
  if (nodes.length === 0) return null;

  const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const yMin = sortedNodes[0].position.y;
  const yMax = sortedNodes[sortedNodes.length - 1].position.y;
  const trunkX = sortedNodes[0].position.x;

  // GPZ busbar — ALWAYS HORIZONTAL, ABB-grade
  const busbarWidth = gpzBusbarWidth(sortedNodes.length);
  const busbarY = yMin - 40;
  const busbarX1 = trunkX - busbarWidth / 2;
  const busbarX2 = trunkX + busbarWidth / 2;
  const busbarThickness = 8;

  return (
    <g data-sld-role="trunk-spine" data-trunk-id={trunkId}>
      {/* ═══════════════════════════════════════════════════════════
          GPZ BLOCK — ABB-style: compact, professional
          ═══════════════════════════════════════════════════════════ */}
      <g data-sld-role="gpz-block">
        {/* GPZ background panel — subtle, clean */}
        <rect
          x={busbarX1 - 16}
          y={busbarY - 44}
          width={busbarWidth + 32}
          height={72}
          rx={6}
          ry={6}
          fill="rgba(219, 234, 254, 0.6)"
          stroke="#1D4ED8"
          strokeWidth={1.8}
        />

        {/* GPZ title — compact ABB typography */}
        <text
          x={trunkX}
          y={busbarY - 20}
          textAnchor="middle"
          className="sld-gpz-title"
        >
          GPZ — Rozdzielnia SN
        </text>
        <text
          x={trunkX}
          y={busbarY - 6}
          textAnchor="middle"
          className="sld-gpz-subtitle"
        >
          {trunkId} • Magistrala główna
        </text>

        {/* ─── HORIZONTAL GPZ BUSBAR — ABB-grade dominant element ─── */}
        {/* Busbar shadow for depth */}
        <line
          x1={busbarX1}
          y1={busbarY + 2}
          x2={busbarX2}
          y2={busbarY + 2}
          stroke="rgba(29, 78, 216, 0.15)"
          strokeWidth={busbarThickness + 4}
          strokeLinecap="round"
        />
        {/* Main busbar body */}
        <line
          x1={busbarX1}
          y1={busbarY}
          x2={busbarX2}
          y2={busbarY}
          stroke={color}
          strokeWidth={busbarThickness}
          strokeLinecap="round"
          data-sld-role="gpz-busbar"
          className="sld-sn-busbar"
        />
        {/* Busbar end caps — ABB convention */}
        <circle cx={busbarX1} cy={busbarY} r={3} fill={color} stroke="none" />
        <circle cx={busbarX2} cy={busbarY} r={3} fill={color} stroke="none" />

        {/* Vertical drop from busbar to first trunk node */}
        <line
          x1={trunkX}
          y1={busbarY + busbarThickness / 2}
          x2={trunkX}
          y2={yMin}
          stroke={color}
          strokeWidth={TRUNK_STROKE_WIDTH}
          strokeLinecap="round"
        />
        <JunctionDot x={trunkX} y={busbarY} color={color} />
      </g>

      {/* ═══════════════════════════════════════════════════════════
          TRUNK SPINE — Vertical main line
          ═══════════════════════════════════════════════════════════ */}
      <line
        x1={trunkX}
        y1={yMin}
        x2={trunkX}
        y2={yMax}
        stroke={color}
        strokeWidth={TRUNK_STROKE_WIDTH - 1}
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* ═══════════════════════════════════════════════════════════
          TRUNK NODES — T-junction tap-off points (IEC 61082)

          ELEKTROENERGETYKA: Węzeł magistrali to punkt odgałęzienia
          na ciągłym kablu/linii napowietrznej. NIE jest szyną zbiorczą.
          Szyna SN istnieje TYLKO w GPZ (powyżej).
          ═══════════════════════════════════════════════════════════ */}
      {sortedNodes.map((node) => (
        <g key={`field-${node.nodeId}`} data-sld-role="trunk-tap-point" data-node-id={node.nodeId}>
          {/* IEC 61082 junction dot — tap-off point on continuous trunk line */}
          <JunctionDot x={trunkX} y={node.position.y} color={color} />

          {/* Node label — left side of trunk */}
          <text
            x={trunkX - 14}
            y={node.position.y - 6}
            textAnchor="end"
            className="sld-label-node"
          >
            {node.nodeId}
          </text>
          <text
            x={trunkX - 14}
            y={node.position.y + 8}
            textAnchor="end"
            className="sld-label-params"
          >
            {node.kmFromGPZ.toFixed(2)} km
          </text>
          {showTechnicalLabels && (
            <text
              x={trunkX - 14}
              y={node.position.y + 20}
              textAnchor="end"
              className="sld-label-params"
            >
              {node.voltageKV.toFixed(1)}kV Ik3={node.ikss3p.toFixed(1)}kA
            </text>
          )}
        </g>
      ))}

      {/* ═══════════════════════════════════════════════════════════
          TRUNK SEGMENTS — Cable/line labels between nodes
          ═══════════════════════════════════════════════════════════ */}
      {segments.map((seg) => {
        const segIndex = segments.indexOf(seg);
        const nodeAbove = sortedNodes[segIndex];
        const nodeBelow = sortedNodes[segIndex + 1];
        if (!nodeAbove || !nodeBelow) return null;
        const midY = (nodeAbove.position.y + nodeBelow.position.y) / 2;

        return (
          <g key={seg.segmentId} data-sld-role="trunk-segment" data-segment-id={seg.segmentId}>
            {/* Overhead line dashing overlay */}
            {seg.isOverhead && (
              <line
                x1={trunkX}
                y1={nodeAbove.position.y}
                x2={trunkX}
                y2={nodeBelow.position.y}
                stroke={color}
                strokeWidth={TRUNK_STROKE_WIDTH}
                strokeDasharray={OVERHEAD_DASH_ARRAY}
                strokeLinecap="round"
              />
            )}
            {/* Parameter box background */}
            <rect
              x={trunkX + 12}
              y={midY - 14}
              width={140}
              height={30}
              className="sld-param-box"
            />
            {/* Segment label — right side, compact */}
            <text
              x={trunkX + 16}
              y={midY - 2}
              className="sld-label-segment"
            >
              {seg.designation}
            </text>
            <text
              x={trunkX + 16}
              y={midY + 12}
              className="sld-label-params"
            >
              {seg.cableType} • {seg.lengthKm.toFixed(3)} km
            </text>
            {showTechnicalLabels && (
              <text
                x={trunkX + 16}
                y={midY + 20}
                className="sld-label-params"
              >
                R={seg.resistance_ohm.toFixed(3)}&Omega; X={seg.reactance_ohm.toFixed(3)}&Omega;
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};
