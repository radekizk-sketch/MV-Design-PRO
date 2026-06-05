/**
 * SLD V2 — GpzSwitchgearRenderer (Phase 0A operator-grade SCADA-grade rebuild).
 *
 * Wzorowane na ekranach dyspozytorskich SCADA SN/110 kV operatorów (Energa /
 * Tauron / PSE). Renderer pokazuje kanoniczną rozdzielnię GPZ:
 *
 *   ┌─ TR1 (Y na 110 kV, trójkąt na SN) ────── TR2 ──────────────────────┐
 *   │                                                                     │
 *   ════════════════════════════════════════════════════════════════════ S1
 *   │ Pole │ Pole │ Pole │ Pole │ ┌SPRZ┐ │ Pole │ Pole │ Pole │ ...
 *   │ 2    │ 4    │ 6    │ 8    │ │ 15 │ │ 18   │ 24   │ 26   │
 *   │ □    │ □    │ □    │ □    │ │ □  │ │ □    │ □    │ □    │
 *   │ ●    │ ●    │ ●    │ ●    │ │ ●  │ │ ●    │ ●    │ ●    │
 *   │ ▽    │ ▽    │ ▽    │ ▽    │ └────┘ │ ▽    │ ▽    │ ▽    │
 *   │ name │ name │ name │ name │        │ name │ name │ name │
 *   ════════════════════════════════════════════════════════════════════ S2
 *
 * Reguły:
 *   - Każde pole = pionowa kolumna z widocznymi aparatami (CB + DS + cable head).
 *   - Apparat: CB = wypełniony kwadrat, DS = wypełnione kółko, cable head = trójkąt.
 *   - Energized → fill zielony (`COLOR_DEVICE_CLOSED`); de-energized → szary; alarm/open → czerwony.
 *   - Sekcje S1 / S2 mają szerokość wynikającą z liczby pól.
 *   - Sprzęgło sekcyjne = wydzielone pole z innym tłem.
 *   - TR z Y na stronie 110 kV i trójkątem na SN.
 *
 * @see SLD_GPZ_SWITCHGEAR_DEPTH.md
 */

import {
  COLOR_BADGE_BG_YELLOW,
  COLOR_BUS_HV,
  COLOR_BUS_LABEL,
  COLOR_BUS_LV,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_FIELD_TRUNK_ENERGIZED,
  COLOR_FIELD_TRUNK_NEUTRAL,
  COLOR_TR_FLOW_DOWN,
  COLOR_TR_FLOW_UP,
  COLOR_LINE_PRIMARY,
  COLOR_MANIPULATION_BG,
  COLOR_MEASUREMENT_VALUE,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_MUTED,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
  GPZ_GEOMETRY,
  STROKE_BUSBAR_PX,
  STROKE_FIELD_TRACK_PX,
  STROKE_TRUNK_LINE_PX,
} from '../theme/tokens';
import { APPARATUS_KIND, FIELD_ROLE } from '../domain/apparatusContracts';
import { getBayDeviceOrder } from '../domain/bayDeviceOrder';

// =============================================================================
// Geometry constants — wszystkie z GPZ_GEOMETRY (theme/tokens.ts)
// =============================================================================

const TITLE_BAR_HEIGHT = GPZ_GEOMETRY.titleBarHeight;
const HV_TOWER_HEIGHT = GPZ_GEOMETRY.hvTowerHeight;
const TR_RADIUS = GPZ_GEOMETRY.trRadius;
const TR_WINDING_GAP = GPZ_GEOMETRY.trWindingGap;
const TR_HV_LEAD_LEN = GPZ_GEOMETRY.trHvLeadLen;
const TR_LV_LEAD_LEN = GPZ_GEOMETRY.trLvLeadLen;
const SECTION_LABEL_GAP = GPZ_GEOMETRY.sectionLabelGap;
const BAY_COLUMN_WIDTH = GPZ_GEOMETRY.bayColumnWidth;
const BAY_COLUMN_HEIGHT = GPZ_GEOMETRY.bayColumnHeight;
const BAY_HEADER_HEIGHT = GPZ_GEOMETRY.bayHeaderHeight;
const BAY_NUMBER_GAP = GPZ_GEOMETRY.bayNumberGap;

const COUPLER_BAY_WIDTH = GPZ_GEOMETRY.couplerBayWidth;
const COUPLER_BAY_HEIGHT = BAY_COLUMN_HEIGHT;
const COUPLER_LEG_INSET = GPZ_GEOMETRY.couplerLegInset;
const COUPLER_DS_OFFSET_Y = GPZ_GEOMETRY.couplerDsOffsetY;
const COUPLER_HORIZONTAL_OFFSET_Y = GPZ_GEOMETRY.couplerHorizontalOffsetY;
const COUPLER_BAY_NUMBER_OFFSET_Y = GPZ_GEOMETRY.couplerBayNumberOffsetY;
const APPARATUS_PITCH = GPZ_GEOMETRY.apparatusPitch;
const CB_SIZE = GPZ_GEOMETRY.cbSize;
const DS_RADIUS = GPZ_GEOMETRY.dsRadius;
const ES_BRANCH_OFFSET = GPZ_GEOMETRY.esBranchOffset;
const CT_RADIUS = GPZ_GEOMETRY.ctRadius;
const SECTION_BUS_OVERHANG = GPZ_GEOMETRY.sectionBusOverhang;
const VERTICAL_PADDING = GPZ_GEOMETRY.verticalPadding;
const HORIZONTAL_PADDING = GPZ_GEOMETRY.horizontalPadding;

const APPARATUS_COL_X_OFFSET = GPZ_GEOMETRY.apparatusColXOffset;
const BADGE_COL_X_OFFSET = GPZ_GEOMETRY.badgeColXOffset;
const BADGE_WIDTH = GPZ_GEOMETRY.badgeWidth;
const LABEL_CLIP_INSET = GPZ_GEOMETRY.labelClipInset;

const KAS_ROW_HEIGHT = GPZ_GEOMETRY.kasRowHeight;

const MEASUREMENT_ROW_HEIGHT = GPZ_GEOMETRY.measurementRowHeight;
const MEASUREMENT_PANEL_HEADER_HEIGHT = GPZ_GEOMETRY.measurementPanelHeaderHeight;
const MEASUREMENT_FONT_SIZE = FONT_SIZES.measurementPanel;

/**
 * Formatuje napięcie HV bus dla wyświetlenia. Gdy ENM nie niesie wartości
 * liczbowej, pokazuje klasę WN zamiast znaku zastępczego.
 */
function formatHvVoltage(value: number, known: boolean | undefined): string {
  return known === false ? 'WN' : String(value);
}

const OUTGOING_FEEDER_DROP_PX = GPZ_GEOMETRY.outgoingFeederDropPx;
const FIELD_TRUNK_GAP_PX = GPZ_GEOMETRY.fieldTrunkGapPx;
const FIELD_TRUNK_FONT_SIZE = FONT_SIZES.measurementPanel;
const FEEDER_LABEL_FONT_SIZE = FONT_SIZES.feederDestination;
const TRUNK_ARROW_SIZE = GPZ_GEOMETRY.trunkArrowSize;
const OUTGOING_CORRIDOR_LENGTH_PX = 132;
const OUTGOING_CORRIDOR_LANE_PITCH_PX = 30;
const OUTGOING_CORRIDOR_ENDPOINT_SIZE_PX = 7;

// =============================================================================
// Imports from extracted modules
// =============================================================================

import type { Cell } from './GpzSwitchgearLayout';
import {
  computeSwitchgearLayout,
  energizationColor,
  normalizeCouplerState,
  describeCouplerStatePl,
  bayRoleFillColor,
  describeEnergizationPl,
  hasAnyMeasurement,
  formatInteger,
  computeMaxFooterDepth,
  fitTextToWidth,
  collectMeasurementRows,
} from './GpzSwitchgearLayout';
import {
  CtPrimary,
  ApparatusCbSquare,
  ApparatusDsCircle,
  ApparatusCableHead,
  ApparatusEarthingSwitch,
  ApparatusFuse,
  ApparatusSurgeArrester,
  ApparatusSwitchDisconnector,
  ApparatusVtThreePhase,
  ApparatusLvBreaker,
  ApparatusTransformerSymbol,
  QDesignationLabel,
} from './GpzApparatusSymbols';
import {
  BadgeStack,
  KasButton,
  MeasurementPanel,
  GroundFaultMarker,
  ProtectionCodeStack,
} from './GpzBayWidgets';

// Types used internally; all types re-exported at bottom for backward compatibility
import type {
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSwitchgearRendererProps,
  TransformerMeasurements,
} from './GpzSwitchgearTypes';
import {
  gpzApparatusId,
  type GpzApparatusKind,
  type GpzApparatusSelection,
} from './gpzApparatusSelection';
import type { MouseEvent, ReactNode } from 'react';

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export type {
  GpzBayEnergization,
  GpzApparatusSwitchState,
  EarthingSwitchState,
  SecondaryFlagState,
  BaySecondaryFlags,
  BayMeasurements,
  GroundFaultMarkerState,
  GpzBayDescriptor,
  TransformerPowerFlow,
  TransformerMeasurements,
  GpzSectionDescriptor,
  GpzCouplerDescriptor,
  GpzSwitchgearRendererProps,
} from './GpzSwitchgearTypes';

// =============================================================================
// Renderer
// =============================================================================

