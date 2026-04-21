/**
 * JunctionDotLayer — Warstwa kropek polaczeniowych IEC 61082
 *
 * Renderuje junction dots na WSZYSTKICH polaczeniach zdefiniowanych
 * w CanonicalAnnotationsV1.
 *
 * CANONICAL: IEC 61082 — "filled junction dot" at every T-junction.
 */
import React from 'react';
import type { CanonicalAnnotationsV1 } from './core/layoutResult';
import { JunctionDot } from './symbols/JunctionDot';
import { CANONICAL_VOLTAGE_COLORS } from './sldCanonicalStyle';

export interface JunctionDotLayerProps {
  annotations: CanonicalAnnotationsV1;
  colorSN?: string;
  colorNN?: string;
}

export const JunctionDotLayer: React.FC<JunctionDotLayerProps> = ({
  annotations,
  colorSN = CANONICAL_VOLTAGE_COLORS.SN,
  colorNN = CANONICAL_VOLTAGE_COLORS.nN,
}) => {
  // Collect all junction dot positions from annotations
  const dots: Array<{ x: number; y: number; color: string; key: string }> = [];

  // Trunk node junction dots
  for (const node of annotations.trunkNodes) {
    dots.push({
      x: node.position.x,
      y: node.position.y,
      color: colorSN,
      key: `trunk-${node.nodeId}`,
    });
  }

  // Branch point junction dots (at trunk connection)
  for (const bp of annotations.branchPoints) {
    dots.push({
      x: bp.position.x,
      y: bp.position.y,
      color: colorSN,
      key: `branch-${bp.branchId}`,
    });
  }

  // Station apparatus junction dots (between each apparatus)
  for (const chain of annotations.stationChains) {
    for (const item of chain.apparatus) {
      dots.push({
        x: item.position.x,
        y: item.position.y,
        color: colorSN,
        key: `apparatus-${chain.stationId}-${item.designation}`,
      });
    }
    // NN busbar feeder junction dots
    for (const feeder of chain.nnBusbar.feeders) {
      dots.push({
        x: chain.apparatus[0]?.position.x ?? 0,
        y: (chain.apparatus[chain.apparatus.length - 1]?.position.y ?? 0) + 60,
        color: colorNN,
        key: `feeder-${chain.stationId}-${feeder.designation}`,
      });
    }
  }

  return (
    <g data-sld-role="junction-dot-layer">
      {dots.map((dot) => (
        <JunctionDot
          key={dot.key}
          x={dot.x}
          y={dot.y}
          color={dot.color}
        />
      ))}
    </g>
  );
};
