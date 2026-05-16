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
import { BayColumnLv } from './BayColumnLv';
import { BayColumnSn } from './BayColumnSn';
import {
  computeMiniBlockLayout,
  getVariantApparatusGap,
  getVariantApparatusHeight,
} from './MiniBlockBayLayout';
import { ApparatusTransformerSymbol } from './GpzApparatusSymbols';

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

// K30-19/31: variant-aware device sizing now via getVariantApparatusHeight()
// w MiniBlockBayLayout. DER + blocker colors local konstantami.

const COLOR_DER_PV = '#FFC857';
const COLOR_DER_BESS = '#5BB8FF';
const COLOR_DER_FW = '#5BFFD9';
const COLOR_BLOCKER = '#FF5560';
const COLOR_SCADA_SHADOW = '#05070A';

type SymbolClickHandler = (elementId: string) => (e: MouseEvent<SVGGElement>) => void;

// =============================================================================
// Public types
// =============================================================================

export interface MiniBlockBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  readonly hasMissingRequiredDevice: boolean;
  /** K30-63: stan CB (wyłącznika) — pokazuje czerwoną open marker zamiast
   *  domyślnie zielonego closed. 'unknown' → szary z '?'. */
  readonly cbState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan DS (odłącznika). */
  readonly dsState?: 'closed' | 'open' | 'unknown';
  /** K30-63: stan ES (uziemnika). Default 'open' (rest position). */
  readonly esState?: 'closed' | 'open' | 'unknown';
}

export interface MiniBlockDerBadge {
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly count: number;
  readonly connectionSide?: 'nn' | 'sn' | 'dedicated';
  /** K30-55 Phase E: aggregated P_mw z generatorów (realna moc, nie atrapa).
   *  Gdy null → badge ukryty (zamiast atrapy). */
  readonly totalPMw?: number | null;
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
  /** K30-15.3: peak load attached to station's LV side [kW]. */
  readonly totalLoadKw?: number | null;
  /** K30-15.3: total generation capacity attached [kW]. */
  readonly totalGenerationKw?: number | null;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer: boolean;
  readonly transformerRatedKva: number | null;
  readonly nnFeedersCount: number;
  readonly derBadges: readonly MiniBlockDerBadge[];
  readonly missingData: boolean;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onDoubleClick?: (id: string) => void;
  /** K30-40: napięcie głównej szyny SN stacji [kV] — bay-column architecture
   *  używa tego do tint kolorów szyny zgodnie z konwencją dyspozytorską
   *  (110kV→czerwień, 15kV→zieleń, 0.4kV→błękit). Wartość przepuszczana
   *  z adaptera (StationMiniBlockDetails.mainBusVoltageKv) przez
   *  StationOnRunRenderer. Brak → fallback do COLOR_BUS_LV. */
  readonly busVoltageKv?: number | null;
  /** K30-55 Phase D: stacja jest NMO (Normalnie Otwarty Punkt) na ring topology.
   *  Renderer rysuje prominent ⨯ marker over station code badge. */
  readonly isNop?: boolean;
  /** K30-62: vector group transformatora per IEC 60076-1 (np. "Dyn5", "Yd11").
   *  Renderer pokazuje jako mini-badge obok TR symbol (detail variant). */
  readonly transformerVectorGroup?: string | null;
  /** K30-116 audyt #2 MAJOR: schemat uziemienia per PN-EN 60364-1 § 312.
   * Wymagane przez OSD do procedur manewrów i testów impedancji. */
  readonly earthingScheme?: 'TN-C' | 'TN-S' | 'TN-C-S' | 'IT' | 'TT' | null;
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
  // K30-31: busY/visibleSnBays/showLvRow now computed wewnątrz
  // computeMiniBlockLayout — used by bay-column refactor below.
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
      {/* K30-30: usunięty dim "klocki" background — zamiast tła robimy
       *  hit-area transparent z zachowaniem stroke (visible tylko gdy selected). */}
      <rect
        x={offsetX}
        y={offsetY}
        width={width}
        height={height}
        fill={COLOR_PANEL_RAISED}
        opacity={props.selected || isBlocker ? 0.18 : 0}
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={4}
        ry={4}
        data-parity-key="station.mini.body"
      />

