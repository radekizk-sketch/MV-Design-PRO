/**
 * Fault Contribution Arrow — P0.7 / PLAN_SLD_REWORK F4 — SC overlay primitive.
 *
 * STATUS: PRIMITIVE (zintegrowane w pełnym overlay redesign w F4)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 8.1 (SC overlay — strzałki wkładów)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 6.2
 * - docs/audit/SLD_VISUAL_QUALITY_AUDIT.md § 3.4 (PF + SC overlays redesign)
 *
 * Pojedyncza, deterministyczna, samowystarczalna prymityw renderująca strzałkę
 * pokazującą wkład prądu zwarciowego (Ik) od źródła do bus'a.
 *
 * USAGE
 * -----
 *   <FaultContributionArrow
 *     fromXy={[100, 50]}
 *     toXy={[250, 50]}
 *     magnitudeKa={3.4}
 *     sourceLabel="GPZ"
 *   />
 *
 * RENDERED:
 *   GPZ ━━━━━▶  3.4 kA  bus
 *
 * INVARIANTY (V12K + AC-08 zachowanie LOD):
 * - Deterministyczna geometria (te same props → ten sam SVG)
 * - Brak fizyki (tylko prezentacja wyniku z SC ResultSet)
 * - Polskie etykiety (kA, brak codenames)
 * - Theme-driven (currentColor) — paletka via parent context
 * - Grubość strzałki ∝ magnitude (clipped do MIN..MAX)
 */

import { useMemo } from 'react';

export interface FaultContributionArrowProps {
  /** Punkt początkowy strzałki [x, y] w jednostkach SVG canvas. */
  fromXy: readonly [number, number];
  /** Punkt końcowy strzałki [x, y] w jednostkach SVG canvas. */
  toXy: readonly [number, number];
  /** Wkład prądu zwarciowego w kA (rendered as numeric label przy końcówce). */
  magnitudeKa: number;
  /** Polska etykieta źródła (np. "GPZ", "Generator A", "Inverter PV"). */
  sourceLabel?: string;
  /** Minimum stroke width (px) dla najmniejszej strzałki. */
  minStrokeWidth?: number;
  /** Maximum stroke width (px) dla największej strzałki. */
  maxStrokeWidth?: number;
  /** Magnitude przy której stroke = maxStrokeWidth (clipping). */
  maxMagnitudeKa?: number;
  /** Test ID dla E2E lookup. */
  testId?: string;
}

/**
 * Linear interpolation magnitude → stroke width (clipped).
 *
 * Determinist: same magnitude → same width per call. Used by both render
 * function AND test assertions (export to unit-test geometry).
 */
export function computeStrokeWidth(
  magnitudeKa: number,
  options?: {
    minStrokeWidth?: number;
    maxStrokeWidth?: number;
    maxMagnitudeKa?: number;
  },
): number {
  const min = options?.minStrokeWidth ?? 1.5;
  const max = options?.maxStrokeWidth ?? 5.0;
  const cap = options?.maxMagnitudeKa ?? 10.0;
  if (!Number.isFinite(magnitudeKa) || magnitudeKa <= 0) return min;
  const ratio = Math.min(magnitudeKa / cap, 1.0);
  return min + ratio * (max - min);
}

/**
 * Format magnitude per V12.xx canon (polskie jednostki, 1 miejsce po przecinku).
 */
export function formatMagnitudeKa(magnitudeKa: number): string {
  if (!Number.isFinite(magnitudeKa)) return '—';
  return `${magnitudeKa.toFixed(1).replace('.', ',')} kA`;
}

export function FaultContributionArrow({
  fromXy,
  toXy,
  magnitudeKa,
  sourceLabel,
  minStrokeWidth,
  maxStrokeWidth,
  maxMagnitudeKa,
  testId = 'sld-fault-contribution-arrow',
}: FaultContributionArrowProps): JSX.Element {
  const strokeWidth = useMemo(
    () =>
      computeStrokeWidth(magnitudeKa, {
        minStrokeWidth,
        maxStrokeWidth,
        maxMagnitudeKa,
      }),
    [magnitudeKa, minStrokeWidth, maxStrokeWidth, maxMagnitudeKa],
  );

  const [fx, fy] = fromXy;
  const [tx, ty] = toXy;

  // Arrowhead: small triangle at end. Compute orthogonal vector for tri vertices.
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy);
  // Guard: zero-length arrow — render only label.
  const headSize = 8 + strokeWidth; // px scaling with strokeWidth
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  // Perpendicular unit vector
  const px = -uy;
  const py = ux;
  // Triangle base center is at (tx - ux*headSize, ty - uy*headSize)
  const baseCx = tx - ux * headSize;
  const baseCy = ty - uy * headSize;
  const halfBase = headSize * 0.5;
  const v1x = baseCx + px * halfBase;
  const v1y = baseCy + py * halfBase;
  const v2x = baseCx - px * halfBase;
  const v2y = baseCy - py * halfBase;
  const trianglePoints = `${tx},${ty} ${v1x.toFixed(2)},${v1y.toFixed(2)} ${v2x.toFixed(2)},${v2y.toFixed(2)}`;

  // Label position: midpoint of arrow, offset perpendicular
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;
  const labelOffset = 10;
  const labelX = midX + px * labelOffset;
  const labelY = midY + py * labelOffset;

  return (
    <g data-testid={testId} aria-label={`Wkład zwarcia ${formatMagnitudeKa(magnitudeKa)}`}>
      {/* Line body */}
      <line
        x1={fx}
        y1={fy}
        x2={baseCx.toFixed(2)}
        y2={baseCy.toFixed(2)}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        data-testid={`${testId}-line`}
      />
      {/* Arrowhead */}
      <polygon
        points={trianglePoints}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={Math.max(1, strokeWidth * 0.5)}
        data-testid={`${testId}-head`}
      />
      {/* Magnitude label */}
      <text
        x={labelX.toFixed(2)}
        y={labelY.toFixed(2)}
        fontSize={11}
        fontWeight={600}
        fill="currentColor"
        textAnchor="middle"
        dominantBaseline="middle"
        data-testid={`${testId}-label`}
      >
        {formatMagnitudeKa(magnitudeKa)}
      </text>
      {/* Optional source label near origin */}
      {sourceLabel && (
        <text
          x={fx.toFixed(2)}
          y={(fy - 8).toFixed(2)}
          fontSize={9}
          fill="currentColor"
          textAnchor="start"
          data-testid={`${testId}-source`}
        >
          {sourceLabel}
        </text>
      )}
    </g>
  );
}
