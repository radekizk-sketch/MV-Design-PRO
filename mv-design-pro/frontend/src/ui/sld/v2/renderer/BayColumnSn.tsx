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

  // Outgoing point — bottom of last apparatus
  const outgoingY =
    apparatusStack.length === 0
      ? stackTopY
      : stackTopY + apparatusStack.length * apparatusHeight + (apparatusStack.length - 1) * apparatusGap;

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

      {/* Stacked apparatus z explicit interconnecting droplines */}
      {apparatusStack.map((kind, idx) => {
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
                state="closed"
                energized
              />
            )}
            {kind === 'CB' && (
              <ApparatusCbSquare cx={x} cy={cy} state="closed" energized />
            )}
            {kind === 'ES' && (
              <ApparatusEarthingSwitch
                cxAxis={x}
                cy={cy}
                state="open"
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

      {/* Q-designation label (detail variant only) */}
      {variant === 'detail' && designation && (
        <text
          x={x}
          y={busY - 4}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={9}
          fontWeight={700}
          data-testid={`sld-v2-bay-${bayRef}-designation`}
        >
          {designation}
        </text>
      )}

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