      {/* K30-59 BIG REFACTOR: rich compact station card w overview variant.
       *  K30-57 dał simple circle ale to było zbyt sparse — user feedback.
       *  Teraz: 76×46 px station card z kompletą informacji per stacja:
       *  - Top center: station code S01-S29 (prominent, voltage state color)
       *  - Below: voltage label "14,95 kV" (compact monospace)
       *  - Bottom-right corner: DER icon + count (jeśli generatory)
       *  - Bottom-left corner: load indicator dot (jeśli totalLoadKw > 0)
       *  - Border: voltage class color (PN-EN convention)
       *  - Drop-line vertical do trunk (top edge connection point)
       *  Industrial dispatcher convention: każda stacja = mini-tile
       *  z key information at-a-glance.
       *  - variant='compact' (LOD 1): bay-column condensed.
       *  - variant='detail' (LOD 2+): pełen bay-column z labels. */}
      {!isBlocker && variant === 'overview' && (() => {
        const snBusColor = miniBlockBusColorForVoltage(props.busVoltageKv ?? null);
        const code = props.stationCode
          ?? ((props.name || '').match(/\b(S\d{2,3})\b/)?.[1] ?? null);
        const hasDer = props.derBadges.length > 0;
        const derCount = props.derBadges.reduce((sum, b) => sum + b.count, 0);
        const totalDerMw = props.derBadges.reduce((sum, b) => sum + (b.totalPMw ?? 0), 0);
        const hasLoad = (props.totalLoadKw ?? 0) > 0;
        const CARD_W = 76;
        const CARD_H = 46;
        return (
          <g data-testid={`sld-v2-mini-rmu-overview-${props.id}`}>
            {/* Drop-line do trunk (top edge connection point) */}
            <line
              x1={0}
              y1={-CARD_H / 2}
              x2={0}
              y2={-CARD_H / 2 - 16}
              stroke={snBusColor}
              strokeWidth={2.5}
            />
            {/* Station card box */}
            <rect
              x={-CARD_W / 2}
              y={-CARD_H / 2}
              width={CARD_W}
              height={CARD_H}
              rx={3}
              ry={3}
              fill="#0A1018"
              stroke={snBusColor}
              strokeWidth={2}
              data-parity-key="station.mini.bus.sn"
              data-bus-voltage-kv={props.busVoltageKv ?? ''}
            />
            {/* Station code (top center) */}
            {code && (
              <text
                x={0}
                y={-CARD_H / 2 + 14}
                textAnchor="middle"
                fill={snBusColor}
                fontFamily="sans-serif"
                fontSize={13}
                fontWeight={900}
                letterSpacing={0.6}
              >
                {code}
              </text>
            )}
            {/* Voltage (mid) */}
            {props.busVoltageKv != null && (
              <text
                x={0}
                y={-CARD_H / 2 + 28}
                textAnchor="middle"
                fill="#DDF7FF"
                fontFamily="monospace"
                fontSize={8}
                fontWeight={700}
              >
                {props.busVoltageKv >= 1
                  ? `${props.busVoltageKv.toFixed(1).replace('.', ',')} kV`
                  : `${Math.round(props.busVoltageKv * 1000)} V`}
              </text>
            )}
            {/* TR rated kVA badge (small, bottom row left) */}
            {props.transformerRatedKva != null && (
              <text
                x={-CARD_W / 2 + 6}
                y={CARD_H / 2 - 4}
                textAnchor="start"
                fill="#FFD166"
                fontFamily="monospace"
                fontSize={7}
                fontWeight={700}
              >
                {props.transformerRatedKva >= 1000
                  ? `${(props.transformerRatedKva / 1000).toFixed(1).replace('.', ',')} MVA`
                  : `${props.transformerRatedKva} kVA`}
              </text>
            )}
            {/* DER badge (small, bottom-right corner) */}
            {hasDer && (
              <g data-testid={`sld-v2-mini-rmu-overview-${props.id}-der`}>
                <circle cx={CARD_W / 2 - 9} cy={CARD_H / 2 - 9} r={6} fill="#FFD166" stroke="#0A0E14" strokeWidth={0.8} />
                <text
                  x={CARD_W / 2 - 9}
                  y={CARD_H / 2 - 7}
                  textAnchor="middle"
                  fill="#0A0E14"
                  fontFamily="sans-serif"
                  fontSize={7}
                  fontWeight={900}
                >
                  {derCount > 9 ? '+' : derCount}
                </text>
                {totalDerMw > 0 && (
                  <text
                    x={CARD_W / 2 - 4}
                    y={CARD_H / 2 - 14}
                    textAnchor="end"
                    fill="#FFD166"
                    fontFamily="monospace"
                    fontSize={6}
                    fontWeight={700}
                  >
                    {totalDerMw >= 1
                      ? `${totalDerMw.toFixed(1).replace('.', ',')}MW`
                      : `${Math.round(totalDerMw * 1000)}kW`}
                  </text>
                )}
              </g>
            )}
            {/* Load indicator dot (bottom-left corner) */}
            {hasLoad && (
              <circle cx={-CARD_W / 2 + 6} cy={-CARD_H / 2 + 8} r={2.5} fill="#7DD3FC" stroke="#0A0E14" strokeWidth={0.5} />
            )}
            {/* NMO marker (top-right corner) gdy isNop */}
            {props.isNop && (
              <g data-testid={`sld-v2-mini-rmu-overview-${props.id}-nop`}>
                <circle cx={CARD_W / 2 - 8} cy={-CARD_H / 2 + 8} r={5} fill="#7A1414" stroke="#FF333D" strokeWidth={1.2} />
                <text
                  x={CARD_W / 2 - 8}
                  y={-CARD_H / 2 + 10}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontFamily="sans-serif"
                  fontSize={6}
                  fontWeight={900}
                >
                  ⨯
                </text>
              </g>
            )}
          </g>
        );
      })()}

