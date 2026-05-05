/**
 * ConnectionRenderer — renderer połączenia portów (PR-5b).
 *
 * Cienka linia pomocnicza między DER a stacją albo między portami stacji,
 * dla zaznaczenia kierunku przyłączenia.
 */

import { COLOR_LINE_SECONDARY } from '../theme/tokens';

export interface ConnectionRendererProps {
  readonly id: string;
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly selected?: boolean;
}

export function ConnectionRenderer(props: ConnectionRendererProps): JSX.Element | null {
  const { id, pathPoints, selected } = props;
  if (pathPoints.length < 2) return null;

  const path = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  return (
    <path
      data-testid={`sld-v2-connection-${id}`}
      data-element-kind="cable_run"
      data-element-id={id}
      d={path}
      fill="none"
      stroke={selected ? '#35C7FF' : COLOR_LINE_SECONDARY}
      strokeWidth={selected ? 2 : 1.5}
      strokeDasharray="4 3"
      pointerEvents="none"
    />
  );
}
