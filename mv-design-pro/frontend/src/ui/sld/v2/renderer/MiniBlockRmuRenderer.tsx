/**
 * SLD V2 - MiniBlockRmuRenderer.
 *
 * Mini-blok stacji dla LOD 0-2. To nie jest dekoracyjny kafel: renderer
 * pokazuje mini-rozdzielnice SN z szyna, polami i aparatami wynikajacymi
 * z faktycznych bays[].
 */

import type { MouseEvent } from 'react';

import {
  COLOR_BUS_LV,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import {
  MINI_BLOCK_FOOTPRINT,
  type StationFootprintType,
} from './MiniBlockFootprints';

// =============================================================================
// Constants
// =============================================================================

const OVERVIEW_WIDTH = 118;
const OVERVIEW_HEIGHT = 72;
const COMPACT_WIDTH = 190;
const COMPACT_HEIGHT = 136;
const DETAIL_WIDTH = 220;
const DETAIL_HEIGHT = 164;
const DETAIL_DER_WIDTH = 340;
const DETAIL_DER_HEIGHT = 280;

const FIELD_TOP_LEAD = 38;
const FIELD_DEVICE_CENTER_ABOVE_BUS = 20;
const FIELD_DEVICE_SIZE = 11;
const SECTION_BAR_HEIGHT = 4;

const COLOR_TR_TRIANGLE = '#A5C8FF';
const COLOR_MEASUREMENT = '#FFB020';
const COLOR_DER_PV = '#FFC857';
const COLOR_DER_BESS = '#5BB8FF';
const COLOR_DER_FW = '#5BFFD9';
const COLOR_MISSING = '#FFC857';
const COLOR_BLOCKER = '#FF5560';
const COLOR_SCADA_SHADOW = '#05070A';
const COLOR_BAY_CELL = '#0A1720';
const COLOR_BAY_CELL_STROKE = '#17435A';

type SymbolClickHandler = (elementId: string) => (e: MouseEvent<SVGGElement>) => void;

// =============================================================================
// Public types
// =============================================================================

export interface MiniBlockBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  readonly hasMissingRequiredDevice: boolean;
}

export interface MiniBlockDerBadge {
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly count: number;
  readonly connectionSide?: 'nn' | 'sn' | 'dedicated';
}

export interface MiniBlockRmuRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly variant: 'overview' | 'compact' | 'detail';
  readonly footprintType: StationFootprintType;
  readonly name: string;
  /** K30-4: short station code (S01, S15, S29). Prominent badge. */
  readonly stationCode?: string | null;
  /** K30-8: alarm severity (CRITICAL/IMPORTANT/WARNING). */
  readonly alarmSeverity?: 'warning' | 'important' | 'critical' | null;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer: boolean;
  readonly transformerRatedKva: number | null;
  readonly nnFeedersCount: number;
  readonly derBadges: readonly MiniBlockDerBadge[];
  readonly missingData: boolean;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
}

// =============================================================================
// Renderer
// =============================================================================

