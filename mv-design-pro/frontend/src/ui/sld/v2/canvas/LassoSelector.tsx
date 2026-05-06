/**
 * LassoSelector — prostokątny selektor multi-select (Iteracja 12).
 *
 * Renderowany w przestrzeni "ekran" (poza transform world). Drag prawym
 * przyciskiem-shift albo middle-click+shift definiuje prostokąt; po puszczeniu
 * propozycja zaznaczenia jest publikowana przez onLasso(rect).
 *
 * Wzorzec użycia:
 *   <svg ...>
 *     <g transform="translate(...)">{world content}</g>
 *     <LassoSelector visible={lasso != null} rect={lasso} />
 *   </svg>
 */

import type { CSSProperties } from 'react';

export interface LassoRect {
  /** Lewy górny róg w przestrzeni ekranu (px). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LassoSelectorProps {
  readonly visible: boolean;
  readonly rect: LassoRect | null;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function LassoSelector({ visible, rect, className, style }: LassoSelectorProps): JSX.Element | null {
  if (!visible || !rect) return null;
  return (
    <rect
      data-testid="sld-lasso"
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill="rgba(53, 199, 255, 0.10)"
      stroke="#35C7FF"
      strokeWidth={1}
      strokeDasharray="4 4"
      pointerEvents="none"
      className={className}
      style={style}
    />
  );
}

/**
 * Sprawdza, czy punkt o współrzędnych ekranu (clientX/clientY przeniesione na
 * lokalne SVG) jest wewnątrz prostokąta.
 */
export function pointInLasso(
  point: { x: number; y: number },
  rect: LassoRect,
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Konwertuje 2 punkty (start/end drag) do prostokąta zorientowanego.
 */
export function rectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): LassoRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

export default LassoSelector;
