/**
 * STACJA-ROZDZIELNIA SN — the atomic, reusable, RESPONSIVE unit (KROK 1).
 *
 * One station = a mini-rozdzielnia SN: a collector busbar with fields (pola) by
 * canonical role, each showing role + apparatus (IEC 60617) + switch state
 * (green=closed / red=open) + protection functions per applicability. Power
 * flows in via the input field → THROUGH the breaker → onto the busbar → out
 * through outgoing fields; the arrow runs THROUGH the apparatus, with direction
 * READ from the FROZEN-solver companion (one truth, P-A) — never guessed.
 *
 * RESPONSIVE: detail accretes INSIDE the ordered rozdzielnia (the structural fix
 * for the old L2 tangle), driven by `detail`:
 *   - 'far'    : busbar + field symbols + switch state.
 *   - 'closer' : field apparatus visible, role tags, power-flow direction.
 *   - 'close'  : full IEC 60617 symbols, protection functions, catalog labels.
 *
 * Layout comes from the ONE geometry source (`computeStationGeometry`, N-5);
 * apparatus symbols are the shared IEC 60617 library (`GpzApparatusSymbols`).
 * Fields are CLICKABLE → `onFieldClick` (stub configuration handler).
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
  ApparatusDsCircle,
  ApparatusEarthingSwitch,
  ApparatusSwitchDisconnector,
  ApparatusTransformerSymbol,
  ApparatusVtThreePhase,
  CtPrimary,
} from '../renderer/GpzApparatusSymbols';
import { buildPowerFlowIndex, type SldPowerFlowCompanion } from '../canvas/SldPowerFlowCompanion';
import {
  FIELD_ROLE_LABEL_PL,
  FIELD_ROLE_SHORT_TAG,
  type StationApparatus,
  type StationFieldDescriptor,
  type StationRozdzielniaModel,
} from './contract';
import {
  computeStationGeometry,
  type FieldGeometry,
  type StationDetailLevel,
} from './geometry';

// =============================================================================
// Props
// =============================================================================

export interface StationRozdzielniaSNProps {
  readonly model: StationRozdzielniaModel;
  /**
   * Frozen-solver power-flow companion (one truth). Direction + energization of
   * the through-flow arrow are READ from here. Null ⇒ no arrow (no solver data).
   */
  readonly companion: SldPowerFlowCompanion | null;
  /** Detail level (responsive). */
  readonly detail: StationDetailLevel;
  /** Click on a field → configuration (stub handler). */
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

function fieldSwitchState(field: StationFieldDescriptor): StationApparatus['switchState'] {
  // The field's overall state = its breaker (CB); fall back to a switch-disconnector.
  const cb = field.apparatus.find((a) => a.kind === 'CB');
  if (cb?.switchState) return cb.switchState;
  const sd = field.apparatus.find((a) => a.kind === 'LOAD_SWITCH' || a.kind === 'DS');
  return sd?.switchState ?? 'unknown';
}

function stateColor(state: StationApparatus['switchState']): string {
  if (state === 'open') return COLOR_DEVICE_OPEN_BORDER;
  if (state === 'unknown') return COLOR_DEVICE_UNKNOWN;
  return COLOR_DEVICE_CLOSED_BORDER;
}

// =============================================================================
// Power-flow arrow THROUGH the apparatus
// =============================================================================

/**
 * Draw the through-flow arrow ON the field power path at `flowAnchor`. The
 * DIRECTION is read from the companion: 'forward' = power flows from the network
 * down into the station/busbar (arrowhead pointing toward the busbar for line
 * fields, or down into the transformer for TR fields); 'reverse' = the opposite;
 * 'none' = de-energized / zero through-flow → no arrow.
 *
 * Returns null when there is no companion entry (no solver truth) or no flow.
 */