export function MiniBlockRmuRenderer(props: MiniBlockRmuRendererProps): JSX.Element {
  const { variant } = props;
  const showPvCircuit = hasPvNnCircuit(variant, props.derBadges);
  const { width, height } = miniBlockDimensions(variant, showPvCircuit);
  const offsetX = -width / 2;
  const offsetY = -height / 2;
  const busY = variant === 'overview' ? -8 : variant === 'compact' ? -10 : showPvCircuit ? -34 : -22;
  const visibleSnBays = variant === 'overview' ? props.snBays.slice(0, 4) : props.snBays;
  const showLvRow = variant === 'detail' && MINI_BLOCK_FOOTPRINT[props.footprintType].hasLvSection;
  const labelNameY = variant === 'overview'
    ? 18
    : variant === 'compact'
      ? 40
      : showPvCircuit
        ? offsetY + height - 28
        : 56;
  const labelTypeY = variant === 'overview'
    ? labelNameY + 13
    : variant === 'compact'
      ? labelNameY + 14
      : showPvCircuit
        ? labelNameY + 12
        : labelNameY + 13;
  const labelPowerY = labelTypeY + 12;
  const labelFontSize = variant === 'overview' ? 10 : variant === 'compact' ? 10 : showPvCircuit ? 9 : 10;
  const typeFontSize = variant === 'overview' ? 9 : variant === 'compact' ? 8 : showPvCircuit ? 8 : 9;
  const isBlocker = props.snBays.length === 0;
  const stroke = props.selected ? COLOR_SELECTION : isBlocker ? COLOR_BLOCKER : 'transparent';
  const strokeWidth = props.selected ? 2.5 : 1.5;
  const handleSymbolClick = props.onClick
    ? (elementId: string) => (e: MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        props.onClick?.(elementId);
      }
    : undefined;

  return (
    <g
      data-testid={`sld-v2-mini-rmu-${props.id}`}
      data-parity-key="station.mini.root"
      data-element-kind={
        variant === 'overview'
          ? 'mini_block_overview'
          : variant === 'compact'
            ? 'mini_block_compact'
            : 'mini_block_detail'
      }
      data-lod-variant={variant}
      data-element-id={props.id}
      data-footprint-type={props.footprintType}
      data-bay-count={String(props.snBays.length)}
      transform={`translate(${props.x}, ${props.y})`}
      onClick={
        props.onClick
          ? (e) => {
              e.stopPropagation();
              props.onClick?.(props.id);
            }
          : undefined
      }
      onDoubleClick={
        props.onDoubleClick
          ? (e) => {
              e.stopPropagation();
              props.onDoubleClick?.(props.id);
            }
          : undefined
      }
      style={{ cursor: props.onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={offsetX}
        y={offsetY}
        width={width}
        height={height}
        fill={COLOR_PANEL_RAISED}
        opacity={props.selected || isBlocker ? 0.18 : 0.04}
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={4}
        ry={4}
        data-parity-key="station.mini.body"
      />

      {!isBlocker && (
        <SnBusRow
          offsetX={offsetX}
          width={width}
          rowY={busY}
          bays={visibleSnBays}
          stationId={props.id}
          variant={variant}
          onSymbolClick={handleSymbolClick}
        />
      )}

      {showLvRow && (
        <LvSectionRow
          offsetX={offsetX}
          width={width}
          rowY={showPvCircuit ? 22 : 16}
          feedersCount={props.nnFeedersCount}
          hasTransformer={props.hasTransformer}
        />
      )}

      {variant === 'detail' && props.hasTransformer && (
        <TransformerTriangle
          cx={0}
          cy={showPvCircuit ? 2 : 6}
          ratedKva={props.transformerRatedKva}
          stationId={props.id}
          onSymbolClick={handleSymbolClick}
        />
      )}

      {showPvCircuit && (
        <PvConnectionTree
          stationId={props.id}
          baseY={28}
          onSymbolClick={handleSymbolClick}
        />
      )}

      {/* K30-4: prominent station code badge — props.stationCode (from adapter)
       *  or regex z name (fallback). Backend gubi name_pl więc kod musi
       *  pochodzić z adaptera order. */}
      {(() => {
        const code = props.stationCode
          ?? ((props.name || '').match(/\b(S\d{2,3})\b/)?.[1] ?? null);
        return code ? (
          <g data-testid={`sld-v2-mini-station-code-${props.id}`} transform={`translate(0, ${labelNameY - 4})`}>
            <rect x={-22} y={-13} width={44} height={18} rx={2} ry={2} fill="#0A1018" stroke="#7EC8FF" strokeWidth={1.2} opacity={0.95} />
            <text x={0} y={1} textAnchor="middle" fill="#7EC8FF" fontFamily={FONT_SANS} fontSize={14} fontWeight={900} letterSpacing={0.8}>
              {code}
            </text>
          </g>
        ) : null;
      })()}

      {/* K30-8: alarm triangle obok code badge (mini block layout) */}
      {props.alarmSeverity && (() => {
        const color = props.alarmSeverity === 'critical' ? '#FF6B6B' : props.alarmSeverity === 'important' ? '#FF8B5C' : '#FFD166';
        return (
          <g data-testid={`sld-v2-mini-station-alarm-${props.id}`} data-alarm-severity={props.alarmSeverity} transform={`translate(26, ${labelNameY - 4})`}>
            <polygon points="0,-11 9,5 -9,5" fill={color} stroke="#0A0E14" strokeWidth={1} />
            <text x={0} y={3} textAnchor="middle" fill="#0A0E14" fontFamily={FONT_SANS} fontSize={10} fontWeight={900}>
              !
            </text>
          </g>
        );
      })()}
      <text
        x={0}
        y={labelNameY + 18}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={labelFontSize}
        fontWeight={800}
        paintOrder="stroke"
        stroke={COLOR_SCADA_SHADOW}
        strokeWidth={showPvCircuit ? 1.4 : 3}
        data-parity-key="station.mini.name"
      >
        {(props.name || '').length > 22 ? (props.name || '').slice(0, 20) + '…' : props.name}
      </text>

      <text
        x={0}
        y={labelTypeY}
        textAnchor="middle"
        fill={COLOR_SELECTION}
        fontFamily={FONT_SANS}
        fontSize={typeFontSize}
        fontWeight={800}
        paintOrder="stroke"
        stroke={COLOR_SCADA_SHADOW}
        strokeWidth={showPvCircuit ? 1.2 : 3}
        data-parity-key="station.mini.type"
      >
        {MINI_BLOCK_FOOTPRINT[props.footprintType].shortCodePl}
      </text>

      {variant !== 'overview' && !showPvCircuit && props.transformerRatedKva !== null && (
        <text
          x={0}
          y={labelPowerY}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
          fontWeight={700}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={2}
          data-parity-key="station.mini.transformer.power"
        >
          {props.transformerRatedKva}
        </text>
      )}

      {isBlocker && (
        <g data-testid={`sld-v2-mini-rmu-blocker-${props.id}`} data-parity-key="station.mini.blocker">
          <rect
            x={-55}
            y={-8}
            width={110}
            height={24}
            fill={COLOR_BLOCKER}
            opacity={0.18}
            rx={2}
            ry={2}
          />
          <text
            x={0}
            y={8}
            textAnchor="middle"
            fill={COLOR_BLOCKER}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={700}
          >
            Brak pól SN - uzupełnij konfigurację
          </text>
        </g>
      )}

      {props.derBadges.length > 0 && (
        showPvCircuit ? (
          <g aria-hidden="true" data-parity-key="station.mini.der_badges">
            <g data-parity-key="station.mini.der_badge" />
          </g>
        ) : (
          <DerBadges
            offsetX={offsetX}
            offsetY={offsetY}
            badges={props.derBadges}
          />
        )
      )}

      {props.missingData && (
        <circle
          cx={offsetX + width - 9}
          cy={offsetY + 9}
          r={5}
          fill={COLOR_MISSING}
          stroke="#FFB020"
          strokeWidth={1}
          data-parity-key="station.mini.missing"
        >
          <title>Brakuje danych do obliczeń</title>
        </circle>
      )}
    </g>
  );
}

export function miniBlockDimensions(
  variant: 'overview' | 'compact' | 'detail',
  hasPvNnCircuit = false,
): { width: number; height: number } {
  if (variant === 'overview') return { width: OVERVIEW_WIDTH, height: OVERVIEW_HEIGHT };
  if (variant === 'compact') return { width: COMPACT_WIDTH, height: COMPACT_HEIGHT };
  return hasPvNnCircuit
    ? { width: DETAIL_DER_WIDTH, height: DETAIL_DER_HEIGHT }
    : { width: DETAIL_WIDTH, height: DETAIL_HEIGHT };
}

export function miniBlockStationPortOffsets(
  variant: 'overview' | 'compact' | 'detail',
  snBays: readonly MiniBlockBayDescriptor[],
  derBadges: readonly MiniBlockDerBadge[] = [],
): readonly [number, number | null] | null {
  if (snBays.length === 0) return null;
  const hasPvCircuit = hasPvNnCircuit(variant, derBadges);
  const { width } = miniBlockDimensions(variant, hasPvCircuit);
  const visibleSnBays = variant === 'overview' ? snBays.slice(0, 4) : snBays;
  const left = -width / 2 + 24;
  const right = width / 2 - 24;
  const span = right - left;
  const positioned = visibleSnBays.map((bay, idx) => ({
    bay,
    x: visibleSnBays.length === 1 ? 0 : left + (span * idx) / (visibleSnBays.length - 1),
  }));
  const linePorts = positioned.filter(({ bay }) => isLineLikeFieldRole(bay.fieldRole));
  if (linePorts.length === 0) return null;
  return [linePorts[0].x, linePorts[1]?.x ?? null];
}

function hasPvNnCircuit(
  variant: 'overview' | 'compact' | 'detail',
  derBadges: readonly MiniBlockDerBadge[],
): boolean {
  return variant === 'detail'
    && derBadges.some((badge) => badge.kind === 'PV' && (badge.connectionSide ?? 'nn') === 'nn');
}

function isLineLikeFieldRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.LINE_IN
    || role === FIELD_ROLE.LINE_OUT
    || role === FIELD_ROLE.LINE_BRANCH
    || role === FIELD_ROLE.RMU_LINE;
}

// =============================================================================
// Sub-renderers
// =============================================================================

interface SnBusRowProps {
  offsetX: number;
  width: number;
  rowY: number;
  bays: readonly MiniBlockBayDescriptor[];
  stationId: string;
  variant: MiniBlockRmuRendererProps['variant'];
  onSymbolClick?: SymbolClickHandler;
}

function SnBusRow(props: SnBusRowProps): JSX.Element {
  const { offsetX, width, rowY, bays, stationId, variant, onSymbolClick } = props;
  const left = offsetX + 24;
  const right = offsetX + width - 24;
  const span = right - left;

  return (
    <g data-testid="sld-v2-mini-rmu-sn-row" data-parity-key="station.mini.sn_row">
      <line
        x1={offsetX + 14}
        y1={rowY}
        x2={offsetX + width - 14}
        y2={rowY}
        stroke={COLOR_BUS_LV}
        strokeWidth={STROKE_BUSBAR_PX + 1}
        strokeLinecap="butt"
        data-parity-key="station.mini.bus.sn"
      />
      {bays.map((bay, idx) => {
        const x = bays.length === 1 ? 0 : left + (span * idx) / (bays.length - 1);
        return (
          <BayMarker
            key={bay.bayRef}
            x={x}
            y={rowY}
            fieldRole={bay.fieldRole}
            hasMissing={bay.hasMissingRequiredDevice}
            designation={bay.designation}
            stationId={stationId}
            bayRef={bay.bayRef}
            variant={variant}
            onSymbolClick={onSymbolClick}
          />
        );
      })}
    </g>
  );
}

interface BayMarkerProps {
  x: number;
  y: number;
  fieldRole: FieldRole;
  hasMissing: boolean;
  designation: string;
  stationId: string;
  bayRef: string;
  variant: MiniBlockRmuRendererProps['variant'];
  onSymbolClick?: SymbolClickHandler;
}

function BayMarker(props: BayMarkerProps): JSX.Element {
  const { x, y, fieldRole, hasMissing, designation, stationId, bayRef, variant, onSymbolClick } = props;
  const isTransformer =
    fieldRole === FIELD_ROLE.TRANSFORMER || fieldRole === FIELD_ROLE.RMU_TRANSFORMER;
  const isCoupler = fieldRole === FIELD_ROLE.COUPLER;
  const isMeasurement = fieldRole === FIELD_ROLE.MEASUREMENT;
  const apparatusKind = isTransformer
    ? 'transformer-field'
    : isCoupler
      ? 'coupler'
      : isMeasurement
        ? 'measurement'
        : 'line-switch';
  const switchY = y - FIELD_DEVICE_CENTER_ABOVE_BUS;
  const topY = y - FIELD_TOP_LEAD;
  const elementId = `${stationId}/bay/${bayRef}`;

  return (
    <g
      data-testid={`sld-v2-mini-rmu-bay-marker-${fieldRole}`}
      data-parity-key="station.mini.bay"
      data-apparatus-kind={apparatusKind}
      data-element-kind="station_bay"
      data-element-id={elementId}
      onClick={onSymbolClick?.(elementId)}
      style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
    >
      <title>{`${designation} (${fieldRole})`}</title>
      {variant !== 'overview' && (
        <rect
          x={x - 16}
          y={topY - 5}
          width={32}
          height={isTransformer ? 76 : 52}
          fill={COLOR_BAY_CELL}
          fillOpacity={0.58}
          stroke={COLOR_BAY_CELL_STROKE}
          strokeWidth={0.8}
          rx={2}
          ry={2}
          data-parity-key="station.mini.bay.cell"
          data-cell-role={fieldRole}
        />
      )}

      {variant === 'overview' ? (
        <g
          data-parity-key="station.mini.overview_field"
          data-apparatus-kind={isTransformer ? 'transformer-field' : 'line-switch'}
          data-symbol-canon={isTransformer ? 'transformer_field_aggregated' : 'switch_disconnector_rotated_square'}
        >
          <line x1={x} y1={topY + 12} x2={x} y2={y} stroke={COLOR_BUS_LV} strokeWidth={STROKE_FIELD_TRACK_PX} />
          {isTransformer ? (
            <rect
              x={x - 5}
              y={y + 6}
              width={10}
              height={10}
              fill="none"
              stroke={COLOR_MEASUREMENT}
              strokeWidth={1.3}
              rx={5}
            />
          ) : (
            <polygon
              points={`${x},${switchY - 8} ${x + 8},${switchY} ${x},${switchY + 8} ${x - 8},${switchY}`}
              fill={hasMissing ? COLOR_MISSING : COLOR_DEVICE_CLOSED}
              stroke={hasMissing ? '#FFB020' : COLOR_DEVICE_CLOSED_BORDER}
              strokeWidth={1.1}
            />
          )}
        </g>
      ) : isTransformer ? (
        <g data-parity-key="station.mini.transformer_field">
          <line x1={x} y1={y} x2={x} y2={y + 28} stroke={COLOR_BUS_LV} strokeWidth={STROKE_FIELD_TRACK_PX} />
          <rect x={x - 8} y={y + 7} width={5} height={14} fill={COLOR_TR_TRIANGLE} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} data-apparatus-kind="fuse" />
          <rect x={x + 3} y={y + 7} width={5} height={14} fill={COLOR_TR_TRIANGLE} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} data-apparatus-kind="fuse" />
          <circle cx={x - 5} cy={y + 30} r={6} fill="none" stroke={COLOR_MEASUREMENT} strokeWidth={1.6} />
          <circle cx={x + 5} cy={y + 30} r={6} fill="none" stroke={COLOR_MEASUREMENT} strokeWidth={1.6} />
        </g>
      ) : isCoupler ? (
        <g data-parity-key="station.mini.coupler">
          <line x1={x} y1={topY} x2={x} y2={y} stroke={COLOR_BUS_LV} strokeWidth={STROKE_FIELD_TRACK_PX} />
          <rect x={x - 7} y={switchY - 7} width={14} height={14} fill="none" stroke={COLOR_SELECTION} strokeWidth={2} />
        </g>
      ) : isMeasurement ? (
        <g data-parity-key="station.mini.measurement">
          <line x1={x} y1={topY} x2={x} y2={y} stroke={COLOR_BUS_LV} strokeWidth={STROKE_FIELD_TRACK_PX} />
          <circle cx={x} cy={switchY} r={6} fill="none" stroke={COLOR_MEASUREMENT} strokeWidth={2} />
          <circle cx={x} cy={switchY + 12} r={5} fill="none" stroke={COLOR_MEASUREMENT} strokeWidth={1.6} />
        </g>
      ) : (
        <g
          data-parity-key="station.mini.line_switch"
          data-apparatus-kind="switch_disconnector"
          data-symbol-canon="switch_disconnector_rotated_square"
          data-element-kind="switch_disconnector"
          data-element-id={`${elementId}/switch-disconnector`}
          onClick={onSymbolClick?.(`${elementId}/switch-disconnector`)}
          style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
        >
          <line x1={x} y1={topY} x2={x} y2={y} stroke={COLOR_BUS_LV} strokeWidth={STROKE_FIELD_TRACK_PX} />
          <polygon
            points={`${x},${switchY - FIELD_DEVICE_SIZE} ${x + FIELD_DEVICE_SIZE},${switchY} ${x},${switchY + FIELD_DEVICE_SIZE} ${x - FIELD_DEVICE_SIZE},${switchY}`}
            fill={hasMissing ? COLOR_MISSING : COLOR_DEVICE_CLOSED}
            stroke={hasMissing ? '#FFB020' : COLOR_DEVICE_CLOSED_BORDER}
            strokeWidth={1.3}
            data-symbol-canon="switch_disconnector_rotated_square"
          />
          <g
            data-apparatus-kind="earthing_switch"
            data-symbol-canon="earthing_switch_lateral_branch"
            data-element-kind="earthing_switch"
            data-element-id={`${elementId}/earthing-switch`}
            onClick={onSymbolClick?.(`${elementId}/earthing-switch`)}
            style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
          >
            <line x1={x + 12} y1={switchY} x2={x + 23} y2={switchY} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
            <line x1={x + 23} y1={switchY} x2={x + 23} y2={switchY + 10} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} strokeDasharray="2 2" />
            <line x1={x + 18} y1={switchY + 10} x2={x + 28} y2={switchY + 10} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
            <line x1={x + 20} y1={switchY + 13} x2={x + 26} y2={switchY + 13} stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
            <line x1={x + 22} y1={switchY + 16} x2={x + 24} y2={switchY + 16} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.9} />
          </g>
          {hasMissing && (
            <line
              x1={x - 16}
              y1={switchY}
              x2={x - 6}
              y2={switchY}
              stroke={COLOR_DEVICE_OPEN}
              strokeWidth={2}
            />
          )}
        </g>
      )}
    </g>
  );
}