      {/* K30-31: bay-column architecture per IEC 60617.
       *  Replaces SnBusRow + LvSectionRow + TransformerTriangle floating
       *  layout z proper bay-column structure: bus → bay columns → TR bay
       *  → LV bus → feeder columns. User K30-29 (1/10) feedback eliminated.
       *  K30-40: SN bus color z busVoltageKv (analogicznie do K30-37 dispatcher).

      {/* K30-31: bay-column architecture per IEC 60617.
       *  Replaces SnBusRow + LvSectionRow + TransformerTriangle floating
       *  layout z proper bay-column structure: bus → bay columns → TR bay
       *  → LV bus → feeder columns. User K30-29 (1/10) feedback eliminated.
       *  K30-40: SN bus color z busVoltageKv (analogicznie do K30-37 dispatcher).
       *  K30-57: gated to compact/detail variants tylko (overview = simple box). */}
      {!isBlocker && variant !== 'overview' && (() => {
        const snBusColor = miniBlockBusColorForVoltage(props.busVoltageKv ?? null);
        const layout = computeMiniBlockLayout(
          variant,
          props.snBays,
          props.hasTransformer,
          variant === 'detail' && MINI_BLOCK_FOOTPRINT[props.footprintType].hasLvSection ? props.nnFeedersCount : 0,
          showPvCircuit,
        );
        const trBayX = layout.trColumn?.x ?? 0;
        return (
          <g data-testid={`sld-v2-mini-rmu-bay-layout-${props.id}`}>
            {/* SN busbar — horizontal line connecting tops of all bay columns.
                K30-40: stroke per voltage class (busVoltageKv).
                K30-118: data-busbar-topology indicator (ABB SafeRing=single,
                Schneider RM6=cellular). Heuristic: footprint mv_lv_sectional
                = cellular (sekcjowana), inne = single (wspólna szyna). */}
            <line
              x1={layout.busLeft}
              y1={layout.busY}
              x2={layout.busRight}
              y2={layout.busY}
              stroke={snBusColor}
              strokeWidth={STROKE_BUSBAR_PX + 1}
              strokeLinecap="butt"
              data-parity-key="station.mini.bus.sn"
              data-bus-voltage-kv={props.busVoltageKv ?? ''}
              data-busbar-topology={
                props.footprintType === 'mv_lv_sectional' ? 'cellular' : 'single'
              }
            />

            {/* SN bay columns — vertical stacks z apparatus per IEC 60617 */}
            {layout.snColumns.map((col) => (
              <BayColumnSn
                key={col.bay.bayRef}
                x={col.x}
                busY={layout.busY}
                bayRole={col.bay.fieldRole}
                bayRef={col.bay.bayRef}
                designation={col.bay.designation}
                apparatusStack={col.apparatusStack}
                variant={variant}
                stationId={props.id}
                hasMissing={col.bay.hasMissingRequiredDevice}
                onSymbolClick={handleSymbolClick}
                cbState={col.bay.cbState}
                dsState={col.bay.dsState}
                esState={col.bay.esState}
              />
            ))}

            {/* TR symbol (dedicated rendering z bay column above + explicit
             *  vertical leads bus → TR primary, TR secondary → LV bus). */}
            {variant === 'detail' && props.hasTransformer && layout.trCenterY != null && (() => {
              const trCy = layout.trCenterY;
              // ApparatusTransformerSymbol z hardcoded r=5, gap=4 — total height ≈ 18px
              const trTop = trCy - 9;
              const trBottom = trCy + 9;
              // Find bottom of TR bay apparatus stack
              const trBayCol = layout.snColumns.find((c) => c.isTransformerBay) ?? layout.snColumns[layout.snColumns.length - 1];
              const stackBottomY =
                trBayCol == null
                  ? layout.busY + 4
                  : layout.busY + 4 + trBayCol.apparatusStack.length *
                    (getVariantApparatusHeight(variant) + getVariantApparatusGap(variant)) -
                    getVariantApparatusGap(variant);
              return (
                <g data-testid={`sld-v2-mini-rmu-tr-bay-${props.id}`}>
                  {/* Lead from TR bay stack bottom → TR primary terminal */}
                  <line
                    x1={trBayX}
                    y1={stackBottomY}
                    x2={trBayX}
                    y2={trTop}
                    stroke={COLOR_BUS_LV}
                    strokeWidth={STROKE_FIELD_TRACK_PX}
                    data-parity-key="station.mini.tr.primary_lead"
                  />
                  {/* TR symbol (2 circles) */}
                  <ApparatusTransformerSymbol cx={trBayX} cy={trCy} />
                  {/* Lead from TR secondary → LV bus */}
                  <line
                    x1={trBayX}
                    y1={trBottom}
                    x2={trBayX}
                    y2={layout.lvBusY}
                    stroke={COLOR_BUS_LV}
                    strokeWidth={STROKE_FIELD_TRACK_PX}
                    data-parity-key="station.mini.tr.secondary_lead"
                  />
                  {/* TR rated kVA label (detail variant only) */}
                  {props.transformerRatedKva != null && (
                    <text
                      x={trBayX + 16}
                      y={trCy + 3}
                      textAnchor="start"
                      fill={COLOR_TEXT_PRIMARY}
                      fontFamily={FONT_SANS}
                      fontSize={9}
                      fontWeight={700}
                      data-testid={`sld-v2-mini-tr-kva-${props.id}`}
                    >
                      {props.transformerRatedKva >= 1000
                        ? `${(props.transformerRatedKva / 1000).toFixed(1)} MVA`
                        : `${props.transformerRatedKva} kVA`}
                    </text>
                  )}
                </g>
              );
            })()}

            {/* LV busbar (detail variant only, gdy footprint hasLvSection) */}
            {layout.lvColumns.length > 0 && (
              <>
                <line
                  x1={layout.busLeft + 18}
                  y1={layout.lvBusY}
                  x2={layout.busRight - 18}
                  y2={layout.lvBusY}
                  stroke={COLOR_BUS_LV}
                  strokeWidth={STROKE_BUSBAR_PX}
                  data-parity-key="station.mini.bus.lv"
                />
                {layout.lvColumns.map((col) => (
                  <BayColumnLv
                    key={`lv-${col.index}`}
                    x={col.x}
                    lvBusY={layout.lvBusY}
                    index={col.index}
                    variant={variant}
                    cbCatalogRef={col.cbCatalogRef}
                    loadKw={col.loadKw}
                    stationId={props.id}
                    onSymbolClick={handleSymbolClick}
                  />
                ))}
              </>
            )}
          </g>
        );
      })()}

