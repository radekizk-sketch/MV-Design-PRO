/**
 * K30-48 — SldShortCircuitOverlay: projekcja wyników zwarciowych per IEC 60909.
 *
 * Renderuje na schemacie:
 * 1. **Bus markery zwarciowe** — fault X marker + chip Ik" per zwarciowa szyna,
 *    z severity tinting (zielona <5 kA, amber 5-15 kA, czerwona >15 kA).
 * 2. **Source contributions** — dashed arrows z każdego źródła zasilającego
 *    do faulted bus, z chipem Ik contribution.
 * 3. **Fault type badge** — top-left badge wskazujący kind błędu (3F/2F/1F/1FE).
 *
 * Quantities per IEC 60909:
 * - Ik"  — initial symmetrical short-circuit current (subtransient)
 * - ip   — peak short-circuit current
 * - Ith  — thermal equivalent short-circuit current (1s)
 * - Ik   — steady-state short-circuit current
 *
 * Toggleable via prop `projection` — gdy null/undefined → overlay nie
 * renderowany (back-compat).
 */

import type { JSX } from 'react';

export type FaultType = '3F' | '2F' | '1F' | '1F_GROUND';

export interface SldShortCircuitBusResult {
  /** Bus identifier (matches station/bus ref). */
  readonly busId: string;
  /** X/Y position w canvas (SVG units). */
  readonly x: number;
  readonly y: number;
  /** Bus label (np. "GPZ-A SN" / "S08 SN"). */
  readonly label?: string;
  /** Initial symmetrical short-circuit current [kA] — Ik". */
  readonly ikkA: number;
  /** Peak short-circuit current [kA] — ip. */
  readonly ipkA?: number;
  /** Thermal equivalent short-circuit current [kA] — Ith (t=1s). */
  readonly ithkA?: number;
  /** Steady-state short-circuit current [kA] — Ik. */
  readonly ikSteadyKA?: number;
  /** Czy to **fault location** (X marker) czy tylko **calculated bus**. */
  readonly isFaultLocation?: boolean;
}

export interface SldShortCircuitSourceContribution {
  /** Source identifier (GPZ / DER converter / motor). */
  readonly sourceId: string;
  /** Source label (display name). */
  readonly sourceLabel: string;
  /** Source position w canvas. */
  readonly sourceX: number;
  readonly sourceY: number;
  /** Faulted bus ID — gdzie ten source contributes. */
  readonly faultBusId: string;
  /** Source contribution Ik" [kA]. */
  readonly ikContribKA: number;
  /** Kind źródła — wpływa na kolor strzałki. */
  readonly sourceKind?: 'GPZ' | 'TRANSFORMER' | 'PV' | 'BESS' | 'FW' | 'MOTOR' | 'OTHER';
}

export interface SldShortCircuitProjection {
  /** Typ zwarcia: 3F / 2F / 1F / 1F_GROUND. */
  readonly faultType: FaultType;
  /** Bus results — per-bus Ik". */
  readonly busResults: readonly SldShortCircuitBusResult[];
  /** Source contributions — strzałki z każdego źródła do każdego fault bus. */
  readonly sourceContributions?: readonly SldShortCircuitSourceContribution[];
  /** Optional run identifier (do tooltip / audytu). */
  readonly runId?: string;
}

export interface SldShortCircuitOverlayProps {
  /** Główne dane projekcji. Brak → overlay null. */
  readonly projection?: SldShortCircuitProjection | null;
  /** Czy widoczny overlay (poza projection null check). Default true. */
  readonly visible?: boolean;
}

/* ---- Severity classification per Ik" amplitude (typowe MV grid) ---- */
function classifyIkSeverity(ikkA: number): { color: string; label: string } {
  if (ikkA < 1) return { color: '#7E8790', label: 'minimal' };       // < 1 kA — minor
  if (ikkA < 5) return { color: '#13C45A', label: 'normal' };        // < 5 kA — normal MV
  if (ikkA < 15) return { color: '#FFD166', label: 'elevated' };     // 5-15 kA — elevated
  if (ikkA < 30) return { color: '#FF8B5C', label: 'high' };         // 15-30 kA — high
  return { color: '#FF333D', label: 'extreme' };                      // >= 30 kA — extreme
}

/* ---- Source kind → strzałka kolor ---- */
function sourceKindColor(kind: SldShortCircuitSourceContribution['sourceKind']): string {
  switch (kind) {
    case 'GPZ': return '#E74C3C';        // WN feed → czerwień
    case 'TRANSFORMER': return '#13C45A'; // SN feed → zieleń
    case 'PV': return '#FFD166';          // PV inverter → gold
    case 'BESS': return '#7DD3FC';        // BESS → light blue
    case 'FW': return '#7EE0B5';          // wind → mint
    case 'MOTOR': return '#FF8B5C';       // motor backfeed → orange
    case 'OTHER':
    default: return '#B9C0C7';
  }
}

const FAULT_TYPE_LABEL: Record<FaultType, string> = {
  '3F': '3-fazowe',
  '2F': '2-fazowe',
  '1F': '1-fazowe',
  '1F_GROUND': '1-faz. doziemne',
};

const FAULT_TYPE_SYMBOL: Record<FaultType, string> = {
  '3F': '3φ',
  '2F': '2φ',
  '1F': '1φ',
  '1F_GROUND': '1φ⏚',
};

