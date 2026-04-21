/**
 * InlineBranchObjectRenderer - thin adapter for inline SN branch objects.
 *
 * Canonical rule:
 * - shared symbol shapes live in CanonicalSymbolRenderer/SymbolResolver,
 * - this component owns only object placement, branch leader lines and labels.
 */

import React from 'react';
import { CanonicalSymbol } from './CanonicalSymbolRenderer';
import type { InlineBranchObjectV1 } from './core/layoutResult';
import { CANONICAL_VOLTAGE_COLORS, CANONICAL_TYPOGRAPHY } from './sldCanonicalStyle';

export interface InlineBranchObjectRendererProps {
  obj: InlineBranchObjectV1;
  selected?: boolean;
  onClick?: (nodeId: string) => void;
  onDoubleClick?: (nodeId: string) => void;
  showTechnicalLabels?: boolean;
}

const SN_COLOR = CANONICAL_VOLTAGE_COLORS.SN;
const SELECTED_COLOR = '#2563EB';

function inlineBranchSymbolId(objectType: InlineBranchObjectV1['objectType']): 'branch_pole' | 'zksn' {
  return objectType === 'branch_pole' ? 'branch_pole' : 'zksn';
}

function inlineBranchSymbolSize(objectType: InlineBranchObjectV1['objectType']): number {
  return objectType === 'branch_pole' ? 20 : 24;
}

function technicalLabelForObject(objectType: InlineBranchObjectV1['objectType']): string {
  return objectType === 'branch_pole' ? 'SO' : 'ZK';
}

export const InlineBranchObjectRenderer: React.FC<InlineBranchObjectRendererProps> = ({
  obj,
  selected = false,
  onClick,
  onDoubleClick,
  showTechnicalLabels = false,
}) => {
  const { nodeId, objectType, label, position, branchPortCount } = obj;
  const { x, y } = position;
  const stroke = selected ? SELECTED_COLOR : SN_COLOR;
  const symbolId = inlineBranchSymbolId(objectType);
  const symbolSize = inlineBranchSymbolSize(objectType);
  const symbolHalfWidth = symbolSize / 2;
  const symbolHalfHeight = symbolSize / 2;

  const handleClick = onClick
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        onClick(nodeId);
      }
    : undefined;

  const handleDoubleClick = onDoubleClick
    ? (event: React.MouseEvent) => {
        event.stopPropagation();
        onDoubleClick(nodeId);
      }
    : undefined;

  return (
    <g
      data-testid={`sld-inline-branch-object-${nodeId}`}
      data-element-id={nodeId}
      data-element-type={objectType === 'branch_pole' ? 'BranchPole' : 'ZKSN'}
      data-element-name={label}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <g
        transform={`translate(${x - symbolHalfWidth}, ${y - symbolHalfHeight})`}
        data-sld-role={objectType === 'branch_pole' ? 'inline-branch-pole' : 'inline-zksn'}
        data-node-id={nodeId}
        data-testid={objectType === 'branch_pole' ? `sld-branch-pole-${label}` : `sld-zksn-${label}`}
      >
        <CanonicalSymbol
          symbolId={symbolId}
          size={symbolSize}
          stroke={stroke}
          fill={selected ? '#DBEAFE' : objectType === 'branch_pole' ? 'white' : '#F8FAFC'}
        />
      </g>

      {branchPortCount >= 1 && (
        <>
          <line
            x1={x + symbolHalfWidth}
            y1={y - (branchPortCount > 1 ? 3 : 0)}
            x2={x + symbolHalfWidth + 16}
            y2={y - (branchPortCount > 1 ? 3 : 0)}
            stroke={stroke}
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />
          <polygon
            points={`${x + symbolHalfWidth + 16},${y - (branchPortCount > 1 ? 6 : 3)} ${x + symbolHalfWidth + 22},${y - (branchPortCount > 1 ? 3 : 0)} ${x + symbolHalfWidth + 16},${y + (branchPortCount > 1 ? 0 : 3)}`}
            fill={stroke}
            stroke="none"
          />
        </>
      )}
      {branchPortCount >= 2 && (
        <>
          <line
            x1={x + symbolHalfWidth}
            y1={y + 3}
            x2={x + symbolHalfWidth + 16}
            y2={y + 3}
            stroke={stroke}
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />
          <polygon
            points={`${x + symbolHalfWidth + 16},${y} ${x + symbolHalfWidth + 22},${y + 3} ${x + symbolHalfWidth + 16},${y + 6}`}
            fill={stroke}
            stroke="none"
          />
        </>
      )}

      {showTechnicalLabels && (
        <text
          x={x}
          y={y - symbolHalfHeight - 6}
          textAnchor="middle"
          fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
          fontSize={CANONICAL_TYPOGRAPHY.fontSize.xsmall}
          fill={CANONICAL_TYPOGRAPHY.secondaryColor}
        >
          {technicalLabelForObject(objectType)}
        </text>
      )}

      <text
        x={x}
        y={y + symbolHalfHeight + 12}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.small}
        fill={selected ? SELECTED_COLOR : CANONICAL_TYPOGRAPHY.labelColor}
        fontWeight={selected ? CANONICAL_TYPOGRAPHY.fontWeight.semibold : CANONICAL_TYPOGRAPHY.fontWeight.normal}
      >
        {label}
      </text>
    </g>
  );
};

export default InlineBranchObjectRenderer;
