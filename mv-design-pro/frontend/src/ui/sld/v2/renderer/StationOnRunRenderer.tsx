/**
 * StationOnRunRenderer - stacja na ciagu SN.
 *
 * Widok sieciowy nie jest kaflem. Stacja jest rysowana jako element
 * dyspozytorskiego SLD: zielona szyna SN, romby pol liniowych, tory do
 * ciagu oraz etykiety pod szyna zgodnie z referencjami OSD.
 */

import {
  COLOR_DEVICE_OPEN,
  COLOR_FIELD_TRUNK_ENERGIZED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WARN,
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

const STATION_SYMBOL_WIDTH = 176;
const STATION_SYMBOL_HEIGHT = 124;
const STATION_BUS_WIDTH = 120;
const STATION_BUS_Y = 0;
export const STATION_RUN_TRUNK_OFFSET_Y = 54;
const TRUNK_Y = -STATION_RUN_TRUNK_OFFSET_Y;
const LABEL_Y = 30;
const CODE_Y = 48;

export interface StationOnRunRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly nnVoltageLevelsCount?: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
  readonly missingData?: boolean;
  readonly lod?: LodLevel;
  readonly footprintType?: StationFootprintType;
  readonly snBays?: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer?: boolean;
  readonly transformerRefs?: readonly string[];
  readonly transformerRatedKva?: number | null;
  readonly nnFeedersCount?: number;
  readonly derBadges?: readonly MiniBlockDerBadge[];
}

