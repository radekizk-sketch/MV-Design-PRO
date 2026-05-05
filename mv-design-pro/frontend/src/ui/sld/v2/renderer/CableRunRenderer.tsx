/**
 * CableRunRenderer — renderer ciągu liniowego (PR-5b).
 *
 * Renderuje ciąg liniowy = sekwencja segmentów + stacji jako jeden konstrukt.
 * Łączy gpz_bay_port → station → station → ... → end.
 */

import {
  COLOR_LINE_PRIMARY,
  STROKE_BRANCH_LINE_PX,
  STROKE_TRUNK_LINE_PX,
  STROKE_DASHED_RING_DASH_PX,
} from '../theme/tokens';

export interface CableRunRendererProps {
  readonly id: string;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  /** Punkty ścieżki ciągu (ortogonalne L-shape przez kanał Y). */
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly segmentKind: 'cable_sn' | 'overhead_line_sn';
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
}

export function CableRunRenderer(props: CableRunRendererProps): JSX.Element | null {
  const { id, runKind, pathPoints, segmentKind, selected, onClick } = props;
  if (pathPoints.length < 2) return null;

  // Trunk = grubszy, branch = cieńszy, ring = przerywany.
  const strokeWidth = runKind === 'branch'
    ? STROKE_BRANCH_LINE_PX
    : STROKE_TRUNK_LINE_PX;

  const isDashed = runKind === 'ring' || runKind === 'loop';
  const isOverhead = segmentKind === 'overhead_line_sn';

  // Linia napowietrzna: dłuższe kreski + punkty (różny dash niż ring).
  const dasharray = isDashed
    ? STROKE_DASHED_RING_DASH_PX
    : isOverhead
      ? '12 4'
      : undefined;

  const path = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  return (
    <g
      data-testid={`sld-v2-run-${id}`}
      data-element-kind="cable_run"
      data-element-id={id}
      data-run-kind={runKind}
      data-segment-kind={segmentKind}
    >
      {/* Hit area (szersza, niewidoczna, dla łatwiejszego klikania) */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 8, 12)}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      {/* Widoczna linia */}
      <path
        d={path}
        fill="none"
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
        strokeDasharray={dasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );
}
