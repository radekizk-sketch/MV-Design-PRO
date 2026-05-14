/**
 * Power Flow Arrow — P0.7 / PLAN_SLD_REWORK F4 — PF overlay primitive.
 *
 * STATUS: PRIMITIVE (zintegrowane w pełnym overlay redesign w F4)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 8.1 (PF overlay — strzałki kierunkowe)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 6.2
 *
 * Strzałka kierunku przepływu mocy P+jQ z gradientem kolorystycznym wg
 * obciążenia (loading_pct):
 * - < 80% → zielony (normal load)
 * - 80–100% → żółty (high load)
 * - > 100% → czerwony (overload)
 *
 * USAGE
 * -----
 *   <PowerFlowArrow
 *     fromXy={[100, 50]}
 *     toXy={[300, 50]}
 *     activeMw={2.5}
 *     reactiveMvar={1.0}
 *     loadingPct={87}
 *   />
 *
 * Kierunek strzałki = kierunek P > 0 (od source do sink). Ujemne P → strzałka
 * odwrócona (od to → from).
 *
 * INVARIANTY:
 * - Deterministyczna geometria + kolor (same props → identyczny output)
 * - Brak fizyki — tylko prezentacja Power Flow ResultSet
 * - 3-poziomowa paleta severity wg loadingPct (industrial standard)
 * - Strzałka W KIERUNKU dodatniego P (przy ujemnym P → reverse)
 */

import { useMemo } from 'react';

export type PowerFlowSeverity = 'normal' | 'high' | 'overload';

export interface PowerFlowArrowProps {
  /** Punkt początkowy [x, y] (typowo bus from). */
  fromXy: readonly [number, number];
  /** Punkt końcowy [x, y] (typowo bus to). */
  toXy: readonly [number, number];
  /** Moc czynna P [MW]. Ujemna = przepływ w kierunku odwrotnym. */
  activeMw: number;
  /** Moc bierna Q [Mvar]. */
  reactiveMvar: number;
  /** Obciążenie elementu [%] dla severity color. */
  loadingPct: number;
  /** Czy renderować etykietę wartości P+jQ (default true). */
  showLabel?: boolean;
  /** Test ID dla E2E lookup. */
  testId?: string;
}

/**
 * Loading_pct → severity bucket thresholds (presentation buckets only, not physics).
 *
 * These thresholds map loading_pct (already computed upstream by solver) into
 * 3 UI buckets per SLD_INDUSTRIAL_SCADA_CAD_TARGET § 8.1. NO physics
 * calculation happens here — this is severity mapping for color tokens.
 */
const SEVERITY_THRESHOLD_HIGH_PCT = 80;
const SEVERITY_THRESHOLD_OVERLOAD_PCT = 100;

/**
 * Map loading_pct → severity bucket.
 *
 * Industrial-grade thresholds per SLD_INDUSTRIAL_SCADA_CAD_TARGET § 8.1:
 * - normal: < 80% (zielony — normalna eksploatacja)
 * - high: 80–100% (żółty — wysokie obciążenie)
 * - overload: > 100% (czerwony — przeciążenie)
 */
export function computeFlowSeverity(loadingPct: number): PowerFlowSeverity {
  if (!Number.isFinite(loadingPct) || loadingPct < 0) return 'normal';
  if (loadingPct > SEVERITY_THRESHOLD_OVERLOAD_PCT) return 'overload';
  if (loadingPct >= SEVERITY_THRESHOLD_HIGH_PCT) return 'high';
  return 'normal';
}

/**
 * Severity → CSS color class name (theme-driven via Tailwind / CSS vars).
 * Renderery używają tych klas zamiast hardcoded kolorów.
 */
export const SEVERITY_CLASSES: Readonly<Record<PowerFlowSeverity, string>> = {
  normal: 'sld-overlay-flow-normal',
  high: 'sld-overlay-flow-high',
  overload: 'sld-overlay-flow-overload',
};

/**
 * Format P + jQ per V12.xx canon (polskie separatory, jednostki SI).
 */
export function formatPowerFlow(activeMw: number, reactiveMvar: number): string {
  const fmt = (v: number, unit: string): string => {
    if (!Number.isFinite(v)) return `— ${unit}`;
    return `${v.toFixed(2).replace('.', ',')} ${unit}`;
  };
  return `${fmt(activeMw, 'MW')} + j${fmt(reactiveMvar, 'Mvar').trim()}`;
}

export function PowerFlowArrow({
  fromXy,
  toXy,
  activeMw,
  reactiveMvar,
  loadingPct,
  showLabel = true,
  testId = 'sld-power-flow-arrow',
}: PowerFlowArrowProps): JSX.Element {
  const severity = useMemo(() => computeFlowSeverity(loadingPct), [loadingPct]);
  const severityClass = SEVERITY_CLASSES[severity];

  // Reverse direction when activeMw < 0
  const [fx0, fy0] = fromXy;
  const [tx0, ty0] = toXy;
  const reversed = activeMw < 0;
  const fx = reversed ? tx0 : fx0;
  const fy = reversed ? ty0 : fy0;
  const tx = reversed ? fx0 : tx0;
  const ty = reversed ? fy0 : ty0;

  // Arrow geometry (similar to FaultContributionArrow but smaller head)
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const px = -uy;
  const py = ux;
  const headSize = 10;
  const baseCx = tx - ux * headSize;
  const baseCy = ty - uy * headSize;
  const halfBase = headSize * 0.5;
  const v1x = baseCx + px * halfBase;
  const v1y = baseCy + py * halfBase;
  const v2x = baseCx - px * halfBase;
  const v2y = baseCy - py * halfBase;
  const trianglePoints = `${tx},${ty} ${v1x.toFixed(2)},${v1y.toFixed(2)} ${v2x.toFixed(2)},${v2y.toFixed(2)}`;

  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;
  const labelOffset = 12;
  const labelX = midX + px * labelOffset;
  const labelY = midY + py * labelOffset;

  const flowLabel = formatPowerFlow(Math.abs(activeMw), reactiveMvar);
  const loadingLabel = Number.isFinite(loadingPct)
    ? `${loadingPct.toFixed(0)}%`
    : '—';

  return (
    <g
      data-testid={testId}
      data-severity={severity}
      className={severityClass}
      aria-label={`Przepływ mocy ${flowLabel}, obciążenie ${loadingLabel}`}
    >
      <line
        x1={fx}
        y1={fy}
        x2={baseCx.toFixed(2)}
        y2={baseCy.toFixed(2)}
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        data-testid={`${testId}-line`}
      />
      <polygon
        points={trianglePoints}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        data-testid={`${testId}-head`}
      />
      {showLabel && (
        <text
          x={labelX.toFixed(2)}
          y={labelY.toFixed(2)}
          fontSize={10}
          fontWeight={500}
          fill="currentColor"
          textAnchor="middle"
          dominantBaseline="middle"
          data-testid={`${testId}-label`}
        >
          {flowLabel}
        </text>
      )}
    </g>
  );
}
