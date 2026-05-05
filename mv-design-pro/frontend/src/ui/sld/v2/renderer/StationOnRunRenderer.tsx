/**
 * StationOnRunRenderer — renderer stacji na ciągu (PR-5b).
 *
 * Renderuje stację jako blok zewnętrzny (LOD 0/1/2) lub stację rozwiniętą
 * (LOD 3+, tryb wewnętrzny — pełen widok wewnętrzny w PR-6).
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';

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
}

const TYPE_TO_LABEL_PL: Record<StationOnRunRendererProps['topologicalType'], string> = {
  'końcowa': 'końcowa',
  'przelotowa': 'przelotowa',
  'odgałęźna': 'odgałęźna',
  'sekcyjna': 'sekcyjna',
};

export function StationOnRunRenderer(props: StationOnRunRendererProps): JSX.Element {
  const {
    id, x, y, name, topologicalType, nnVoltageLevelsCount,
    selected, onClick, onDoubleClick, missingData,
  } = props;

  // Pozycjonujemy stację centrycznie do anchor (slot z slotAllocator).
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
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
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
