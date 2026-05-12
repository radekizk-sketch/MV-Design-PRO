/**
 * CableRunRenderer - renderer ciagu liniowego SN.
 *
 * Renderuje tor kabla/linii jako obiekt klikany, ale widoczna kreska jest
 * rozcinana na portach stacji. To utrzymuje poprawna semantyke: kabel dochodzi
 * do pola wejsciowego stacji i wychodzi z pola wyjsciowego, zamiast przechodzic
 * przez srodek stacji.
 */

import {
  COLOR_FIELD_TRUNK_ENERGIZED,
  STROKE_BRANCH_LINE_PX,
  STROKE_TRUNK_LINE_PX,
  STROKE_DASHED_RING_DASH_PX,
} from '../theme/tokens';

export interface CableRunStationPortGap {
  readonly stationId: string;
  readonly y: number;
  readonly inputX: number;
  readonly outputX: number | null;
}

export interface CableRunSegmentLabel {
  readonly segmentRef: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface CableRunSegmentPath {
  readonly segmentRef: string;
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
}

export interface CableRunRendererProps {
  readonly id: string;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  /** Punkty sciezki ciagu (ortogonalne L-shape przez kanal Y). */
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly segmentKind: 'cable_sn' | 'overhead_line_sn';
  readonly segmentRefs?: readonly string[];
  readonly segmentPaths?: readonly CableRunSegmentPath[];
  readonly label?: string;
  readonly segmentLabels?: readonly CableRunSegmentLabel[];
  readonly pendingEndpoint?: boolean;
  readonly stationPortGaps?: readonly CableRunStationPortGap[];
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
}

export function CableRunRenderer(props: CableRunRendererProps): JSX.Element | null {
  const {
    id,
    runKind,
    pathPoints,
    segmentKind,
    segmentRefs = [],
    segmentPaths = [],
    label,
    segmentLabels = [],
    pendingEndpoint,
    stationPortGaps = [],
    selected,
    onClick,
  } = props;
  if (pathPoints.length < 2) return null;

  const strokeWidth = runKind === 'branch'
    ? STROKE_BRANCH_LINE_PX
    : STROKE_TRUNK_LINE_PX;

  const isDashed = runKind === 'ring' || runKind === 'loop';
  const isOverhead = segmentKind === 'overhead_line_sn';

  const dasharray = isDashed
    ? STROKE_DASHED_RING_DASH_PX
    : isOverhead
      ? '12 4'
      : undefined;

  const hitPath = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');
  const visiblePaths = buildVisibleCablePaths(pathPoints, stationPortGaps);
  const labelPoint = label && segmentLabels.length === 0
    ? findLongestHorizontalSegmentMidpoint(pathPoints)
    : null;
  const terminalPoint = pathPoints[pathPoints.length - 1];

  return (
    <g
      data-testid={`sld-v2-run-${id}`}
      data-connection-ref={id}
      data-element-kind="cable_run"
      data-element-id={id}
      data-run-kind={runKind}
      data-segment-kind={segmentKind}
    >
      <path
        d={hitPath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 8, 12)}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      <polyline
        points={pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(strokeWidth + 10, 14)}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      {(segmentPaths.length > 0
        ? segmentPaths
        : segmentRefs.map((segmentRef) => ({ segmentRef, pathPoints }))).map((segmentPath) => (
        <g
          key={`${id}-segment-hitbox-${segmentPath.segmentRef}`}
          data-testid={`sld-v2-run-${id}-segment-hitbox-${segmentPath.segmentRef}`}
          data-connection-ref={segmentPath.segmentRef}
          data-element-kind="cable_run"
          data-element-id={segmentPath.segmentRef}
        >
          <polyline
            points={segmentPath.pathPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(strokeWidth + 12, 16)}
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(segmentPath.segmentRef); } : undefined}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
          />
        </g>
      ))}
      {visiblePaths.map((visiblePath, index) => (
        <path
          key={`${id}-visible-${index}`}
          data-testid={`sld-v2-run-${id}-visible-${index}`}
          d={visiblePath}
          fill="none"
          stroke={selected ? '#35C7FF' : COLOR_FIELD_TRUNK_ENERGIZED}
          strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
          strokeDasharray={dasharray}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      ))}
      {label && labelPoint && (
        <text
          data-testid={`sld-v2-run-${id}-label`}
          x={labelPoint.x}
          y={labelPoint.y - 10}
          textAnchor="middle"
          fill="#DDF7FF"
          stroke="#050810"
          strokeWidth={3}
          paintOrder="stroke"
          className="select-none text-[11px] font-semibold"
          pointerEvents="none"
        >
          {label}
        </text>
      )}
      {segmentLabels.map((segmentLabel) => (
        <text
          key={`${id}-segment-label-${segmentLabel.segmentRef}`}
          data-testid={`sld-v2-run-${id}-segment-label-${segmentLabel.segmentRef}`}
          x={segmentLabel.x}
          y={segmentLabel.y}
          textAnchor="middle"
          fill="#DDF7FF"
          stroke="#050810"
          strokeWidth={3}
          paintOrder="stroke"
          className="select-none text-[11px] font-semibold"
          pointerEvents="none"
        >
          {segmentLabel.text}
        </text>
      ))}
      {pendingEndpoint && terminalPoint && (
        <g
          data-testid={`sld-v2-run-${id}-pending-end`}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <rect
            x={terminalPoint.x - 28}
            y={terminalPoint.y - 17}
            width={210}
            height={40}
            rx={3}
            fill="transparent"
            stroke="transparent"
            pointerEvents="all"
          />
          <rect
            x={terminalPoint.x - 20}
            y={terminalPoint.y - 11}
            width={40}
            height={22}
            rx={2}
            fill="#0B141B"
            stroke="#FFD166"
            strokeWidth={1.4}
            strokeDasharray="4 3"
          />
          <line
            x1={terminalPoint.x - 13}
            y1={terminalPoint.y}
            x2={terminalPoint.x + 13}
            y2={terminalPoint.y}
            stroke="#FFD166"
            strokeWidth={1.4}
          />
          <line
            x1={terminalPoint.x}
            y1={terminalPoint.y - 7}
            x2={terminalPoint.x}
            y2={terminalPoint.y + 7}
            stroke="#FFD166"
            strokeWidth={1.2}
          />
          <text
            x={terminalPoint.x + 28}
            y={terminalPoint.y - 4}
            fill="#FFD166"
            stroke="#050810"
            strokeWidth={3}
            paintOrder="stroke"
            className="select-none text-[10px] font-semibold"
            pointerEvents="none"
          >
            Wybierz kolejny obiekt
          </text>
          <text
            x={terminalPoint.x + 28}
            y={terminalPoint.y + 9}
            fill="#DDF7FF"
            stroke="#050810"
            strokeWidth={3}
            paintOrder="stroke"
            className="select-none text-[9px] font-medium"
            pointerEvents="none"
          >
            stacja / ZK SN / słup / ciąg
          </text>
        </g>
      )}
    </g>
  );
}

