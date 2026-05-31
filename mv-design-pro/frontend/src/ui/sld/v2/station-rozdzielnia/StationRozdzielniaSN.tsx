/**
 * STACJA-ROZDZIELNIA SN — the atomic, reusable, RESPONSIVE unit (KROK 1 v2).
 *
 * One station = a mini-rozdzielnia SN: a collector busbar with fields (pola) by
 * canonical role + ABB UniSwitch cell type (catalog §4), each showing apparatus
 * (IEC 60617) + switch state (green=closed / red=open) + protection per
 * applicability. Power flows in via the input field → THROUGH the apparatus →
 * onto the busbar → out; the arrow runs THROUGH the apparatus with direction +
 * power READ from the FROZEN-solver companion (one truth, P-A) — never guessed.
 *
 * Three projections, all from the ONE geometry source (`computeStationGeometry`):
 *   - station (T1/T2/T4): SN busbar + field columns. T1/T2 also carry an nN tier
 *     (transformer boundary → nN busbar → feeders + PV backfeed). T4 has a
 *     two-section busbar joined by an ABB SMC coupler (CBC + BRC) at a NOP.
 *   - zksn (T3): a `BranchPointSN` cable-junction — line fields on a short bus,
 *     NO transformer / nN / load.
 *
 * RESPONSIVE: detail accretes INSIDE the unit (the structural fix for the old L2
 * tangle): far → busbar + state; closer → apparatus + flow; close → full IEC
 * symbols + protection + nN side + SCADA power.
 */

import {
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_DEVICE_UNKNOWN,
  COLOR_FIELD_TRUNK_ENERGIZED,
  COLOR_SELECTION,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TR_FLOW_DOWN,
  FONT_MONO,
  FONT_SANS,
} from '../theme/tokens';
import {
  ApparatusCableHead,
  ApparatusCbSquare,
  ApparatusEarthingSwitch,
  ApparatusFuse,
  ApparatusThreePositionSwitch,
  ApparatusTransformerSymbol,
  ApparatusVtThreePhase,
  CtPrimary,
} from '../renderer/GpzApparatusSymbols';
import type { MouseEvent } from 'react';
import {
  buildPowerFlowIndex,
  type SldPowerFlowCompanion,
  type SldPowerFlowIndex,
} from '../canvas/SldPowerFlowCompanion';
import {
  FIELD_ROLE_LABEL_PL,
  FIELD_ROLE_SHORT_TAG,
  type StationApparatus,
  type StationFieldDescriptor,
  type StationNNBlock,
  type StationNNFeeder,
  type StationRozdzielniaModel,
} from './contract';
import {
  computeStationGeometry,
  type FieldGeometry,
  type NNFeederGeometry,
  type NNGeometry,
  type StationDetailLevel,
} from './geometry';
import type { ScBus } from './companions/shortCircuitTypes';

// =============================================================================
// Props
// =============================================================================

export interface StationRozdzielniaSNProps {
  readonly model: StationRozdzielniaModel;
  /**
   * Frozen-solver power-flow companion (one truth). Direction, energization AND
   * the displayed power values are READ from here. Null ⇒ no arrow / no power.
   */
  readonly companion: SldPowerFlowCompanion | null;
  /** Detail level (responsive). */
  readonly detail: StationDetailLevel;
  /** Click on a field / apparatus → configuration (stub handler). */
  readonly onFieldClick?: (fieldId: string) => void;
  /** Currently selected field (drawn highlighted). */
  readonly selectedFieldId?: string | null;
  /** Local translate so multiple units can share a canvas. */
  readonly x?: number;
  readonly y?: number;
}

// =============================================================================
// Busbar tint per voltage class (dispatcher convention)
// =============================================================================

function busColorForVoltage(kv: number): string {
  if (kv >= 100) return '#E74C3C';
  if (kv >= 12) return COLOR_FIELD_TRUNK_ENERGIZED;
  if (kv >= 5) return '#0A8D43';
  if (kv >= 0.2) return '#7DD3FC';
  return COLOR_FIELD_TRUNK_ENERGIZED;
}

/**
 * The field's REPRESENTATIVE switching apparatus — the device whose identity and
 * canonical shape stands for the whole field at the overview level (N-8). This is
 * a pure projection of the model's apparatus set (CB > LOAD_SWITCH > DS), the SAME
 * apparatus shown in detail at L1/L2 — so its shape is invariant across the LOD
 * ladder: zoom is a property of the VIEW, identity a property of the MODEL.
 */
function representativeApparatus(field: StationFieldDescriptor): StationApparatus | null {
  return (
    field.apparatus.find((a) => a.kind === 'CB') ??
    field.apparatus.find((a) => a.kind === 'LOAD_SWITCH') ??
    field.apparatus.find((a) => a.kind === 'DS') ??
    null
  );
}

/** Canonical IEC-60617 outline shape per switching apparatus kind (N-8). The
 *  shape is a function of the apparatus TYPE only — never of the zoom level. */
function canonicalShapeForKind(kind: StationApparatus['kind']): 'square' | 'diamond' | 'circle' | null {
  switch (kind) {
    case 'CB':
      return 'square'; // wyłącznik □
    case 'LOAD_SWITCH':
      return 'diamond'; // rozłącznik ◇
    case 'DS':
      return 'circle'; // odłącznik ◯
    default:
      return null;
  }
}

function fieldSwitchState(field: StationFieldDescriptor): StationApparatus['switchState'] {
  const rep = representativeApparatus(field);
  return rep?.switchState ?? 'unknown';
}

function stateColor(state: StationApparatus['switchState']): string {
  if (state === 'open') return COLOR_DEVICE_OPEN_BORDER;
  if (state === 'unknown') return COLOR_DEVICE_UNKNOWN;
  return COLOR_DEVICE_CLOSED_BORDER;
}

/** Format a solver MW value as a compact SCADA label (kW under 1 MW). */
function formatPower(mw: number): string {
  const abs = Math.abs(mw);
  if (abs < 1) return `${Math.round(mw * 1000)} kW`;
  return `${mw.toFixed(2)} MW`;
}