interface LvSectionRowProps {
  offsetX: number;
  width: number;
  rowY: number;
  feedersCount: number;
  hasTransformer: boolean;
}

function LvSectionRow(props: LvSectionRowProps): JSX.Element {
  const { offsetX, width, rowY, feedersCount, hasTransformer } = props;
  return (
    <g data-testid="sld-v2-mini-rmu-lv-row" data-parity-key="station.mini.lv_row">
      <rect
        x={offsetX + 32}
        y={rowY}
        width={width - 64}
        height={SECTION_BAR_HEIGHT}
        fill={COLOR_BUS_LV}
        opacity={hasTransformer ? 0.8 : 0.35}
      />
      <text
        x={offsetX + width - 18}
        y={rowY + 13}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={10}
      >
        {feedersCount > 0 ? `${feedersCount}× nN` : 'nN'}
      </text>
    </g>
  );
}

interface TransformerTriangleProps {
  cx: number;
  cy: number;
  ratedKva: number | null;
  stationId?: string;
  onSymbolClick?: SymbolClickHandler;
}

function TransformerTriangle(props: TransformerTriangleProps): JSX.Element {
  const { cx, cy, ratedKva, stationId, onSymbolClick } = props;
  const elementId = stationId ? `${stationId}/transformer/sn-nn` : 'transformer/sn-nn';
  return (
    <g
      data-testid="sld-v2-mini-rmu-tr-triangle"
      data-parity-key="station.mini.transformer"
      data-element-kind="transformer_sn_nn"
      data-element-id={elementId}
      onClick={onSymbolClick?.(elementId)}
      style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
    >
      <circle cx={cx - 6} cy={cy} r={7} fill="none" stroke={COLOR_TR_TRIANGLE} strokeWidth={1.5} />
      <circle cx={cx + 6} cy={cy} r={7} fill="none" stroke={COLOR_TR_TRIANGLE} strokeWidth={1.5} />
      {ratedKva !== null && (
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel - 2}
          fontWeight={700}
        >
          TR
        </text>
      )}
    </g>
  );
}

