/**
 * BayColumnLv — K30-31 LV (nN) feeder column renderer.
 *
 * Per IEC 60617 — LV feeder bay = vertical column:
 *   LV bus connection point → vertical lead → LV breaker → outgoing point
 *
 * Replaces ad-hoc per-feeder droplines z proper bay-column structure.
 * Każdy feeder = osobna column z CB symbol per IEC 60617.
 */

import type { JSX } from 'react';

import {
  COLOR_BUS_LV,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import { ApparatusLvBreaker } from './GpzApparatusSymbols';

export interface BayColumnLvProps {
  readonly x: number;
  readonly lvBusY: number;
  readonly index: number;
  readonly variant: 'overview' | 'compact' | 'detail';
  readonly cbCatalogRef?: string;
  readonly loadKw?: number;
  readonly stationId: string;
  readonly onSymbolClick?: (
    id: string,
  ) => ((e: React.MouseEvent<SVGGElement>) => void) | undefined;
}

export function BayColumnLv(props: BayColumnLvProps): JSX.Element {
  const {
    x,
    lvBusY,
    index,
    variant,
    cbCatalogRef,
    loadKw,
    stationId,
    onSymbolClick,
  } = props;

  // Per-variant heights — same scaling as SN bays
  const leadToCbLen = variant === 'overview' ? 4 : variant === 'compact' ? 6 : 8;
  const cbY = lvBusY + leadToCbLen + 5;
  const cbBottomY = cbY + 5;
  const outgoingLen = variant === 'overview' ? 4 : variant === 'compact' ? 6 : 8;
  const outgoingY = cbBottomY + outgoingLen;

  // Polish naming per project terminology guard (avoid English "feeder").
  const odplywId = `${stationId}/nn-odplyw/${index}`;

  return (
    <g
      data-testid={`sld-v2-bay-column-lv-${index}`}
      data-station-id={stationId}
      data-feeder-index={index}
    >
      {/* Connection point to LV bus */}
      <circle
        cx={x}
        cy={lvBusY}
        r={1.8}
        fill={COLOR_BUS_LV}
        data-testid={`sld-v2-lv-${index}-bus-junction`}
      />

      {/* Lead bus → CB top */}
      <line
        x1={x}
        y1={lvBusY}
        x2={x}
        y2={cbY - 5}
        stroke={COLOR_BUS_LV}
        strokeWidth={STROKE_FIELD_TRACK_PX - 0.5}
      />

      {/* LV CB symbol */}
      <g
        data-testid={`sld-v2-lv-${index}-cb`}
        onClick={onSymbolClick?.(`${odplywId}/cb`)}
        style={onSymbolClick ? { cursor: 'pointer' } : undefined}
      >
        <ApparatusLvBreaker cx={x} cy={cbY} state="closed" />
      </g>

      {/* Lead CB → outgoing */}
      <line
        x1={x}
        y1={cbBottomY}
        x2={x}
        y2={outgoingY}
        stroke={COLOR_BUS_LV}
        strokeWidth={STROKE_FIELD_TRACK_PX - 0.5}
      />

      {/* Outgoing point */}
      <circle
        cx={x}
        cy={outgoingY}
        r={2}
        fill={COLOR_BUS_LV}
        data-testid={`sld-v2-lv-${index}-outgoing`}
      />

      {/* Load annotation (detail variant only) */}
      {variant === 'detail' && loadKw != null && loadKw > 0 && (
        <text
          x={x}
          y={outgoingY + 10}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={8}
          opacity={0.85}
          data-testid={`sld-v2-lv-${index}-load`}
        >
          {loadKw >= 1000
            ? `${(loadKw / 1000).toFixed(1)}MW`
            : `${loadKw}kW`}
        </text>
      )}

      {/* Catalog ref tooltip via SVG title */}
      {cbCatalogRef && (
        <title>{`Odpływ nN #${index + 1} — ${cbCatalogRef}`}</title>
      )}
    </g>
  );
}
