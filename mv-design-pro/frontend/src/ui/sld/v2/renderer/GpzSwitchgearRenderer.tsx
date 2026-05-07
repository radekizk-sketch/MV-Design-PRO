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
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_LINE_PRIMARY,
  COLOR_NODE,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_MUTED,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import type { FieldRole } from '../domain/apparatusContracts';

// =============================================================================
// Geometry constants (deterministyczne, bez RNG)
// =============================================================================

const TITLE_BAR_HEIGHT = 26;
const HV_TOWER_HEIGHT = 78;
const TR_RADIUS = 9;
const TR_WINDING_GAP = 7;
const TR_HV_LEAD_LEN = 10;
const TR_LV_LEAD_LEN = 10;
const SECTION_LABEL_GAP = 18;
const BAY_COLUMN_WIDTH = 30;
const BAY_COLUMN_HEIGHT = 100;
const BAY_GAP = 4;
const BAY_HEADER_HEIGHT = 14;
const BAY_NUMBER_GAP = 14;
const COUPLER_BAY_WIDTH = 36;
const COUPLER_BAY_HEIGHT = BAY_COLUMN_HEIGHT;
const SECTION_INTER_GAP = 28;
const APPARATUS_PITCH = 18;
const CB_SIZE = 9;
const DS_RADIUS = 4.5;
const TRIANGLE_SIZE = 6;
const SECTION_BUS_OVERHANG = 10;
const VERTICAL_PADDING = 10;
const HORIZONTAL_PADDING = 14;

// =============================================================================
// Public types
// =============================================================================

/**
 * Stan zasilania pola — używany do koloryzacji.
 *
 * `unknown` daje neutralny szary. `de_energized` daje przygaszony szary.
 * `energized` daje zielony (kanon SCADA). `tripped`/`alarm` daje czerwony.
 */
export type GpzBayEnergization = 'energized' | 'deenergized' | 'tripped' | 'unknown';

/** Stan łączeniowy CB/DS w polu — domyślnie closed (kanon SCADA = green). */
export type GpzApparatusSwitchState = 'closed' | 'open' | 'unknown';

export interface GpzBayDescriptor {
  readonly bayRef: string;
  readonly fieldRole: FieldRole;
  readonly designation: string;
  /** Numer pola (np. "2", "10", "23/1"). Wyświetlany pod kolumną. */
  readonly bayNumber?: string;
  /** Krótka nazwa odpływu (np. "SADY", "OKRĘŻNA"). Wyświetlana w nagłówku kolumny. */
  readonly feederName?: string;
  readonly hasMissingRequiredDevice: boolean;
  readonly energization?: GpzBayEnergization;
  readonly cbState?: GpzApparatusSwitchState;
  readonly dsState?: GpzApparatusSwitchState;
}

export interface GpzSectionDescriptor {
  readonly sectionId: string;
  readonly order: number;
  readonly name: string;
  readonly busVoltageKv: number;
  readonly bays: readonly GpzBayDescriptor[];
  /** Pełna etykieta sekcji wyświetlana po lewej (np. "S1"). */
  readonly sectionLabel?: string;
}

export interface GpzCouplerDescriptor {
  readonly couplerId: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
  readonly designation: string;
  readonly closed: boolean;
}

export interface GpzSwitchgearRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly voltageHighKv: number;
  readonly voltageLowKv: number;
  readonly sections: readonly GpzSectionDescriptor[];
  readonly couplers: readonly GpzCouplerDescriptor[];
  readonly transformerCount?: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;
  readonly onClickSection?: (sectionId: string) => void;
  readonly onClickBay?: (bayRef: string) => void;
}

// =============================================================================
// Renderer
// =============================================================================

export function GpzSwitchgearRenderer(props: GpzSwitchgearRendererProps): JSX.Element {
  const sortedSections = [...props.sections].sort((a, b) => a.order - b.order);
  const transformerCount = Math.max(1, props.transformerCount ?? 1);
  const layout = computeSwitchgearLayout(sortedSections, props.couplers);

  const totalWidth = Math.max(360, layout.totalWidth + 2 * HORIZONTAL_PADDING);
  const totalHeight =
    TITLE_BAR_HEIGHT +
    HV_TOWER_HEIGHT +
    SECTION_LABEL_GAP +
    BAY_COLUMN_HEIGHT +
    BAY_NUMBER_GAP +
    VERTICAL_PADDING * 2;

  const stroke = props.selected ? COLOR_SELECTION : COLOR_LINE_PRIMARY;
  const strokeWidth = props.selected ? 2 : 1.5;

  const sectionsBlockY = TITLE_BAR_HEIGHT + HV_TOWER_HEIGHT;
  const busY = sectionsBlockY + SECTION_LABEL_GAP / 2;

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
        {props.voltageHighKv} / {props.voltageLowKv} kV
      </text>

      {/* Tor 110 kV → TR(1..N) → szyna SN */}
      <HvTowerColumn
        cx={totalWidth / 2}
        topY={TITLE_BAR_HEIGHT}
        bottomY={busY}
        transformerCount={transformerCount}
        voltageHighKv={props.voltageHighKv}
        voltageLowKv={props.voltageLowKv}
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
            />
          );
        }
        return (
          <CouplerBay
            key={`coupler-${cell.coupler.couplerId}`}
            x={HORIZONTAL_PADDING + cell.x}
            busY={busY}
            coupler={cell.coupler}
          />
        );
      })}

      {/* Etykiety sekcji (S1, S2, ...) — po lewej każdej sekcji nad szyną. */}
      {layout.sectionLabels.map((label) => (
        <text
          key={`label-${label.sectionId}`}
          x={HORIZONTAL_PADDING + label.x}
          y={busY - 4}
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
          fontWeight={700}
          data-testid={`sld-v2-gpz-section-label-${label.sectionId}`}
        >
          {label.text}
        </text>
      ))}
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
}