export function SldShortCircuitOverlay(props: SldShortCircuitOverlayProps): JSX.Element | null {
  const { projection, visible = true } = props;
  if (!visible || !projection) return null;
  const { faultType, busResults, sourceContributions = [] } = projection;

  return (
    <g
      data-testid="sld-v2-sc-overlay"
      data-fault-type={faultType}
      data-bus-count={busResults.length}
      pointerEvents="none"
    >
      {/* Fault-type badge (top-left of overlay group) */}
      <g
        data-testid="sld-v2-sc-overlay-fault-badge"
        transform="translate(20, 20)"
      >
        <rect x={0} y={0} width={180} height={36} rx={3} fill="#7A1414" stroke="#FF6B6B" strokeWidth={1.5} opacity={0.95} />
        <text x={10} y={14} fill="#FFFFFF" fontFamily="sans-serif" fontSize={9} fontWeight={700} letterSpacing={0.5}>
          ZWARCIE · IEC 60909
        </text>
        <text x={10} y={28} fill="#FFD166" fontFamily="sans-serif" fontSize={11} fontWeight={900}>
          {`${FAULT_TYPE_SYMBOL[faultType]}  ${FAULT_TYPE_LABEL[faultType]}`}
        </text>
      </g>

      {/* Source contribution arrows (dashed) — z każdego źródła do fault bus */}
      {sourceContributions.map((src) => {
        const fault = busResults.find((b) => b.busId === src.faultBusId);
        if (!fault) return null;
        const color = sourceKindColor(src.sourceKind);
        const midX = (src.sourceX + fault.x) / 2;
        const midY = (src.sourceY + fault.y) / 2;
        // Arrow head — direction normal vector
        const dx = fault.x - src.sourceX;
        const dy = fault.y - src.sourceY;
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const ux = dx / len;
        const uy = dy / len;
        // Arrow tip at 80% along path
        const tipX = src.sourceX + ux * len * 0.8;
        const tipY = src.sourceY + uy * len * 0.8;
        // Perpendicular for arrowhead base
        const px = -uy;
        const py = ux;
        return (
          <g
            key={`sc-src-${src.sourceId}-${src.faultBusId}`}
            data-testid={`sld-v2-sc-source-contrib-${src.sourceId}-${src.faultBusId}`}
            data-source-kind={src.sourceKind ?? 'OTHER'}
            data-ik-contrib-ka={src.ikContribKA.toFixed(3)}
          >
            <line
              x1={src.sourceX}
              y1={src.sourceY}
              x2={tipX}
              y2={tipY}
              stroke={color}
              strokeWidth={1.6}
              strokeDasharray="5 3"
              opacity={0.9}
            />
            {/* Arrowhead */}
            <polygon
              points={`${tipX},${tipY} ${tipX - ux * 8 + px * 4},${tipY - uy * 8 + py * 4} ${tipX - ux * 8 - px * 4},${tipY - uy * 8 - py * 4}`}
              fill={color}
              opacity={0.95}
            />
            {/* Ik contribution chip near midpoint */}
            <g transform={`translate(${midX}, ${midY})`}>
              <rect x={-26} y={-9} width={52} height={16} rx={2} fill="#0B141B" stroke={color} strokeWidth={1} opacity={0.92} />
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fill={color}
                fontFamily="sans-serif"
                fontSize={9}
                fontWeight={700}
              >
                {`${src.ikContribKA.toFixed(2)} kA`}
              </text>
            </g>
          </g>
        );
      })}

      {/* Per-bus Ik" markers + chips */}
      {busResults.map((bus) => {
        const severity = classifyIkSeverity(bus.ikkA);
        return (
          <g
            key={`sc-bus-${bus.busId}`}
            data-testid={`sld-v2-sc-bus-${bus.busId}`}
            data-is-fault-location={bus.isFaultLocation ? 'true' : 'false'}
            data-ik-ka={bus.ikkA.toFixed(3)}
            data-severity={severity.label}
            transform={`translate(${bus.x}, ${bus.y})`}
          >
            {/* Fault location marker (X cross) */}
            {bus.isFaultLocation && (
              <g data-testid={`sld-v2-sc-bus-${bus.busId}-fault-marker`}>
                <circle cx={0} cy={0} r={14} fill="#7A1414" stroke="#FF333D" strokeWidth={2} opacity={0.92} />
                <line x1={-8} y1={-8} x2={8} y2={8} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
                <line x1={8} y1={-8} x2={-8} y2={8} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
              </g>
            )}
            {/* Ik" chip (z severity tint) */}
            <g transform="translate(18, -10)">
              <rect x={0} y={0} width={80} height={36} rx={3} fill="#0A0E14" stroke={severity.color} strokeWidth={1.4} opacity={0.95} />
              <text
                x={6}
                y={11}
                fill={severity.color}
                fontFamily="sans-serif"
                fontSize={8}
                fontWeight={700}
              >
                {bus.label ?? bus.busId}
              </text>
              <text
                x={6}
                y={23}
                fill="#FFFFFF"
                fontFamily="monospace"
                fontSize={10}
                fontWeight={900}
              >
                {`Ik" ${bus.ikkA.toFixed(2)} kA`}
              </text>
              <text
                x={6}
                y={32}
                fill={severity.color}
                fontFamily="sans-serif"
                fontSize={7}
                fontWeight={600}
              >
                {bus.ipkA != null
                  ? `ip ${bus.ipkA.toFixed(1)}  Ith ${bus.ithkA?.toFixed(1) ?? '—'} kA`
                  : '(brak ip/Ith)'}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
