/**
 * SpineRenderer — rysuje oś ciągu SN (spine) + węzły + odgałęzienia.
 *
 * Spine = jeden line_run (run_kind === 'main_trunk') reprezentowany pojedynczą
 * poziomą linią. Stacje/ZKSN/słupy/NOP są węzłami na osi. Odgałęzienia (branch
 * runs) startują od węzła oryginu i schodzą w dół.
 *
 * LOD-aware: na overview (LOD 0) rysujemy tylko oś + węzły jako kropki.
 * Na medium+ widoczne odgałęzienia.
 *
 * Pure presentational. Brak fizyki, brak mutacji modelu.
 */

import type { SpineCorridor, SpineModel } from '../builder/SpinePolicy';
import { isVisibleAtLod, type LodLevel } from '../lod/LodPolicy';

const SPINE_STROKE_PX = 3;
const SPINE_COLOR = '#1f2937';
const NODE_RADIUS_OVERVIEW = 4;
const NODE_RADIUS_DETAIL = 6;
const BRANCH_LENGTH_PX = 40;
const BRANCH_STROKE_PX = 2;
const BRANCH_COLOR = '#6b7280';

function nodeFill(kind: SpineCorridor['nodes'][number]['kind']): string {
  switch (kind) {
    case 'gpz':
      return '#1e40af';
    case 'station':
      return '#0f766e';
    case 'zksn':
      return '#92400e';
    case 'pole':
      return '#374151';
    case 'nop':
      return '#dc2626';
  }
}

/** Severity → kolor obwódki węzła (real-time error na SLD, kryt. #9). */
const ISSUE_STROKE: Record<'ERROR' | 'WARNING', string> = {
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
};

export interface SpineRendererProps {
  readonly model: SpineModel;
  readonly lod: LodLevel;
  /** Opcjonalny callback selekcji. */
  readonly onSelect?: (ref: string) => void;
  /**
   * Mapa ref elementu → najwyższa severity problemu semantycznego.
   * Węzły z problemem dostają czerwoną (ERROR) / bursztynową (WARNING) obwódkę.
   * Czysto prezentacyjne — dane pochodzą z validate_semantic (store.lastSemanticIssues).
   */
  readonly issuesByRef?: Readonly<Record<string, 'ERROR' | 'WARNING'>>;
}

export function SpineRenderer({ model, lod, onSelect, issuesByRef }: SpineRendererProps) {
  const axisVisible = isVisibleAtLod('spine_axis', lod);
  const nodesVisible = isVisibleAtLod('spine_node', lod);
  const branchesVisible = isVisibleAtLod('spine_branch', lod);
  const nodeRadius = lod >= 2 ? NODE_RADIUS_DETAIL : NODE_RADIUS_OVERVIEW;

  if (!axisVisible && !nodesVisible) return null;

  return (
    <g data-testid="spine-renderer" data-lod={lod}>
      {model.corridors.map((corridor) => (
        <g key={corridor.spineId} data-spine-id={corridor.spineId}>
          {axisVisible && (
            <line
              x1={corridor.xStart}
              y1={corridor.axisY}
              x2={corridor.xEnd}
              y2={corridor.axisY}
              stroke={SPINE_COLOR}
              strokeWidth={SPINE_STROKE_PX}
              strokeLinecap="round"
              data-testid={`spine-axis-${corridor.spineId}`}
            />
          )}
          {branchesVisible &&
            corridor.branches.map((branch) => (
              <line
                key={branch.branchRunId}
                x1={branch.originX}
                y1={corridor.axisY}
                x2={branch.originX}
                y2={corridor.axisY + BRANCH_LENGTH_PX}
                stroke={BRANCH_COLOR}
                strokeWidth={BRANCH_STROKE_PX}
                strokeLinecap="round"
                data-testid={`spine-branch-${branch.branchRunId}`}
              />
            ))}
          {nodesVisible &&
            corridor.nodes.map((node) => {
              const severity = issuesByRef?.[node.ref];
              const hasIssue = Boolean(severity);
              return (
              <g
                key={node.ref}
                onClick={onSelect ? () => onSelect(node.ref) : undefined}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                data-spine-node={node.ref}
                data-node-kind={node.kind}
                data-has-issue={hasIssue ? severity : undefined}
              >
                <circle
                  cx={node.x}
                  cy={corridor.axisY}
                  r={hasIssue ? nodeRadius + 1.5 : nodeRadius}
                  fill={nodeFill(node.kind)}
                  stroke={severity ? ISSUE_STROKE[severity] : '#ffffff'}
                  strokeWidth={hasIssue ? 3 : 1.5}
                />
                {lod >= 1 && (
                  <text
                    x={node.x}
                    y={corridor.axisY - nodeRadius - 4}
                    textAnchor="middle"
                    fontSize={lod >= 3 ? 11 : 9}
                    fill="#111827"
                    pointerEvents="none"
                  >
                    {node.label}
                  </text>
                )}
              </g>
              );
            })}
        </g>
      ))}
    </g>
  );
}
