/**
 * K30-47 — SldNorthArrow: kompas orientacji geograficznej per PN-EN ISO 5456.
 *
 * Industrial map-style drawings używają strzałki N (north arrow) wskazującej
 * geograficzną orientację. Dla schematów topologicznych SLD jest to opcjonalne
 * ale przydatne gdy layout zawiera geographic context (np. K30 z distance
 * from GPZ — odległości fizyczne).
 *
 * Rendering: okrąg z trójkątną strzałką N + opcjonalny kontekstowy obrót
 * (rotationDeg, np. gdy mapa jest obrócona względem N).
 */

import type { JSX } from 'react';

export interface SldNorthArrowProps {
  /** Czy widoczna. Default true. */
  readonly visible?: boolean;
  /** X coordinate origin. Default 0. */
  readonly x?: number;
  /** Y coordinate origin. Default 0. */
  readonly y?: number;
  /** Obrót strzałki [deg] — 0 = N do góry. Default 0. */
  readonly rotationDeg?: number;
  /** Rozmiar pixel (średnica okręgu). Default 48. */
  readonly size?: number;
}

const COLOR_BG = '#0A0E14';
const COLOR_BORDER = '#5A6878';
const COLOR_ARROW = '#FFD166';
const COLOR_TEXT = '#DDF7FF';

export function SldNorthArrow(props: SldNorthArrowProps): JSX.Element | null {
  const { visible = true, x = 0, y = 0, rotationDeg = 0, size = 48 } = props;
  if (!visible) return null;
  if (size <= 0) return null;

  const r = size / 2;
  const arrowLen = r - 4;
  const arrowHalfWidth = 5;

  return (
    <g
      data-testid="sld-v2-north-arrow"
      data-rotation-deg={rotationDeg}
      pointerEvents="none"
      transform={`translate(${x}, ${y})`}
    >
      {/* Outer circle frame */}
      <circle
        cx={r}
        cy={r}
        r={r}
        fill={COLOR_BG}
        stroke={COLOR_BORDER}
        strokeWidth={1.2}
        opacity={0.95}
      />
      {/* Arrow body — pointing UP by default; rotation rotuje cally group */}
      <g transform={`rotate(${rotationDeg} ${r} ${r})`}>
        {/* Filled half-arrow (right side) */}
        <polygon
          points={`${r},${r - arrowLen} ${r + arrowHalfWidth},${r + arrowLen * 0.5} ${r},${r}`}
          fill={COLOR_ARROW}
          stroke={COLOR_ARROW}
          strokeWidth={0.6}
        />
        {/* Outline half-arrow (left side) */}
        <polygon
          points={`${r},${r - arrowLen} ${r - arrowHalfWidth},${r + arrowLen * 0.5} ${r},${r}`}
          fill="none"
          stroke={COLOR_ARROW}
          strokeWidth={1.2}
        />
      </g>
      {/* N label */}
      <text
        x={r}
        y={11}
        textAnchor="middle"
        fill={COLOR_TEXT}
        fontFamily="sans-serif"
        fontSize={10}
        fontWeight={900}
      >
        N
      </text>
    </g>
  );
}
