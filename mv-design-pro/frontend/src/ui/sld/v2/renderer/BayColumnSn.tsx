/**
 * BayColumnSn — K30-31 SN bay column renderer (single vertical column).
 *
 * Per IEC 60617 — bay = vertical column z stacked apparatus:
 *   Bus connection point → DS → CB → ES → Outgoing point
 * (or other combinations per role; see apparatusStackForRole).
 *
 * Replaces ad-hoc BayMarker floating-symbol pattern z proper
 * bay-column SLD structure. Każde apparatus connected do next via
 * explicit vertical dropline (NIE floating).
 */

import type { JSX } from 'react';

import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import {
  COLOR_BUS_LV,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import type { ApparatusKind } from './MiniBlockBayLayout';
import {
  getVariantApparatusGap,
  getVariantApparatusHeight,
} from './MiniBlockBayLayout';
import {
  ApparatusCbSquare,
  ApparatusEarthingSwitch,
  ApparatusSwitchDisconnector,
  ApparatusVtThreePhase,
  CtPrimary,
} from './GpzApparatusSymbols';

export type SymbolClickHandler = (
  id: string,
) => ((e: React.MouseEvent<SVGGElement>) => void) | undefined;

export interface BayColumnSnProps {
  readonly x: number;
  readonly busY: number;
  readonly bayRole: FieldRole;
  readonly bayRef: string;
  readonly designation: string;
  readonly apparatusStack: readonly ApparatusKind[];
  readonly variant: 'overview' | 'compact' | 'detail';
  readonly stationId: string;
  readonly hasMissing?: boolean;
  readonly onSymbolClick?: SymbolClickHandler;
  /** K30-63: stan CB w bay (closed/open/unknown). Default 'closed'. */
  readonly cbState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan DS w bay (closed/open/unknown). Default 'closed'. */
  readonly dsState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan ES w bay (closed/open/unknown). Default 'open' (rest). */
  readonly esState?: 'closed' | 'open' | 'unknown';
}

export function BayColumnSn(props: BayColumnSnProps): JSX.Element {
  const {
    x,
    busY,
    bayRole,
    bayRef,
    designation,
    apparatusStack,
    variant,
    stationId,
    hasMissing,
    onSymbolClick,
  } = props;

  const apparatusHeight = getVariantApparatusHeight(variant);
  const apparatusGap = getVariantApparatusGap(variant);
  const stackTopY = busY + 4;
  const stepHeight = apparatusHeight + apparatusGap;

  /* K30-119 audyt #2 MAJOR: LOD-aware apparatus downsampling.
   * - overview (LOD 0): render TYLKO 1 symbol (primary switching device)
   *                     + ES jeśli jest (safety-critical BHP)
   * - compact (LOD 1): render 2 symbole + ES jeśli jest (PN-EN 62271-102 BHP)
   * - detail (LOD 2+): pełen stack (existing)
   * Operator widzi w overview tylko esencjalne info zamiast clutter, ale
   * uziemnik ZAWSZE widoczny (safety-critical per audyt #2). */
  const visibleApparatusStack = variant === 'detail'
    ? apparatusStack
    : (() => {
        const limit = variant === 'compact' ? 2 : 1;
        const truncated = apparatusStack.slice(0, Math.min(limit, apparatusStack.length));
        // Ensure ES always visible (safety-critical) gdy obecny w stack
        const hasEs = apparatusStack.includes('ES' as typeof apparatusStack[number]);
        const truncatedHasEs = truncated.includes('ES' as typeof apparatusStack[number]);
        if (hasEs && !truncatedHasEs) {
          return [...truncated, 'ES' as typeof apparatusStack[number]];
        }
        return truncated;
      })();

  // Outgoing point — bottom of last apparatus (K30-119: based on visible count)
  const outgoingY =
    visibleApparatusStack.length === 0
      ? stackTopY
      : stackTopY + visibleApparatusStack.length * apparatusHeight + (visibleApparatusStack.length - 1) * apparatusGap;

  const elementId = `${stationId}/bay/${bayRef}`;

  return (
    <g
      data-testid={`sld-v2-bay-column-sn-${bayRef}`}
      data-bay-role={bayRole}
      data-station-id={stationId}
    >
      {/* Connection point to SN bus */}
      <circle
        cx={x}
        cy={busY}
        r={1.8}
        fill={COLOR_BUS_LV}
        data-testid={`sld-v2-bay-${bayRef}-bus-junction`}
      />

      {/* Lead bus → top of apparatus stack */}
      <line
        x1={x}
        y1={busY}
        x2={x}
        y2={stackTopY}
        stroke={COLOR_BUS_LV}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* Stacked apparatus z explicit interconnecting droplines (K30-119: visible only) */}
      {visibleApparatusStack.map((kind, idx) => {
        const cy =
          stackTopY + idx * stepHeight + apparatusHeight / 2;
        const prevBottomY =
          idx === 0
            ? stackTopY
            : stackTopY + (idx - 1) * stepHeight + apparatusHeight;
        const apparatusTopY = stackTopY + idx * stepHeight;
        return (
          <g
            key={`${kind}-${idx}`}
            data-testid={`sld-v2-bay-${bayRef}-apparatus-${idx}`}
            data-bay-apparatus-slot={kind}
            data-bay-apparatus-position={idx}
            onClick={onSymbolClick?.(`${elementId}/apparatus/${idx}`)}
            style={onSymbolClick ? { cursor: 'pointer' } : undefined}
          >
            {/* Interconnecting dropline z previous apparatus */}
            {idx > 0 && (
              <line
                x1={x}
                y1={prevBottomY}
                x2={x}
                y2={apparatusTopY}
                stroke={COLOR_BUS_LV}
                strokeWidth={STROKE_FIELD_TRACK_PX}
              />
            )}
            {/* Apparatus symbol per IEC 60617 */}
            {kind === 'DS' && (
              <ApparatusSwitchDisconnector
                cx={x}
                cy={cy}
                state={props.dsState ?? 'closed'}
                energized={(props.dsState ?? 'closed') === 'closed'}
              />
            )}
            {kind === 'CB' && (
              <>
                <ApparatusCbSquare
                  cx={x}
                  cy={cy}
                  state={props.cbState ?? 'closed'}
                  energized={(props.cbState ?? 'closed') === 'closed'}
                />
                {/* K30-56: ANSI 51 protection badge obok CB (overcurrent relay).
                    K30-66: + ANSI 50 (instantaneous) + 67 (directional) badges.
                    Real OSD bay ma protection relay — pokazujemy ANSI codes
                    50/51 (line bays) i 67 (kierunkowa, GPZ feeder) per IEC 60255-127. */}
                {variant === 'detail' && (
                  <g data-testid={`sld-v2-bay-${bayRef}-protection-ansi`}>
                    {/* ANSI 50 — instantaneous overcurrent (top) */}
                    <g
                      data-testid={`sld-v2-bay-${bayRef}-protection-50`}
                      data-ansi-code="50"
                      transform={`translate(${x + 9}, ${cy - 9})`}
                    >
                      <circle cx={0} cy={0} r={4} fill="#0A0E14" stroke="#FF8B5C" strokeWidth={0.8} />
                      <text x={0} y={1.5} textAnchor="middle" fill="#FF8B5C" fontFamily="monospace" fontSize={4.5} fontWeight={900}>
                        50
                      </text>
                    </g>
                    {/* ANSI 51 — time-delayed overcurrent (middle) */}
                    <g
                      data-testid={`sld-v2-bay-${bayRef}-protection-51`}
                      data-ansi-code="51"
                      transform={`translate(${x + 9}, ${cy})`}
                    >
                      <circle cx={0} cy={0} r={4} fill="#0A0E14" stroke="#FFD166" strokeWidth={0.8} />
                      <text
                        x={0}
                        y={1.5}
                        textAnchor="middle"
                        fill="#FFD166"
                        fontFamily="monospace"
                        fontSize={4.5}
                        fontWeight={900}
                      >
                        51
                      </text>
                    </g>
                    {/* ANSI 67 — directional overcurrent (bottom, GPZ feeders) */}
                    {(bayRole === FIELD_ROLE.GPZ_LINE_BAY || bayRole === FIELD_ROLE.LINE_OUT) && (
                      <g
                        data-testid={`sld-v2-bay-${bayRef}-protection-67`}
                        data-ansi-code="67"
                        transform={`translate(${x + 9}, ${cy + 9})`}
                      >
                        <circle cx={0} cy={0} r={4} fill="#0A0E14" stroke="#7DD3FC" strokeWidth={0.8} />
                        <text x={0} y={1.5} textAnchor="middle" fill="#7DD3FC" fontFamily="monospace" fontSize={4.5} fontWeight={900}>
                          67
                        </text>
                      </g>
                    )}
                  </g>
                )}
              </>
            )}
            {kind === 'ES' && (
              <ApparatusEarthingSwitch
                cxAxis={x}
                cy={cy}
                state={props.esState ?? 'open'}
              />
            )}
            {kind === 'CT' && <CtPrimary cx={x} cy={cy} />}
            {kind === 'VT' && <ApparatusVtThreePhase cx={x} cy={cy} />}
          </g>
        );
      })}

      {/* Outgoing point (bottom of column) */}
      <circle
        cx={x}
        cy={outgoingY}
        r={2}
        fill={COLOR_BUS_LV}
        data-testid={`sld-v2-bay-${bayRef}-outgoing`}
      />

      {/* Q-designation label — K30-124 audyt fix: render WSZYSTKICH variants
       *  dla consistent UX (eliminacja flickering przy LOD toggle).
       *  K30-121 audyt fix: label offset gdy DS jest w stack (lever może
       *  kolidować z text gdy dsState='open' — diagonal sięga cx+DS_RADIUS×0.85).
       *  Przesunięcie x o +8px gdy DS obecny (anti-collision). */}
      {designation && (() => {
        const hasDs = visibleApparatusStack.includes('DS' as typeof visibleApparatusStack[number]);
        const labelX = hasDs ? x + 8 : x;
        const labelAnchor = hasDs ? 'start' : 'middle';
        const labelFontSize = variant === 'overview' ? 7 : variant === 'compact' ? 8 : 9;
        return (
          <text
            x={labelX}
            y={busY - 4}
            textAnchor={labelAnchor}
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_SANS}
            fontSize={labelFontSize}
            fontWeight={700}
            data-testid={`sld-v2-bay-${bayRef}-designation`}
          >
            {designation}
          </text>
        );
      })()}

      {/* Missing data indicator */}
      {hasMissing && (
        <circle
          cx={x + 12}
          cy={stackTopY + 4}
          r={3}
          fill="#FF7B00"
          stroke={COLOR_SELECTION}
          strokeWidth={0.5}
          data-testid={`sld-v2-bay-${bayRef}-missing-indicator`}
        >
          <title>Brakuje wymaganego apparatusu</title>
        </circle>
      )}

      {/* Bay role badge (overview/compact) — light text under outgoing */}
      {variant !== 'overview' && bayRole && (
        <text
          x={x}
          y={outgoingY + 12}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={8}
          opacity={0.7}
          data-testid={`sld-v2-bay-${bayRef}-role`}
        >
          {bayRoleShortLabel(bayRole)}
        </text>
      )}
    </g>
  );
}

function bayRoleShortLabel(role: FieldRole): string {
  switch (role) {
    case FIELD_ROLE.LINE_IN:
      return 'IN';
    case FIELD_ROLE.LINE_OUT:
      return 'OUT';
    case FIELD_ROLE.LINE_BRANCH:
      return 'BR';
    case FIELD_ROLE.TRANSFORMER:
    case FIELD_ROLE.RMU_TRANSFORMER:
      return 'TR';
    case FIELD_ROLE.COUPLER:
      return 'C';
    case FIELD_ROLE.MEASUREMENT:
      return 'M';
    case FIELD_ROLE.GPZ_LINE_BAY:
      return 'L';
    case FIELD_ROLE.RMU_LINE:
      return 'L';
    default:
      return '';
  }
}