      {showPvCircuit && (
        <PvConnectionTree
          stationId={props.id}
          baseY={28}
          onSymbolClick={handleSymbolClick}
        />
      )}

      {/* K30-4: prominent station code badge — props.stationCode (from adapter)
       *  or regex z name (fallback). Backend gubi name_pl więc kod musi
       *  pochodzić z adaptera order.
       *  K30-55 Phase D: gdy isNop → ring color red + ⨯ marker overlay.
       *  K30-59: skip dla overview (już renderowany w rich card branch). */}
      {variant !== 'overview' && (() => {
        const code = props.stationCode
          ?? ((props.name || '').match(/\b(S\d{2,3})\b/)?.[1] ?? null);
        if (!code) return null;
        const nopRing = props.isNop ? '#FF333D' : '#7EC8FF';
        const nopText = props.isNop ? '#FF333D' : '#7EC8FF';
        return (
          <g data-testid={`sld-v2-mini-station-code-${props.id}`} data-is-nop={props.isNop ? 'true' : 'false'} transform={`translate(0, ${labelNameY - 4})`}>
            <rect x={-22} y={-13} width={44} height={18} rx={2} ry={2} fill="#0A1018" stroke={nopRing} strokeWidth={props.isNop ? 1.8 : 1.2} opacity={0.95} />
            <text x={0} y={1} textAnchor="middle" fill={nopText} fontFamily={FONT_SANS} fontSize={14} fontWeight={900} letterSpacing={0.8}>
              {code}
            </text>
            {props.isNop && (
              <g data-testid={`sld-v2-mini-station-nop-${props.id}`}>
                {/* ⨯ marker w corner badge — IEC sectionalizer normally open */}
                <line x1={-18} y1={-9} x2={-12} y2={-3} stroke="#FF333D" strokeWidth={1.8} />
                <line x1={-12} y1={-9} x2={-18} y2={-3} stroke="#FF333D" strokeWidth={1.8} />
                <text x={20} y={2} textAnchor="end" fill="#FF333D" fontFamily={FONT_SANS} fontSize={6} fontWeight={900}>NMO</text>
              </g>
            )}
          </g>
        );
      })()}