function HvTowerColumn(props: HvTowerColumnProps): JSX.Element {
  const { cx, topY, bottomY, transformerCount, voltageHighKv, voltageLowKv } = props;

  // Rozkład TR: jeśli >1, rozsadzamy poziomo wokół środka.
  const trSpacing = 60;
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

      {trsX.map((trX, idx) => (
        <g key={`tr-${idx}`} data-testid="sld-v2-gpz-switchgear-transformer-symbol" data-tr-index={String(idx)}>
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
      ))}
    </g>
  );
}

interface NodeMarkerProps {
  cx: number;
  cy: number;
}

/** Y (gwiazda) — kanoniczny marker strony 110 kV transformatora. */
function YNodeMarker(props: NodeMarkerProps): JSX.Element {
  const { cx, cy } = props;
  const armLen = 5;
  return (
    <g data-testid="sld-v2-gpz-tr-y-marker">
      <line x1={cx} y1={cy} x2={cx} y2={cy - armLen} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <line x1={cx} y1={cy} x2={cx - armLen * 0.86} y2={cy + armLen * 0.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <line x1={cx} y1={cy} x2={cx + armLen * 0.86} y2={cy + armLen * 0.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
    </g>
  );
}

/** Trójkąt — kanoniczny marker strony SN transformatora. */
function DeltaNodeMarker(props: NodeMarkerProps): JSX.Element {
  const { cx, cy } = props;
  const size = 5;
  return (
    <g data-testid="sld-v2-gpz-tr-delta-marker">
      <polygon
        points={`${cx},${cy + size} ${cx - size * 0.86},${cy - size * 0.5} ${cx + size * 0.86},${cy - size * 0.5}`}
        fill="none"
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
      />
    </g>
  );
}

// =============================================================================
// Bay column (widoczna kolumna pola SCADA-grade)
// =============================================================================

interface BayColumnProps {
  x: number;
  busY: number;
  bay: GpzBayDescriptor;
  voltageKv: number;
  onClickBay?: (bayRef: string) => void;
}

function BayColumn(props: BayColumnProps): JSX.Element {
  const { x, busY, bay, onClickBay } = props;
  const energization = bay.energization ?? 'unknown';
  const cbState = bay.cbState ?? 'closed';
  const dsState = bay.dsState ?? 'closed';
  const energizedColor = energizationColor(energization);
  const trackColor = bay.hasMissingRequiredDevice ? '#FFB020' : energizedColor;

  // Y kursor wewnątrz kolumny (od szyny w dół).
  const headerY = busY + 2;
  const cbY = headerY + BAY_HEADER_HEIGHT + 4;
  const dsY = cbY + APPARATUS_PITCH;
  const triangleY = dsY + APPARATUS_PITCH * 0.6;
  const columnBottomY = busY + BAY_COLUMN_HEIGHT;

  return (
    <g
      data-testid={`sld-v2-gpz-bay-${bay.bayRef}`}
      data-bay-ref={bay.bayRef}
      data-field-role={bay.fieldRole}
      data-energization={energization}
      data-bay-number={bay.bayNumber ?? ''}
      onClick={
        onClickBay
          ? (e) => {
              e.stopPropagation();
              onClickBay(bay.bayRef);
            }
          : undefined
      }
      style={{ cursor: onClickBay ? 'pointer' : 'default' }}
    >
      {/* Korpus kolumny (subtelne tło) */}
      <rect
        x={x}
        y={busY}
        width={BAY_COLUMN_WIDTH}
        height={BAY_COLUMN_HEIGHT}
        fill={COLOR_PANEL}
        stroke={COLOR_TEXT_MUTED}
        strokeOpacity={0.3}
        strokeWidth={0.8}
        rx={1}
      />

      {/* Nagłówek pola — feeder name lub designation */}
      <text
        x={x + BAY_COLUMN_WIDTH / 2}
        y={headerY + 9}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel - 1}
        fontWeight={600}
      >
        {(bay.feederName ?? bay.designation).slice(0, 8)}
      </text>

      {/* Pionowy tor pola */}
      <line
        x1={x + BAY_COLUMN_WIDTH / 2}
        y1={busY}
        x2={x + BAY_COLUMN_WIDTH / 2}
        y2={columnBottomY - 4}
        stroke={trackColor}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* CB (filled square) */}
      <ApparatusCbSquare cx={x + BAY_COLUMN_WIDTH / 2} cy={cbY} state={cbState} energized={energization === 'energized'} />

      {/* DS (filled circle) */}
      <ApparatusDsCircle cx={x + BAY_COLUMN_WIDTH / 2} cy={dsY} state={dsState} energized={energization === 'energized'} />

      {/* Cable head triangle (downward) */}
      <ApparatusCableHead cx={x + BAY_COLUMN_WIDTH / 2} cy={triangleY} energized={energization === 'energized'} />

      {/* Numer pola pod kolumną */}
      {bay.bayNumber && (
        <text
          x={x + BAY_COLUMN_WIDTH / 2}
          y={columnBottomY + BAY_NUMBER_GAP - 2}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel}
          fontWeight={700}
        >
          {bay.bayNumber}
        </text>
      )}

      {/* Tooltip aria. */}
      <title>{`${bay.designation} (${bay.fieldRole}) — ${describeEnergizationPl(energization)}`}</title>
    </g>
  );
}

