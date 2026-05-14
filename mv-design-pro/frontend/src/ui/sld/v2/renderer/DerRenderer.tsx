/**
 * DerRenderer — renderer DER (PV / BESS / FW) (PR-5b).
 *
 * Renderuje obiekt DER jako symbol z polską etykietą + status danych.
 * Brief 2 §15: DER musi mieć jasno określony port przyłączenia, NIE wisi w powietrzu.
 */

import { useSldLod } from '../lod/SldLodContext';
import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
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
  /**
   * Phase 0C operator-grade SLD plan v2 (Acceptance Invariant 10):
   * DER zawsze ma PCC + connection_variant + port + voltage_level —
   * albo widoczny missing-connection blocker.
   *
   * `missingPcc=true` renderuje czerwony X badge nadrzędny do innych badge'y
   * (dominujący wizualnie, operator widzi natychmiast). Backend walidator
   * E028/E029 już blokuje runs gdy ten flag, ale renderer wyróżnia obiekt
   * również wizualnie aby operator wiedział KTÓRY DER jest niekompletny.
   */
  readonly missingPcc?: boolean;
  /**
   * Phase 0C: wariant przyłączenia (z ENM Generator.connection_variant).
   * Konsumowane przez `DerConnectionTreeRenderer` przy LOD ≥ 3 do narysowania
   * pełnego drzewa: falownik → trafo blokowy → port stacji.
   */
  readonly connectionVariant?:
    | 'nn_side'
    | 'block_transformer'
    | 'LV_BEHIND_STATION_TRANSFORMER'
    | 'DEDICATED_MV_CONNECTION'
    | 'SOURCE_CONNECTION_STATION';
  /**
   * Naprawa hmi.3: LOD (Level of Detail) — uproszczony marker dla zoom out.
   *  - 'full' (default): pełen symbol (DER_BLOCK_SIZE 60px)
   *  - 'compact': romb mniejszy + etykieta typu (35px)
   *  - 'marker': kropka z kolorem typu (12px)
   */
  readonly lod?: 'full' | 'compact' | 'marker';
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
}

const DER_BLOCK_SIZE = 44;
const DER_COMPACT_SIZE = 28;
const DER_MARKER_SIZE = 12;

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
    selected, missingData, missingPcc, lod = 'full', onClick, onDoubleClick,
  } = props;
  const { getFontSize } = useSldLod();

  // Naprawa hmi.3: LOD = 'marker' renderuje minimalną kropkę (overview zoom).
  if (lod === 'marker') {
    return (
      <g
        data-testid={`sld-v2-der-${id}`}
        data-element-kind="der_marker"
        data-element-id={id}
        data-der-kind={kind}
        data-lod="marker"
        transform={`translate(${x}, ${y})`}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
        onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(id); } : undefined}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        <circle
          cx={0}
          cy={0}
          r={DER_MARKER_SIZE / 2}
          fill={KIND_FILL_COLOR[kind]}
          fillOpacity={0.7}
          stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
          strokeWidth={selected ? 2 : 1}
        >
          <title>{`${KIND_LABEL_PL[kind]} · ${name}`}</title>
        </circle>
      </g>
    );
  }

  // LOD = 'compact' — uproszczony romb + etykieta typu.
  const half = (lod === 'compact' ? DER_COMPACT_SIZE : DER_BLOCK_SIZE) / 2;

  return (
    <g
      data-testid={`sld-v2-der-${id}`}
      data-element-kind={lod === 'compact' ? 'der_compact' : 'der_full'}
      data-element-id={id}
      data-der-kind={kind}
      data-lod={lod}
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
          fontSize={lod === 'compact' ? Math.max(getFontSize('deviceQ') - 4, 10) : getFontSize('deviceQ')}
          fontWeight={700}
        >
        {KIND_LABEL_PL[kind]}
      </text>
      {/* Nazwa DER pod symbolem (LOD=full only) */}
      {lod === 'full' && (
        <text
          x={0}
          y={half + 16}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={getFontSize('parameter')}
        >
          {name}
        </text>
      )}
      {/* Moc znamionowa (LOD=full only, jeśli dostępna) */}
      {lod === 'full' && nominalPowerKw !== null && nominalPowerKw !== undefined && (
        <text
          x={0}
          y={half + 30}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={getFontSize('fieldMeasurement')}
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
      {/* Phase 0C: missing PCC blocker — dominujący wizualnie czerwony X badge.
       * Renderowany NAD innymi badge'ami (Acceptance Invariant 10: DER bez PCC =
       * blocker, NIE normalny badge). */}
      {missingPcc && (
        <g data-testid={`sld-v2-der-${id}-missing-pcc`}>
          <circle
            cx={half - 6}
            cy={half - 6}
            r={8}
            fill="#FF4040"
            stroke="#A00000"
            strokeWidth={1.5}
            opacity={0.95}
          >
            <title>BLOKADA: Brak punktu przyłączenia (PCC) lub connection_variant</title>
          </circle>
          {/* Czerwony X jako symbol blocker */}
          <line
            x1={half - 9}
            y1={half - 9}
            x2={half - 3}
            y2={half - 3}
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={half - 9}
            y1={half - 3}
            x2={half - 3}
            y2={half - 9}
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}