      {/* K30-29 round 4: nN feeders count badge always visible (next to code).
       *  Critical dla pixel-by-pixel expert review at all LOD variants. */}
      {props.nnFeedersCount > 0 && (
        <g
          data-testid={`sld-v2-mini-station-nn-count-${props.id}`}
          data-feeders-count={props.nnFeedersCount}
          transform={`translate(28, ${labelNameY - 4})`}
        >
          <rect
            x={-12}
            y={-13}
            width={24}
            height={18}
            rx={2}
            ry={2}
            fill="#0D2818"
            stroke="#4EC9B0"
            strokeWidth={1}
            opacity={0.95}
          />
          <text
            x={0}
            y={1}
            textAnchor="middle"
            fill="#4EC9B0"
            fontFamily={FONT_SANS}
            fontSize={11}
            fontWeight={900}
          >
            {`${props.nnFeedersCount}n`}
          </text>
        </g>
      )}

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
      {/* K30-57: hide name label w overview variant (clutter at zoom-out) */}
      {variant !== 'overview' && (
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
      )}

      {/* K30-15.3: load (L) + DER generation (G) badges per stacja.
       *  Eksploatacyjny diff: stacja z load 100 kW vs ZKSN bez load
       *  vs hybrid PV+BESS 1500 kW visible bezpośrednio. */}
      {props.totalLoadKw && props.totalLoadKw > 0 && (
        <g data-testid={`sld-v2-mini-station-load-${props.id}`} transform={`translate(-28, ${labelNameY + 32})`}>
          <rect x={-22} y={-9} width={44} height={16} rx={2} ry={2} fill="#5A2A1E" stroke="#FF8B5C" strokeWidth={1} />
          <text x={0} y={2} textAnchor="middle" fill="#FF8B5C" fontFamily={FONT_SANS} fontSize={9} fontWeight={900}>
            L {props.totalLoadKw >= 1000 ? `${(props.totalLoadKw / 1000).toFixed(1)}MW` : `${props.totalLoadKw}kW`}
          </text>
        </g>
      )}
      {props.totalGenerationKw != null && props.totalGenerationKw > 0 && (
        <g data-testid={`sld-v2-mini-station-gen-${props.id}`} transform={`translate(28, ${labelNameY + 32})`}>
          <rect x={-22} y={-9} width={44} height={16} rx={2} ry={2} fill="#1E4A2A" stroke="#7EE0B5" strokeWidth={1} />
          <text x={0} y={2} textAnchor="middle" fill="#7EE0B5" fontFamily={FONT_SANS} fontSize={9} fontWeight={900}>
            G {props.totalGenerationKw >= 1000 ? `${(props.totalGenerationKw / 1000).toFixed(1)}MW` : `${props.totalGenerationKw}kW`}
          </text>
        </g>
      )}

