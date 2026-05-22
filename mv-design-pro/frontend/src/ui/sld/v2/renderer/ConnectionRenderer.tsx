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
  readonly transformerLabel?: string | null;
  readonly connectionKind?: 'der_block_transformer' | 'der_nn' | 'generic';
}

function visibleBlockTransformerLabel(label: string): string {
  const trimmed = label.trim();
  if (/blok/i.test(trimmed)) return trimmed;
  if (/^TR\b/i.test(trimmed)) return trimmed.replace(/^TR\b/i, 'TR blokowy');
  return `TR blokowy ${trimmed}`;
}

export function ConnectionRenderer(props: ConnectionRendererProps): JSX.Element | null {
  const { id, pathPoints, selected, transformerLabel, connectionKind } = props;
  if (pathPoints.length < 2) return null;

  const path = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  const hasBlockTransformer = connectionKind === 'der_block_transformer'
    && typeof transformerLabel === 'string'
    && transformerLabel.trim().length > 0;
  const transformerPoint = hasBlockTransformer
    ? pathPoints[Math.max(1, Math.floor(pathPoints.length / 2))]
    : null;
  const visibleTransformerLabel = hasBlockTransformer
    ? visibleBlockTransformerLabel(transformerLabel)
    : null;

  return (
    <g
      data-testid={`sld-v2-connection-${id}`}
      data-element-kind={hasBlockTransformer ? 'der_block_transformer_connection' : 'cable_run'}
      data-element-id={id}
      data-connection-kind={connectionKind ?? 'generic'}
      pointerEvents="none"
    >
      <path
        d={path}
        fill="none"
        stroke={selected ? '#35C7FF' : COLOR_LINE_SECONDARY}
        strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={hasBlockTransformer ? undefined : '4 3'}
      />
      {transformerPoint && (
        <g
          data-testid={`sld-v2-connection-transformer-${id}`}
          transform={`translate(${transformerPoint.x}, ${transformerPoint.y})`}
        >
          <circle cx={0} cy={-7} r={9} fill="#050A12" stroke="#DDF7FF" strokeWidth={1.8} />
          <circle cx={0} cy={7} r={9} fill="#050A12" stroke="#DDF7FF" strokeWidth={1.8} />
          <text
            x={20}
            y={4}
            fill="#DDF7FF"
            stroke="#050810"
            strokeWidth={3}
            paintOrder="stroke"
            fontFamily="sans-serif"
            fontSize={11}
            fontWeight={800}
          >
            {visibleTransformerLabel}
          </text>
        </g>
      )}
    </g>
  );
}
