/**
 * ProfileCurveEditor — graficzny edytor krzywych NC RfG.
 *
 * Pozwala drag-and-drop edycję punktów krzywej Q(U) lub cos φ(P).
 * Walidacja monotoniczności + zakres dziedziny.
 *
 * Wymagane przez NC RfG Art. 13-16 (Q/U capability, cos φ profile).
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';

export interface CurvePoint {
  x: number;
  y: number;
}

export interface ProfileCurveEditorProps {
  /** Tytuł wykresu (np. "Q(U) - praca jałowa"). */
  readonly title: string;
  /** Etykieta osi X. */
  readonly xLabel: string;
  /** Etykieta osi Y. */
  readonly yLabel: string;
  /** Zakres X (min, max). */
  readonly xRange: readonly [number, number];
  /** Zakres Y (min, max). */
  readonly yRange: readonly [number, number];
  /** Aktualne punkty krzywej (posortowane po X). */
  readonly points: readonly CurvePoint[];
  /** Callback gdy punkty zmienione. */
  readonly onChange?: (points: CurvePoint[]) => void;
  /** Czy edycja jest dozwolona. */
  readonly editable?: boolean;
  /** Szerokość SVG. */
  readonly width?: number;
  /** Wysokość SVG. */
  readonly height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };

export function ProfileCurveEditor({
  title,
  xLabel,
  yLabel,
  xRange,
  yRange,
  points,
  onChange,
  editable = true,
  width = 480,
  height = 320,
}: ProfileCurveEditorProps): JSX.Element {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const xToPx = useCallback(
    (x: number): number => PADDING.left + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotWidth,
    [xRange, plotWidth],
  );
  const yToPx = useCallback(
    (y: number): number => PADDING.top + plotHeight - ((y - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight,
    [yRange, plotHeight],
  );
  const pxToX = useCallback(
    (px: number): number => xRange[0] + ((px - PADDING.left) / plotWidth) * (xRange[1] - xRange[0]),
    [xRange, plotWidth],
  );
  const pxToY = useCallback(
    (py: number): number => yRange[0] + ((PADDING.top + plotHeight - py) / plotHeight) * (yRange[1] - yRange[0]),
    [yRange, plotHeight],
  );

  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points]);

  const pathD = useMemo(() => {
    if (sortedPoints.length === 0) return '';
    return sortedPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(p.x)} ${yToPx(p.y)}`)
      .join(' ');
  }, [sortedPoints, xToPx, yToPx]);

  const handleMouseDown = useCallback(
    (idx: number) => (e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      setDraggingIdx(idx);
    },
    [editable],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (draggingIdx === null || !editable) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const newX = Math.max(xRange[0], Math.min(xRange[1], pxToX(localX)));
      const newY = Math.max(yRange[0], Math.min(yRange[1], pxToY(localY)));
      const newPoints = sortedPoints.map((p, i) =>
        i === draggingIdx ? { x: newX, y: newY } : p,
      );
      onChange?.(newPoints);
    },
    [draggingIdx, editable, sortedPoints, xRange, yRange, pxToX, pxToY, onChange],
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIdx(null);
  }, []);

  // Grid lines (5 per axis)
  const xTicks = Array.from({ length: 5 }, (_, i) => xRange[0] + (i / 4) * (xRange[1] - xRange[0]));
  const yTicks = Array.from({ length: 5 }, (_, i) => yRange[0] + (i / 4) * (yRange[1] - yRange[0]));

  return (
    <div data-testid="profile-curve-editor" className="rounded border border-scada-border bg-scada-bg p-3">
      <h4 className="mb-2 text-[11px] font-semibold text-scada-text">{title}</h4>
      <svg
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="bg-scada-panel"
        data-testid="profile-curve-svg"
      >
        {/* Grid */}
        {xTicks.map((tick, i) => (
          <g key={`xtick-${i}`}>
            <line
              x1={xToPx(tick)}
              y1={PADDING.top}
              x2={xToPx(tick)}
              y2={PADDING.top + plotHeight}
              stroke="#1d3550"
              strokeWidth={0.5}
            />
            <text
              x={xToPx(tick)}
              y={PADDING.top + plotHeight + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#7691b3"
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {yTicks.map((tick, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={PADDING.left}
              y1={yToPx(tick)}
              x2={PADDING.left + plotWidth}
              y2={yToPx(tick)}
              stroke="#1d3550"
              strokeWidth={0.5}
            />
            <text x={PADDING.left - 6} y={yToPx(tick) + 3} textAnchor="end" fontSize={9} fill="#7691b3">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Axes labels */}
        <text x={width / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="#9ab3d5">
          {xLabel}
        </text>
        <text
          x={12}
          y={height / 2}
          textAnchor="middle"
          fontSize={10}
          fill="#9ab3d5"
          transform={`rotate(-90, 12, ${height / 2})`}
        >
          {yLabel}
        </text>

        {/* Curve */}
        <path d={pathD} fill="none" stroke="#04d6ff" strokeWidth={1.5} data-testid="profile-curve-path" />

        {/* Points - draggable */}
        {sortedPoints.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={xToPx(p.x)}
            cy={yToPx(p.y)}
            r={5}
            fill={draggingIdx === i ? '#ffd166' : '#04d6ff'}
            stroke="#08111d"
            strokeWidth={1.5}
            onMouseDown={handleMouseDown(i)}
            style={{ cursor: editable ? 'grab' : 'default' }}
            data-testid={`profile-curve-point-${i}`}
          />
        ))}
      </svg>
      <div className="mt-2 text-[10px] text-scada-muted">
        {editable
          ? 'Przeciągnij punkty aby zmodyfikować krzywą. Walidacja zachowuje monotoniczność osi X.'
          : 'Krzywa tylko do odczytu (zablokowana edycja).'}
      </div>
      <table className="mt-2 w-full text-[10px]">
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">#</th>
            <th className="text-right">{xLabel}</th>
            <th className="text-right">{yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {sortedPoints.map((p, i) => (
            <tr key={`row-${i}`} className="border-t border-scada-border">
              <td className="text-scada-muted">{i + 1}</td>
              <td className="text-right text-scada-text font-mono">{p.x.toFixed(3)}</td>
              <td className="text-right text-scada-text font-mono">{p.y.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
