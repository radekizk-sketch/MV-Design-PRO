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
  readonly derRef?: string | null;
  readonly transformerRef?: string | null;
  readonly pccRef?: string | null;
  readonly viewportScale?: number;
  readonly onClick?: (id: string, kind: 'der_pcc_bay' | 'der_block_transformer') => void;
  readonly onDoubleClick?: (id: string, kind: 'der_pcc_bay' | 'der_block_transformer') => void;
}

function visibleBlockTransformerLabel(label: string): string {
  const trimmed = label.trim();
  if (/blok/i.test(trimmed)) return trimmed;
  if (/^TR\b/i.test(trimmed)) return trimmed.replace(/^TR\b/i, 'TR blokowy');
  return `TR blokowy ${trimmed}`;
}

function compactBlockTransformerLabel(label: string): string {
  const visible = visibleBlockTransformerLabel(label);
  const power = visible.match(/\b\d+(?:[,.]\d+)?\s*kVA\b/i)?.[0];
  if (power) return `TR blok. ${power}`;
  return visible.length > 22 ? `${visible.slice(0, 19).trimEnd()}...` : visible;
}

function capWorldDimension(
  worldSize: number,
  viewportScale: number | null | undefined,
  maxScreenPx: number,
  minWorldSize: number,
): number {
  if (
    viewportScale === null
    || viewportScale === undefined
    || !Number.isFinite(viewportScale)
    || viewportScale <= 1
  ) {
    return worldSize;
  }
  return Math.max(minWorldSize, Math.min(worldSize, maxScreenPx / viewportScale));
}

export function ConnectionRenderer(props: ConnectionRendererProps): JSX.Element | null {
  const {
    id,
    pathPoints,
    selected,
    transformerLabel,
    connectionKind,
    derRef,
    transformerRef,
    pccRef,
    viewportScale,
    onClick,
    onDoubleClick,
  } = props;
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
  const compactTransformerLabel = hasBlockTransformer
    ? compactBlockTransformerLabel(transformerLabel)
    : null;
  const pccBayPoint = hasBlockTransformer ? pathPoints[1] ?? pathPoints[0] : null;
  const pccSelectionRef = pccRef ?? derRef ?? id;
  const transformerSelectionRef = transformerRef ?? derRef ?? id;
  const transformerLabelWidth = capWorldDimension(110, viewportScale, 150, 58);
  const transformerLabelFont = capWorldDimension(8, viewportScale, 13, 4.8);
  const pccLabelFont = capWorldDimension(7, viewportScale, 12, 4.6);

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
      {pccBayPoint && (
        <g
          data-testid={`sld-v2-connection-pcc-bay-${id}`}
          data-element-kind="der_pcc_bay"
          data-element-id={id}
          transform={`translate(${pccBayPoint.x}, ${pccBayPoint.y})`}
          pointerEvents="all"
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(pccSelectionRef, 'der_pcc_bay'); } : undefined}
          onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(pccSelectionRef, 'der_pcc_bay'); } : undefined}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <title>Pole SN przyłączenia DER/PCC. Otwiera konfigurację toru przyłączeniowego źródła.</title>
          <rect x={-12} y={-14} width={24} height={28} fill="transparent" />
          <rect
            x={-9}
            y={-13}
            width={18}
            height={26}
            rx={2}
            ry={2}
            fill="#071018"
            stroke={selected ? '#35C7FF' : '#7EE0B5'}
            strokeWidth={1.3}
          />
          <line x1={0} y1={-18} x2={0} y2={18} stroke="#7EE0B5" strokeWidth={1.2} />
          <rect x={-4} y={-4} width={8} height={8} fill="#0A1018" stroke="#7EE0B5" strokeWidth={1} />
          <text
            x={0}
            y={-17}
            textAnchor="middle"
            fill="#7EE0B5"
            stroke="#050810"
            strokeWidth={2}
            paintOrder="stroke"
            fontFamily="monospace"
            fontSize={pccLabelFont}
            fontWeight={900}
          >
            PCC
          </text>
        </g>
      )}
      {transformerPoint && (
        <g
          data-testid={`sld-v2-connection-transformer-${id}`}
          data-element-kind="der_block_transformer"
          data-element-id={id}
          transform={`translate(${transformerPoint.x}, ${transformerPoint.y})`}
          pointerEvents="all"
          onClick={onClick ? (e) => { e.stopPropagation(); onClick(transformerSelectionRef, 'der_block_transformer'); } : undefined}
          onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(transformerSelectionRef, 'der_block_transformer'); } : undefined}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <title>{visibleTransformerLabel ?? 'Transformator blokowy DER'}</title>
          <rect x={-22} y={-28} width={44} height={70} fill="transparent" />
          <circle cx={0} cy={-7} r={9} fill="#050A12" stroke="#DDF7FF" strokeWidth={1.8} />
          <circle cx={0} cy={7} r={9} fill="#050A12" stroke="#DDF7FF" strokeWidth={1.8} />
          <line x1={0} y1={-24} x2={0} y2={-16} stroke="#DDF7FF" strokeWidth={1.5} />
          <line x1={0} y1={16} x2={0} y2={24} stroke="#DDF7FF" strokeWidth={1.5} />
          <rect
            x={-transformerLabelWidth / 2}
            y={25}
            width={transformerLabelWidth}
            height={13}
            rx={3}
            ry={3}
            fill="#06110D"
            stroke="#7EE0B5"
            strokeWidth={0.8}
            opacity={0.94}
          />
          <text
            x={0}
            y={35}
            textAnchor="middle"
            fill="#DDF7FF"
            stroke="#050810"
            strokeWidth={1.7}
            paintOrder="stroke"
            fontFamily="monospace"
            fontSize={transformerLabelFont}
            fontWeight={800}
          >
            {compactTransformerLabel}
          </text>
        </g>
      )}
    </g>
  );
}
