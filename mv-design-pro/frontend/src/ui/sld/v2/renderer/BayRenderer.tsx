/**
 * BayRenderer — renderer pola SN (PR-5b).
 *
 * Renderuje pionowy tor pola od szyny w dół, z aparatami w kanonicznej kolejności
 * (DS_BUS → CB → CT → DS_LINE → ES boczny → CABLE_HEAD trójkąt).
 */

import {
  COLOR_LINE_PRIMARY,
  COLOR_TEXT_PRIMARY,
  DEVICE_OFFSET_TOP_PX,
  DEVICE_PITCH_PX,
  FONT_SANS,
  FONT_SIZES,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import { DeviceRenderer, type DeviceRendererProps } from './DeviceRenderer';

export interface BayRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly designation: string;
  readonly devices: readonly Omit<DeviceRendererProps, 'x' | 'y'>[];
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  /** Czy pokazywać Q labels (LOD ≥ 3). */
  readonly showQLabels?: boolean;
}

export function BayRenderer(props: BayRendererProps): JSX.Element {
  const { id, x, y, designation, devices, selected, onClick, showQLabels } = props;
  // Ostatni aparat określa długość toru pionowego pola.
  const bayHeight = devices.length > 0
    ? DEVICE_OFFSET_TOP_PX + devices.length * DEVICE_PITCH_PX + 20
    : DEVICE_OFFSET_TOP_PX;

  return (
    <g
      data-testid={`sld-v2-bay-${id}`}
      data-element-kind="bay_head"
      data-element-id={id}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(id); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Etykieta pola nad szyną */}
      <text
        x={0}
        y={-32}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={600}
      >
        {designation}
      </text>
      {/* Pionowy tor pola */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={bayHeight}
        stroke={selected ? '#35C7FF' : COLOR_LINE_PRIMARY}
        strokeWidth={selected ? 3 : STROKE_FIELD_TRACK_PX}
      />
      {/* Aparaty w kanonicznej kolejności */}
      {devices.map((d, i) => (
        <DeviceRenderer
          key={d.id}
          {...d}
          x={0}
          y={DEVICE_OFFSET_TOP_PX + i * DEVICE_PITCH_PX}
          showQLabel={showQLabels ?? false}
        />
      ))}
    </g>
  );
}