interface ApparatusVisualProps {
  cx: number;
  cy: number;
  state?: GpzApparatusSwitchState;
  energized: boolean;
}

function ApparatusCbSquare(props: ApparatusVisualProps): JSX.Element {
  const { cx, cy, state = 'closed', energized } = props;
  const open = state === 'open';
  const fill = open ? COLOR_PANEL_RAISED : energized ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED;
  const stroke = open ? COLOR_DEVICE_OPEN_BORDER : COLOR_DEVICE_CLOSED_BORDER;
  return (
    <g data-testid="sld-v2-gpz-bay-cb" data-state={state}>
      <rect
        x={cx - CB_SIZE / 2}
        y={cy - CB_SIZE / 2}
        width={CB_SIZE}
        height={CB_SIZE}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        rx={1}
      />
      {open && (
        <line
          x1={cx - CB_SIZE / 2 + 1}
          y1={cy}
          x2={cx + CB_SIZE / 2 - 1}
          y2={cy}
          stroke={COLOR_DEVICE_OPEN}
          strokeWidth={1.4}
        />
      )}
    </g>
  );
}

function ApparatusDsCircle(props: ApparatusVisualProps): JSX.Element {
  const { cx, cy, state = 'closed', energized } = props;
  const open = state === 'open';
  const fill = open ? COLOR_PANEL_RAISED : energized ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED;
  const stroke = open ? COLOR_DEVICE_OPEN_BORDER : COLOR_DEVICE_CLOSED_BORDER;
  return (
    <g data-testid="sld-v2-gpz-bay-ds" data-state={state}>
      <circle cx={cx} cy={cy} r={DS_RADIUS} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {open && (
        <line
          x1={cx - DS_RADIUS}
          y1={cy}
          x2={cx + DS_RADIUS}
          y2={cy}
          stroke={COLOR_DEVICE_OPEN}
          strokeWidth={1.2}
        />
      )}
    </g>
  );
}