export function GpzSwitchgearRenderer(props: GpzSwitchgearRendererProps): JSX.Element {
  const sortedSections = [...props.sections].sort((a, b) => a.order - b.order);
  const sortedHvSections = props.hvSections
    ? [...props.hvSections].sort((a, b) => a.order - b.order)
    : [];
  /* `transformerCount` steruje liczbą wież TR (TwoBusTrColumn / HvTowerColumn).
   * Gdy wszystkie transformatory renderują się przez pole TR (adapter pomija
   * wieże), mapper przekazuje `transformerCount: 0` → 0 wież (brak phantomu).
   * Brak propsa (testy bezpośrednie renderera) → fallback 1 (backward-compat). */
  const transformerCount = Math.max(0, props.transformerCount ?? 1);
  const isTwoBus = sortedHvSections.length > 0;
  const layout = computeSwitchgearLayout(sortedSections, props.couplers);
  const hvLayout = isTwoBus
    ? computeSwitchgearLayout(sortedHvSections, props.hvCouplers ?? [])
    : null;

  /* Maksymalna głębokość footera (KAS + panel pomiarowy) wśród wszystkich pól. */
  const footerDepth = computeMaxFooterDepth(sortedSections);
  const hvFooterDepth = isTwoBus ? computeMaxFooterDepth(sortedHvSections) : 0;

  const layoutMaxWidth = Math.max(layout.totalWidth, hvLayout?.totalWidth ?? 0);
  const totalWidth = Math.max(GPZ_GEOMETRY.minSwitchgearWidth, layoutMaxWidth + 2 * HORIZONTAL_PADDING);

  const outgoingFeederCount = sortedSections.reduce(
    (sum, section) => sum + section.bays.filter((bay) => bay.outgoingFeeder).length,
    0,
  );
  /* Czy istnieje przynajmniej jedno pole liniowe SN z wyjściem z głowicy? */
  const hasOutgoingFeeders = isTwoBus && outgoingFeederCount > 0;
  /* Czy renderować opis zbiorczy strefy wyprowadzeń SN. */
  const showFieldTrunk = hasOutgoingFeeders && props.fieldTrunkLabel !== '';
  const fieldTrunkLabel = props.fieldTrunkLabel ?? 'Wyprowadzenia SN';

  const TWO_BUS_TR_GAP = GPZ_GEOMETRY.twoBusTrGap;
  const fieldTrunkZoneHeight = hasOutgoingFeeders
    ? OUTGOING_FEEDER_DROP_PX
      + OUTGOING_CORRIDOR_LANE_PITCH_PX * outgoingFeederCount
      + (showFieldTrunk ? FIELD_TRUNK_GAP_PX + FIELD_TRUNK_FONT_SIZE + 6 : 0)
    : 0;
  const totalHeight = isTwoBus
    ? TITLE_BAR_HEIGHT +
      VERTICAL_PADDING +
      BAY_COLUMN_HEIGHT +
      BAY_NUMBER_GAP +
      hvFooterDepth +
      TWO_BUS_TR_GAP +
      BAY_COLUMN_HEIGHT +
      BAY_NUMBER_GAP +
      footerDepth +
      fieldTrunkZoneHeight +
      VERTICAL_PADDING
    : TITLE_BAR_HEIGHT +
      HV_TOWER_HEIGHT +
      SECTION_LABEL_GAP +
      BAY_COLUMN_HEIGHT +
      BAY_NUMBER_GAP +
      footerDepth +
      VERTICAL_PADDING * 2;

  const stroke = props.selected ? COLOR_SELECTION : COLOR_LINE_PRIMARY;
  const strokeWidth = props.selected ? 2 : 1.5;

  const sectionsBlockY = TITLE_BAR_HEIGHT + HV_TOWER_HEIGHT;
  const busY = sectionsBlockY + SECTION_LABEL_GAP / 2;

  /* Two-bus geometry: HV bus near top, LV bus lower, TR symbols between. */
  const hvBusY = TITLE_BAR_HEIGHT + VERTICAL_PADDING + BAY_COLUMN_HEIGHT;
  const hvBaysBottomY = hvBusY + BAY_NUMBER_GAP + hvFooterDepth;
  const trGapTopY = hvBaysBottomY + 4;
  const trGapBottomY = trGapTopY + TWO_BUS_TR_GAP;
  const lvBusY = trGapBottomY;

  return (
    <g
      data-testid={`sld-v2-gpz-switchgear-${props.id}`}
      data-element-kind="gpz_switchgear"
      data-element-id={props.id}
      data-section-count={String(sortedSections.length)}
      data-bay-count={String(layout.totalBayCount)}
      transform={`translate(${props.x}, ${props.y})`}
      onClick={
        props.onClick
          ? (e) => {
              e.stopPropagation();
              props.onClick?.(props.id);
            }
          : undefined
      }
      style={{ cursor: props.onClick ? 'pointer' : 'default' }}
    >
      {/* Korpus rozdzielni */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={totalHeight}
        fill={COLOR_PANEL_RAISED}
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={4}
        ry={4}
      />

      {/* Tytuł */}
      <text
        x={HORIZONTAL_PADDING}
        y={16}
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={700}
      >
        {props.name}
      </text>
      <text
        x={totalWidth - HORIZONTAL_PADDING}
        y={16}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {formatHvVoltage(props.voltageHighKv, props.voltageHighKvKnown)} / {props.voltageLowKv} kV
      </text>

      {/* Tekst akcji "Kasowanie sygnalizacji zabezpieczeń" — kanon SCADA. */}
      {props.titleBarAction && (
        <text
          x={totalWidth / 2}
          y={16}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
          fontWeight={500}
          data-testid="sld-v2-gpz-switchgear-title-bar-action"
        >
          {props.titleBarAction}
        </text>
      )}

      {isTwoBus && hvLayout ? (
        <>
          {/* === Tryb two-bus: HV bus + HV bays + TR symbols + LV bus + LV bays === */}

          {/* Pozioma szyna 110 kV (HV bus) — kanon SCADA: biały, NIE czerwony.
             Czerwony zarezerwowany dla alarm/zwarcie. */}
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={hvBusY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={hvBusY}
            stroke={COLOR_BUS_HV}
            strokeWidth={STROKE_BUSBAR_PX}
            data-testid="sld-v2-gpz-switchgear-hv-bus"
          />
          <text
            x={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG - 4}
            y={hvBusY + 3}
            textAnchor="end"
            fill={COLOR_BUS_LABEL}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
            data-testid="sld-v2-gpz-switchgear-hv-bus-label-left"
          >
            {`${formatHvVoltage(props.voltageHighKv, props.voltageHighKvKnown)}kV`}
          </text>
          <text
            x={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG + 4}
            y={hvBusY + 3}
            textAnchor="start"
            fill={COLOR_BUS_LABEL}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
            data-testid="sld-v2-gpz-switchgear-hv-bus-label-right"
          >
            {`${formatHvVoltage(props.voltageHighKv, props.voltageHighKvKnown)}kV`}
          </text>

          {/* HV sekcje + sprzęgła + kolumny pól (hangujące w dół z HV bus) */}
          {hvLayout.cells.map((cell) => {
            if (cell.kind === 'bay') {
              return (
                <BayColumn
                  key={`hv-bay-${cell.bay.bayRef}`}
                  x={HORIZONTAL_PADDING + cell.x}
                  busY={hvBusY}
                  bay={cell.bay}
                  voltageKv={cell.busVoltageKv}
                  onClickBay={props.onClickBay}
                  onDoubleClickBay={props.onDoubleClickBay}
                  onContextMenuBay={props.onContextMenuBay}
                  onClickApparatus={props.onClickApparatus}
                  onContextMenuApparatus={props.onContextMenuApparatus}
                  onClickKas={props.onClickKas}
                />
              );
            }
            return (
              <CouplerBay
                key={`hv-coupler-${cell.coupler.couplerId}`}
                x={HORIZONTAL_PADDING + cell.x}
                busY={hvBusY}
                coupler={cell.coupler}
                onClickCoupler={props.onClickCoupler}
                onClickKas={props.onClickKas}
              />
            );
          })}

          {/* HV etykiety sekcji */}
          {hvLayout.sectionLabels.map((label) => (
            <SectionLabel
              key={`hv-label-${label.sectionId}`}
              x={HORIZONTAL_PADDING + label.x}
              y={hvBusY - 4}
              sectionId={label.sectionId}
              text={label.text}
              testId={`sld-v2-gpz-hv-section-label-${label.sectionId}`}
              onClickSection={props.onClickSection}
              onContextMenuSection={props.onContextMenuSection}
            />
          ))}

          {/* TR symbols między HV bays bottom a LV bus */}
          <TwoBusTrColumn
            cx={totalWidth / 2}
            topY={trGapTopY}
            bottomY={trGapBottomY}
            transformerCount={transformerCount}
            voltageHighKv={props.voltageHighKv}
            voltageLowKv={props.voltageLowKv}
            measurements={props.transformerMeasurements}
            transformerRefs={props.transformerRefs}
            onClickTransformer={props.onClickTransformer}
          />

          {/* Pozioma szyna 15 kV (LV bus) — cyan, odróżnia od deviceClosed
             zielonego (kanon SCADA: bus voltage ≠ device state). */}
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={lvBusY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={lvBusY}
            stroke={COLOR_BUS_LV}
            strokeWidth={STROKE_BUSBAR_PX}
            data-testid="sld-v2-gpz-switchgear-lv-bus"
          />
          <text
            x={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG - 4}
            y={lvBusY + 3}
            textAnchor="end"
            fill={COLOR_BUS_LV}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={700}
            data-testid="sld-v2-gpz-switchgear-lv-bus-label-left"
          >
            {`${props.voltageLowKv}kV`}
          </text>
          <text
            x={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG + 4}
            y={lvBusY + 3}
            textAnchor="start"
            fill={COLOR_BUS_LV}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={700}
            data-testid="sld-v2-gpz-switchgear-lv-bus-label-right"
          >
            {`${props.voltageLowKv}kV`}
          </text>

          {/* LV sekcje + sprzęgła + kolumny pól */}
          {layout.cells.map((cell) => {
            if (cell.kind === 'bay') {
              return (
                <BayColumn
                  key={`lv-bay-${cell.bay.bayRef}`}
                  x={HORIZONTAL_PADDING + cell.x}
                  busY={lvBusY}
                  bay={cell.bay}
                  voltageKv={cell.busVoltageKv}
                  onClickBay={props.onClickBay}
                  onDoubleClickBay={props.onDoubleClickBay}
                  onContextMenuBay={props.onContextMenuBay}
                  onClickApparatus={props.onClickApparatus}
                  onContextMenuApparatus={props.onContextMenuApparatus}
                  onClickKas={props.onClickKas}
                />
              );
            }
            return (
              <CouplerBay
                key={`lv-coupler-${cell.coupler.couplerId}`}
                x={HORIZONTAL_PADDING + cell.x}
                busY={lvBusY}
                coupler={cell.coupler}
                onClickCoupler={props.onClickCoupler}
                onClickKas={props.onClickKas}
              />
            );
          })}

          {/* LV etykiety sekcji */}
          {layout.sectionLabels.map((label) => (
            <SectionLabel
              key={`lv-label-${label.sectionId}`}
              x={HORIZONTAL_PADDING + label.x}
              y={lvBusY - 4}
              sectionId={label.sectionId}
              text={label.text}
              testId={`sld-v2-gpz-section-label-${label.sectionId}`}
              onClickSection={props.onClickSection}
              onContextMenuSection={props.onContextMenuSection}
            />
          ))}

          {/* Pola liniowe SN — outgoing feeders w kierunku magistrali */}
          {hasOutgoingFeeders && (
            <FieldTrunkZone
              cells={layout.cells}
              hOffset={HORIZONTAL_PADDING}
              totalWidth={totalWidth}
              lvBaysBottomY={
                lvBusY + BAY_COLUMN_HEIGHT + BAY_NUMBER_GAP + footerDepth
              }
              showTrunk={showFieldTrunk}
              trunkLabel={fieldTrunkLabel}
            />
          )}
        </>
      ) : (
        <>
          {/* === Tryb single-bus (legacy) === */}

          {/* Tor 110 kV → TR(1..N) → szyna SN */}
          <HvTowerColumn
            cx={totalWidth / 2}
            topY={TITLE_BAR_HEIGHT}
            bottomY={busY}
            transformerCount={transformerCount}
            voltageHighKv={props.voltageHighKv}
            voltageLowKv={props.voltageLowKv}
            measurements={props.transformerMeasurements}
            transformerRefs={props.transformerRefs}
            onClickTransformer={props.onClickTransformer}
          />

          {/* Pojedyncza pozioma szyna główna SN — operator-grade rendering */}
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={busY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={busY}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={STROKE_BUSBAR_PX}
            data-testid="sld-v2-gpz-switchgear-main-bus"
          />

          {/* Sekcje + sprzęgła + kolumny pól */}
          {layout.cells.map((cell) => {
            if (cell.kind === 'bay') {
              return (
                <BayColumn
                  key={`bay-${cell.bay.bayRef}`}
                  x={HORIZONTAL_PADDING + cell.x}
                  busY={busY}
                  bay={cell.bay}
                  voltageKv={cell.busVoltageKv}
                  onClickBay={props.onClickBay}
                  onDoubleClickBay={props.onDoubleClickBay}
                  onContextMenuBay={props.onContextMenuBay}
                  onClickApparatus={props.onClickApparatus}
                  onContextMenuApparatus={props.onContextMenuApparatus}
                  onClickKas={props.onClickKas}
                />
              );
            }
            return (
              <CouplerBay
                key={`coupler-${cell.coupler.couplerId}`}
                x={HORIZONTAL_PADDING + cell.x}
                busY={busY}
                coupler={cell.coupler}
                onClickCoupler={props.onClickCoupler}
                onClickKas={props.onClickKas}
              />
            );
          })}

          {/* Etykiety sekcji (S1, S2, ...) — po lewej każdej sekcji nad szyną. */}
          {layout.sectionLabels.map((label) => (
            <SectionLabel
              key={`label-${label.sectionId}`}
              x={HORIZONTAL_PADDING + label.x}
              y={busY - 4}
              sectionId={label.sectionId}
              text={label.text}
              testId={`sld-v2-gpz-section-label-${label.sectionId}`}
              onClickSection={props.onClickSection}
              onContextMenuSection={props.onContextMenuSection}
            />
          ))}
        </>
      )}
    </g>
  );
}

// =============================================================================
// HV Tower (110 kV → TR → SN)
// =============================================================================

interface HvTowerColumnProps {
  cx: number;
  topY: number;
  bottomY: number;
  transformerCount: number;
  voltageHighKv: number;
  voltageLowKv: number;
  measurements?: readonly TransformerMeasurements[];
  transformerRefs?: readonly string[];
  onClickTransformer?: (transformerRef: string) => void;
}

function HvTowerColumn(props: HvTowerColumnProps): JSX.Element {
  const {
    cx,
    topY,
    bottomY,
    transformerCount,
    voltageHighKv,
    voltageLowKv,
    measurements,
    transformerRefs,
    onClickTransformer,
  } = props;

  // 0 transformatorów (wszystkie renderują się przez pole TR) → brak wieży.
  // Pusty `trsX` oznaczałby NaN w poziomej linii zasilania 110 kV poniżej.
  if (transformerCount <= 0) {
    return <g data-testid="sld-v2-gpz-switchgear-hv-tower" data-tr-count="0" />;
  }

  // Rozkład TR: jeśli >1, rozsadzamy poziomo wokół środka.
  const trSpacing = GPZ_GEOMETRY.singleBusTrSpacing;
  const trsX: number[] = [];
  const startX = cx - ((transformerCount - 1) * trSpacing) / 2;
  for (let i = 0; i < transformerCount; i++) {
    trsX.push(startX + i * trSpacing);
  }

  // 110 kV poziome zasilanie nad TR.
  const hvLineY = topY + 8;
  const trTopCenterY = topY + 12 + TR_RADIUS;
  const trBottomCenterY = trTopCenterY + TR_RADIUS + TR_WINDING_GAP + TR_RADIUS;

  return (
    <g data-testid="sld-v2-gpz-switchgear-hv-tower">
      {/* Pozioma 110 kV nad transformatorami */}
      <line
        x1={trsX[0] - TR_HV_LEAD_LEN}
        y1={hvLineY}
        x2={trsX[trsX.length - 1] + TR_HV_LEAD_LEN}
        y2={hvLineY}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_BUSBAR_PX}
        data-testid="sld-v2-gpz-switchgear-hv-feed"
      />
      <text
        x={trsX[trsX.length - 1] + TR_HV_LEAD_LEN + 6}
        y={hvLineY + 3}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {`${voltageHighKv} kV`}
      </text>

      {trsX.map((trX, idx) => {
        const transformerRef = transformerRefs?.[idx];
        const trClickable = Boolean(transformerRef && onClickTransformer);
        return (
        <g
          key={`tr-${idx}`}
          data-testid={transformerRef ? `gpz-canonical-transformer-${transformerRef}` : 'sld-v2-gpz-switchgear-transformer-symbol'}
          data-tr-index={String(idx)}
          data-element-kind={transformerRef ? 'transformer' : undefined}
          data-element-id={transformerRef}
          data-transformer-ref={transformerRef}
          onClick={
            trClickable
              ? (e) => {
                  e.stopPropagation();
                  onClickTransformer?.(transformerRef!);
                }
              : undefined
          }
          style={{ cursor: trClickable ? 'pointer' : 'default' }}
        >
          {/* Pionowy łącznik 110 kV → TR */}
          <line
            x1={trX}
            y1={hvLineY}
            x2={trX}
            y2={trTopCenterY - TR_RADIUS}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={STROKE_FIELD_TRACK_PX}
          />

          {/* Y na stronie 110 kV (kanon SCADA: gwiazda HV) */}
          <YNodeMarker cx={trX} cy={trTopCenterY - TR_RADIUS - 2} />

          {/* Dwa sprzężone okręgi (IEC 60617 Yy) */}
          <circle
            cx={trX}
            cy={trTopCenterY}
            r={TR_RADIUS}
            fill={COLOR_PANEL_RAISED}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />
          <circle
            cx={trX}
            cy={trBottomCenterY}
            r={TR_RADIUS}
            fill={COLOR_PANEL_RAISED}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />

          {/* Trójkąt na stronie SN (kanon SCADA: trójkąt LV) */}
          <DeltaNodeMarker cx={trX} cy={trBottomCenterY + TR_RADIUS + 2} />

          {/* Etykieta TR po prawej */}
          <text
            x={trX + TR_RADIUS + 5}
            y={(trTopCenterY + trBottomCenterY) / 2 + 3}
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
          >
            TR{idx + 1}
          </text>
          <text
            x={trX + TR_RADIUS + 5}
            y={(trTopCenterY + trBottomCenterY) / 2 + 3 + 11}
            fill={COLOR_TEXT_MUTED}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel - 1}
          >
            {`${voltageHighKv}/${voltageLowKv}`}
          </text>

          {/* Strzałka kierunku przepływu (kanon SCADA: nad TR) */}
          {measurements?.[idx]?.flow && measurements[idx].flow !== 'none' && (
            <TransformerFlowArrow
              cx={trX - TR_RADIUS - 6}
              cy={(trTopCenterY + trBottomCenterY) / 2}
              direction={measurements[idx].flow as 'up' | 'down'}
              trIndex={idx}
            />
          )}

          {/* Panel pomiarów TR (Temp. oleju / Uarn / NZACZ / MVA). Przy >1 TR
             panele rozkładamy na ZEWNĄTRZ (lewy TR → w lewo, prawy TR → w prawo),
             żeby nie kolidowały w środku między transformatorami.
             Pojedynczy TR: align='right' → cały blok label/value kończy się na x
             i wyrasta w LEWO, więc nie nachodzi na okręgi uzwojeń (anty-kolizja
             D3: poprzednio "MVA 25" lądowało na dolnym okręgu). */}
          {measurements?.[idx] && (
            <TransformerMeasurementPanel
              x={
                transformerCount <= 1
                  ? trX - TR_RADIUS - 12
                  : idx >= transformerCount / 2
                    ? trX + TR_RADIUS + 10
                    : trX - TR_RADIUS - 10
              }
              y={(trTopCenterY + trBottomCenterY) / 2 + TR_RADIUS + 16}
              data={measurements[idx]}
              trIndex={idx}
              align={
                transformerCount <= 1 ? 'right' : idx >= transformerCount / 2 ? 'left' : 'right'
              }
            />
          )}

          {/* Pionowy łącznik trójkąt → szyna SN */}
          <line
            x1={trX}
            y1={trBottomCenterY + TR_RADIUS + TR_LV_LEAD_LEN}
            x2={trX}
            y2={bottomY}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={STROKE_FIELD_TRACK_PX}
          />
        </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// Strefa wyprowadzeń pól liniowych SN
// =============================================================================

interface FieldTrunkZoneProps {
  /** Cells z layoutu LV (zawiera bays + couplery z pozycjami x). */
  readonly cells: readonly Cell[];
  /** Poziome offset dla wszystkich pozycji (HORIZONTAL_PADDING). */
  readonly hOffset: number;
  /** Pełna szerokość rozdzielni, potrzebna do antykolizyjnego zawracania opisów. */
  readonly totalWidth: number;
  /** Y pozycja dolnej krawędzi LV bays (po footerze) — start zone. */
  readonly lvBaysBottomY: number;
  /** Czy renderować opis zbiorczy strefy wyprowadzeń. */
  readonly showTrunk: boolean;
  /** Etykieta strefy wyprowadzeń, np. "Wyprowadzenia SN". */
  readonly trunkLabel: string;
}

/**
 * Renderuje strefę wyprowadzeń sieci terenowej z głowic pól SN.
 *
 * Każde pole liniowe SN z `outgoingFeeder` dostaje własny korytarz:
 * pion wychodzi z osi głowicy kablowej, potem krótki odcinek poziomy prowadzi
 * do lokalnego punktu zakończenia. Nie ma wspólnej kreski pod rozdzielnią,
 * bo taka kreska wygląda jak elektryczne połączenie wszystkich głowic.
 */
function FieldTrunkZone(props: FieldTrunkZoneProps): JSX.Element {
  const { cells, hOffset, totalWidth, lvBaysBottomY, showTrunk, trunkLabel } = props;
  const firstLaneY = lvBaysBottomY + OUTGOING_FEEDER_DROP_PX;

  /* Zbieramy pola z wyjściem z głowicy oraz ich oś głowicy kablowej. */
  const feederColumns = cells
    .filter((cell): cell is Extract<Cell, { kind: 'bay' }> => cell.kind === 'bay')
    .filter((cell) => cell.bay.outgoingFeeder !== undefined)
    .map((cell) => ({
      bay: cell.bay,
      cx: hOffset + cell.x + APPARATUS_COL_X_OFFSET,
    }));

  if (feederColumns.length === 0) {
    return <g data-testid="sld-v2-gpz-field-trunk-zone" data-feeder-count="0" />;
  }

  return (
    <g
      data-testid="sld-v2-gpz-field-trunk-zone"
      data-feeder-count={String(feederColumns.length)}
      data-trunk-visible={showTrunk ? 'true' : 'false'}
    >
      {feederColumns.map((col, index) => {
        const feeder = col.bay.outgoingFeeder!;
        const energized = feeder.energized; // może być undefined
        const stroke =
          energized === true
            ? COLOR_FIELD_TRUNK_ENERGIZED
            : energized === false
            ? COLOR_TEXT_MUTED
            : COLOR_FIELD_TRUNK_NEUTRAL;
        const laneY = firstLaneY + index * OUTGOING_CORRIDOR_LANE_PITCH_PX;
        const canGoRight =
          col.cx + OUTGOING_CORRIDOR_LENGTH_PX + HORIZONTAL_PADDING <= totalWidth;
        const direction = canGoRight ? 1 : -1;
        const endX = col.cx + direction * OUTGOING_CORRIDOR_LENGTH_PX;
        const labelAnchor = direction === 1 ? 'start' : 'end';
        const labelX = endX + direction * 10;
        const arrowMidY = (lvBaysBottomY + laneY) / 2;
        const typeLabel = feeder.catalogLabel ?? 'brak typu katalogowego';
        const technicalLabel = [typeLabel, feeder.segmentLengthLabel]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join(' · ');
        return (
          <g
            key={`feeder-${col.bay.bayRef}`}
            data-testid={`sld-v2-gpz-outgoing-feeder-${col.bay.bayRef}`}
            data-feeder-energized={
              energized === true ? 'true' : energized === false ? 'false' : 'unknown'
            }
            data-lane-index={String(index)}
            data-cable-head-x={String(col.cx)}
            data-end-x={String(endX)}
          >
            <line
              x1={col.cx}
              y1={lvBaysBottomY}
              x2={col.cx}
              y2={laneY}
              stroke={stroke}
              strokeWidth={STROKE_FIELD_TRACK_PX}
              data-testid={`sld-v2-gpz-outgoing-feeder-drop-${col.bay.bayRef}`}
            />
            <polygon
              points={`${col.cx},${arrowMidY + TRUNK_ARROW_SIZE} ${col.cx - TRUNK_ARROW_SIZE * 0.7},${arrowMidY - TRUNK_ARROW_SIZE * 0.5} ${col.cx + TRUNK_ARROW_SIZE * 0.7},${arrowMidY - TRUNK_ARROW_SIZE * 0.5}`}
              fill={stroke}
              stroke={stroke}
              strokeWidth={0.5}
              data-testid={`sld-v2-gpz-outgoing-feeder-arrow-${col.bay.bayRef}`}
            />
            <line
              x1={col.cx}
              y1={laneY}
              x2={endX}
              y2={laneY}
              stroke={stroke}
              strokeWidth={STROKE_TRUNK_LINE_PX}
              strokeLinecap="round"
              data-testid={`sld-v2-gpz-outgoing-feeder-corridor-${col.bay.bayRef}`}
            />
            <rect
              x={endX - OUTGOING_CORRIDOR_ENDPOINT_SIZE_PX / 2}
              y={laneY - OUTGOING_CORRIDOR_ENDPOINT_SIZE_PX / 2}
              width={OUTGOING_CORRIDOR_ENDPOINT_SIZE_PX}
              height={OUTGOING_CORRIDOR_ENDPOINT_SIZE_PX}
              fill={COLOR_PANEL}
              stroke={stroke}
              strokeWidth={2}
              data-testid={`sld-v2-gpz-outgoing-feeder-endpoint-${col.bay.bayRef}`}
            />
            <text
              x={labelX}
              y={laneY - 5}
              textAnchor={labelAnchor}
              fill={energized === false ? COLOR_TEXT_MUTED : COLOR_TEXT_PRIMARY}
              fontFamily={FONT_SANS}
              fontSize={FEEDER_LABEL_FONT_SIZE}
              fontWeight={600}
              data-testid={`sld-v2-gpz-outgoing-feeder-destination-${col.bay.bayRef}`}
            >
              {feeder.destination}
            </text>
            {technicalLabel && (
              <text
                x={labelX}
                y={laneY + 11}
                textAnchor={labelAnchor}
                fill={COLOR_TEXT_MUTED}
                fontFamily={FONT_MONO}
                fontSize={FEEDER_LABEL_FONT_SIZE - 1}
                data-testid={`sld-v2-gpz-outgoing-feeder-parameters-${col.bay.bayRef}`}
              >
                {technicalLabel}
              </text>
            )}
            {feeder.feederNumber && (
              <text
                x={labelX}
                y={laneY + (technicalLabel ? 24 : 11)}
                textAnchor={labelAnchor}
                fill={COLOR_TEXT_MUTED}
                fontFamily={FONT_MONO}
                fontSize={FEEDER_LABEL_FONT_SIZE - 1}
                data-testid={`sld-v2-gpz-outgoing-feeder-number-${col.bay.bayRef}`}
              >
                {feeder.feederNumber}
              </text>
            )}
          </g>
        );
      })}

      {showTrunk && (
        <text
          x={HORIZONTAL_PADDING}
          y={firstLaneY + feederColumns.length * OUTGOING_CORRIDOR_LANE_PITCH_PX + FIELD_TRUNK_GAP_PX}
          textAnchor="start"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel - 1}
          fontWeight={600}
          data-testid="sld-v2-gpz-field-trunk-label"
        >
          {trunkLabel}
        </text>
      )}
    </g>
  );
}

// =============================================================================
// Two-Bus TR Column (TR symbols między HV bus a LV bus, bez 110 kV feed line)
// =============================================================================

interface TwoBusTrColumnProps {
  cx: number;
  topY: number;
  bottomY: number;
  transformerCount: number;
  voltageHighKv: number;
  voltageLowKv: number;
  measurements?: readonly TransformerMeasurements[];
  transformerRefs?: readonly string[];
  onClickTransformer?: (transformerRef: string) => void;
}

/**
 * Renderuje stos TR symboli między HV bus a LV bus dla two-bus topology.
 *
 * Każdy TR ma:
 *   - pionowy łącznik z HV bus (topY) do TR symbol
 *   - dwa okręgi (Y/Δ kanon IEC)
 *   - pionowy łącznik z TR do LV bus (bottomY)
 *   - opcjonalnie: panel pomiarów + flow arrow + etykieta MVA
 */
function TwoBusTrColumn(props: TwoBusTrColumnProps): JSX.Element {
  const {
    cx,
    topY,
    bottomY,
    transformerCount,
    voltageHighKv,
    voltageLowKv,
    measurements,
    transformerRefs,
    onClickTransformer,
  } = props;
  // 0 transformatorów (wszystkie renderują się przez pole TR) → brak wieży.
  if (transformerCount <= 0) {
    return <g data-testid="sld-v2-gpz-switchgear-two-bus-tr-column" data-tr-count="0" />;
  }

  const trSpacing = GPZ_GEOMETRY.twoBusTrSpacing;
  const trsX: number[] = [];
  const startX = cx - ((transformerCount - 1) * trSpacing) / 2;
  for (let i = 0; i < transformerCount; i++) {
    trsX.push(startX + i * trSpacing);
  }
  const trCenterY = (topY + bottomY) / 2;
  const trTopCenterY = trCenterY - (TR_RADIUS + TR_WINDING_GAP / 2);
  const trBottomCenterY = trCenterY + (TR_RADIUS + TR_WINDING_GAP / 2);

  return (
    <g data-testid="sld-v2-gpz-switchgear-two-bus-tr-column">
      {trsX.map((trX, idx) => {
        const transformerRef = transformerRefs?.[idx];
        const trClickable = Boolean(transformerRef && onClickTransformer);
        return (
        <g
          key={`twobus-tr-${idx}`}
          data-testid={transformerRef ? `gpz-canonical-transformer-${transformerRef}` : 'sld-v2-gpz-switchgear-transformer-symbol'}
          data-tr-index={String(idx)}
          data-element-kind={transformerRef ? 'transformer' : undefined}
          data-element-id={transformerRef}
          data-transformer-ref={transformerRef}
          onClick={
            trClickable
              ? (e) => {
                  e.stopPropagation();
                  onClickTransformer?.(transformerRef!);
                }
              : undefined
          }
          style={{ cursor: trClickable ? 'pointer' : 'default' }}
        >
          {/* Pionowy łącznik z HV bus do TR góra */}
          <line
            x1={trX}
            y1={topY}
            x2={trX}
            y2={trTopCenterY - TR_RADIUS}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={STROKE_FIELD_TRACK_PX}
          />

          {/* Y na stronie 110 kV */}
          <YNodeMarker cx={trX} cy={trTopCenterY - TR_RADIUS - 2} />

          {/* Dwa sprzężone okręgi */}
          <circle
            cx={trX}
            cy={trTopCenterY}
            r={TR_RADIUS}
            fill={COLOR_PANEL_RAISED}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />
          <circle
            cx={trX}
            cy={trBottomCenterY}
            r={TR_RADIUS}
            fill={COLOR_PANEL_RAISED}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />

          {/* Trójkąt na stronie SN */}
          <DeltaNodeMarker cx={trX} cy={trBottomCenterY + TR_RADIUS + 2} />

          {/* Pionowy łącznik z TR dół do LV bus */}
          <line
            x1={trX}
            y1={trBottomCenterY + TR_RADIUS + 4}
            x2={trX}
            y2={bottomY}
            stroke={COLOR_DEVICE_CLOSED}
            strokeWidth={STROKE_FIELD_TRACK_PX}
          />

          {/* Etykieta TR + MVA po prawej */}
          <text
            x={trX + TR_RADIUS + 5}
            y={trCenterY + 3}
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
          >
            TR{idx + 1}
          </text>
          {measurements?.[idx]?.apparentMva !== undefined && (
            <text
              x={trX + TR_RADIUS + 5}
              y={trCenterY + 14}
              fill={COLOR_TEXT_SECONDARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.technicalPanel - 1}
              fontWeight={500}
              data-testid={`sld-v2-gpz-tr-mva-label-${idx}`}
            >
              {`${measurements[idx].apparentMva!.toFixed(0)}MVA`}
            </text>
          )}
          {!measurements?.[idx]?.apparentMva && (
            <text
              x={trX + TR_RADIUS + 5}
              y={trCenterY + 14}
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.technicalPanel - 1}
            >
              {`${voltageHighKv}/${voltageLowKv}`}
            </text>
          )}

          {/* Flow arrow (z lewej strony TR) */}
          {measurements?.[idx]?.flow && measurements[idx].flow !== 'none' && (
            <TransformerFlowArrow
              cx={trX - TR_RADIUS - 6}
              cy={trCenterY}
              direction={measurements[idx].flow as 'up' | 'down'}
              trIndex={idx}
            />
          )}

          {/* Panel pomiarów po lewej */}
          {measurements?.[idx] && (
            <TransformerMeasurementPanel
              x={trX - TR_RADIUS - 12}
              y={trCenterY - 6}
              data={measurements[idx]}
              trIndex={idx}
            />
          )}
        </g>
        );
      })}
    </g>
  );
}

interface NodeMarkerProps {
  cx: number;
  cy: number;
}

/** Y (gwiazda) — kanoniczny marker strony 110 kV transformatora.
 *  Powiększony do `trMarkerArmLen` z `trMarkerStrokeWidth` dla operator-grade
 *  czytelności (ekran 24" 1920×1080, dystans 60 cm). */
function YNodeMarker(props: NodeMarkerProps): JSX.Element {
  const { cx, cy } = props;
  const armLen = GPZ_GEOMETRY.trMarkerArmLen;
  const sw = GPZ_GEOMETRY.trMarkerStrokeWidth;
  return (
    <g data-testid="sld-v2-gpz-tr-y-marker">
      <line x1={cx} y1={cy} x2={cx} y2={cy - armLen} stroke={COLOR_LINE_PRIMARY} strokeWidth={sw} />
      <line x1={cx} y1={cy} x2={cx - armLen * 0.86} y2={cy + armLen * 0.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={sw} />
      <line x1={cx} y1={cy} x2={cx + armLen * 0.86} y2={cy + armLen * 0.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={sw} />
    </g>
  );
}

/** Trójkąt — kanoniczny marker strony SN transformatora. */
function DeltaNodeMarker(props: NodeMarkerProps): JSX.Element {
  const { cx, cy } = props;
  const size = GPZ_GEOMETRY.trMarkerArmLen;
  const sw = GPZ_GEOMETRY.trMarkerStrokeWidth;
  return (
    <g data-testid="sld-v2-gpz-tr-delta-marker">
      <polygon
        points={`${cx},${cy + size} ${cx - size * 0.86},${cy - size * 0.5} ${cx + size * 0.86},${cy - size * 0.5}`}
        fill="none"
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={sw}
      />
    </g>
  );
}

interface TransformerFlowArrowProps {
  readonly cx: number;
  readonly cy: number;
  readonly direction: 'up' | 'down';
  readonly trIndex: number;
}

/**
 * Strzałka kierunku przepływu mocy transformatora.
 * `up`   → moc z SN do 110 kV (eksport, zwykle żółta)
 * `down` → moc z 110 kV do SN (import, zwykle magenta)
 */
function TransformerFlowArrow(props: TransformerFlowArrowProps): JSX.Element {
  const { cx, cy, direction, trIndex } = props;
  /* Up=eksport (żółty), down=import (magenta). Rozdzielone tokeny żeby
   * zmiana KAS LED color nie pociągała za sobą zmiany flow arrow. */
  const fill = direction === 'up' ? COLOR_TR_FLOW_UP : COLOR_TR_FLOW_DOWN;
  const size = TRUNK_ARROW_SIZE;
  const tipY = direction === 'up' ? cy - size : cy + size;
  const baseY = direction === 'up' ? cy + size : cy - size;
  return (
    <g
      data-testid={`sld-v2-gpz-tr-flow-arrow-${trIndex}`}
      data-flow-direction={direction}
    >
      <polygon
        points={`${cx},${tipY} ${cx - size * 0.86},${baseY} ${cx + size * 0.86},${baseY}`}
        fill={fill}
        stroke={fill}
        strokeWidth={0.5}
      />
    </g>
  );
}

interface TransformerMeasurementPanelProps {
  readonly x: number;
  readonly y: number;
  readonly data: TransformerMeasurements;
  readonly trIndex: number;
  /**
   * Wyrównanie bloku label/value względem `x`.
   *   - `undefined` → kanon dla pojedynczego TR: label kończy się na x, value od x (środek).
   *   - `'left'`    → blok wyrasta w PRAWO od x (panel po prawej stronie TR).
   *   - `'right'`   → blok kończy się na x, wyrasta w LEWO (panel po lewej stronie TR).
   */
  readonly align?: 'left' | 'right';
}

/**
 * Panel pomiarów transformatora (Temp. oleju / Uarn / NZACZ / MVA).
 * Renderowany po lewej stronie symbolu TR jako stos label/value.
 */
function TransformerMeasurementPanel(props: TransformerMeasurementPanelProps): JSX.Element {
  const { x, y, data, trIndex, align } = props;
  // Szerokości kolumn dla wyrównania zewnętrznego (label | value).
  // LABEL_COL_W mieści najszerszą etykietę „Temp. oleju" przy font 10 px.
  const LABEL_COL_W = 62;
  const VALUE_COL_W = 30;
  const labelX = align === 'right' ? x - VALUE_COL_W : x;
  const labelAnchor: 'start' | 'end' = align === 'left' ? 'start' : 'end';
  const valueX = align === 'left' ? x + LABEL_COL_W : align === 'right' ? x : x + 4;
  const valueAnchor: 'start' | 'end' = align === 'right' ? 'end' : 'start';
  const rows: { label: string; value: string; testId: string }[] = [];
  if (data.oilTemperatureC !== undefined) {
    rows.push({
      label: 'Temp. oleju',
      value: data.oilTemperatureC.toFixed(1),
      testId: 'oil-temp',
    });
  }
  if (data.uarnKv !== undefined) {
    rows.push({
      label: 'Uarn',
      value: data.uarnKv.toFixed(1),
      testId: 'uarn',
    });
  }
  if (data.nzacz) {
    rows.push({
      label: 'NZACZ',
      value: data.nzacz,
      testId: 'nzacz',
    });
  }
  if (data.apparentMva !== undefined) {
    rows.push({
      label: 'MVA',
      value: data.apparentMva.toFixed(0),
      testId: 'mva',
    });
  }
  if (rows.length === 0) {
    return <g data-testid={`sld-v2-gpz-tr-measurements-${trIndex}`} />;
  }
  return (
    <g data-testid={`sld-v2-gpz-tr-measurements-${trIndex}`}>
      {rows.map((row, idx) => {
        const rowY = y + idx * MEASUREMENT_ROW_HEIGHT;
        return (
          <g
            key={row.testId}
            data-testid={`sld-v2-gpz-tr-measurement-${row.testId}-${trIndex}`}
          >
            <text
              x={labelX}
              y={rowY}
              textAnchor={labelAnchor}
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.label}
            </text>
            <text
              x={valueX}
              y={rowY}
              textAnchor={valueAnchor}
              fill={COLOR_MEASUREMENT_VALUE}
              fontFamily={FONT_MONO}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// =============================================================================
// Apparatus interaction wrapper (kanon lustrzany do GpzCanonicalRenderer)
// =============================================================================

/** Wiązka callbacków interakcji aparatu — przekazywana w głąb pól. */
interface BayApparatusHandlers {
  readonly onClickApparatus?: (selection: GpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (
    selection: GpzApparatusSelection,
    evt: { clientX: number; clientY: number },
  ) => void;
}

interface ClickableApparatusGroupProps extends BayApparatusHandlers {
  readonly bayRef: string;
  readonly kind: GpzApparatusKind;
  readonly designation: string | null;
  readonly labelPl: string;
  readonly children: ReactNode;
}

/**
 * Owija symbol aparatu w grupę z kanonicznymi `data-*` atrybutami oraz
 * handlerami klik/menu emitującymi `GpzApparatusSelection`. `stopPropagation`
 * zapobiega temu, by klik aparatu odpalił też klik całego pola (mirror
 * komentarza CB-vs-bay w legacy).
 */
function ClickableApparatusGroup(props: ClickableApparatusGroupProps): JSX.Element {
  const { bayRef, kind, designation, labelPl, onClickApparatus, onContextMenuApparatus } = props;
  const id = gpzApparatusId(bayRef, kind);
  const selection: GpzApparatusSelection = {
    apparatusId: id,
    bayRef,
    apparatusKind: kind,
    designation: designation ?? null,
    labelPl,
  };
  const handleClick = onClickApparatus
    ? (e: MouseEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        onClickApparatus(selection);
      }
    : undefined;
  const handleContextMenu = onContextMenuApparatus
    ? (e: MouseEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenuApparatus(selection, { clientX: e.clientX, clientY: e.clientY });
      }
    : undefined;
  const interactive = Boolean(onClickApparatus || onContextMenuApparatus);
  return (
    <g
      data-element-kind="apparatus"
      data-element-id={id}
      data-apparatus-kind={kind}
      data-apparatus-label={labelPl}
      data-designation-present={designation ? 'true' : 'false'}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
    >
      {props.children}
    </g>
  );
}

// =============================================================================
// Section label (etykieta sekcji + interakcja sekcji)
// =============================================================================

interface SectionLabelProps {
  readonly x: number;
  readonly y: number;
  readonly sectionId: string;
  readonly text: string;
  readonly testId: string;
  readonly onClickSection?: (sectionId: string) => void;
  readonly onContextMenuSection?: (sectionId: string, evt: { clientX: number; clientY: number }) => void;
}

/**
 * Etykieta sekcji renderowana nad szyną. Pełni rolę uchwytu interakcji
 * sekcji (klik + menu kontekstowe), bo szyna `<line>` jest współdzielona
 * przez wszystkie sekcje i nie niesie pojedynczego `sectionId`.
 */
function SectionLabel(props: SectionLabelProps): JSX.Element {
  const { x, y, sectionId, text, testId, onClickSection, onContextMenuSection } = props;
  const interactive = Boolean(onClickSection || onContextMenuSection);
  return (
    <text
      x={x}
      y={y}
      fill={COLOR_TEXT_SECONDARY}
      fontFamily={FONT_SANS}
      fontSize={FONT_SIZES.technicalPanel}
      fontWeight={700}
      data-testid={testId}
      onClick={
        onClickSection
          ? (e) => {
              e.stopPropagation();
              onClickSection(sectionId);
            }
          : undefined
      }
      onContextMenu={
        onContextMenuSection
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenuSection(sectionId, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
      style={{ cursor: interactive ? 'pointer' : 'default' }}
    >
      {text}
    </text>
  );
}

// =============================================================================
// Bay column (widoczna kolumna pola SCADA-grade)
// =============================================================================

interface BayColumnProps extends BayApparatusHandlers {
  x: number;
  busY: number;
  bay: GpzBayDescriptor;
  voltageKv: number;
  onClickBay?: (bayRef: string) => void;
  onDoubleClickBay?: (bayRef: string) => void;
  onContextMenuBay?: (bayRef: string, evt: { clientX: number; clientY: number }) => void;
  onClickKas?: (bayRef: string) => void;
}

function BayColumn(props: BayColumnProps): JSX.Element {
  const {
    x,
    busY,
    bay,
    onClickBay,
    onDoubleClickBay,
    onContextMenuBay,
    onClickKas,
    onClickApparatus,
    onContextMenuApparatus,
  } = props;
  /* Oznaczenie odłącznika liniowego dla selekcji: preferuj nowy alias
   * `dsLin`, w razie braku użyj legacy `ds`. */
  const dsLinDesignation = bay.qDesignations?.dsLin ?? bay.qDesignations?.ds ?? null;
  /* INVARIANT 9 + anti-pattern §15.1 (audyt system): brak danych ≠ default
   * 'closed'. Renderer NIE może hardkodować stanów aparatów — gdy adapter
   * nie dostarczył runtime telemetry, renderer pokazuje neutral 'unknown'
   * (szary), NIE zafałszowane 'closed' (zielone). */
  const energization = bay.energization ?? 'unknown';
  const cbState = bay.cbState ?? 'unknown';
  const dsState = bay.dsState ?? 'unknown';

  /* INVARIANT 13 (audyt MV BLOCKER-1+15, 3-ci audyt SLD §C.1): renderer
   * iteruje BAY_DEVICE_ORDER_POLICY w PEŁNI — wszystkie 12 typów ApparatusKind
   * mają whitelist boolean flag. Polityka kontroluje symbole, NIE renderer. */
  const slots = getBayDeviceOrder(bay.fieldRole);
  const hasSlot = (kind: typeof APPARATUS_KIND[keyof typeof APPARATUS_KIND]): boolean =>
    slots.some((s) => s.apparatusKind === kind);
  const showCb = hasSlot(APPARATUS_KIND.CIRCUIT_BREAKER);
  const showDsCircle = hasSlot(APPARATUS_KIND.DISCONNECTOR);
  const showSwitchDisconnector = hasSlot(APPARATUS_KIND.SWITCH_DISCONNECTOR);
  const showCt = hasSlot(APPARATUS_KIND.CT);
  const showEs = hasSlot(APPARATUS_KIND.EARTHING_SWITCH);
  const showCableHead = hasSlot(APPARATUS_KIND.CABLE_HEAD);
  const showFuse = hasSlot(APPARATUS_KIND.FUSE);
  const showSurgeArrester = hasSlot(APPARATUS_KIND.SURGE_ARRESTER);
  const showTransformer = hasSlot(APPARATUS_KIND.TRANSFORMER);
  const showLvBreaker = hasSlot(APPARATUS_KIND.LV_BREAKER);
  /* VT trójfazowy renderowany dla pól z VT na MAIN_AXIS (MEASUREMENT).
   * Pola GPZ_LINE_BAY mają VT na LATERAL_BRANCH (opcjonalnie) — placeholder
   * pomijany. */
  const showVt = hasSlot(APPARATUS_KIND.VT)
    && slots.some((s) => s.apparatusKind === APPARATUS_KIND.VT && s.position === 'MAIN_AXIS');
  const energizedColor = energizationColor(energization);
  const trackColor = bay.hasMissingRequiredDevice ? '#FFB020' : energizedColor;
  const apparatusCx = x + APPARATUS_COL_X_OFFSET;

  /* Y-kursor: kolumna jest hanging-DOWN, busY = górna krawędź. */
  const headerY = busY + 2;
  const bodyTopY = headerY + BAY_HEADER_HEIGHT + 2;
  /* DS_BUS (Q1) — odłącznik szynowy, przed CB (kanon polskiego pola liniowego).
   * Renderowany TYLKO gdy bay.qDesignations.dsBus jest dostarczone (zwykle dla
   * pól GPZ/LINE_*; pola RMU/COUPLER/MEASUREMENT bez Q1). */
  /* K30-113: unified APPARATUS_PITCH (18 px) per audyt #1 MAJOR + #4 MEDIUM.
   * Poprzednio multiplier 0.7/0.85 powodował inconsistent spacing (12.6/15.3).
   * Operator dyspozytorni widział "skurczenia" pomiędzy aparatami. */
  const dsBusY = bodyTopY + 4;
  const cbY = bay.qDesignations?.dsBus ? dsBusY + APPARATUS_PITCH : bodyTopY + 8;
  const ctY = cbY + APPARATUS_PITCH;
  const dsY = ctY + APPARATUS_PITCH;
  const triangleY = dsY + APPARATUS_PITCH;
  const columnBottomY = busY + BAY_COLUMN_HEIGHT;

  /* Tło kolumny — manipulation ma pierwszeństwo, potem per-role color
   * (audyt SLD §D.3 fix 10/12: operator szybko odróżnia klasę pola). */
  /* K30-112: hasMissingRequiredDevice MUSI mieć distinct background — audyt #4 HIGH.
   * Operator nie może pomylić niekompletnego pola z gotowym (safety-critical). */
  const columnFill = bay.hasMissingRequiredDevice
    ? '#3A2A2A' // dark red tint dla niekompletnego pola
    : bay.inManipulation
    ? COLOR_MANIPULATION_BG
    : bayRoleFillColor(bay.fieldRole);
  /* K30-112: missing device → czerwona obwódka dashed (visual cue dla operatora).
   * K30-123 audyt fix: brighter red #FF1744 (contrast ~3.5:1 na #3A2A2A bg
   * vs 1.2:1 dla #FF4D4D — WCAG AA compliance). */
  const columnStroke = bay.hasMissingRequiredDevice
    ? '#FF1744'
    : bay.inManipulation
    ? COLOR_BADGE_BG_YELLOW
    : COLOR_TEXT_MUTED;
  const columnStrokeOpacity = bay.hasMissingRequiredDevice || bay.inManipulation ? 0.95 : 0.3;
  const columnStrokeDasharray = bay.hasMissingRequiredDevice ? '4 2' : undefined;

  /* Footer (numer pola + KAS + pomiary). */
  const numberY = columnBottomY + BAY_NUMBER_GAP - 2;
  const kasY = numberY + KAS_ROW_HEIGHT;
  const measurementHeaderY = bay.hasKasButton ? kasY + KAS_ROW_HEIGHT : numberY + KAS_ROW_HEIGHT;

  return (
    <g
      data-testid={`sld-v2-gpz-bay-${bay.bayRef}`}
      data-bay-ref={bay.bayRef}
      data-field-role={bay.fieldRole}
      data-energization={energization}
      data-bay-number={bay.bayNumber ?? ''}
      data-in-manipulation={bay.inManipulation ? 'true' : 'false'}
      onClick={
        onClickBay
          ? (e) => {
              e.stopPropagation();
              onClickBay(bay.bayRef);
            }
          : undefined
      }
      onDoubleClick={
        onDoubleClickBay
          ? (e) => {
              e.stopPropagation();
              onDoubleClickBay(bay.bayRef);
            }
          : undefined
      }
      onContextMenu={
        onContextMenuBay
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenuBay(bay.bayRef, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
      style={{ cursor: onClickBay ? 'pointer' : 'default' }}
    >
      {/* Korpus kolumny (subtelne tło, manipulation = oliwkowe) */}
      <rect
        x={x}
        y={busY}
        width={BAY_COLUMN_WIDTH}
        height={BAY_COLUMN_HEIGHT}
        fill={columnFill}
        stroke={columnStroke}
        strokeOpacity={columnStrokeOpacity}
        strokeWidth={bay.hasMissingRequiredDevice ? 1.4 : bay.inManipulation ? 1.2 : 0.8}
        strokeDasharray={columnStrokeDasharray}
        rx={1}
        data-testid="sld-v2-gpz-bay-body"
        data-missing-device={bay.hasMissingRequiredDevice ? 'true' : 'false'}
      />

      {/* Nagłówek pola — feeder name lub designation. Wyśrodkowany w kolumnie
       * (nie na osi aparatów) i przycięty do szerokości kolumny minus inset,
       * żeby długa nazwa nie wylewała się do sąsiedniej kolumny (anty-kolizja
       * D2: "STAROŁĘ.WSCHODN…"). */}
      <text
        x={x + BAY_COLUMN_WIDTH / 2}
        y={headerY + 9}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel - 1}
        fontWeight={600}
        data-testid="sld-v2-gpz-bay-header"
      >
        {fitTextToWidth(
          bay.feederName ?? bay.designation,
          BAY_COLUMN_WIDTH - 2 * LABEL_CLIP_INSET,
          FONT_SIZES.technicalPanel - 1,
        )}
      </text>

      {/* Marker zwarcia doziemnego (cyan circle u góry) */}
      {bay.groundFault && bay.groundFault !== 'normal' && (
        <GroundFaultMarker cx={apparatusCx} cy={bodyTopY + 3} state={bay.groundFault} />
      )}

      {/* Pionowy tor pola (apparatus column line) */}
      <line
        x1={apparatusCx}
        y1={busY}
        x2={apparatusCx}
        y2={columnBottomY - 4}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* DS_BUS (Q1) — odłącznik szynowy, kanoniczny dla pola liniowego SN
       * (PN-EN 62271-200). Renderowany jako koło na osi pola tuż pod szyną
       * gdy `qDesignations.dsBus` dostarczony. Stan dziedziczony z `dsState`
       * (na typowym polu DS_BUS i DS_LIN sterowane tym samym sygnałem;
       * przyszły refaktor może rozdzielić `dsBusState`/`dsLinState`). */}
      {bay.qDesignations?.dsBus && (
        <ClickableApparatusGroup
          bayRef={bay.bayRef}
          kind="disconnect_bus"
          designation={bay.qDesignations?.dsBus ?? null}
          labelPl="Odłącznik szynowy"
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusDsCircle cx={apparatusCx} cy={dsBusY} state={dsState} energized={energization === 'energized'} />
          <QDesignationLabel
            x={apparatusCx + DS_RADIUS + 3}
            y={dsBusY + 2}
            text={bay.qDesignations.dsBus}
            slot="ds-bus"
          />
        </ClickableApparatusGroup>
      )}

      {/* CB (filled square) + opcjonalna etykieta Q (IEC 81346-2).
       * onClickCb dziedziczy stopPropagation aby nie konfliktować z onClickBay.
       * RENDER WARUNKOWY (BLOCKER MV-1+15): pole MEASUREMENT i RMU_LINE NIE mają
       * CB → showCb=false → renderer pomija. */}
      {showCb && (
        <ClickableApparatusGroup
          bayRef={bay.bayRef}
          kind="breaker"
          designation={bay.qDesignations?.cb ?? null}
          labelPl="Wyłącznik"
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusCbSquare cx={apparatusCx} cy={cbY} state={cbState} energized={energization === 'energized'} />
          {bay.qDesignations?.cb && (
            <QDesignationLabel
              x={apparatusCx + CB_SIZE / 2 + 3}
              y={cbY + 2}
              text={bay.qDesignations.cb}
              slot="cb"
            />
          )}
        </ClickableApparatusGroup>
      )}

      {/* CT primary (small open circle) + ratio label po lewej.
       * MEASUREMENT bay nie ma CT → showCt=false. */}
      {showCt && (
        <ClickableApparatusGroup
          bayRef={bay.bayRef}
          kind="ct"
          designation={bay.qDesignations?.ct ?? null}
          labelPl="Przekładnik prądowy"
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <CtPrimary cx={apparatusCx} cy={ctY} ratio={bay.ctRatio} />
          {bay.qDesignations?.ct && (
            <QDesignationLabel
              x={apparatusCx + CT_RADIUS + 3}
              y={ctY + 2}
              text={bay.qDesignations.ct}
              slot="ct"
            />
          )}
        </ClickableApparatusGroup>
      )}

      {/* VT trójfazowy dla MEASUREMENT bay — pełny symbol IEC 60617 S00310 +
       * tradycja PSE/Energa (3 okręgi fazowe L1/L2/L3 + trójkąt ziemi).
       * Zastępuje placeholder żółty z poprzedniej iteracji. */}
      {showVt && (
        <ApparatusVtThreePhase cx={apparatusCx} cy={dsY + 2} />
      )}

      {/* SWITCH_DISCONNECTOR (rozłącznik z load-break) — kanon RMU/RM6.
       * Większy od zwykłego DS, z dodatkową kreską load-break (kanon IEC 60617
       * S00198). Renderowany na pozycji CB dla RMU pola (RMU_LINE_ORDER nie ma
       * CB, tylko SD jako jedyny łącznik). */}
      {showSwitchDisconnector && (
        <ClickableApparatusGroup
          bayRef={bay.bayRef}
          kind="switch_disconnector"
          designation={dsLinDesignation}
          labelPl="Rozłącznik"
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusSwitchDisconnector
            cx={apparatusCx}
            cy={cbY}
            state={dsState}
            energized={energization === 'energized'}
          />
          {bay.qDesignations?.ds && (
            <QDesignationLabel
              x={apparatusCx + 9 + 3}
              y={cbY + 2}
              text={bay.qDesignations.ds}
              slot="switch-disconnector"
            />
          )}
        </ClickableApparatusGroup>
      )}

      {/* DS (filled circle) + opcjonalna etykieta Q.
       * Pole TR ma tylko DS_BUS (Q1) → renderowany na górze; ten DS to DS_LIN
       * (Q9) — NIEobecny dla TR według polityki. RMU_LINE używa SD na cbY
       * pozycji, nie ma DS na osi. */}
      {showDsCircle && bay.fieldRole !== FIELD_ROLE.TRANSFORMER && bay.fieldRole !== FIELD_ROLE.RMU_TRANSFORMER && (
        <ClickableApparatusGroup
          bayRef={bay.bayRef}
          kind="switch_disconnector"
          designation={dsLinDesignation}
          labelPl="Odłącznik liniowy"
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusDsCircle cx={apparatusCx} cy={dsY} state={dsState} energized={energization === 'energized'} />
          {bay.qDesignations?.ds && (
            <QDesignationLabel
              x={apparatusCx + DS_RADIUS + 3}
              y={dsY + 2}
              text={bay.qDesignations.ds}
              slot="ds"
            />
          )}
        </ClickableApparatusGroup>
      )}

      {/* FUSE — bezpieczniki na osi pola (MEASUREMENT, RMU_TRANSFORMER, TR
       * fuse-switch). Renderowany na pozycji CT dla MEASUREMENT, na pozycji
       * CB dla TR fuse-switch. */}
      {showFuse && (
        <ApparatusFuse cx={apparatusCx} cy={ctY} state="unknown" />
      )}

      {/* SURGE_ARRESTER — ogranicznik przepięć na bocznej gałęzi LEWO. */}
      {showSurgeArrester && (
        <ApparatusSurgeArrester cx={apparatusCx - 14} cy={dsY} />
      )}

      {/* TRANSFORMER — symbol trafa NA OSI pola TR (kanon: pole TR kończy się
       * portem do trafa, nie głowicą kablową). */}
      {showTransformer && (
        <ApparatusTransformerSymbol cx={apparatusCx} cy={triangleY} />
      )}

      {/* LV_BREAKER — wyłącznik nN za trafem (poniżej TRANSFORMER symbolu). */}
      {showLvBreaker && (
        <ApparatusLvBreaker cx={apparatusCx} cy={triangleY + 14} state="unknown" />
      )}

      {/* Uziemnik (ES) — boczna gałąź z trójkątem ziemi (BHP-krytyczny).
       * Side z BAY_DEVICE_ORDER_POLICY (audyt MV B2): renderer konsumuje
       * `slot.side` ('LEFT' | 'RIGHT'). Phase 0A wszystkie ES po RIGHT
       * (zgodnie z polityką), ale infrastruktura na LEFT gotowa. */}
      {showEs && bay.esState && bay.esState !== 'absent' && (() => {
        const esSlot = slots.find((s) => s.apparatusKind === APPARATUS_KIND.EARTHING_SWITCH);
        const esSide: 'LEFT' | 'RIGHT' = esSlot?.side === 'LEFT' ? 'LEFT' : 'RIGHT';
        const labelX = esSide === 'LEFT'
          ? apparatusCx - ES_BRANCH_OFFSET - 12
          : apparatusCx + ES_BRANCH_OFFSET + 6;
        return (
          <ClickableApparatusGroup
            bayRef={bay.bayRef}
            kind="earthing_switch"
            designation={bay.qDesignations?.es ?? null}
            labelPl="Uziemnik"
            onClickApparatus={onClickApparatus}
            onContextMenuApparatus={onContextMenuApparatus}
          >
            <g data-es-side={esSide}>
              <ApparatusEarthingSwitch
                cxAxis={apparatusCx}
                cy={dsY + APPARATUS_PITCH * 0.4}
                state={bay.esState}
                side={esSide}
              />
              {/* Etykieta ES przesunięta W DÓŁ obok trójkąta ziemi (cy + 5),
               * a nie na linii gałęzi — inaczej dzieli wiersz z etykietą
               * odłącznika liniowego (Q9) / wyłącznika (Q0) i zlewa się w
               * nieczytelny ciąg "Q08"/"Q98" (anty-kolizja D4). */}
              {bay.qDesignations?.es && (
                <QDesignationLabel
                  x={labelX}
                  y={dsY + APPARATUS_PITCH * 0.4 + 5}
                  text={bay.qDesignations.es}
                  slot="es"
                />
              )}
            </g>
          </ClickableApparatusGroup>
        );
      })()}

      {/* Cable head triangle (downward).
       * Pole TR/MEASUREMENT/COUPLER NIE kończą się głowicą kablową — TR
       * port do trafa, MEASUREMENT VT, COUPLER mostek do drugiej sekcji.
       * showCableHead reguluje renderowanie. */}
      {showCableHead && (
        <ApparatusCableHead cx={apparatusCx} cy={triangleY} energized={energization === 'energized'} />
      )}

      {/* Stos badge'y stanu po prawej (SPZ/SCO/OWG/NZ/LRW/ARN/...) */}
      {bay.secondary && (
        <BadgeStack
          x={x + BADGE_COL_X_OFFSET}
          y={bodyTopY + 2}
          flags={bay.secondary}
        />
      )}

      {/* Numer pola pod kolumną */}
      {bay.bayNumber && (
        <text
          x={x + BAY_COLUMN_WIDTH / 2}
          y={numberY}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel}
          fontWeight={700}
          data-testid="sld-v2-gpz-bay-number"
        >
          {bay.bayNumber}
        </text>
      )}

      {/* Przycisk KAS (kasowanie sygnalizacji) — etykieta + LED kropka + opcjonalnie P-number */}
      {bay.hasKasButton && (
        <KasButton
          cx={x + BAY_COLUMN_WIDTH / 2}
          cy={kasY}
          pNumber={bay.pNumber}
          onClick={onClickKas ? () => onClickKas(bay.bayRef) : undefined}
        />
      )}

      {/* Panel pomiarowy — feeder header + P/Q/I1/I2/I3 */}
      {bay.measurements && hasAnyMeasurement(bay.measurements) && (
        <MeasurementPanel
          x={x + BAY_COLUMN_WIDTH / 2}
          y={measurementHeaderY}
          width={BAY_COLUMN_WIDTH}
          feederName={bay.feederName}
          measurements={bay.measurements}
        />
      )}

      {/* Stos kodów zabezpieczeniowych (87T/51/50/51N + Buchholz/temp/ciśnienie
       * na polu TR) — TEN SAM mechanizm string[] co OZE. Renderowany pod
       * panelem pomiarowym (lub pod numerem/KAS gdy brak pomiarów). Data-honest:
       * tylko kody z modelu; pola bez kodów nie pokazują nic. */}
      {bay.protectionCodes && bay.protectionCodes.length > 0 && (
        <ProtectionCodeStack
          cx={x + BAY_COLUMN_WIDTH / 2}
          y={
            bay.measurements && hasAnyMeasurement(bay.measurements)
              ? measurementHeaderY +
                MEASUREMENT_PANEL_HEADER_HEIGHT +
                collectMeasurementRows(bay.measurements).length * MEASUREMENT_ROW_HEIGHT +
                6
              : measurementHeaderY + 4
          }
          codes={bay.protectionCodes}
        />
      )}

      {/* Tooltip aria. */}
      <title>{`${bay.designation} (${bay.fieldRole}) — ${describeEnergizationPl(energization)}`}</title>
    </g>
  );
}

// =============================================================================
// Coupler bay (sprzęgło sekcyjne między S1 i S2)
// =============================================================================

interface CouplerBayProps {
  x: number;
  busY: number;
  coupler: GpzCouplerDescriptor;
  onClickCoupler?: (couplerId: string) => void;
  onClickKas?: (bayRef: string) => void;
}

function CouplerBay(props: CouplerBayProps): JSX.Element {
  const { x, busY, coupler, onClickCoupler, onClickKas } = props;
  const couplerState: 'closed' | 'open' | 'unknown' = normalizeCouplerState(coupler.closed);

  /* CB visual: closed = zielony filled, open = cyan hollow, unknown = szary. */
  const cbFill =
    couplerState === 'closed'
      ? COLOR_DEVICE_CLOSED
      : couplerState === 'unknown'
      ? COLOR_TEXT_MUTED
      : COLOR_PANEL_RAISED;
  const cbStroke =
    couplerState === 'closed'
      ? COLOR_DEVICE_CLOSED_BORDER
      : couplerState === 'unknown'
      ? COLOR_TEXT_MUTED
      : COLOR_SELECTION;

  /* Track color — zielony tylko gdy zamknięte; unknown = neutral szary. */
  const trackColor =
    couplerState === 'closed'
      ? COLOR_DEVICE_CLOSED
      : couplerState === 'unknown'
      ? COLOR_TEXT_MUTED
      : COLOR_LINE_PRIMARY;

  /* Geometry: two legs dropping from busY, joined by horizontal connection with CB in middle. */
  const leftLegX = x + COUPLER_LEG_INSET;
  const rightLegX = x + COUPLER_BAY_WIDTH - COUPLER_LEG_INSET;
  const cbCx = (leftLegX + rightLegX) / 2;
  const dsY = busY + COUPLER_DS_OFFSET_Y;
  const horizontalY = busY + COUPLER_HORIZONTAL_OFFSET_Y;

  /* Decoration positions (under horizontal CB row). */
  const measurementY = horizontalY + 14;
  const kasSpY = measurementY + 14;
  const badgeStackY = kasSpY + 8;
  const kasSzrY = badgeStackY + 18;

  /* Yellow manipulation highlight (oliwkowe tło). */
  const bodyFill = coupler.inManipulation ? COLOR_MANIPULATION_BG : COLOR_PANEL_RAISED;
  const bodyStroke = coupler.inManipulation ? COLOR_BADGE_BG_YELLOW : COLOR_TEXT_MUTED;
  const bodyStrokeOpacity = coupler.inManipulation ? 0.9 : 0.45;
  const bodyStrokeWidth = coupler.inManipulation ? 1.2 : 0.8;

  const useFallbackLabel = !coupler.bayNumberLeft && !coupler.bayNumberRight;

  return (
    <g
      data-testid={`sld-v2-gpz-coupler-${coupler.couplerId}`}
      data-closed={couplerState === 'closed' ? 'true' : couplerState === 'open' ? 'false' : 'unknown'}
      data-coupler-state={couplerState}
      data-coupler-id={coupler.couplerId}
      data-in-manipulation={coupler.inManipulation ? 'true' : 'false'}
    >
      {/* Tło sprzęgła */}
      <rect
        x={x}
        y={busY}
        width={COUPLER_BAY_WIDTH}
        height={COUPLER_BAY_HEIGHT}
        fill={bodyFill}
        stroke={bodyStroke}
        strokeOpacity={bodyStrokeOpacity}
        strokeWidth={bodyStrokeWidth}
        rx={1}
        data-testid="sld-v2-gpz-coupler-body"
      />

      {/* Numery pól nad każdą nogą (np. 15, 17). Fallback: "Sprz." na środku. */}
      {useFallbackLabel ? (
        <text
          x={cbCx}
          y={busY + COUPLER_BAY_NUMBER_OFFSET_Y + 2}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel - 1}
          fontWeight={600}
        >
          Sprz.
        </text>
      ) : (
        <>
          {coupler.bayNumberLeft && (
            <text
              x={leftLegX}
              y={busY + COUPLER_BAY_NUMBER_OFFSET_Y + 2}
              textAnchor="middle"
              fill={COLOR_TEXT_PRIMARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.bayLabel - 4}
              fontWeight={700}
              data-testid="sld-v2-gpz-coupler-bay-number-left"
            >
              {coupler.bayNumberLeft}
            </text>
          )}
          {coupler.bayNumberRight && (
            <text
              x={rightLegX}
              y={busY + COUPLER_BAY_NUMBER_OFFSET_Y + 2}
              textAnchor="middle"
              fill={COLOR_TEXT_PRIMARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.bayLabel - 4}
              fontWeight={700}
              data-testid="sld-v2-gpz-coupler-bay-number-right"
            >
              {coupler.bayNumberRight}
            </text>
          )}
        </>
      )}

      {/* Lewa noga: pionowy łącznik z busa do horyzontalnej części */}
      <line
        x1={leftLegX}
        y1={busY}
        x2={leftLegX}
        y2={horizontalY}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
        data-testid="sld-v2-gpz-coupler-leg-left"
      />

      {/* Prawa noga */}
      <line
        x1={rightLegX}
        y1={busY}
        x2={rightLegX}
        y2={horizontalY}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
        data-testid="sld-v2-gpz-coupler-leg-right"
      />

      {/* DS otwarty (kółko) na górze każdej nogi — kanoniczny marker rozłącznika */}
      <circle
        cx={leftLegX}
        cy={dsY}
        r={DS_RADIUS}
        fill={COLOR_PANEL_RAISED}
        stroke={couplerState === 'closed' ? COLOR_DEVICE_CLOSED_BORDER : couplerState === 'unknown' ? COLOR_TEXT_MUTED : COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        data-testid="sld-v2-gpz-coupler-ds-left"
      />
      <circle
        cx={rightLegX}
        cy={dsY}
        r={DS_RADIUS}
        fill={COLOR_PANEL_RAISED}
        stroke={couplerState === 'closed' ? COLOR_DEVICE_CLOSED_BORDER : couplerState === 'unknown' ? COLOR_TEXT_MUTED : COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        data-testid="sld-v2-gpz-coupler-ds-right"
      />

      {/* Lewy odcinek poziomu (od lewej nogi do CB) */}
      <line
        x1={leftLegX}
        y1={horizontalY}
        x2={cbCx - CB_SIZE / 2 - 1}
        y2={horizontalY}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* Prawy odcinek poziomu (od CB do prawej nogi) */}
      <line
        x1={cbCx + CB_SIZE / 2 + 1}
        y1={horizontalY}
        x2={rightLegX}
        y2={horizontalY}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* CB sprzęgła w środku poziomej części (cyan hollow gdy open, green gdy closed).
       * Klik = operator otwiera/zamyka sprzęgło. */}
      <g
        onClick={
          onClickCoupler
            ? (e) => {
                e.stopPropagation();
                onClickCoupler(coupler.couplerId);
              }
            : undefined
        }
        style={{ cursor: onClickCoupler ? 'pointer' : undefined }}
      >
        <rect
          x={cbCx - CB_SIZE / 2}
          y={horizontalY - CB_SIZE / 2}
          width={CB_SIZE}
          height={CB_SIZE}
          fill={cbFill}
          stroke={cbStroke}
          strokeWidth={1.4}
          rx={1}
          data-testid="sld-v2-gpz-coupler-cb"
          data-state={couplerState}
        />
      </g>

      {/* Pomiar prądu sprzęgła "I  X" */}
      {coupler.currentI !== undefined && (
        <CouplerCurrentDisplay cx={cbCx} cy={measurementY} value={coupler.currentI} />
      )}

      {/* KAS SP — kasowanie sygnalizacji sprzęgła */}
      {coupler.hasKasSp && (
        <KasButton
          cx={cbCx + 4}
          cy={kasSpY}
          label="KAS SP"
          testId="sld-v2-gpz-coupler-kas-sp"
          ledTestId="sld-v2-gpz-coupler-kas-sp-led"
          onClick={onClickKas ? () => onClickKas(coupler.couplerId) : undefined}
        />
      )}

      {/* Stos badge'y (najczęściej SZR + opcjonalnie SPZ) */}
      {coupler.secondary && (
        <BadgeStack
          x={cbCx - BADGE_WIDTH / 2}
          y={badgeStackY}
          flags={coupler.secondary}
        />
      )}

      {/* KAS SZR — kasowanie sygnalizacji automatyki SZR */}
      {coupler.hasKasSzr && (
        <KasButton
          cx={cbCx + 4}
          cy={kasSzrY}
          label="KAS SZR"
          testId="sld-v2-gpz-coupler-kas-szr"
          ledTestId="sld-v2-gpz-coupler-kas-szr-led"
          onClick={onClickKas ? () => onClickKas(coupler.couplerId) : undefined}
        />
      )}

      <title>{`${coupler.designation} — ${describeCouplerStatePl(couplerState)}`}</title>
    </g>
  );
}

/** Pomiar prądu sprzęgła "I  X" — jednorzędowy panel pomiarowy nad CB. */
function CouplerCurrentDisplay(props: { cx: number; cy: number; value: number }): JSX.Element {
  const { cx, cy, value } = props;
  return (
    <g data-testid="sld-v2-gpz-coupler-current">
      <rect
        x={cx - 16}
        y={cy - 5}
        width={32}
        height={10}
        fill={COLOR_PANEL}
        stroke={COLOR_TEXT_MUTED}
        strokeOpacity={0.5}
        strokeWidth={0.5}
        rx={1}
      />
      <text
        x={cx - 12}
        y={cy + 3}
        textAnchor="start"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={MEASUREMENT_FONT_SIZE - 1}
        fontWeight={600}
      >
        I
      </text>
      <text
        x={cx + 13}
        y={cy + 3}
        textAnchor="end"
        fill={COLOR_MEASUREMENT_VALUE}
        fontFamily={FONT_MONO}
        fontSize={MEASUREMENT_FONT_SIZE - 1}
      >
        {formatInteger(value)}
      </text>
    </g>
  );
}