// =============================================================================
// Power-flow arrow THROUGH the apparatus
// =============================================================================

/**
 * Draw the through-flow arrow ON the field power path at `flowAnchor`. The
 * DIRECTION is read from the companion: 'forward' = power flows from the network
 * down into the station/busbar; 'reverse' = the opposite; 'none' = no arrow.
 */
function PowerFlowArrow(props: {
  geom: FieldGeometry;
  direction: 'forward' | 'reverse' | 'none';
  energized: boolean;
}): JSX.Element | null {
  const { geom, direction, energized } = props;
  if (!energized || direction === 'none') return null;

  const { x } = geom.flowAnchor;
  // Network/coupler fields: forward = up (network → busbar). Transformer/lateral:
  // forward = down (busbar → transformer/load). Reverse flips the arrowhead.
  const forwardPointsUp = geom.pathOrientation === 'network';
  const pointsUp = direction === 'forward' ? forwardPointsUp : !forwardPointsUp;

  const top = geom.busY + 4;
  const bottom = geom.busY + 18;
  const headY = pointsUp ? top : bottom;
  const tailY = pointsUp ? bottom : top;
  const color = direction === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_FIELD_TRUNK_ENERGIZED;
  const headDir = pointsUp ? -1 : 1;

  return (
    <g
      data-testid={`sr-flow-${geom.fieldId}`}
      data-flow-direction={direction}
      data-flow-points={pointsUp ? 'up' : 'down'}
      pointerEvents="none"
    >
      <line x1={x} y1={tailY} x2={x} y2={headY} stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <polygon
        points={`${x},${headY} ${x - 3.4},${headY - headDir * 5} ${x + 3.4},${headY - headDir * 5}`}
        fill={color}
      />
    </g>
  );
}

/** A small vertical flow arrow used on the nN feeder drops (direction from solver). */
function NNFlowArrow(props: {
  cx: number;
  topY: number;
  botY: number;
  direction: 'forward' | 'reverse' | 'none';
}): JSX.Element | null {
  const { cx, topY, botY, direction } = props;
  if (direction === 'none') return null;
  // Feeder convention: forward = power leaves the bus DOWN to the load; reverse =
  // power flows UP into the bus (PV backfeed). Read straight from the solver.
  const pointsDown = direction === 'forward';
  const headY = pointsDown ? botY : topY;
  const tailY = pointsDown ? topY : botY;
  const color = direction === 'reverse' ? COLOR_TR_FLOW_DOWN : COLOR_FIELD_TRUNK_ENERGIZED;
  const headDir = pointsDown ? 1 : -1;
  return (
    <g data-testid="sr-nn-flow" data-flow-direction={direction} pointerEvents="none">
      <line x1={cx} y1={tailY} x2={cx} y2={headY} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <polygon
        points={`${cx},${headY} ${cx - 3},${headY - headDir * 4.5} ${cx + 3},${headY - headDir * 4.5}`}
        fill={color}
      />
    </g>
  );
}

// =============================================================================
// Apparatus symbol dispatch (IEC 60617, shared library)
// =============================================================================

function ApparatusSymbol(props: {
  apparatus: StationApparatus;
  cx: number;
  cy: number;
  energized: boolean;
  showLabel: boolean;
}): JSX.Element | null {
  const { apparatus, cx, cy, energized, showLabel } = props;
  const { kind, switchState = 'unknown', earthingState = 'unknown', designation, catalogLabel } = apparatus;

  const label =
    showLabel && (designation || catalogLabel) ? (
      <text
        x={cx + 12}
        y={cy + 3}
        fill={COLOR_TEXT_MUTED}
        fontFamily={FONT_MONO}
        fontSize={7}
        fontWeight={600}
        data-testid={`sr-apparatus-label-${apparatus.deviceRef}`}
      >
        {designation ?? catalogLabel}
      </text>
    ) : null;

  let symbol: JSX.Element;
  switch (kind) {
    case 'CB':
      symbol = <ApparatusCbSquare cx={cx} cy={cy} state={switchState} energized={energized} />;
      break;
    case 'LOAD_SWITCH':
    case 'DS': {
      // The ABB UniSwitch signature: rozłącznik trzypołożeniowy (integral earthing).
      const position =
        switchState === 'closed' ? 'closed' : switchState === 'open' ? 'open' : 'unknown';
      symbol = <ApparatusThreePositionSwitch cx={cx} cy={cy} position={position} />;
      break;
    }
    case 'FUSE':
      symbol = <ApparatusFuse cx={cx} cy={cy} state={energized ? 'healthy' : 'unknown'} />;
      break;
    case 'CT':
      symbol = <CtPrimary cx={cx} cy={cy} ratio={catalogLabel} />;
      break;
    case 'VT':
      symbol = <ApparatusVtThreePhase cx={cx} cy={cy} />;
      break;
    case 'ES':
      symbol = <ApparatusEarthingSwitch cxAxis={cx} cy={cy} state={earthingState} side="RIGHT" />;
      break;
    case 'TRANSFORMER_DEVICE':
      symbol = <ApparatusTransformerSymbol cx={cx} cy={cy} vectorGroup="Dyn5" neutralEarthed />;
      break;
    case 'CABLE_HEAD':
      symbol = <ApparatusCableHead cx={cx} cy={cy} energized={energized} />;
      break;
    default:
      return null;
  }

  return (
    <g data-testid={`sr-apparatus-${apparatus.deviceRef}`} data-apparatus-kind={kind} data-state={switchState}>
      {symbol}
      {label}
    </g>
  );
}

// =============================================================================
// Protection function chips (close zoom only)
// =============================================================================