function PowerFlowArrow(props: {
  geom: FieldGeometry;
  direction: 'forward' | 'reverse' | 'none';
  energized: boolean;
}): JSX.Element | null {
  const { geom, direction, energized } = props;
  if (!energized || direction === 'none') return null;

  const { x } = geom.flowAnchor;
  // Network/coupler fields: forward = up (network → busbar). Transformer fields:
  // forward = down (busbar → transformer). Reverse flips the arrowhead.
  const forwardPointsUp = geom.pathOrientation !== 'transformer';
  const pointsUp = direction === 'forward' ? forwardPointsUp : !forwardPointsUp;

  // Place a short, bold arrow spanning the gap between busbar and first apparatus.
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
    case 'DS':
      symbol = <ApparatusDsCircle cx={cx} cy={cy} state={switchState} energized={energized} />;
      break;
    case 'LOAD_SWITCH':
      symbol = <ApparatusSwitchDisconnector cx={cx} cy={cy} state={switchState} energized={energized} />;
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
  // Stack vertically, right of the field path.
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
  selected: boolean;
  onFieldClick?: (fieldId: string) => void;
}): JSX.Element {
  const { field, geom, detail, busColor, direction, energized, selected, onFieldClick } = props;
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

      {/* Role tag (far + closer + close). */}
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

      {/* FAR: a single state diamond near the busbar (compact). */}
      {detail === 'far' && (
        <polygon
          points={`${x},${geom.busY + 8} ${x + 7},${geom.busY + 15} ${x},${geom.busY + 22} ${x - 7},${geom.busY + 15}`}
          fill={isOpen ? 'none' : state === 'unknown' ? COLOR_DEVICE_UNKNOWN : '#0A8D43'}
          stroke={stateColor(state)}
          strokeWidth={isOpen ? 1.8 : 1.2}
          data-testid={`sr-field-state-diamond-${field.fieldId}`}
          data-apparatus-kind="switch_disconnector"
        />
      )}

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

      {/* Normally-open point marker (T4): distinct red ⨯ on the path. */}
      {field.isNormallyOpen && (
        <g data-testid={`sr-field-nop-${field.fieldId}`} pointerEvents="none">
          <circle cx={x} cy={geom.busY + 10} r={6} fill="#7A1414" stroke={COLOR_DEVICE_OPEN_BORDER} strokeWidth={1.6} />
          <line x1={x - 3.5} y1={geom.busY + 6.5} x2={x + 3.5} y2={geom.busY + 13.5} stroke="#FFFFFF" strokeWidth={1.6} />
          <line x1={x + 3.5} y1={geom.busY + 6.5} x2={x - 3.5} y2={geom.busY + 13.5} stroke="#FFFFFF" strokeWidth={1.6} />
        </g>
      )}
    </g>
  );
}

// =============================================================================
// The component
// =============================================================================

export function StationRozdzielniaSN(props: StationRozdzielniaSNProps): JSX.Element {
  const { model, companion, detail, onFieldClick, selectedFieldId, x = 0, y = 0 } = props;
  const geometry = computeStationGeometry(model.fields, detail);
  const busColor = busColorForVoltage(model.busVoltageKv);
  const index = buildPowerFlowIndex(companion);

  return (
    <g
      data-testid={`station-rozdzielnia-${model.stationId}`}
      data-element-kind="station_rozdzielnia"
      data-archetype={model.archetype}
      data-detail={detail}
      data-station-type={model.archetype}
      data-case-ref={model.caseRef ?? ''}
      data-field-count={String(model.fields.length)}
      transform={`translate(${x}, ${y})`}
    >
      {/* Station header (code + name + type). */}
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

      {/* SN collector busbar (the szyna). */}
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
      {/* Busbar end terminators (IEC 60617). */}
      <line x1={geometry.busbar.x1} y1={geometry.busbar.y - 5} x2={geometry.busbar.x1} y2={geometry.busbar.y + 5} stroke={busColor} strokeWidth={2} />
      <line x1={geometry.busbar.x2} y1={geometry.busbar.y - 5} x2={geometry.busbar.x2} y2={geometry.busbar.y + 5} stroke={busColor} strokeWidth={2} />

      {/* Fields. */}
      {geometry.fields.map((fieldGeom) => {
        const field = model.fields.find((f) => f.fieldId === fieldGeom.fieldId);
        if (!field) return null;
        const direction = field.branchRef ? index?.directionOf(field.branchRef) ?? 'none' : 'none';
        // Energized = solver solved the branch (closed path in the slack island)
        // AND it is not an open point. One truth from the companion.
        const energized = field.branchRef
          ? (index?.isBranchEnergized(field.branchRef) ?? true) && !(index?.isOpenPoint(field.branchRef) ?? false)
          : true;
        return (
          <FieldColumn
            key={field.fieldId}
            field={field}
            geom={fieldGeom}
            detail={detail}
            busColor={busColor}
            direction={direction}
            energized={energized}
            selected={selectedFieldId === field.fieldId}
            onFieldClick={onFieldClick}
          />
        );
      })}

      {/* Bus voltage label (closer + close). */}
      {detail !== 'far' && (
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
