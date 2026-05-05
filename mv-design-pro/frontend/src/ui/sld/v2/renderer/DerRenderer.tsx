/**
 * DerRenderer — renderer DER (PV / BESS / FW) (PR-5b).
 *
 * Renderuje obiekt DER jako symbol z polską etykietą + status danych.
 * Brief 2 §15: DER musi mieć jasno określony port przyłączenia, NIE wisi w powietrzu.
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';

export interface DerRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly name: string;
  readonly nominalPowerKw?: number | null;
  readonly hasBlockTransformer?: boolean;
  readonly selected?: boolean;
  readonly missingData?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
}

const DER_BLOCK_SIZE = 60;

const KIND_LABEL_PL: Record<DerRendererProps['kind'], string> = {
  PV: 'PV',
  BESS: 'BESS',
  FW: 'FW',
};

const KIND_FILL_COLOR: Record<DerRendererProps['kind'], string> = {
  PV: '#FFC857',     // żółty/słoneczny
  BESS: '#3FA9F5',   // niebieski
  FW: '#7FB069',     // zielony (wiatrak)
};

export function DerRenderer(props: DerRendererProps): JSX.Element {
  const {
    id, x, y, kind, name, nominalPowerKw, hasBlockTransformer,
    selected, missingData, onClick, onDoubleClick,
  } = props;
  const half = DER_BLOCK_SIZE / 2;

  return (
    <g
      data-testid={`sld-v2-der-${id}`}
      data-element-kind="der_full"
      data-element-id={id}
      data-der-kind={kind}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
      onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Romb (DER) */}
      <polygon
        points={`0,${-half} ${half},0 0,${half} ${-half},0`}
        fill={KIND_FILL_COLOR[kind]}
        fillOpacity={0.3}
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* Etykieta typu DER */}
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={700}
      >
        {KIND_LABEL_PL[kind]}
      </text>
      {/* Nazwa DER pod symbolem */}
      <text
        x={0}
        y={half + 16}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {name}
      </text>
      {/* Moc znamionowa (jeśli dostępna) */}
      {nominalPowerKw !== null && nominalPowerKw !== undefined && (
        <text
          x={0}
          y={half + 30}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={FONT_SIZES.numericValue}
        >
          {nominalPowerKw.toFixed(0)} kW
        </text>
      )}
      {/* Badge: transformator blokowy */}
      {hasBlockTransformer && (
        <circle
          cx={half - 4}
          cy={-half + 8}
          r={4}
          fill={COLOR_PANEL_RAISED}
          stroke="#13C45A"
          strokeWidth={1.5}
        >
          <title>Transformator blokowy obecny</title>
        </circle>
      )}
      {/* Badge: brak danych */}
      {missingData && (
        <circle
          cx={-half + 6}
          cy={-half + 6}
          r={5}
          fill="#FFC857"
          stroke="#FFB020"
          strokeWidth={1}
        >
          <title>Brakuje danych do obliczeń</title>
        </circle>
      )}
    </g>
  );
}