const TYPE_TO_LABEL_PL: Record<StationOnRunRendererProps['topologicalType'], string> = {
  końcowa: 'końcowa',
  przelotowa: 'przelotowa',
  odgałęźna: 'odgałęźna',
  sekcyjna: 'sekcyjna',
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

function shouldDelegateToMiniBlock(props: StationOnRunRendererProps): boolean {
  if (props.lod === undefined) return false;
  if (props.lod >= 3) return false;
  return props.snBays !== undefined;
}

export function StationOnRunRenderer(props: StationOnRunRendererProps): JSX.Element {
  if (shouldDelegateToMiniBlock(props)) {
    const variant = miniBlockVariantForLod(props.lod ?? 0);
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

  return <DispatcherStationSymbol {...props} />;
}

function miniBlockVariantForLod(lod: LodLevel): 'overview' | 'compact' | 'detail' {
  if (lod <= 0) return 'overview';
  if (lod === 1) return 'compact';
  return 'detail';
}

function DispatcherStationSymbol(props: StationOnRunRendererProps): JSX.Element {
  const {
    id, x, y, name, topologicalType, nnVoltageLevelsCount,
    selected, onClick, onDoubleClick, missingData,
  } = props;
  const connectionXs = connectionColumns(topologicalType);
  const voltageLabel = nnVoltageLevelsCount && nnVoltageLevelsCount > 1
    ? `${nnVoltageLevelsCount}× nN`
    : 'SN/nN';

  return (
    <g
      data-testid={`sld-v2-station-${id}`}
      data-element-kind="station_block"
      data-element-id={id}
      data-topological-type={topologicalType}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (event) => { event.stopPropagation(); onClick(id); } : undefined}
      onDoubleClick={onDoubleClick ? (event) => { event.stopPropagation(); onDoubleClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={-STATION_SYMBOL_WIDTH / 2}
        y={-STATION_SYMBOL_HEIGHT / 2}
        width={STATION_SYMBOL_WIDTH}
        height={STATION_SYMBOL_HEIGHT}
        fill="transparent"
        stroke={selected ? COLOR_SELECTION : 'transparent'}
        strokeWidth={selected ? 1.5 : 0}
        strokeDasharray={selected ? '5 4' : undefined}
        rx={4}
        ry={4}
        data-testid={`sld-v2-station-hitarea-${id}`}
      />

      <line
        x1={-STATION_BUS_WIDTH / 2}
        y1={STATION_BUS_Y}
        x2={STATION_BUS_WIDTH / 2}
        y2={STATION_BUS_Y}
        stroke={COLOR_FIELD_TRUNK_ENERGIZED}
        strokeWidth={4}
        strokeLinecap="butt"
        data-testid={`sld-v2-station-bus-${id}`}
      />

      {connectionXs.map((cx, index) => (
        <g key={`${id}-connector-${index}`} data-testid={`sld-v2-station-connector-${id}-${index}`}>
          <line
            x1={cx}
            y1={TRUNK_Y}
            x2={cx}
            y2={STATION_BUS_Y}
            stroke={COLOR_FIELD_TRUNK_ENERGIZED}
            strokeWidth={2.5}
          />
          <polygon
            points={`${cx},${STATION_BUS_Y - 34} ${cx + 11},${STATION_BUS_Y - 23} ${cx},${STATION_BUS_Y - 12} ${cx - 11},${STATION_BUS_Y - 23}`}
            fill="#0A8D43"
            stroke={COLOR_FIELD_TRUNK_ENERGIZED}
            strokeWidth={1.3}
            data-testid={`sld-v2-station-diamond-${id}-${index}`}
            data-apparatus-kind="switch_disconnector"
            data-symbol-canon="switch_disconnector_rotated_square"
          />
          <g
            data-apparatus-kind="earthing_switch"
            data-symbol-canon="earthing_switch_lateral_branch"
          >
            <line x1={cx + 13} y1={STATION_BUS_Y - 23} x2={cx + 25} y2={STATION_BUS_Y - 23} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} />
            <line x1={cx + 25} y1={STATION_BUS_Y - 23} x2={cx + 25} y2={STATION_BUS_Y - 11} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} strokeDasharray="2 2" />
            <line x1={cx + 20} y1={STATION_BUS_Y - 11} x2={cx + 30} y2={STATION_BUS_Y - 11} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1.2} />
            <line x1={cx + 22} y1={STATION_BUS_Y - 8} x2={cx + 28} y2={STATION_BUS_Y - 8} stroke={COLOR_TEXT_SECONDARY} strokeWidth={1} />
            <line x1={cx + 24} y1={STATION_BUS_Y - 5} x2={cx + 26} y2={STATION_BUS_Y - 5} stroke={COLOR_TEXT_SECONDARY} strokeWidth={0.9} />
          </g>
          {topologicalType === 'sekcyjna' && index === 0 && (
            <line
              x1={cx - 16}
              y1={STATION_BUS_Y - 23}
              x2={cx + 16}
              y2={STATION_BUS_Y - 23}
              stroke={COLOR_DEVICE_OPEN}
              strokeWidth={2}
              transform={`rotate(-90 ${cx} ${STATION_BUS_Y - 23})`}
              data-testid={`sld-v2-station-open-marker-${id}`}
            />
          )}
        </g>
      ))}

      {topologicalType === 'odgałęźna' && (
        <g data-testid={`sld-v2-station-branch-drop-${id}`}>
          <line x1={0} y1={STATION_BUS_Y} x2={0} y2={STATION_BUS_Y + 20} stroke={COLOR_FIELD_TRUNK_ENERGIZED} strokeWidth={2.5} />
          <line x1={-10} y1={STATION_BUS_Y + 14} x2={10} y2={STATION_BUS_Y + 14} stroke={COLOR_DEVICE_OPEN} strokeWidth={2} />
        </g>
      )}

      {missingData && (
        <g data-testid={`sld-v2-station-missing-${id}`} transform={`translate(${STATION_BUS_WIDTH / 2 + 14}, ${STATION_BUS_Y - 36})`}>
          <circle r={6} fill={COLOR_WARN} stroke="#FFB020" strokeWidth={1}>
            <title>Brakuje danych do obliczeń</title>
          </circle>
          <text x={0} y={4} textAnchor="middle" fill="#0B0E11" fontFamily={FONT_SANS} fontSize={10} fontWeight={800}>!</text>
        </g>
      )}

      <text
        x={0}
        y={LABEL_Y}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={800}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={3}
      >
        {name}
      </text>
      <text
        x={0}
        y={CODE_Y}
        textAnchor="middle"
        fill={selected ? COLOR_SELECTION : '#7EC8FF'}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={800}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={3}
      >
        {TYPE_TO_LABEL_PL[topologicalType]}
      </text>
      <text
        x={0}
        y={CODE_Y + 14}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
        fontWeight={700}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={2}
      >
        {voltageLabel}
      </text>
    </g>
  );
}

function connectionColumns(topologicalType: StationOnRunRendererProps['topologicalType']): readonly number[] {
  switch (topologicalType) {
    case 'końcowa':
      return [0];
    case 'przelotowa':
      return [-28, 28];
    case 'odgałęźna':
      return [-36, 0, 36];
    case 'sekcyjna':
      return [-28, 28];
    default:
      return [0];
  }
}