interface PvConnectionTreeProps {
  stationId: string;
  baseY: number;
  onSymbolClick?: SymbolClickHandler;
}

function PvConnectionTree(props: PvConnectionTreeProps): JSX.Element {
  const { stationId, baseY, onSymbolClick } = props;
  const lvBusY = baseY + 22;
  const breakerY = baseY + 36;
  const inverterY = baseY + 58;
  const pccId = `${stationId}/pv/nn-pcc`;
  const feederXs = [-28, 28];

  return (
    <g
      data-testid={`sld-v2-mini-rmu-pv-nn-${stationId}`}
      data-parity-key="station.pv.nn_connection"
      data-element-kind="pv_nn_connection_tree"
      data-element-id={`${stationId}/pv/nn-connection`}
    >
      <rect
        x={-86}
        y={baseY + 1}
        width={172}
        height={76}
        fill="#120F05"
        fillOpacity={0.44}
        stroke="#6F5A17"
        strokeWidth={0.8}
        strokeDasharray="4 3"
        rx={2}
        ry={2}
        data-parity-key="station.pv.nn_compartment"
      />
      <line x1={0} y1={baseY - 16} x2={0} y2={lvBusY} stroke={COLOR_DER_PV} strokeWidth={2.2} />
      <line x1={-66} y1={lvBusY} x2={66} y2={lvBusY} stroke={COLOR_DER_PV} strokeWidth={2.8} strokeLinecap="butt" />
      <g
        data-testid={`sld-v2-mini-rmu-pv-pcc-${stationId}`}
        data-element-kind="pcc"
        data-element-id={pccId}
        onClick={onSymbolClick?.(pccId)}
        style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
      >
        <circle cx={0} cy={lvBusY} r={4} fill={COLOR_DER_PV} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
        <title>Punkt przyłączenia PV po stronie nN</title>
      </g>

      {feederXs.map((x, index) => {
        const breakerId = `${stationId}/pv/nn-breaker/Q${index + 1}`;
        const protectionId = `${stationId}/pv/protection/e2tango/Q${index + 1}`;
        const inverterId = `${stationId}/pv/inverter/${index + 1}`;
        return (
          <g key={breakerId} data-parity-key="station.pv.nn_feeder">
            <rect
              x={x - 18}
              y={breakerY - 5}
              width={36}
              height={44}
              fill="#161507"
              fillOpacity={0.78}
              stroke="#9A7A1B"
              strokeWidth={0.8}
              rx={2}
              ry={2}
              data-parity-key="station.pv.nn_feeder.cell"
            />
            <line x1={x} y1={lvBusY} x2={x} y2={inverterY} stroke={COLOR_DER_PV} strokeWidth={1.8} />
            <g
              data-testid={`sld-v2-mini-rmu-pv-lv-breaker-${index + 1}`}
              data-element-kind="lv_breaker"
              data-element-id={breakerId}
              data-apparatus-kind="lv_breaker"
              data-symbol-canon="circuit_breaker_square"
              onClick={onSymbolClick?.(breakerId)}
              style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
            >
              <rect
                x={x - 6}
                y={breakerY - 6}
                width={12}
                height={12}
                fill={COLOR_DEVICE_CLOSED}
                stroke={COLOR_DEVICE_CLOSED_BORDER}
                strokeWidth={1.4}
                rx={1}
              />
              <text
                x={x}
                y={breakerY - 10}
                textAnchor="middle"
                fill={COLOR_TEXT_PRIMARY}
                fontFamily={FONT_SANS}
                fontSize={FONT_SIZES.technicalPanel - 2}
                fontWeight={800}
              >
                Q{index + 1}
              </text>
              <title>{`Wyłącznik nN PV Q${index + 1}`}</title>
            </g>
            <g
              data-testid={`sld-v2-mini-rmu-pv-protection-${index + 1}`}
              data-element-kind="protection_relay"
              data-element-id={protectionId}
              data-protected-ref={breakerId}
              onClick={onSymbolClick?.(protectionId)}
              style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
            >
              <rect
                x={x - 14}
                y={breakerY + 6}
                width={28}
                height={10}
                fill="#1d1704"
                stroke="#d6a21d"
                strokeWidth={1}
                rx={1}
              />
              <text
                x={x}
                y={breakerY + 14}
                textAnchor="middle"
                fill="#ffd166"
                fontFamily={FONT_SANS}
                fontSize={9}
                fontWeight={800}
              >
                e2
              </text>
              <title>{`Zabezpieczenie PV e2TANGO-400 dla Q${index + 1}`}</title>
            </g>
            <g
              data-testid={`sld-v2-mini-rmu-pv-inverter-${index + 1}`}
              data-element-kind="pv_inverter"
              data-element-id={inverterId}
              onClick={onSymbolClick?.(inverterId)}
              style={{ cursor: onSymbolClick ? 'pointer' : 'default' }}
            >
              <circle cx={x} cy={inverterY} r={10} fill="none" stroke={COLOR_DER_PV} strokeWidth={1.8} />
              <path d={`M ${x - 5} ${inverterY} C ${x - 2} ${inverterY - 5}, ${x + 2} ${inverterY + 5}, ${x + 5} ${inverterY}`} fill="none" stroke={COLOR_DER_PV} strokeWidth={1.3} />
              <title>{`Falownik PV ${index + 1}`}</title>
            </g>
          </g>
        );
      })}

      <text
        x={70}
        y={lvBusY + 4}
        fill={COLOR_DER_PV}
        fontFamily={FONT_SANS}
        fontSize={10}
        fontWeight={800}
        paintOrder="stroke"
        stroke={COLOR_SCADA_SHADOW}
        strokeWidth={1.4}
      >
        PV / nN
      </text>
    </g>
  );
}