function ProtectionChips(props: { field: StationFieldDescriptor; cx: number; topY: number }): JSX.Element | null {
  const { field, cx, topY } = props;
  const enabled = field.protection.filter((p) => p.available);
  if (enabled.length === 0) return null;
  const chipW = 22;
  const chipH = 11;
  const gap = 2;
  const colX = cx + 18;
  return (
    <g data-testid={`sr-protection-${field.fieldId}`} pointerEvents="none">
      {enabled.map((fn, i) => {
        const y = topY + i * (chipH + gap);
        const active = fn.tripped ? COLOR_DEVICE_OPEN : fn.pickedUp ? '#FFB020' : '#0A1018';
        const border = fn.enabled ? COLOR_DEVICE_CLOSED_BORDER : COLOR_TEXT_MUTED;
        return (
          <g key={fn.code} data-protection-code={fn.code} data-enabled={fn.enabled ? 'true' : 'false'}>
            <rect x={colX} y={y} width={chipW} height={chipH} rx={2} ry={2} fill={active} stroke={border} strokeWidth={0.9} />
            <text
              x={colX + chipW / 2}
              y={y + chipH - 3}
              textAnchor="middle"
              fill={fn.enabled ? COLOR_TEXT_PRIMARY : COLOR_TEXT_MUTED}
              fontFamily={FONT_MONO}
              fontSize={7}
              fontWeight={700}
            >
              {fn.code}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// One field column
// =============================================================================

function FieldColumn(props: {
  field: StationFieldDescriptor;
  geom: FieldGeometry;
  detail: StationDetailLevel;
  busColor: string;
  direction: 'forward' | 'reverse' | 'none';
  energized: boolean;
  powerMw: number | null;
  selected: boolean;
  onFieldClick?: (fieldId: string) => void;
}): JSX.Element {
  const { field, geom, detail, busColor, direction, energized, powerMw, selected, onFieldClick } = props;
  const state = fieldSwitchState(field);
  const isOpen = state === 'open' || field.isNormallyOpen;
  const pathColor = isOpen ? COLOR_DEVICE_OPEN : energized ? busColor : COLOR_TEXT_MUTED;
  const { x } = geom;

  const roleTag = FIELD_ROLE_SHORT_TAG[field.role];
  const headTagY = geom.busY - (detail === 'close' ? 32 : 26);

  const handleClick = onFieldClick ? () => onFieldClick(field.fieldId) : undefined;

  return (
    <g
      data-testid={`sr-field-${field.fieldId}`}
      data-field-role={field.role}
      data-abb-cell-type={field.abbCellType ?? ''}
      data-switch-state={state}
      data-is-nop={field.isNormallyOpen ? 'true' : 'false'}
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      aria-label={handleClick ? `${FIELD_ROLE_LABEL_PL[field.role]} ${field.feederName ?? field.bayNumber ?? ''}` : undefined}
      onClick={
        handleClick
          ? (e) => {
              e.stopPropagation();
              handleClick();
            }
          : undefined
      }
      onKeyDown={
        handleClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      style={{ cursor: handleClick ? 'pointer' : 'default' }}
    >
      {/* Click hit area spanning the whole column. */}
      <rect
        x={x - 22}
        y={geom.busY - 34}
        width={44}
        height={geom.pathBottomY - geom.busY + 56}
        fill={selected ? COLOR_SELECTION : 'transparent'}
        opacity={selected ? 0.12 : 0}
        stroke={selected ? COLOR_SELECTION : 'transparent'}
        strokeWidth={selected ? 1.2 : 0}
        strokeDasharray={selected ? '4 3' : undefined}
        rx={3}
        data-testid={`sr-field-hit-${field.fieldId}`}
      />

      {/* Vertical power path from busbar down through the apparatus stack. */}
      <line
        x1={x}
        y1={geom.busY}
        x2={x}
        y2={geom.pathBottomY}
        stroke={pathColor}
        strokeWidth={2.2}
        strokeDasharray={isOpen ? '4 3' : undefined}
      />

      {/* Role + ABB cell-type tag (far + closer + close). */}
      <text
        x={x}
        y={headTagY}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={detail === 'far' ? 8 : 9}
        fontWeight={800}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={2.4}
        data-testid={`sr-field-role-tag-${field.fieldId}`}
      >
        {roleTag}
      </text>
      {detail === 'close' && field.abbCellType && (
        <text
          x={x}
          y={headTagY + 11}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={7}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#05070A"
          strokeWidth={2}
          data-testid={`sr-field-abb-${field.fieldId}`}
        >
          {field.abbCellType.replace('_', '-')}
        </text>
      )}

      {/* FAR: the field's REPRESENTATIVE apparatus in its CANONICAL shape (N-8) —
          □ CB / ◇ LOAD_SWITCH / ◯ DS, the SAME apparatus identity as L1/L2, with
          the switch state. NOT a generic glyph: a CB at far reads as a square, a
          rozłącznik as a diamond, an odłącznik as a circle — never a symbol lie. */}
      {detail === 'far' && (() => {
        const rep = representativeApparatus(field);
        const shape = rep ? canonicalShapeForKind(rep.kind) : null;
        const cy = geom.busY + 15;
        const fillColor = isOpen ? 'none' : state === 'unknown' ? COLOR_DEVICE_UNKNOWN : '#0A8D43';
        const strokeColor = stateColor(state);
        const sw = isOpen ? 1.8 : 1.4;
        const common = {
          'data-testid': `sr-field-rep-symbol-${field.fieldId}`,
          'data-apparatus-kind': rep?.kind ?? 'none',
          'data-symbol-shape': shape ?? 'none',
          'data-state': state ?? 'unknown',
        } as const;
        if (shape === 'square') {
          return <rect {...common} x={x - 7} y={cy - 7} width={14} height={14} rx={1} fill={fillColor} stroke={strokeColor} strokeWidth={sw} />;
        }
        if (shape === 'circle') {
          return <circle {...common} cx={x} cy={cy} r={7.5} fill={fillColor} stroke={strokeColor} strokeWidth={sw} />;
        }
        // diamond (LOAD_SWITCH / rozłącznik) — and a safe default.
        return (
          <polygon
            {...common}
            points={`${x},${cy - 7} ${x + 7},${cy} ${x},${cy + 7} ${x - 7},${cy}`}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={sw}
          />
        );
      })()}

      {/* CLOSER + CLOSE: real apparatus symbols on the power path. */}
      {detail !== 'far' &&
        field.apparatus.map((dev, slot) => {
          const slotGeom = geom.apparatus[slot];
          if (!slotGeom) return null;
          return (
            <ApparatusSymbol
              key={dev.deviceRef}
              apparatus={dev}
              cx={slotGeom.x}
              cy={slotGeom.y}
              energized={energized && !isOpen}
              showLabel={detail === 'close'}
            />
          );
        })}

      {/* Power-flow arrow THROUGH the apparatus (closer + close). */}
      {detail !== 'far' && (
        <PowerFlowArrow geom={geom} direction={direction} energized={energized} />
      )}

      {/* Protection function chips (close zoom only). */}
      {detail === 'close' && <ProtectionChips field={field} cx={x} topY={geom.busY + 26} />}

      {/* Feeder / bay number label below the path (closer + close). */}
      {detail !== 'far' && (field.feederName || field.bayNumber) && (
        <text
          x={x}
          y={geom.pathBottomY + 14}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={8}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#05070A"
          strokeWidth={2}
          data-testid={`sr-field-feeder-${field.fieldId}`}
        >
          {field.feederName ?? field.bayNumber}
        </text>
      )}

      {/* SCADA power readout (close zoom): solver P at the field's branch. */}
      {detail === 'close' && powerMw !== null && (
        <text
          x={x}
          y={geom.pathBottomY + 25}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={7}
          fontWeight={600}
          data-testid={`sr-field-power-${field.fieldId}`}
        >
          {`P=${formatPower(powerMw)}`}
        </text>
      )}

      {/* Normally-open point: state shown by COLOUR (the open apparatus is red and
          the path dashes) + a "NOP" text tag — NO ⊘/⨯ glyph (stan ≠ kształt). */}
      {field.isNormallyOpen && detail !== 'far' && (
        <text
          data-testid={`sr-field-nop-${field.fieldId}`}
          x={x + 12}
          y={geom.busY + 13}
          fill={COLOR_DEVICE_OPEN}
          fontFamily={FONT_MONO}
          fontSize={7}
          fontWeight={800}
          pointerEvents="none"
        >
          NOP
        </text>
      )}
    </g>
  );
}

// =============================================================================
// nN tier (second voltage level): transformer boundary → nN busbar → feeders + PV
// =============================================================================

const NN_FEEDER_LABEL_PL: Readonly<Record<StationNNFeeder['role'], string>> = {
  ODPLYW_NN: 'Odpływ nN',
  ODPLYW_REZERWOWY: 'Odpływ rez.',
  ZRODLO_NN_PV: 'PV',
  ZRODLO_NN_BESS: 'BESS',
};

function NNFeederColumn(props: {
  feeder: StationNNFeeder;
  geom: NNFeederGeometry;
  detail: StationDetailLevel;
  nnBusColor: string;
  index: SldPowerFlowIndex | null;
  onFieldClick?: (fieldId: string) => void;
}): JSX.Element {
  const { feeder, geom, detail, nnBusColor, index, onFieldClick } = props;
  const direction = index?.directionOf(feeder.branchRef) ?? 'none';
  const powerMw = index?.powerOf(feeder.branchRef) ?? null;
  const isPv = feeder.role === 'ZRODLO_NN_PV' || feeder.role === 'ZRODLO_NN_BESS';
  const handleClick = onFieldClick ? () => onFieldClick(feeder.feederId) : undefined;
  const { x } = geom;
  return (
    <g
      data-testid={`sr-nn-feeder-${feeder.feederId}`}
      data-nn-role={feeder.role}
      data-flow-direction={direction}
      role={handleClick ? 'button' : undefined}
      tabIndex={handleClick ? 0 : undefined}
      aria-label={handleClick ? `${NN_FEEDER_LABEL_PL[feeder.role]} ${feeder.feederName ?? ''}` : undefined}
      onClick={handleClick ? (e) => { e.stopPropagation(); handleClick(); } : undefined}
      style={{ cursor: handleClick ? 'pointer' : 'default' }}
    >
      {/* Feeder drop. */}
      <line x1={x} y1={geom.busY} x2={x} y2={geom.bottomY} stroke={nnBusColor} strokeWidth={1.8} />
      {/* nN feeder switch (LV breaker square). */}
      <rect x={x - 4} y={geom.busY + 8} width={8} height={8} rx={1} fill="#0A8D43" stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1} />
      {/* Terminator: PV = inverter node; load = arrowhead. */}
      {isPv ? (
        <g data-testid={`sr-nn-pv-${feeder.feederId}`}>
          <circle cx={x} cy={geom.bottomY - 3} r={6.5} fill="#0A1622" stroke="#FFB020" strokeWidth={1.4} />
          {/* Inverter glyph: ~ over = */}
          <path d={`M ${x - 3.2} ${geom.bottomY - 4.6} q 1.6 -2 3.2 0 t 3.2 0`} fill="none" stroke="#FFB020" strokeWidth={1} />
          <line x1={x - 3.2} y1={geom.bottomY - 1} x2={x + 3.2} y2={geom.bottomY - 1} stroke="#FFB020" strokeWidth={1} />
        </g>
      ) : (
        <g data-testid={`sr-nn-load-${feeder.feederId}`}>
          <polygon
            points={`${x - 5},${geom.bottomY - 6} ${x + 5},${geom.bottomY - 6} ${x},${geom.bottomY + 1}`}
            fill="none"
            stroke={nnBusColor}
            strokeWidth={1.4}
          />
        </g>
      )}
      {/* nN flow arrow (direction from solver; PV backfeed points UP into the bus). */}
      <NNFlowArrow cx={x} topY={geom.busY + 3} botY={geom.busY + 18} direction={direction} />
      {/* Feeder label + SCADA power (close zoom). */}
      {feeder.feederName && (
        <text
          x={x}
          y={geom.bottomY + 12}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={7.5}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#05070A"
          strokeWidth={2}
        >
          {feeder.feederName}
        </text>
      )}
      {detail === 'close' && powerMw !== null && (
        <text
          x={x}
          y={geom.bottomY + 22}
          textAnchor="middle"
          fill={isPv ? '#FFB020' : COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={7}
          fontWeight={600}
          data-testid={`sr-nn-power-${feeder.feederId}`}
        >
          {`${direction === 'reverse' ? '↑ ' : 'P='}${formatPower(powerMw)}`}
        </text>
      )}
    </g>
  );
}

function NNTier(props: {
  nn: NNGeometry;
  block: StationNNBlock;
  detail: StationDetailLevel;
  index: SldPowerFlowIndex | null;
  onFieldClick?: (fieldId: string) => void;
}): JSX.Element {
  const { nn, block, detail, index, onFieldClick } = props;
  const nnBusColor = busColorForVoltage(block.busVoltageKv);
  return (
    <g data-testid="sr-nn-tier" data-nn-voltage-kv={block.busVoltageKv}>
      {/* Transformation boundary: SN field bottom → transformer → nN main → nN bus. */}
      <line x1={nn.spineX} y1={nn.snHandoffY} x2={nn.spineX} y2={nn.transformerY - 9} stroke={COLOR_TEXT_MUTED} strokeWidth={2} />
      <ApparatusTransformerSymbol
        cx={nn.spineX}
        cy={nn.transformerY}
        vectorGroup={block.transformer.vectorGroup}
        neutralEarthed
      />
      {/* nN main breaker between transformer and nN busbar. */}
      <line x1={nn.spineX} y1={nn.transformerY + 9} x2={nn.spineX} y2={nn.busbar.y} stroke={nnBusColor} strokeWidth={1.8} />
      <rect x={nn.spineX - 4} y={nn.mainBreakerY - 4} width={8} height={8} rx={1} fill="#0A8D43" stroke={COLOR_DEVICE_CLOSED_BORDER} strokeWidth={1} />
      {detail === 'close' && (
        <text x={nn.spineX + 9} y={nn.mainBreakerY + 3} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={600}>
          Q0 nN
        </text>
      )}
      {/* nN busbar (second voltage level — distinct colour/weight). */}
      <line
        x1={nn.busbar.x1}
        y1={nn.busbar.y}
        x2={nn.busbar.x2}
        y2={nn.busbar.y}
        stroke={nnBusColor}
        strokeWidth={3.2}
        data-testid="sr-nn-busbar"
        data-bus-voltage-kv={block.busVoltageKv}
      />
      <text
        x={nn.busbar.x2 + 4}
        y={nn.busbar.y + 3}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_MONO}
        fontSize={7.5}
        fontWeight={700}
      >
        {`${(block.busVoltageKv * 1000).toFixed(0)} V`}
      </text>
      {/* Vector group + tap on the transformation boundary (close zoom). */}
      {detail === 'close' && (
        <text x={nn.spineX - 10} y={nn.transformerY + 2} textAnchor="end" fill="#FFB020" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700}>
          {block.transformer.vectorGroup}
          {block.transformer.tapChanger ? ' ⎓' : ''}
        </text>
      )}
      {/* nN feeders (loads) + PV backfeed. */}
      {nn.feeders.map((fGeom) => {
        const feeder = block.feeders.find((f) => f.feederId === fGeom.feederId);
        if (!feeder) return null;
        return (
          <NNFeederColumn
            key={feeder.feederId}
            feeder={feeder}
            geom={fGeom}
            detail={detail}
            nnBusColor={nnBusColor}
            index={index}
            onFieldClick={onFieldClick}
          />
        );
      })}
    </g>
  );
}

// =============================================================================
// SMC coupler (T4) — TWO CELLS idiom: rozłącznik+wyłącznik | rozłącznik
// =============================================================================

/**
 * The ABB SMC bus coupler drawn as the catalog defines it — TWO vertical CELLS
 * bridging the two bus sections (the SCADA "pole 6-7" idiom), NOT three symbols
 * lying in the bus gap:
 *
 *   SEKCJA A ─┐                          ┌─ SEKCJA B
 *             │ CELA A                   │ CELA B
 *        [rozłącznik 3-poł. A ◇]    [rozłącznik 3-poł. B ◇]
 *        [WYŁĄCZNIK sprzęgła □]            │
 *             └────────── tie ────────────┘
 *
 * The breaker sits UNDER the left rozłącznik (per the catalog SMC = CBC cell +
 * BRC cell). State is shown by COLOUR/FILL only (green=closed, red=open) — never
 * by a shape change and never with a ⊘ glyph. The normally-open status is the
 * breaker drawn as a RED OPEN □ plus a "NOP" text tag.
 */
function SmcCoupler(props: {
  field: StationFieldDescriptor;
  busY: number;
  aEnd: number;
  bStart: number;
  detail: StationDetailLevel;
  breakerOpen: boolean;
  onFieldClick?: (fieldId: string) => void;
}): JSX.Element {
  const { field, busY, aEnd, bStart, detail, breakerOpen, onFieldClick } = props;
  const swA = field.apparatus.find((a) => a.designation === 'Q1');
  const swB = field.apparatus.find((a) => a.designation === 'Q2');
  // Two vertical cells: A (left, with the breaker under its switch) and B (right).
  const aX = aEnd + (bStart - aEnd) * 0.33;
  const bX = aEnd + (bStart - aEnd) * 0.67;
  const swY = busY + (detail === 'far' ? 13 : 20);
  const breakerY = swY + (detail === 'far' ? 13 : 22); // breaker UNDER the left switch
  const tieY = breakerY + (detail === 'far' ? 9 : 14);
  const lineColor = breakerOpen ? COLOR_DEVICE_OPEN : COLOR_FIELD_TRUNK_ENERGIZED;
  const swState = breakerOpen ? 'open' : 'closed';
  const breakerState = breakerOpen ? 'open' : 'closed';
  const handle = (id: string) => (onFieldClick ? (e: MouseEvent) => { e.stopPropagation(); onFieldClick(id); } : undefined);

  return (
    <g
      data-testid={`sr-coupler-${field.fieldId}`}
      data-coupler="smc"
      data-rozlaczniki="2"
      data-wylaczniki="1"
      data-is-nop={breakerOpen ? 'true' : 'false'}
      role={onFieldClick ? 'button' : undefined}
      aria-label={onFieldClick ? 'Sprzęgło SMC (2 pola: rozłącznik + wyłącznik | rozłącznik)' : undefined}
    >
      {/* CELL A (left): section-A drop → rozłącznik A → WYŁĄCZNIK → down to the tie. */}
      <g data-testid="sr-coupler-cell-a" onClick={handle(`${field.fieldId}/q1`)} style={{ cursor: onFieldClick ? 'pointer' : 'default' }}>
        <line x1={aEnd} y1={busY} x2={aX} y2={swY - 9} stroke={lineColor} strokeWidth={1.8} />
        <g data-apparatus-kind="three_position_switch" data-symbol-shape="diamond" data-state={swState}>
          <ApparatusThreePositionSwitch cx={aX} cy={swY} position={swA?.switchState === 'open' || breakerOpen ? 'open' : 'closed'} h={detail === 'far' ? 6 : 8} />
        </g>
        {detail !== 'far' && <text x={aX - 11} y={swY + 2} textAnchor="end" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>Q1</text>}
        {/* connector switch → breaker */}
        <line x1={aX} y1={swY + 9} x2={aX} y2={breakerY - (detail === 'far' ? 6 : 8)} stroke={lineColor} strokeWidth={1.8} />
        {/* WYŁĄCZNIK sprzęgła — square, state by COLOUR (red open / green closed). */}
        <g data-testid="sr-coupler-breaker" data-apparatus-kind="circuit_breaker" data-symbol-shape="square" data-state={breakerState} onClick={handle(`${field.fieldId}/q0`)}>
          <ApparatusCbSquare cx={aX} cy={breakerY} state={breakerState} energized={!breakerOpen} />
        </g>
        {detail !== 'far' && <text x={aX - 11} y={breakerY + 2} textAnchor="end" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>Q0</text>}
        {/* NOP tag — text, NOT a ⊘ glyph; the red open □ already shows the state. */}
        {breakerOpen && detail !== 'far' && (
          <text data-testid="sr-coupler-nop" x={aX + 11} y={breakerY + 2} fill={COLOR_DEVICE_OPEN} fontFamily={FONT_MONO} fontSize={7} fontWeight={800}>NOP</text>
        )}
        {breakerOpen && detail === 'far' && (
          <circle data-testid="sr-coupler-nop" cx={aX} cy={breakerY} r={0.1} fill="none" />
        )}
        {/* breaker → tie line down */}
        <line x1={aX} y1={breakerY + (detail === 'far' ? 6 : 8)} x2={aX} y2={tieY} stroke={lineColor} strokeWidth={1.8} strokeDasharray={breakerOpen ? '3 3' : undefined} />
      </g>

      {/* CELL B (right): section-B drop → rozłącznik B → down to the tie. */}
      <g data-testid="sr-coupler-cell-b" onClick={handle(`${field.fieldId}/q2`)} style={{ cursor: onFieldClick ? 'pointer' : 'default' }}>
        <line x1={bStart} y1={busY} x2={bX} y2={swY - 9} stroke={lineColor} strokeWidth={1.8} />
        <g data-apparatus-kind="three_position_switch" data-symbol-shape="diamond" data-state={swState}>
          <ApparatusThreePositionSwitch cx={bX} cy={swY} position={swB?.switchState === 'open' || breakerOpen ? 'open' : 'closed'} h={detail === 'far' ? 6 : 8} />
        </g>
        {detail !== 'far' && <text x={bX + 11} y={swY + 2} textAnchor="start" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>Q2</text>}
        <line x1={bX} y1={swY + 9} x2={bX} y2={tieY} stroke={lineColor} strokeWidth={1.8} strokeDasharray={breakerOpen ? '3 3' : undefined} />
      </g>

      {/* The tie connecting the two cells (A breaker output ↔ B switch output). */}
      <line x1={aX} y1={tieY} x2={bX} y2={tieY} stroke={lineColor} strokeWidth={1.8} strokeDasharray={breakerOpen ? '3 3' : undefined} />

      {/* Bus-tie protection relay on the coupler breaker (close zoom). */}
      {detail === 'close' && <ProtectionChips field={field} cx={bX} topY={swY} />}

      {/* Label. */}
      {detail !== 'far' && (
        <text x={(aX + bX) / 2} y={busY - 14} textAnchor="middle" fill="#FFB020" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700} paintOrder="stroke" stroke="#05070A" strokeWidth={2}>
          SPRZĘGŁO SMC
        </text>
      )}
    </g>
  );
}

// =============================================================================
// Busbar short-circuit panel (gate E) — IEC 60909 dossier at L2
// =============================================================================

/**
 * The per-busbar short-circuit dossier shown at L2 (close zoom) — gate E. Every
 * value is READ from the frozen-solver SC companion (`ScBus`); nothing is
 * recomputed. Shows Ik''max/min, ip/ib/ith, κ, Sk'', R/X and the Ik''max ≤ Icw
 * withstand verdict, with the case_ref and a White Box affordance (the LaTeX
 * derivation is carried in `max.white_box_trace`).
 */
function BusbarShortCircuitPanel(props: {
  sc: ScBus;
  x: number;
  y: number;
}): JSX.Element {
  const { sc, x, y } = props;
  const ok = sc.verification.passed;
  const rows: Array<[string, string]> = [
    [`Ik"max (c=${sc.max.c_factor})`, `${sc.max.ikss_ka.toFixed(2)} kA`],
    ['ip', `${sc.max.ip_ka.toFixed(1)} kA`],
    ['Ith', `${sc.max.ith_ka.toFixed(2)} kA`],
    ['Ib', `${sc.max.ib_ka.toFixed(2)} kA`],
    ['κ', sc.max.kappa.toFixed(2)],
    ['Sk"', `${sc.max.sk_mva.toFixed(1)} MVA`],
    ['R/X', sc.max.rx_ratio.toFixed(3)],
    [`Ik"min (c=${sc.min.c_factor})`, `${sc.min.ikss_ka.toFixed(2)} kA`],
  ];
  const rowH = 9;
  const panelW = 116;
  const panelH = 20 + rows.length * rowH + 22;
  return (
    <g data-testid={`sr-sc-panel-${sc.bus_ref}`} data-sc-bus={sc.bus_ref} pointerEvents="none">
      <rect x={x} y={y} width={panelW} height={panelH} rx={3} fill="#0A1622" stroke="#1C3A4E" strokeWidth={1} opacity={0.96} />
      {/* Title + case_ref. */}
      <text x={x + 6} y={y + 12} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={7.5} fontWeight={800}>
        {`ZWARCIE — ${sc.bus_ref} (${sc.un_kv} kV)`}
      </text>
      <text x={x + panelW - 6} y={y + 12} textAnchor="end" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6} fontWeight={600}>
        IEC 60909
      </text>
      {rows.map(([k, v], i) => {
        const ry = y + 20 + i * rowH;
        return (
          <g key={k}>
            <text x={x + 6} y={ry} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={6.6}>{k}</text>
            <text x={x + panelW - 6} y={ry} textAnchor="end" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_MONO} fontSize={6.6} fontWeight={700}>{v}</text>
          </g>
        );
      })}
      {/* Icw verification verdict. */}
      <rect x={x + 4} y={y + panelH - 18} width={panelW - 8} height={14} rx={2} fill={ok ? '#0C2A18' : '#3A0E0E'} stroke={ok ? COLOR_DEVICE_CLOSED_BORDER : COLOR_DEVICE_OPEN_BORDER} strokeWidth={1} />
      <text x={x + panelW / 2} y={y + panelH - 8} textAnchor="middle" fill={ok ? '#5BE08A' : '#FF6B6B'} fontFamily={FONT_MONO} fontSize={6.6} fontWeight={800}>
        {`Ik"max ${sc.verification.ikss_max_ka.toFixed(1)} ${ok ? '≤' : '>'} Icw ${sc.verification.icw_ka} kA ${ok ? '✓' : '✗'}`}
      </text>
      {/* White Box affordance — the derivation exists (LaTeX trace from the solver). */}
      <text data-testid={`sr-sc-whitebox-${sc.bus_ref}`} data-wb-steps={sc.max.white_box_trace.length} x={x + 6} y={y + panelH + 8} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6} fontWeight={600}>
        {`White Box: ${sc.max.white_box_trace.length} kroków · ${sc.max.case_ref}`}
      </text>
    </g>
  );
}

// =============================================================================
// The component
// =============================================================================

export function StationRozdzielniaSN(props: StationRozdzielniaSNProps): JSX.Element {
  const { model, companion, detail, onFieldClick, selectedFieldId, x = 0, y = 0 } = props;
  const geometry = computeStationGeometry(model.fields, detail, model.nnBlock);
  const busColor = busColorForVoltage(model.busVoltageKv);
  const index = buildPowerFlowIndex(companion);
  const isZksn = model.projection === 'zksn';

  // Sectioned busbar (T4): split the SN busbar into A | B at the coupler x, each
  // energised per its own section incomer from the solver (one truth).
  let sectionGap: { aEnd: number; bStart: number } | null = null;
  if (model.sectionedBus) {
    const coupler = geometry.fields.find((f) => f.role === 'SPRZEGLO');
    // The SMC coupler needs room for TWO cells + a breaker between them — give it
    // a wide gap (most of a field pitch) so the rozłącznik A · wyłącznik ·
    // rozłącznik B layout breathes instead of overlapping.
    if (coupler) {
      const halfGap = detail === 'far' ? 26 : detail === 'closer' ? 36 : 44;
      sectionGap = { aEnd: coupler.x - halfGap, bStart: coupler.x + halfGap };
    }
  }
  const sectionAEnergized = model.sectionABranchRef
    ? index?.isBranchEnergized(model.sectionABranchRef) ?? true
    : true;
  const sectionBEnergized = model.sectionBBranchRef
    ? index?.isBranchEnergized(model.sectionBBranchRef) ?? true
    : true;

  return (
    <g
      data-testid={`station-rozdzielnia-${model.stationId}`}
      data-element-kind="station_rozdzielnia"
      data-archetype={model.archetype}
      data-detail={detail}
      data-station-type={model.archetype}
      data-projection={model.projection ?? 'station'}
      data-case-ref={model.caseRef ?? ''}
      data-field-count={String(model.fields.length)}
      transform={`translate(${x}, ${y})`}
    >
      {/* Station header (code + name + type, or ZKSN label). */}
      <text
        x={0}
        y={geometry.bounds.y + 12}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={detail === 'close' ? 13 : 11}
        fontWeight={900}
        paintOrder="stroke"
        stroke="#05070A"
        strokeWidth={3}
        data-testid={`sr-header-${model.stationId}`}
      >
        {model.stationCode ? `${model.stationCode} · ${model.name}` : model.name}
      </text>

      {/* SN collector busbar (the szyna) — split into two sections for T4. */}
      {sectionGap ? (
        <>
          <line
            x1={geometry.busbar.x1}
            y1={geometry.busbar.y}
            x2={sectionGap.aEnd}
            y2={geometry.busbar.y}
            stroke={sectionAEnergized ? busColor : COLOR_TEXT_MUTED}
            strokeWidth={4}
            data-testid={`sr-busbar-${model.stationId}`}
            data-bus-voltage-kv={model.busVoltageKv}
            data-section="A"
            data-energized={sectionAEnergized ? 'true' : 'false'}
          />
          <line
            x1={sectionGap.bStart}
            y1={geometry.busbar.y}
            x2={geometry.busbar.x2}
            y2={geometry.busbar.y}
            stroke={sectionBEnergized ? busColor : COLOR_TEXT_MUTED}
            strokeWidth={4}
            data-testid={`sr-busbar-b-${model.stationId}`}
            data-bus-voltage-kv={model.busVoltageKv}
            data-section="B"
            data-energized={sectionBEnergized ? 'true' : 'false'}
          />
          {detail === 'close' && (
            <>
              <text x={geometry.busbar.x1 + 12} y={geometry.busbar.y - 6} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700}>SEKCJA A</text>
              <text x={geometry.busbar.x2 - 12} y={geometry.busbar.y - 6} textAnchor="end" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7.5} fontWeight={700}>SEKCJA B</text>
            </>
          )}
        </>
      ) : (
        <line
          x1={geometry.busbar.x1}
          y1={geometry.busbar.y}
          x2={geometry.busbar.x2}
          y2={geometry.busbar.y}
          stroke={busColor}
          strokeWidth={4}
          strokeLinecap="butt"
          data-testid={`sr-busbar-${model.stationId}`}
          data-bus-voltage-kv={model.busVoltageKv}
        />
      )}
      {/* Busbar end terminators (IEC 60617). */}
      <line x1={geometry.busbar.x1} y1={geometry.busbar.y - 5} x2={geometry.busbar.x1} y2={geometry.busbar.y + 5} stroke={busColor} strokeWidth={2} />
      <line x1={geometry.busbar.x2} y1={geometry.busbar.y - 5} x2={geometry.busbar.x2} y2={geometry.busbar.y + 5} stroke={busColor} strokeWidth={2} />

      {/* ZKSN projection badge (T3) — make the cable-junction nature explicit. */}
      {isZksn && detail !== 'far' && (
        <text
          x={0}
          y={geometry.busbar.y - 14}
          textAnchor="middle"
          fill="#7DD3FC"
          fontFamily={FONT_MONO}
          fontSize={8}
          fontWeight={700}
          data-testid={`sr-zksn-badge-${model.stationId}`}
        >
          {model.branchPointType === 'zksn' ? 'ZŁĄCZE KABLOWE SN (kabel)' : 'SŁUP ROZGAŁĘŹNY (napowietrzna)'}
        </text>
      )}

      {/* nN tier (T1/T2) — transformer boundary + nN busbar + feeders + PV. */}
      {geometry.nn && model.nnBlock && (
        <NNTier nn={geometry.nn} block={model.nnBlock} detail={detail} index={index} onFieldClick={onFieldClick} />
      )}

      {/* SMC coupler (T4) — drawn horizontally across the bus gap as TWO cells +
          a breaker, NOT as a vertical field column. Skipped from the field map. */}
      {sectionGap && (() => {
        const couplerField = model.fields.find((f) => f.role === 'SPRZEGLO');
        if (!couplerField) return null;
        const breakerOpen =
          (couplerField.isNormallyOpen ?? false) ||
          (couplerField.branchRef ? index?.isOpenPoint(couplerField.branchRef) ?? false : false);
        return (
          <SmcCoupler
            field={couplerField}
            busY={geometry.busbar.y}
            aEnd={sectionGap.aEnd}
            bStart={sectionGap.bStart}
            detail={detail}
            breakerOpen={breakerOpen}
            onFieldClick={onFieldClick}
          />
        );
      })()}

      {/* Fields (the SPRZEGLO field is drawn by SmcCoupler above, not here). */}
      {geometry.fields.map((fieldGeom) => {
        const field = model.fields.find((f) => f.fieldId === fieldGeom.fieldId);
        if (!field) return null;
        if (sectionGap && field.role === 'SPRZEGLO') return null;
        const direction = field.branchRef ? index?.directionOf(field.branchRef) ?? 'none' : 'none';
        const energized = field.branchRef
          ? (index?.isBranchEnergized(field.branchRef) ?? true) && !(index?.isOpenPoint(field.branchRef) ?? false)
          : true;
        const powerMw = field.branchRef ? index?.powerOf(field.branchRef) ?? null : null;
        return (
          <FieldColumn
            key={field.fieldId}
            field={field}
            geom={fieldGeom}
            detail={detail}
            busColor={busColor}
            direction={direction}
            energized={energized}
            powerMw={powerMw}
            selected={selectedFieldId === field.fieldId}
            onFieldClick={onFieldClick}
          />
        );
      })}

      {/* SHORT-CIRCUIT dossiers on EVERY busbar at L2 (gate E) — read from the
          frozen IEC 60909 companion. SN busbar (or section A), section B (T4),
          and the nN 400 V busbar each carry their own panel. */}
      {detail === 'close' && model.shortCircuit && (() => {
        const sc = model.shortCircuit;
        const panels: JSX.Element[] = [];
        const snBus = model.snBusScRef ? sc.buses[model.snBusScRef] : undefined;
        if (snBus) {
          panels.push(
            <BusbarShortCircuitPanel key={snBus.bus_ref} sc={snBus} x={geometry.busbar.x1 - 132} y={geometry.busbar.y - 18} />,
          );
        }
        const snBusB = model.snBusBScRef ? sc.buses[model.snBusBScRef] : undefined;
        if (snBusB) {
          panels.push(
            <BusbarShortCircuitPanel key={snBusB.bus_ref} sc={snBusB} x={geometry.busbar.x2 + 16} y={geometry.busbar.y - 18} />,
          );
        }
        const nnRef = model.nnBlock?.scBusRef;
        const nnBus = nnRef ? sc.buses[nnRef] : undefined;
        if (nnBus && geometry.nn) {
          panels.push(
            <BusbarShortCircuitPanel key={nnBus.bus_ref} sc={nnBus} x={geometry.nn.busbar.x2 + 16} y={geometry.nn.busbar.y - 14} />,
          );
        }
        return <>{panels}</>;
      })()}

      {/* Bus voltage label (closer + close). */}
      {detail !== 'far' && !sectionGap && (
        <text
          x={geometry.busbar.x2 + 4}
          y={geometry.busbar.y + 3}
          textAnchor="start"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={8}
          fontWeight={700}
          data-testid={`sr-bus-voltage-${model.stationId}`}
        >
          {`${model.busVoltageKv.toFixed(0)} kV`}
        </text>
      )}
    </g>
  );
}