type Point = { x: number; y: number };

function buildVisibleCablePaths(
  points: readonly Point[],
  gaps: readonly CableRunStationPortGap[],
): string[] {
  if (gaps.length === 0) {
    return [points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')];
  }

  const paths: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x === b.x && a.y === b.y) continue;
    if (a.y !== b.y) {
      paths.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
      continue;
    }

    for (const interval of cutHorizontalInterval(a, b, gaps)) {
      if (interval.from === interval.to) continue;
      paths.push(`M ${interval.from} ${a.y} L ${interval.to} ${a.y}`);
    }
  }

  return paths.length > 0
    ? paths
    : [points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ')];
}

function cutHorizontalInterval(
  a: Point,
  b: Point,
  gaps: readonly CableRunStationPortGap[],
): Array<{ from: number; to: number }> {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const cuts = gaps
    .filter((gap) => Math.abs(gap.y - a.y) <= 0.5)
    .map((gap) => ({
      from: clamp(Math.min(gap.inputX, gap.outputX ?? maxX), minX, maxX),
      to: clamp(gap.outputX === null ? maxX : Math.max(gap.inputX, gap.outputX), minX, maxX),
    }))
    .filter((cut) => cut.to > cut.from)
    .sort((left, right) => left.from - right.from);

  if (cuts.length === 0) {
    return [{ from: a.x, to: b.x }];
  }

  const intervals: Array<{ from: number; to: number }> = [];
  let cursor = minX;
  for (const cut of cuts) {
    if (cut.from > cursor) {
      intervals.push({ from: cursor, to: cut.from });
    }
    cursor = Math.max(cursor, cut.to);
  }
  if (cursor < maxX) {
    intervals.push({ from: cursor, to: maxX });
  }

  if (a.x <= b.x) return intervals;
  return intervals.reverse().map((interval) => ({ from: interval.to, to: interval.from }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function findLongestHorizontalSegmentMidpoint(points: readonly Point[]): Point | null {
  let best: { x: number; y: number; length: number } | null = null;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (Math.abs(start.y - end.y) > 0.5) continue;
    const length = Math.abs(end.x - start.x);
    if (length <= 0) continue;
    if (!best || length > best.length) {
      best = {
        x: (start.x + end.x) / 2,
        y: start.y,
        length,
      };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