interface DerBadgesProps {
  offsetX: number;
  offsetY: number;
  badges: readonly MiniBlockDerBadge[];
}

function DerBadges(props: DerBadgesProps): JSX.Element {
  const { offsetX, offsetY, badges } = props;
  // K30-15.2: distinct geometric shape per DER type per IEC 60617-5 convention
  // (PV=hexagon, BESS=square z napisem 'B', FW=triangle z napisem 'W').
  // ENLARGED badge 6→10 px + label widoczny per typ przy zoomie LOD2+.
  return (
    <g data-testid="sld-v2-mini-rmu-der-badges" data-parity-key="station.mini.der_badges">
      {badges.map((badge, idx) => {
        const cx = offsetX + 14 + idx * 26;
        const cy = offsetY + 14;
        const fill =
          badge.kind === 'PV' ? COLOR_DER_PV : badge.kind === 'BESS' ? COLOR_DER_BESS : COLOR_DER_FW;
        const label = badge.kind === 'PV' ? 'PV' : badge.kind === 'BESS' ? 'B' : 'W';
        return (
          <g
            key={`${badge.kind}-${idx}`}
            data-testid={`sld-v2-mini-rmu-der-badge-${badge.kind}`}
            data-parity-key="station.mini.der_badge"
          >
            {badge.kind === 'PV' && (
              <polygon
                points={`${cx},${cy - 10} ${cx + 8.66},${cy - 5} ${cx + 8.66},${cy + 5} ${cx},${cy + 10} ${cx - 8.66},${cy + 5} ${cx - 8.66},${cy - 5}`}
                fill={fill}
                stroke={COLOR_LINE_PRIMARY}
                strokeWidth={1.2}
              />
            )}
            {badge.kind === 'BESS' && (
              <rect
                x={cx - 9}
                y={cy - 9}
                width={18}
                height={18}
                fill={fill}
                stroke={COLOR_LINE_PRIMARY}
                strokeWidth={1.2}
              />
            )}
            {badge.kind === 'FW' && (
              <polygon
                points={`${cx},${cy - 10} ${cx + 9},${cy + 6} ${cx - 9},${cy + 6}`}
                fill={fill}
                stroke={COLOR_LINE_PRIMARY}
                strokeWidth={1.2}
              />
            )}
            <title>{`${badge.kind}: ${badge.count} szt.`}</title>
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fill="#0A0E14"
              fontFamily={FONT_SANS}
              fontSize={10}
              fontWeight={900}
              letterSpacing={0.3}
            >
              {label}
            </text>
            {badge.count > 1 && (
              <text
                x={cx + 11}
                y={cy - 8}
                textAnchor="start"
                fill={fill}
                fontFamily={FONT_SANS}
                fontSize={9}
                fontWeight={900}
              >
                ×{badge.count}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// Helper
// =============================================================================

export function miniBlockViewBox(
  variant: 'overview' | 'compact' | 'detail',
): { width: number; height: number } {
  if (variant === 'overview') return { width: OVERVIEW_WIDTH, height: OVERVIEW_HEIGHT };
  return variant === 'compact'
    ? { width: COMPACT_WIDTH, height: COMPACT_HEIGHT }
    : { width: DETAIL_WIDTH, height: DETAIL_HEIGHT };
}
