/**
 * K30-46 — SldProtectionZoneOverlay: stref ochrony Z1/Z2/Z3 per IEC 60255-127.
 *
 * Industrial distance protection scheme zwykle używa 3-zone settings:
 * - **Z1** (zone 1): instantaneous, 80% reach linii — primary protection
 * - **Z2** (zone 2): delayed (0.3-0.5s), 120% reach — back-up for end-of-line
 * - **Z3** (zone 3): remote back-up (1.0-1.5s), 250% reach — far back-up
 *
 * Operator widzi zone reach jako kolorowe pasma równolegle do kabla:
 * - Z1 zielona (instantaneous OK)
 * - Z2 amber (delayed)
 * - Z3 czerwona (remote — last resort)
 *
 * Toggleable via `projection` prop — gdy null, overlay nie renderowany.
 */

import type { JSX } from 'react';

export type ProtectionZoneType = 'Z1' | 'Z2' | 'Z3' | 'BACKUP';

export interface SldProtectionZone {
  /** Zone identifier (np. "GPZ-A/Q05/Z1"). */
  readonly zoneId: string;
  /** Protection bay z którego zona jest skonfigurowana. */
  readonly protectionBayRef: string;
  /** Display label dla bay (np. "Q05 GPZ-A"). */
  readonly protectionBayLabel?: string;
  /** Typ strefy. */
  readonly zoneType: ProtectionZoneType;
  /** Reach [km] — fizyczny zasięg strefy w kierunku zabezpieczanym. */
  readonly reachKm: number;
  /** Trip delay [ms]. Z1 typowo 0, Z2 300-500, Z3 1000-1500. */
  readonly delayMs: number;
  /** Path points — ścieżka cabla po którym zona biegnie. */
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  /** Offset perpendicular do cabla [px] — pozwala distinct render Z1/Z2/Z3
   *  równolegle do siebie. Default 8 dla Z1, 14 dla Z2, 20 dla Z3. */
  readonly offsetPx?: number;
}

export interface SldProtectionZoneProjection {
  readonly zones: readonly SldProtectionZone[];
  /** Optional run identifier (do tooltip / audytu). */
  readonly runId?: string;
}

export interface SldProtectionZoneOverlayProps {
  readonly projection?: SldProtectionZoneProjection | null;
  /** Czy widoczny. Default true. */
  readonly visible?: boolean;
}

const ZONE_STYLES: Record<ProtectionZoneType, {
  stroke: string;
  defaultOffset: number;
  label: string;
}> = {
  Z1: { stroke: '#13C45A', defaultOffset: 8,  label: 'Z1' },
  Z2: { stroke: '#FFD166', defaultOffset: 14, label: 'Z2' },
  Z3: { stroke: '#FF6B6B', defaultOffset: 20, label: 'Z3' },
  BACKUP: { stroke: '#7E8790', defaultOffset: 26, label: 'B' },
};

/**
 * K30-46: shift każdego punktu path perpendicular o `offset` px.
 * Działa tylko na poziomych/pionowych segmentach (Manhattan SLD geometry).
 */
function offsetPath(
  points: readonly { x: number; y: number }[],
  offsetPx: number,
): string {
  if (points.length < 2) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Horizontal segment → offset Y, Vertical → offset X
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal — shift Y by offset (above cable)
      if (i === 0) parts.push(`M ${a.x} ${a.y - offsetPx}`);
      parts.push(`L ${b.x} ${b.y - offsetPx}`);
    } else {
      // Vertical — shift X by offset
      if (i === 0) parts.push(`M ${a.x - offsetPx} ${a.y}`);
      parts.push(`L ${b.x - offsetPx} ${b.y}`);
    }
  }
  return parts.join(' ');
}

export function SldProtectionZoneOverlay(props: SldProtectionZoneOverlayProps): JSX.Element | null {
  const { projection, visible = true } = props;
  if (!visible || !projection) return null;
  if (projection.zones.length === 0) return null;

  return (
    <g
      data-testid="sld-v2-protection-zones-overlay"
      data-zone-count={projection.zones.length}
      pointerEvents="none"
    >
      {projection.zones.map((zone) => {
        const style = ZONE_STYLES[zone.zoneType];
        const offset = zone.offsetPx ?? style.defaultOffset;
        const d = offsetPath(zone.pathPoints, offset);
        const last = zone.pathPoints[zone.pathPoints.length - 1];
        return (
          <g
            key={zone.zoneId}
            data-testid={`sld-v2-protection-zone-${zone.zoneId}`}
            data-zone-type={zone.zoneType}
            data-protection-bay-ref={zone.protectionBayRef}
            data-reach-km={zone.reachKm.toFixed(2)}
            data-delay-ms={zone.delayMs}
          >
            <path
              d={d}
              fill="none"
              stroke={style.stroke}
              strokeWidth={2.4}
              strokeDasharray={zone.zoneType === 'Z1' ? undefined : zone.zoneType === 'Z2' ? '6 3' : '3 3'}
              opacity={0.8}
              strokeLinecap="round"
            />
            {/* Zone end-of-reach label chip */}
            <g transform={`translate(${last.x}, ${last.y - offset})`}>
              <rect
                x={-22}
                y={-9}
                width={44}
                height={16}
                rx={2}
                fill="#0A0E14"
                stroke={style.stroke}
                strokeWidth={1}
                opacity={0.95}
              />
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fill={style.stroke}
                fontFamily="sans-serif"
                fontSize={9}
                fontWeight={800}
              >
                {`${style.label} ${zone.delayMs === 0 ? '0s' : `${(zone.delayMs / 1000).toFixed(1)}s`}`}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
