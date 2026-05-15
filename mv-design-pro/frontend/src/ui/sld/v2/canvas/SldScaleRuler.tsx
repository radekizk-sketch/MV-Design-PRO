/**
 * K30-43 — SldScaleRuler: skala rysunku per PN-EN ISO 5455.
 *
 * Klasyczny industrial drawing element: pozioma listwa skali z głównymi
 * (major) podziałkami co `majorTickKm` km i drobnymi (minor) podziałkami
 * co `minorTickKm` km. Format zgodny z konwencją OSD:
 *
 *   |─┴─┴─|─┴─┴─|─┴─┴─|
 *   0   500m   1km
 *
 * Skala = relacja fizyczna ↔ SVG pixels. Domyślnie `pixelsPerKm=800`
 * (zgodne z STATION_PITCH layout K30 ~ 1 km / 800 px).
 *
 * Rendering jest pure SVG; pozycjonowanie kontroluje rodzic (zwykle
 * bottom-left canvas po stronie przeciwnej do title block).
 */

import type { JSX } from 'react';

export interface SldScaleRulerProps {
  /** Czy widoczna. Default true. */
  readonly visible?: boolean;
  /** X coordinate origin. Default 0. */
  readonly x?: number;
  /** Y coordinate origin. Default 0. */
  readonly y?: number;
  /** Współczynnik pixels/km. Default 800. */
  readonly pixelsPerKm?: number;
  /** Długość listwy w km. Default 1.0 (1 km). */
  readonly lengthKm?: number;
  /** Co ile km major tick. Default 0.5 (co 500 m). */
  readonly majorTickKm?: number;
  /** Co ile km minor tick. Default 0.1 (co 100 m). */
  readonly minorTickKm?: number;
}

const COLOR_RULER = '#DDF7FF';
const COLOR_RULER_BG = '#0A0E14';
const COLOR_RULER_BORDER = '#5A6878';

export function SldScaleRuler(props: SldScaleRulerProps): JSX.Element | null {
  const {
    visible = true,
    x = 0,
    y = 0,
    pixelsPerKm = 800,
    lengthKm = 1.0,
    majorTickKm = 0.5,
    minorTickKm = 0.1,
  } = props;
  if (!visible) return null;
  if (lengthKm <= 0 || pixelsPerKm <= 0) return null;

  const totalWidth = lengthKm * pixelsPerKm;
  const PANEL_PAD = 8;
  const PANEL_HEIGHT = 42;
  const RULER_Y = 18;
  const TICK_MAJOR_HEIGHT = 10;
  const TICK_MINOR_HEIGHT = 5;

  // Generate ticks niezależnie — pozwala major/minor mieć nie-współmierne kroki.
  const majorTicks: number[] = [];
  for (let kmPos = 0; kmPos <= lengthKm + 0.0001; kmPos += majorTickKm) {
    majorTicks.push(Math.round(kmPos * 1000) / 1000);
  }
  const majorSet = new Set(majorTicks);
  const minorTicks: number[] = [];
  for (let kmPos = 0; kmPos <= lengthKm + 0.0001; kmPos += minorTickKm) {
    const kmRounded = Math.round(kmPos * 1000) / 1000;
    if (!majorSet.has(kmRounded)) {
      minorTicks.push(kmRounded);
    }
  }

  return (
    <g
      data-testid="sld-v2-scale-ruler"
      data-pixels-per-km={pixelsPerKm}
      data-length-km={lengthKm}
      pointerEvents="none"
      transform={`translate(${x}, ${y})`}
    >
      <rect
        x={0}
        y={0}
        width={totalWidth + PANEL_PAD * 2}
        height={PANEL_HEIGHT}
        fill={COLOR_RULER_BG}
        stroke={COLOR_RULER_BORDER}
        strokeWidth={1.2}
        rx={2}
        ry={2}
        opacity={0.95}
      />
      {/* Title */}
      <text x={PANEL_PAD} y={11} fill={COLOR_RULER} fontFamily="sans-serif" fontSize={9} fontWeight={700}>
        SKALA · PN-EN ISO 5455
      </text>
      {/* Main horizontal line */}
      <line
        x1={PANEL_PAD}
        y1={RULER_Y}
        x2={PANEL_PAD + totalWidth}
        y2={RULER_Y}
        stroke={COLOR_RULER}
        strokeWidth={1.6}
      />
      {/* Minor ticks */}
      {minorTicks.map((kmPos) => (
        <line
          key={`minor-${kmPos}`}
          x1={PANEL_PAD + kmPos * pixelsPerKm}
          y1={RULER_Y}
          x2={PANEL_PAD + kmPos * pixelsPerKm}
          y2={RULER_Y + TICK_MINOR_HEIGHT}
          stroke={COLOR_RULER}
          strokeWidth={0.9}
        />
      ))}
      {/* Major ticks + labels */}
      {majorTicks.map((kmPos) => (
        <g key={`major-${kmPos}`} data-testid={`sld-v2-scale-ruler-tick-${Math.round(kmPos * 1000)}m`}>
          <line
            x1={PANEL_PAD + kmPos * pixelsPerKm}
            y1={RULER_Y}
            x2={PANEL_PAD + kmPos * pixelsPerKm}
            y2={RULER_Y + TICK_MAJOR_HEIGHT}
            stroke={COLOR_RULER}
            strokeWidth={1.4}
          />
          <text
            x={PANEL_PAD + kmPos * pixelsPerKm}
            y={RULER_Y + TICK_MAJOR_HEIGHT + 11}
            textAnchor="middle"
            fill={COLOR_RULER}
            fontFamily="sans-serif"
            fontSize={9}
          >
            {kmPos === 0
              ? '0'
              : kmPos < 1
                ? `${Math.round(kmPos * 1000)} m`
                : `${kmPos} km`}
          </text>
        </g>
      ))}
    </g>
  );
}
