/**
 * GpzRenderer — kanoniczny renderer GPZ (PR-5b).
 *
 * Renderuje blok GPZ z napisem (nazwa + napięcie HV/LV) — kontener nadrzędny
 * dla sekcji rozdzielni SN.
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';

export interface GpzRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly voltageHighKv: number;
  readonly voltageLowKv: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
}

const GPZ_BLOCK_WIDTH = 200;
const GPZ_BLOCK_HEIGHT = 80;

export function GpzRenderer(props: GpzRendererProps): JSX.Element {
  const { id, x, y, name, voltageHighKv, voltageLowKv, selected, onClick } = props;

  return (
    <g
      data-testid={`sld-v2-gpz-${id}`}
      data-element-kind="gpz_block"
      data-element-id={id}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? () => onClick(id) : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        width={GPZ_BLOCK_WIDTH}
        height={GPZ_BLOCK_HEIGHT}
        fill={COLOR_PANEL_RAISED}
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? 2 : 1.5}
        rx={4}
        ry={4}
      />
      <text
        x={GPZ_BLOCK_WIDTH / 2}
        y={GPZ_BLOCK_HEIGHT / 2 - 8}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={600}
      >
        {name}
      </text>
      <text
        x={GPZ_BLOCK_WIDTH / 2}
        y={GPZ_BLOCK_HEIGHT / 2 + 14}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {voltageHighKv} / {voltageLowKv} kV
      </text>
    </g>
  );
}