function ApparatusCableHead(props: { cx: number; cy: number; energized: boolean }): JSX.Element {
  const { cx, cy, energized } = props;
  const stroke = energized ? COLOR_DEVICE_CLOSED_BORDER : COLOR_TEXT_MUTED;
  return (
    <g data-testid="sld-v2-gpz-bay-cable-head">
      <polygon
        points={`${cx},${cy + TRIANGLE_SIZE} ${cx - TRIANGLE_SIZE * 0.86},${cy - TRIANGLE_SIZE * 0.5} ${cx + TRIANGLE_SIZE * 0.86},${cy - TRIANGLE_SIZE * 0.5}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
      />
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
}

function CouplerBay(props: CouplerBayProps): JSX.Element {
  const { x, busY, coupler } = props;
  const closed = coupler.closed;
  const fill = closed ? COLOR_DEVICE_CLOSED : COLOR_PANEL;
  const stroke = closed ? COLOR_DEVICE_CLOSED_BORDER : COLOR_DEVICE_OPEN_BORDER;
  const cx = x + COUPLER_BAY_WIDTH / 2;
  const cyCb = busY + 28;

  return (
    <g
      data-testid={`sld-v2-gpz-coupler-${coupler.couplerId}`}
      data-closed={String(closed)}
      data-coupler-id={coupler.couplerId}
    >
      {/* Tło sprzęgła — subtelnie wyróżnione */}
      <rect
        x={x}
        y={busY}
        width={COUPLER_BAY_WIDTH}
        height={COUPLER_BAY_HEIGHT}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_TEXT_MUTED}
        strokeOpacity={0.45}
        strokeWidth={0.8}
        rx={1}
      />

      {/* Etykieta sprzęgła */}
      <text
        x={cx}
        y={busY + 10}
        textAnchor="middle"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel - 1}
        fontWeight={600}
      >
        Sprz.
      </text>

      {/* Pionowy tor sprzęgła (kreska) */}
      <line
        x1={cx}
        y1={busY}
        x2={cx}
        y2={busY + COUPLER_BAY_HEIGHT - 6}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* CB sprzęgła */}
      <rect
        x={cx - CB_SIZE / 2}
        y={cyCb - CB_SIZE / 2}
        width={CB_SIZE}
        height={CB_SIZE}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.4}
        rx={1}
        data-testid="sld-v2-gpz-coupler-cb"
        data-state={closed ? 'closed' : 'open'}
      />
      {!closed && (
        <line
          x1={cx - CB_SIZE / 2 + 1}
          y1={cyCb}
          x2={cx + CB_SIZE / 2 - 1}
          y2={cyCb}
          stroke={COLOR_DEVICE_OPEN}
          strokeWidth={1.4}
        />
      )}

      <title>{`${coupler.designation} — ${closed ? 'zamknięte' : 'otwarte'}`}</title>
    </g>
  );
}

// =============================================================================
// Layout calculation
// =============================================================================

interface BayCell {
  readonly kind: 'bay';
  readonly x: number;
  readonly bay: GpzBayDescriptor;
  readonly sectionId: string;
  readonly busVoltageKv: number;
}
interface CouplerCell {
  readonly kind: 'coupler';
  readonly x: number;
  readonly coupler: GpzCouplerDescriptor;
}
type Cell = BayCell | CouplerCell;

interface SwitchgearLayout {
  readonly cells: readonly Cell[];
  readonly sectionLabels: readonly { sectionId: string; x: number; text: string }[];
  readonly totalBayCount: number;
  readonly totalWidth: number;
}

function computeSwitchgearLayout(
  sections: readonly GpzSectionDescriptor[],
  couplers: readonly GpzCouplerDescriptor[],
): SwitchgearLayout {
  const cells: Cell[] = [];
  const labels: { sectionId: string; x: number; text: string }[] = [];

  let cursor = 0;
  let totalBayCount = 0;

  // Mapa sprzęgieł indeksowana po lewej sekcji (po prawej będzie obsłużona przy iteracji).
  const couplersByLeft = new Map<string, GpzCouplerDescriptor>();
  for (const c of couplers) {
    couplersByLeft.set(c.leftSectionId, c);
  }

  sections.forEach((section, sIdx) => {
    if (sIdx > 0) {
      cursor += SECTION_INTER_GAP;
    }

    // Etykieta sekcji nad pierwszym polem.
    labels.push({
      sectionId: section.sectionId,
      x: cursor,
      text: section.sectionLabel ?? `S${section.order}`,
    });

    section.bays.forEach((bay) => {
      cells.push({ kind: 'bay', x: cursor, bay, sectionId: section.sectionId, busVoltageKv: section.busVoltageKv });
      cursor += BAY_COLUMN_WIDTH + BAY_GAP;
      totalBayCount += 1;
    });

    // Sprzęgło na prawym końcu sekcji (jeśli istnieje połączenie do następnej sekcji).
    const coupler = couplersByLeft.get(section.sectionId);
    if (coupler && sIdx < sections.length - 1) {
      cells.push({ kind: 'coupler', x: cursor, coupler });
      cursor += COUPLER_BAY_WIDTH + BAY_GAP;
    }
  });

  return {
    cells,
    sectionLabels: labels,
    totalBayCount,
    totalWidth: Math.max(0, cursor - BAY_GAP),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function energizationColor(state: GpzBayEnergization): string {
  switch (state) {
    case 'energized':
      return COLOR_DEVICE_CLOSED;
    case 'deenergized':
      return COLOR_TEXT_MUTED;
    case 'tripped':
      return COLOR_DEVICE_OPEN;
    case 'unknown':
      return COLOR_NODE;
  }
}

function describeEnergizationPl(state: GpzBayEnergization): string {
  switch (state) {
    case 'energized':
      return 'pod napięciem';
    case 'deenergized':
      return 'bez napięcia';
    case 'tripped':
      return 'wyłączony / zwarcie';
    case 'unknown':
      return 'stan nieznany';
  }
}
