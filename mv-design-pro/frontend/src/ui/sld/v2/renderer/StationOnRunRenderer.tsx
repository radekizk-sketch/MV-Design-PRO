/**
 * StationOnRunRenderer — renderer stacji na ciągu.
 *
 * Phase 0A delegacja:
 *   - LOD 0/1: `<MiniBlockRmuRenderer variant="compact"/>`.
 *   - LOD 2  : `<MiniBlockRmuRenderer variant="detail"/>`.
 *   - LOD 3+ : legacy blok 140×60 z hintem "kliknij dwukrotnie aby otworzyć
 *              widok wewnętrzny stacji" (drill-down do `StationInternalView`
 *              obsługuje shell przez `onDoubleClick`).
 *
 * Backwards-compat: jeśli `lod` nie jest podany albo `snBays` jest
 * `undefined`, renderer wraca do legacy bloku 140×60 (zachowuje
 * istniejące testy).
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';
import type { LodLevel } from '../lod/LodPolicy';
import {
  MiniBlockRmuRenderer,
  type MiniBlockBayDescriptor,
  type MiniBlockDerBadge,
} from './MiniBlockRmuRenderer';
import type { StationFootprintType } from './MiniBlockFootprints';

const STATION_BLOCK_WIDTH = 140;
const STATION_BLOCK_HEIGHT = 60;

export interface StationOnRunRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  /** Liczba poziomów nN (multi-voltage). */
  readonly nnVoltageLevelsCount?: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
  /** Status danych dla badge braku danych (jeśli niekompletna). */
  readonly missingData?: boolean;

  // ===== Phase 0A — delegacja do MiniBlockRmuRenderer =====
  /** Aktualny LOD (0–4). Brak → renderer legacy. */
  readonly lod?: LodLevel;
  /** Footprint type (7 typów; brak → wnioskuj z `topologicalType`). */
  readonly footprintType?: StationFootprintType;
  /** Faktyczne pola SN tej stacji. Pusta tablica → blocker badge. */
  readonly snBays?: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer?: boolean;
  readonly transformerRatedKva?: number | null;
  readonly nnFeedersCount?: number;
  readonly derBadges?: readonly MiniBlockDerBadge[];
}

const TYPE_TO_LABEL_PL: Record<StationOnRunRendererProps['topologicalType'], string> = {
  'końcowa': 'końcowa',
  'przelotowa': 'przelotowa',
  'odgałęźna': 'odgałęźna',
  'sekcyjna': 'sekcyjna',
};

const TOPOLOGY_TO_FOOTPRINT: Record<
  StationOnRunRendererProps['topologicalType'],
  StationFootprintType
> = {
  końcowa: 'mv_lv_terminal',
  przelotowa: 'mv_lv_inline',
  odgałęźna: 'mv_lv_branch',
  sekcyjna: 'mv_lv_sectional',
};

/**
 * Decyzja delegacji: LOD ≤ 2 + obecność `snBays` → mini-block;
 * LOD ≥ 3 lub brak `snBays` → legacy.
 */
function shouldDelegateToMiniBlock(props: StationOnRunRendererProps): boolean {
  if (props.lod === undefined) return false;
  if (props.lod >= 3) return false;
  return props.snBays !== undefined;
}

export function StationOnRunRenderer(props: StationOnRunRendererProps): JSX.Element {
  if (shouldDelegateToMiniBlock(props)) {
    const variant: 'compact' | 'detail' = (props.lod ?? 0) >= 2 ? 'detail' : 'compact';
    const footprintType = props.footprintType ?? TOPOLOGY_TO_FOOTPRINT[props.topologicalType];
    return (
      <MiniBlockRmuRenderer
        id={props.id}
        x={props.x}
        y={props.y}
        variant={variant}
        footprintType={footprintType}
        name={props.name}
        snBays={props.snBays ?? []}
        hasTransformer={props.hasTransformer ?? true}
        transformerRatedKva={props.transformerRatedKva ?? null}
        nnFeedersCount={props.nnFeedersCount ?? props.nnVoltageLevelsCount ?? 0}
        derBadges={props.derBadges ?? []}
        missingData={props.missingData ?? false}
        selected={props.selected}
        onClick={props.onClick}
        onDoubleClick={props.onDoubleClick}
      />
    );
  }

  // Legacy 140×60 — zachowane dla LOD ≥ 3 i back-compat (testy + istniejący adapter).
  return <LegacyStationBlock {...props} />;
}

function LegacyStationBlock(props: StationOnRunRendererProps): JSX.Element {
  const {
    id, x, y, name, topologicalType, nnVoltageLevelsCount,
    selected, onClick, onDoubleClick, missingData,
  } = props;
  const offsetX = -STATION_BLOCK_WIDTH / 2;
  const offsetY = -STATION_BLOCK_HEIGHT / 2;

  return (
    <g
      data-testid={`sld-v2-station-${id}`}
      data-element-kind="station_block"
      data-element-id={id}
      data-topological-type={topologicalType}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
      onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={offsetX}
        y={offsetY}
        width={STATION_BLOCK_WIDTH}
        height={STATION_BLOCK_HEIGHT}
        fill={COLOR_PANEL_RAISED}
        stroke={selected ? COLOR_SELECTION : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? 2.5 : 1.5}
        rx={3}
        ry={3}
      />
      {missingData && (
        <circle
          cx={offsetX + STATION_BLOCK_WIDTH - 8}
          cy={offsetY + 8}
          r={5}
          fill="#FFC857"
          stroke="#FFB020"
          strokeWidth={1}
        >
          <title>Brakuje danych do obliczeń</title>
        </circle>
      )}
      <text
        x={0}
        y={offsetY + STATION_BLOCK_HEIGHT / 2 - 6}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={600}
      >
        {name}
      </text>
      <text
        x={0}
        y={offsetY + STATION_BLOCK_HEIGHT / 2 + 12}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {TYPE_TO_LABEL_PL[topologicalType]}
        {nnVoltageLevelsCount && nnVoltageLevelsCount > 1 ? ` • ${nnVoltageLevelsCount}× nN` : ''}
      </text>
    </g>
  );
}