      {/* K30-61: shortCode "RMU·P" hidden w overview (rich card już zawiera
          station class info via voltage tint border + code). Pokazane w
          compact/detail variant. */}
      {variant !== 'overview' && (
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
      )}

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

      {/* K30-62: transformer vector group badge per IEC 60076-1 (Dyn5, Yd11).
          Pokazany w detail variant obok TR rated kVA — industrial SLD canon. */}
      {variant === 'detail' && !showPvCircuit && props.transformerVectorGroup && (
        <text
          x={0}
          y={labelPowerY + 12}
          textAnchor="middle"
          fill="#FFD166"
          fontFamily="monospace"
          fontSize={9}
          fontWeight={800}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={2}
          data-testid={`sld-v2-mini-rmu-tr-vector-group-${props.id}`}
        >
          {props.transformerVectorGroup}
        </text>
      )}

      {/* K30-116: earthing scheme badge per PN-EN 60364-1 § 312 (TN/IT/TT).
          OSD wymaga do procedur manewrów + testów impedancji. */}
      {variant !== 'overview' && props.earthingScheme && (
        <g data-testid={`sld-v2-mini-rmu-earthing-scheme-${props.id}`}>
          <rect
            x={-22}
            y={labelPowerY + (props.transformerVectorGroup ? 18 : 6)}
            width={44}
            height={11}
            fill="#0E1822"
            stroke="#7EE0B5"
            strokeWidth={0.8}
            rx={2}
          />
          <text
            x={0}
            y={labelPowerY + (props.transformerVectorGroup ? 26 : 14)}
            textAnchor="middle"
            fill="#7EE0B5"
            fontFamily="monospace"
            fontSize={7}
            fontWeight={800}
            data-earthing-scheme={props.earthingScheme}
          >
            ⏚ {props.earthingScheme}
          </text>
        </g>
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

      {/* K30-57: full DerBadges tylko w compact/detail; overview ma small
          indicator dot wewnątrz station circle (już renderowany powyżej). */}
      {variant !== 'overview' && props.derBadges.length > 0 && (
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
          fill={'#FFC857'}
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
              <>
                <polygon
                  points={`${cx},${cy - 10} ${cx + 8.66},${cy - 5} ${cx + 8.66},${cy + 5} ${cx},${cy + 10} ${cx - 8.66},${cy + 5} ${cx - 8.66},${cy - 5}`}
                  fill={fill}
                  stroke={COLOR_LINE_PRIMARY}
                  strokeWidth={1.2}
                />
                {/* K30-67: IEC 60617 inverter sinusoid wave (PV cell→AC) */}
                <path
                  d={`M ${cx - 5} ${cy} Q ${cx - 2.5} ${cy - 3} ${cx} ${cy} T ${cx + 5} ${cy}`}
                  fill="none"
                  stroke="#0A0E14"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                />
              </>
            )}
            {badge.kind === 'BESS' && (
              <>
                <rect
                  x={cx - 9}
                  y={cy - 9}
                  width={18}
                  height={18}
                  fill={fill}
                  stroke={COLOR_LINE_PRIMARY}
                  strokeWidth={1.2}
                />
                {/* K30-67: IEC 60617 battery inverter sinusoid (DC→AC) */}
                <path
                  d={`M ${cx - 6} ${cy + 4} Q ${cx - 3} ${cy + 1} ${cx} ${cy + 4} T ${cx + 6} ${cy + 4}`}
                  fill="none"
                  stroke="#0A0E14"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                />
                {/* K30-67: dwa pionowe paski = symbol baterii nad sinusoidą */}
                <line x1={cx - 3} y1={cy - 6} x2={cx - 3} y2={cy - 1} stroke="#0A0E14" strokeWidth={1.4} />
                <line x1={cx + 3} y1={cy - 6} x2={cx + 3} y2={cy - 1} stroke="#0A0E14" strokeWidth={1.4} />
              </>
            )}
            {badge.kind === 'FW' && (
              <>
                <polygon
                  points={`${cx},${cy - 10} ${cx + 9},${cy + 6} ${cx - 9},${cy + 6}`}
                  fill={fill}
                  stroke={COLOR_LINE_PRIMARY}
                  strokeWidth={1.2}
                />
                {/* K30-67: śmigło wiatrowe IEC 60617 (3-bladed propeller mini) */}
                <circle cx={cx} cy={cy + 1} r={1.5} fill="#0A0E14" />
                <line x1={cx} y1={cy + 1} x2={cx} y2={cy - 4} stroke="#0A0E14" strokeWidth={1} strokeLinecap="round" />
                <line x1={cx} y1={cy + 1} x2={cx + 4} y2={cy + 4} stroke="#0A0E14" strokeWidth={1} strokeLinecap="round" />
                <line x1={cx} y1={cy + 1} x2={cx - 4} y2={cy + 4} stroke="#0A0E14" strokeWidth={1} strokeLinecap="round" />
              </>
            )}
            <title>{`${badge.kind}: ${badge.count} szt.`}</title>
            {/* K30-67: label przeniesiony pod symbol (IEC 60617 nie ma labels
                wewnątrz symbol — wewnątrz jest sinusoida/strzałka). */}
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              fill={fill}
              fontFamily={FONT_SANS}
              fontSize={8}
              fontWeight={900}
              letterSpacing={0.3}
              paintOrder="stroke"
              stroke="#05070A"
              strokeWidth={2}
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
            {/* K30-55 Phase E: aggregated P_mw (realna moc generacji, nie atrapa) */}
            {typeof badge.totalPMw === 'number' && badge.totalPMw > 0 && (
              <text
                x={cx}
                y={cy + 18}
                textAnchor="middle"
                fill={fill}
                fontFamily="monospace"
                fontSize={8}
                fontWeight={800}
                paintOrder="stroke"
                stroke="#05070A"
                strokeWidth={2}
              >
                {badge.totalPMw >= 1
                  ? `${badge.totalPMw.toFixed(2).replace('.', ',')} MW`
                  : `${Math.round(badge.totalPMw * 1000)} kW`}
              </text>
            )}
            {/* K30-70: connection_variant arrow indicator — pokazuje gdzie DER
                jest podłączony per IEC convention:
                - 'nn'        → strzałka w dół (nN bus) #7DD3FC
                - 'sn'        → strzałka w górę (SN bus) #13C45A
                - 'dedicated' → strzałka kątowa (dedicated MV connection) #FFD166 */}
            {badge.connectionSide && (
              <g
                data-testid={`sld-v2-mini-rmu-der-conn-${badge.kind}-${idx}`}
                data-connection-side={badge.connectionSide}
                transform={`translate(${cx + 8}, ${cy - 8})`}
              >
                <polygon
                  points={
                    badge.connectionSide === 'nn'
                      ? '0,0 4,-4 -4,-4'  // strzałka w dół (do nN)
                      : badge.connectionSide === 'sn'
                        ? '0,-4 4,0 -4,0'  // strzałka w górę (do SN)
                        : '-4,-4 4,-4 -4,4'  // strzałka kątowa (dedicated MV)
                  }
                  fill={
                    badge.connectionSide === 'nn'
                      ? '#7DD3FC'
                      : badge.connectionSide === 'sn'
                        ? '#13C45A'
                        : '#FFD166'
                  }
                  stroke="#0A0E14"
                  strokeWidth={0.6}
                />
              </g>
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

/**
 * K30-40: kolor szyny SN per voltage class w bay-column architecture.
 * Analogous do K30-37 busColorForVoltage (StationOnRunRenderer) i K30-41
 * cableColorForVoltage (CableRunRenderer). Wspólna konwencja OSD:
 * - ≥100 kV (WN) → #E74C3C czerwień
 * - 12-30 kV (SN) → COLOR_BUS_LV (zieleń energized — fallback default)
 * - 5-10 kV (SN niskie) → #0A8D43
 * - 0.2-1 kV (nN) → #7DD3FC
 * - brak / inne → COLOR_BUS_LV (back-compat)
 */
function miniBlockBusColorForVoltage(kv: number | null): string {
  if (kv == null || !Number.isFinite(kv) || kv <= 0) return COLOR_BUS_LV;
  if (kv >= 100) return '#E74C3C';
  if (kv >= 12) return COLOR_BUS_LV;
  if (kv >= 5) return '#0A8D43';
  if (kv >= 0.2) return '#7DD3FC';
  return COLOR_BUS_LV;
}
