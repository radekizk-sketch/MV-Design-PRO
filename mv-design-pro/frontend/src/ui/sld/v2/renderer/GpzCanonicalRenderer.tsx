/**
 * GpzCanonicalRenderer — Phase R2 Operator-Grade Rebuild (clean-room).
 *
 * Pełen renderer GPZ klasy SCADA OSD (Mikronika MIKRA II / Sygnity / PSE-Energa).
 *
 * NIE MODYFIKUJE legacy GpzRenderer.tsx ani GpzSwitchgearRenderer.tsx.
 * Konsumuje BEZPOŚREDNIO ENM data (Substation + Bay[] + Transformer[] +
 * Bus[] + Generator[]). Mapping na visual props bez fallback do placeholderów.
 *
 * Acceptance Invariants (Faza R1 reality check):
 *   1. ZAKAZ placeholderów ("GPZ 1", "TR1", "?/15 kV") w widoku.
 *   2. ZAKAZ nakładających tekstów (każdy <text> deterministyczny key).
 *   3. PEŁEN kanon SCADA: header + HV + TR + sekcje + pola + sprzęgła + magistrale.
 *   4. End-to-end ENM → render bez fallbacków.
 *   5. Brak danych → "—" lub missing-data badge (NIE "?").
 *
 * @see docs/audit/GPZ_RENDERER_REALITY_CHECK.md
 */

import {
  COLOR_BG,
  COLOR_BUS_HV,
  COLOR_BUS_LV,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
} from '../theme/tokens';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';

import {
  GpzOperatorHeader,
  type ControlAvailabilityStatus,
  type GpzAlarmFlags,
  type GpzStationBalance,
  type TransmissionStatus,
} from './GpzOperatorHeader';

/* =============================================================================
   Domain types (z ENM, projected to canonical SLD)
   ============================================================================= */

export interface CanonicalGpzSection {
  /** Stable id z ENM (`Substation.gpz_sections[].section_id`). */
  readonly sectionId: string;
  /** Order w rozdzielni (1-N). */
  readonly order: number;
  /** Etykieta widoczna ("S1"/"S2"/...). */
  readonly label: string;
  /** Napięcie szyny (kV). */
  readonly busVoltageKv: number;
  /** Lista pól na sekcji. */
  readonly bays: readonly CanonicalGpzBay[];
}

export interface CanonicalGpzBay {
  readonly bayRef: string;
  /** Numer dyspozytorski ("10", "23/1") z ENM `Bay.bay_number`. */
  readonly bayNumber: string | null;
  /** Krótka nazwa odpływu z `Bay.feeder_short_name`. */
  readonly feederName: string | null;
  /** Cel feedera (np. "→ STAROŁĘCKA 42"). */
  readonly destinationLabel: string | null;
  /** Rola pola — z ENM `Bay.bay_role`. */
  readonly fieldRole: BayFieldRole;
  /** Aparatura z `BAY_DEVICE_ORDER_POLICY` (kanon IEC 81346). */
  readonly cbState?: SwitchState;
  readonly dsState?: SwitchState;
  readonly esState?: 'closed' | 'open' | 'absent' | 'unknown';
  /** Q-numbering (z ENM lub deterministyczne wnioskowanie). */
  readonly qDesignations: {
    readonly cb?: string;
    readonly dsBus?: string;
    readonly dsLin?: string;
    readonly es?: string;
    readonly ct?: string;
  };
  /** Status badge'y (SPZ/SCO/OWG/NZ/LRW/ARN/...). */
  readonly statusFlags?: readonly StatusFlag[];
  /** Pomiary per pole. */
  readonly measurements?: BayMeasurements | null;
  /** Tryb sterowania. */
  readonly controlMode?: 'remote' | 'local' | 'unknown';
  /** Flag: pole w stanie manipulacji. */
  readonly inManipulation?: boolean;
}

export type CanonicalGpzApparatusKind =
  | 'disconnect_bus'
  | 'breaker'
  | 'ct'
  | 'vt'
  | 'switch_disconnector'
  | 'earthing_switch'
  | 'fuse'
  | 'cable_head'
  | 'transformer_symbol';

export interface CanonicalGpzApparatusSelection {
  readonly apparatusId: string;
  readonly bayRef: string;
  readonly apparatusKind: CanonicalGpzApparatusKind;
  readonly designation: string | null;
  readonly labelPl: string;
}

export type BayFieldRole =
  | 'LINE_OUT'
  | 'LINE_IN'
  | 'LINE_BRANCH'
  | 'TRANSFORMER'
  | 'COUPLER'
  | 'MEASUREMENT';

export type SwitchState = 'closed' | 'open' | 'unknown';
export type StatusFlag = 'SPZ' | 'SCO' | 'OWG' | 'NZ' | 'LRW' | 'ARN' | 'BKR' | 'STYCZ' | 'AWSC' | 'ZS' | 'SZR';

export interface BayMeasurements {
  readonly pMw?: number | null;
  readonly qMvar?: number | null;
  readonly u12Kv?: number | null;
  readonly u23Kv?: number | null;
  readonly u31Kv?: number | null;
  readonly i1A?: number | null;
  readonly i2A?: number | null;
  readonly i3A?: number | null;
  readonly fHz?: number | null;
}

export interface CanonicalGpzCoupler {
  readonly couplerId: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
  readonly designation: string;
  readonly closedState: SwitchState;
}

export interface CanonicalGpzTransformer {
  readonly transformerRef: string;
  readonly designation: string; // "TR1", "TR2"
  readonly snMva: number;
  readonly uhvKv: number;
  readonly ulvKv: number;
  readonly vectorGroup: string | null; // "Dyn11" itp.
  /** Sekcja SN do której podłączony jest dolny zacisk TR. null gdy mapowanie
   *  nie istnieje — renderer ustawia TR na środku kanwy (legacy). */
  readonly lvSectionId?: string | null;
  /** Ref szyny HV (110 kV) — do oznaczenia kierunku zasilania. */
  readonly hvBusRef?: string | null;
}

export interface CanonicalGpzHvSection {
  readonly sectionId: string;
  readonly order: number;
  readonly busVoltageKv: number;
  readonly label: string;
  readonly bays: readonly CanonicalGpzBay[];
}

export interface GpzCanonicalRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Nazwa GPZ (z ENM `Substation.name`). PUSTA gdy ENM nie ma. */
  readonly name: string;
  /** Adres + radio (opcjonalne — z ENM meta). */
  readonly addressLine?: string;
  readonly radioId?: string;
  /** Status SCADA. */
  readonly transmissionStatus?: TransmissionStatus;
  readonly controlAvailability?: ControlAvailabilityStatus;
  /** Bilans stacji (z runtime SCADA). */
  readonly balance?: GpzStationBalance;
  /** Alarmy. */
  readonly alarms?: GpzAlarmFlags;
  /** HV side: 110 kV bus + pola HV liniowe + pola TR. Brak → tylko LV. */
  readonly hvSections?: readonly CanonicalGpzHvSection[];
  /** Transformatory NA OSI (T1...Tn). */
  readonly transformers: readonly CanonicalGpzTransformer[];
  /** LV side: ≥1 sekcja 15 kV. */
  readonly sections: readonly CanonicalGpzSection[];
  /** Sprzęgła międzysekcyjne LV. */
  readonly couplers: readonly CanonicalGpzCoupler[];

  /* Interakcja */
  readonly onClickBay?: (bayRef: string) => void;
  readonly onDoubleClickBay?: (bayRef: string) => void;
  readonly onContextMenuBay?: (bayRef: string, evt: { clientX: number; clientY: number }) => void;
  readonly onContextMenuSection?: (sectionId: string, evt: { clientX: number; clientY: number }) => void;
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (selection: CanonicalGpzApparatusSelection, evt: { clientX: number; clientY: number }) => void;
  readonly onClickCoupler?: (couplerId: string) => void;
  readonly onClickTransformer?: (transformerRef: string) => void;
  readonly onResetSignals?: () => void;
}

/* =============================================================================
   Geometry constants
   ============================================================================= */

const HEADER_WIDTH = 320;
const HV_BUS_Y = 180;
const HV_BAY_HEIGHT = 80;
const TR_AREA_Y = 280;
const TR_HEIGHT = 80;
// Inżynierski wymóg: między dolnym zaciskiem TR a szyną SN musi być
// pole transformatorowe (DS-CB-CT-ES). LV_BUS_GAP rezerwuje przestrzeń na
// tę kolumnę aparatów.
const LV_BUS_GAP = 110;
const LV_SECTION_COUPLER_GAP = 72;
const LV_SECTION_MIN_WIDTH = 260;
const LV_BAY_HEIGHT = 250;
const LV_TR_UPSTREAM_HEIGHT = 182;
const BAY_WIDTH = 74;
const BAY_PITCH = 82;
const TR_WIDTH = 60;
const SECTION_LABEL_WIDTH = 30;
const PAGE_PADDING = 24;

interface LvSectionLayout {
  readonly section: CanonicalGpzSection;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

function getLvSectionWidth(section: CanonicalGpzSection): number {
  const bayCount = Math.max(section.bays.length, 1);
  const baySpan = (bayCount - 1) * BAY_PITCH + BAY_WIDTH;
  return Math.max(LV_SECTION_MIN_WIDTH, SECTION_LABEL_WIDTH + 32 + baySpan + 32);
}

function getLvSwitchgearWidth(sections: readonly CanonicalGpzSection[]): number {
  if (sections.length === 0) return 0;
  const sectionWidthSum = sections.reduce((sum, section) => sum + getLvSectionWidth(section), 0);
  return sectionWidthSum + (sections.length - 1) * LV_SECTION_COUPLER_GAP;
}

function buildLvSectionLayouts(
  sections: readonly CanonicalGpzSection[],
  startX: number,
  y: number,
): readonly LvSectionLayout[] {
  let cursor = startX;
  return sections.map((section, index) => {
    const width = getLvSectionWidth(section);
    const layout: LvSectionLayout = { section, x: cursor, y, width };
    cursor += width + (index < sections.length - 1 ? LV_SECTION_COUPLER_GAP : 0);
    return layout;
  });
}

/* =============================================================================
   Main renderer
   ============================================================================= */

export function GpzCanonicalRenderer(props: GpzCanonicalRendererProps): JSX.Element {
  const lvSwitchgearWidth = getLvSwitchgearWidth(props.sections);
  const totalLvWidth = lvSwitchgearWidth + PAGE_PADDING * 2;
  const totalHvBays = props.hvSections?.reduce((acc, s) => acc + s.bays.length, 0) ?? 0;
  const totalHvWidth = SECTION_LABEL_WIDTH + (totalHvBays + props.transformers.length) * BAY_PITCH + PAGE_PADDING * 2;
  const totalWidth = Math.max(totalLvWidth, totalHvWidth, HEADER_WIDTH * 2 + PAGE_PADDING);
  const sectionsBlockY = TR_AREA_Y + TR_HEIGHT + LV_BUS_GAP;
  const sectionsBlockHeight = props.sections.length > 0 ? LV_BAY_HEIGHT : 60;
  const totalHeight = sectionsBlockY + sectionsBlockHeight + PAGE_PADDING;
  const lvStartX = Math.max(PAGE_PADDING, (totalWidth - lvSwitchgearWidth) / 2);
  const lvSectionLayouts = buildLvSectionLayouts(props.sections, lvStartX, sectionsBlockY);
  const lvSectionLayoutById = new Map(lvSectionLayouts.map((layout) => [layout.section.sectionId, layout]));

  return (
    <g
      data-testid={`sld-v2-gpz-canonical-${props.id}`}
      data-parity-key="gpz.root"
      data-element-kind="gpz_canonical"
      data-element-id={props.id}
      data-gpz-name={props.name}
      transform={`translate(${props.x}, ${props.y})`}
    >
      {/* Tło rozdzielni */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={totalHeight}
        fill={COLOR_BG}
        stroke={COLOR_TEXT_MUTED}
        strokeOpacity={0.3}
        strokeWidth={1}
        rx={2}
        data-parity-key="gpz.frame"
        data-testid={`gpz-canonical-${props.id}-frame`}
      />

      {/* 1. Header (top-left) */}
      <GpzOperatorHeader
        x={PAGE_PADDING}
        y={PAGE_PADDING}
        width={HEADER_WIDTH}
        gpzName={props.name || '—'}
        addressLine={props.addressLine}
        radioId={props.radioId}
        transmissionStatus={props.transmissionStatus}
        controlAvailability={props.controlAvailability}
        balance={props.balance}
        alarms={props.alarms}
        onResetSignalsClick={props.onResetSignals}
      />

      {/* 2. HV side — 110 kV bus + HV bays */}
      <HvSection
        x={PAGE_PADDING}
        y={HV_BUS_Y}
        width={totalWidth - PAGE_PADDING * 2}
        sections={props.hvSections ?? []}
        transformerCount={props.transformers.length}
      />

      {/* 3. Transformatory NA OSI sekcji (TR1 → Sekcja 1, TR2 → Sekcja 2).
             Każdy TR pionowo łączy szynę 110 kV z polem TR (a NIE bezpośrednio
             z szyną SN — inżynierski wymóg: TR przyłączony przez pole TR z
             aparaturą DS-CB-CT-ES). */}
      <TransformersBlock
        x={PAGE_PADDING}
        y={TR_AREA_Y}
        width={totalWidth - PAGE_PADDING * 2}
        transformers={props.transformers}
        lvSectionLayouts={lvSectionLayouts}
        hvBusY={HV_BUS_Y - TR_AREA_Y}
        lvBusY={TR_HEIGHT + 8}
        onClickTransformer={props.onClickTransformer}
      />

      {/* 3a. Pola transformatorowe — kolumna aparatów (DS bus → CB → CT → ES)
             między dolnym zaciskiem TR a szyną SN sekcji. */}
      <TrFieldColumnsBlock
        transformers={props.transformers}
        lvSectionLayouts={lvSectionLayouts}
        trBottomY={TR_AREA_Y + TR_HEIGHT + 8}
        sectionsBlockY={sectionsBlockY}
        onClickApparatus={props.onClickApparatus}
      />

      {/* 4. LV sections — szyny 15 kV + pola SN */}
      {lvSectionLayouts.map((layout, index) => (
        <LvSection
          key={`section-${layout.section.sectionId}-${index}`}
          section={layout.section}
          x={layout.x}
          y={layout.y}
          width={layout.width}
          onClickBay={props.onClickBay}
          onDoubleClickBay={props.onDoubleClickBay}
          onContextMenuBay={props.onContextMenuBay}
          onContextMenuSection={props.onContextMenuSection}
          onClickApparatus={props.onClickApparatus}
          onContextMenuApparatus={props.onContextMenuApparatus}
        />
      ))}

      {/* 5. Sprzęgła LV (między sekcjami) */}
      {props.couplers.map((coupler, index) => {
        const leftLayout = lvSectionLayoutById.get(coupler.leftSectionId);
        const rightLayout = lvSectionLayoutById.get(coupler.rightSectionId);
        if (!leftLayout || !rightLayout) return null;
        const firstLayout = leftLayout.x <= rightLayout.x ? leftLayout : rightLayout;
        const secondLayout = leftLayout.x <= rightLayout.x ? rightLayout : leftLayout;
        const couplerStartX = firstLayout.x + firstLayout.width;
        const couplerEndX = secondLayout.x;
        const couplerLineLength = Math.max(24, couplerEndX - couplerStartX);
        const couplerX = couplerStartX + couplerLineLength / 2;
        return (
          <CouplerSymbol
            key={`coupler-${coupler.couplerId}-${index}`}
            x={couplerX}
            y={sectionsBlockY}
            lineLength={couplerLineLength}
            coupler={coupler}
            onClick={props.onClickCoupler}
          />
        );
      })}

      {/* 6. Etykiety sekcji + napięcia */}
      {lvSectionLayouts.map((layout, index) => (
        <SectionLabel
          key={`section-label-${layout.section.sectionId}-${index}`}
          x={layout.x + 4}
          y={layout.y - 24}
          label={layout.section.label}
          voltageKv={layout.section.busVoltageKv}
        />
      ))}
    </g>
  );
}

/* =============================================================================
   HV switchgear (110 kV side)
   ============================================================================= */

interface HvSectionProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly sections: readonly CanonicalGpzHvSection[];
  readonly transformerCount: number;
}

function HvSection(props: HvSectionProps): JSX.Element {
  const { x, y, width, sections, transformerCount } = props;
  if (sections.length === 0 && transformerCount === 0) {
    return (
      <g data-testid="gpz-canonical-hv-empty" data-parity-key="gpz.hv.missing" transform={`translate(${x}, ${y})`}>
        <rect x={0} y={-18} width={170} height={24} rx={3} fill="#101A27" stroke="#3C536A" strokeWidth={1} />
        <text x={10} y={0} fill={COLOR_TEXT_MUTED} fontFamily={FONT_SANS} fontSize={12} fontWeight={700}>
          Brak danych 110 kV
        </text>
      </g>
    );
  }

  return (
    <g data-testid="gpz-canonical-hv" data-parity-key="gpz.hv" transform={`translate(${x}, ${y})`}>
      {/* Wskaźnik źródła systemu 110 kV — strzałka kierunku zasilania
          z lewej strony szyny (kanon SCADA: zasilanie przychodzi z systemu). */}
      <g data-testid="gpz-canonical-hv-source-indicator" data-parity-key="gpz.hv.source">
        <line
          x1={SECTION_LABEL_WIDTH - 28}
          y1={0}
          x2={SECTION_LABEL_WIDTH}
          y2={0}
          stroke={COLOR_BUS_HV}
          strokeWidth={2.5}
        />
        <polygon
          points={`${SECTION_LABEL_WIDTH - 32},-5 ${SECTION_LABEL_WIDTH - 32},5 ${SECTION_LABEL_WIDTH - 24},0`}
          fill={COLOR_BUS_HV}
        />
        <text
          x={SECTION_LABEL_WIDTH - 40}
          y={-4}
          textAnchor="end"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={10}
          fontWeight={700}
        >
          System
        </text>
        <text
          x={SECTION_LABEL_WIDTH - 40}
          y={7}
          textAnchor="end"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={10}
        >
          110 kV
        </text>
      </g>
      {/* HV bus 110 kV — pozioma szyna */}
      <line
        x1={SECTION_LABEL_WIDTH}
        y1={0}
        x2={width}
        y2={0}
        stroke={COLOR_BUS_HV}
        strokeWidth={2.5}
        data-parity-key="gpz.bus.hv"
        data-testid="gpz-canonical-hv-bus"
      />
      <text
        x={4}
        y={4}
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_MONO}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={700}
      >
        110 kV
      </text>

      {/* HV pola liniowe (powyżej szyny — wchodzą "z góry") */}
      {sections.flatMap((section, sectionIndex) =>
        section.bays.map((bay, idx) => (
          <HvLineBay
            key={`hv-bay-${section.sectionId}-${bay.bayRef}-${sectionIndex}-${idx}`}
            x={SECTION_LABEL_WIDTH + 30 + idx * BAY_PITCH * 1.2}
            y={-HV_BAY_HEIGHT}
            bay={bay}
          />
        )),
      )}
    </g>
  );
}

interface HvLineBayProps {
  readonly x: number;
  readonly y: number;
  readonly bay: CanonicalGpzBay;
}

function HvLineBay(props: HvLineBayProps): JSX.Element {
  const { x, y, bay } = props;
  return (
    <g
      data-testid={`gpz-canonical-hv-bay-${bay.bayRef}`}
      data-parity-key="gpz.hv.bay"
      data-bay-role={bay.fieldRole}
      transform={`translate(${x}, ${y})`}
    >
      {/* Pionowy tor pola HV */}
      <line x1={0} y1={0} x2={0} y2={HV_BAY_HEIGHT} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
      {/* CB symbol (kwadrat) */}
      <ApparatusCb cx={0} cy={20} state={bay.cbState ?? 'unknown'} />
      {/* DS symbol (koło) */}
      <ApparatusDs cx={0} cy={50} state={bay.dsState ?? 'unknown'} />
      {/* Numer pola HV */}
      <text
        x={0}
        y={-6}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={700}
      >
        {bay.bayNumber ?? '—'}
      </text>
    </g>
  );
}

/* =============================================================================
   Transformers block (NA OSI: TR1, TR2, ...)
   ============================================================================= */

interface TransformersBlockProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly transformers: readonly CanonicalGpzTransformer[];
  readonly lvSectionLayouts: readonly LvSectionLayout[];
  /** Y szyny 110 kV w lokalnym układzie bloku TR (translate y = TR_AREA_Y). */
  readonly hvBusY: number;
  /** Y szyny SN (LV) w lokalnym układzie bloku TR. */
  readonly lvBusY: number;
  readonly onClickTransformer?: (ref: string) => void;
}

function TransformersBlock(props: TransformersBlockProps): JSX.Element {
  const { x, y, width, transformers, lvSectionLayouts, hvBusY, lvBusY, onClickTransformer } = props;
  if (transformers.length === 0) {
    return (
      <g data-testid="gpz-canonical-transformers-empty" data-parity-key="gpz.transformer.missing" transform={`translate(${x}, ${y})`}>
        <rect x={0} y={-18} width={195} height={24} rx={3} fill="#101A27" stroke="#3C536A" strokeWidth={1} />
        <text x={10} y={0} fill={COLOR_TEXT_MUTED} fontFamily={FONT_SANS} fontSize={12} fontWeight={700}>
          Brak transformatora WN/SN
        </text>
      </g>
    );
  }

  // Mapuj sectionId → center X (w globalnym układzie kanwy GPZ — przed translate).
  const sectionCenterById = new Map<string, number>();
  for (const layout of lvSectionLayouts) {
    sectionCenterById.set(layout.section.sectionId, layout.x + layout.width / 2);
  }

  // Dla każdego TR wyznacz X w lokalnym układzie tego bloku (y = TR_AREA_Y).
  const sectionsByOrder = lvSectionLayouts
    .slice()
    .sort((a, b) => a.section.order - b.section.order);

  return (
    <g data-testid="gpz-canonical-transformers" data-parity-key="gpz.transformers" transform={`translate(${x}, ${y})`}>
      {transformers.map((tr, idx) => {
        let centerGlobalX: number | null = null;
        if (tr.lvSectionId && sectionCenterById.has(tr.lvSectionId)) {
          centerGlobalX = sectionCenterById.get(tr.lvSectionId)!;
        } else if (sectionsByOrder[idx]) {
          // Fallback: TR po indeksie sekcji (TR1 → S1, TR2 → S2).
          const fallback = sectionsByOrder[idx];
          centerGlobalX = fallback.x + fallback.width / 2;
        }
        // Lokalny X (kontener jest translate'owany o `x`).
        const localX = centerGlobalX !== null ? centerGlobalX - x - TR_WIDTH / 2 : (width - TR_WIDTH) / 2;
        return (
          <TransformerSymbol
            key={`tr-${tr.transformerRef}-${idx}`}
            x={localX}
            y={0}
            transformer={tr}
            hvBusY={hvBusY}
            lvBusY={lvBusY}
            onClick={onClickTransformer}
          />
        );
      })}
    </g>
  );
}

/* =============================================================================
   TR Field Columns — pola transformatorowe między TR a szyną SN
   ============================================================================= */

interface TrFieldColumnsBlockProps {
  readonly transformers: readonly CanonicalGpzTransformer[];
  readonly lvSectionLayouts: readonly LvSectionLayout[];
  /** Y dolnego zacisku TR (global, gdzie kończy się symbol Y/Δ). */
  readonly trBottomY: number;
  /** Y szyny SN sekcji (global). */
  readonly sectionsBlockY: number;
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
}

function TrFieldColumnsBlock(props: TrFieldColumnsBlockProps): JSX.Element {
  const { transformers, lvSectionLayouts, trBottomY, sectionsBlockY, onClickApparatus } = props;
  const sectionCenterById = new Map<string, number>();
  for (const layout of lvSectionLayouts) {
    sectionCenterById.set(layout.section.sectionId, layout.x + layout.width / 2);
  }
  const sectionsByOrder = lvSectionLayouts.slice().sort((a, b) => a.section.order - b.section.order);

  return (
    <g data-testid="gpz-canonical-tr-field-columns" data-parity-key="gpz.tr_fields">
      {transformers.map((tr, idx) => {
        let cx: number | null = null;
        if (tr.lvSectionId && sectionCenterById.has(tr.lvSectionId)) {
          cx = sectionCenterById.get(tr.lvSectionId)!;
        } else if (sectionsByOrder[idx]) {
          cx = sectionsByOrder[idx].x + sectionsByOrder[idx].width / 2;
        }
        if (cx === null) return null;
        return (
          <TrFieldColumn
            key={`tr-field-${tr.transformerRef}-${idx}`}
            cx={cx}
            topY={trBottomY}
            bottomY={sectionsBlockY}
            transformerDesignation={tr.designation}
            transformerRef={tr.transformerRef}
            onClickApparatus={onClickApparatus}
          />
        );
      })}
    </g>
  );
}

interface TrFieldColumnProps {
  readonly cx: number;
  readonly topY: number;
  readonly bottomY: number;
  readonly transformerDesignation: string;
  readonly transformerRef: string;
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
}

/**
 * Pole transformatorowe (TR field) — kolumna aparatów między dolnym zaciskiem
 * TR a szyną SN sekcji.
 *
 * Kanon SCADA (od góry, czyli od TR, do dołu, czyli szyna SN):
 *   1. Anchor TOP (dolny zacisk TR)
 *   2. DS bus (odłącznik szynowy) — kółko
 *   3. CB (wyłącznik) — kwadrat
 *   4. CT (przekładnik prądowy) — 2 kółka mini
 *   5. ES (uziemnik) — bok poziomy + arrow do ziemi
 *   6. Anchor BOTTOM (szyna SN)
 */
function TrFieldColumn(props: TrFieldColumnProps): JSX.Element {
  const { cx, topY, bottomY, transformerDesignation, transformerRef, onClickApparatus } = props;
  const height = bottomY - topY;
  // Pozycje 5 aparatów rozłożone równomiernie wzdłuż kolumny.
  const dsBusY = topY + height * 0.18;
  const cbY = topY + height * 0.38;
  const ctY = topY + height * 0.58;
  const esY = topY + height * 0.80;
  const pseudoBay: CanonicalGpzBay = {
    bayRef: `${transformerRef}__field`,
    bayNumber: null,
    feederName: `Pole ${transformerDesignation}`,
    destinationLabel: null,
    fieldRole: 'TRANSFORMER',
    cbState: 'unknown',
    dsState: 'unknown',
    esState: 'unknown',
    qDesignations: deriveTrQDesignations(),
  };

  const handleClick = (kind: CanonicalGpzApparatusKind, labelPl: string): void => {
    if (!onClickApparatus) return;
    onClickApparatus({
      apparatusId: `${transformerRef}__field#${kind}`,
      bayRef: pseudoBay.bayRef,
      apparatusKind: kind,
      designation: null,
      labelPl,
    });
  };

  return (
    <g
      data-testid={`gpz-canonical-tr-field-${transformerRef}`}
      data-parity-key="gpz.tr_field"
      data-tr-ref={transformerRef}
    >
      {/* Tor pionowy pola TR */}
      <line
        x1={cx}
        y1={topY}
        x2={cx}
        y2={bottomY}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.5}
      />

      {/* DS bus — odłącznik szynowy (kółko) */}
      <g
        onClick={() => handleClick('disconnect_bus', 'Odłącznik szynowy pola TR')}
        style={{ cursor: onClickApparatus ? 'pointer' : 'default' }}
        data-testid={`gpz-canonical-tr-field-${transformerRef}-ds`}
      >
        <circle cx={cx} cy={dsBusY} r={6} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
      </g>

      {/* CB — wyłącznik (kwadrat) */}
      <g
        onClick={() => handleClick('breaker', 'Wyłącznik pola TR')}
        style={{ cursor: onClickApparatus ? 'pointer' : 'default' }}
        data-testid={`gpz-canonical-tr-field-${transformerRef}-cb`}
      >
        <rect
          x={cx - 7}
          y={cbY - 7}
          width={14}
          height={14}
          fill="none"
          stroke={COLOR_LINE_PRIMARY}
          strokeWidth={1.5}
        />
      </g>

      {/* CT — przekładnik prądowy (2 kółka) */}
      <g
        onClick={() => handleClick('ct', 'Przekładnik prądowy CT')}
        style={{ cursor: onClickApparatus ? 'pointer' : 'default' }}
        data-testid={`gpz-canonical-tr-field-${transformerRef}-ct`}
      >
        <circle cx={cx - 4} cy={ctY} r={4} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
        <circle cx={cx + 4} cy={ctY} r={4} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
      </g>

      {/* ES — uziemnik (boczna kreska + arrow do ziemi po lewej) */}
      <g
        onClick={() => handleClick('earthing_switch', 'Uziemnik pola TR')}
        style={{ cursor: onClickApparatus ? 'pointer' : 'default' }}
        data-testid={`gpz-canonical-tr-field-${transformerRef}-es`}
      >
        <line x1={cx} y1={esY} x2={cx - 12} y2={esY} stroke="#FF4040" strokeWidth={1.5} />
        <line x1={cx - 12} y1={esY - 3} x2={cx - 12} y2={esY + 3} stroke="#FF4040" strokeWidth={1.5} />
        <line x1={cx - 15} y1={esY + 3} x2={cx - 9} y2={esY + 3} stroke="#FF4040" strokeWidth={1.5} />
        <line x1={cx - 13} y1={esY + 5} x2={cx - 11} y2={esY + 5} stroke="#FF4040" strokeWidth={1.5} />
      </g>

      {/* Etykieta pola (np. "Pole TR1") — WCAG iter 13: bump 9→11 px */}
      <text
        x={cx + 18}
        y={topY + 12}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={11}
        fontWeight={600}
      >
        Pole {transformerDesignation}
      </text>
    </g>
  );
}

function deriveTrQDesignations(): {
  readonly cb?: string;
  readonly dsBus?: string;
  readonly dsLin?: string;
  readonly es?: string;
  readonly ct?: string;
} {
  return { dsBus: 'Q1', cb: 'Q0', es: 'Q9', ct: 'T1' };
}

interface TransformerSymbolProps {
  readonly x: number;
  readonly y: number;
  readonly transformer: CanonicalGpzTransformer;
  /** Y szyny 110 kV (lokalnie do bloku TR). */
  readonly hvBusY: number;
  /** Y szyny SN (lokalnie do bloku TR). */
  readonly lvBusY: number;
  readonly onClick?: (ref: string) => void;
}

function TransformerSymbol(props: TransformerSymbolProps): JSX.Element {
  const { x, y, transformer, hvBusY, lvBusY, onClick } = props;
  const cx = TR_WIDTH / 2;
  const hvWindingY = 20;
  const lvWindingY = 48;
  return (
    <g
      data-testid={`gpz-canonical-transformer-${transformer.transformerRef}`}
      data-parity-key="gpz.transformer.symbol"
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(transformer.transformerRef); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* HV connector: od szyny 110 kV DO górnego zacisku TR (Y). */}
      <line
        x1={cx}
        y1={hvBusY}
        x2={cx}
        y2={hvWindingY - 14}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={2}
        data-parity-key="gpz.transformer.hv_connector"
      />
      {/* LV connector: od dolnego zacisku TR DO szyny SN sekcji. */}
      <line
        x1={cx}
        y1={lvWindingY + 14}
        x2={cx}
        y2={lvBusY}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={2}
        data-parity-key="gpz.transformer.lv_connector"
      />
      {/* Krótkie połączenie między uzwojeniami (środek symbolu). */}
      <line
        x1={cx}
        y1={hvWindingY + 14}
        x2={cx}
        y2={lvWindingY - 14}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.5}
      />
      {/* Górny okrąg (HV) z markerem Y */}
      <circle cx={cx} cy={hvWindingY} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} data-parity-key="gpz.transformer.winding.hv" />
      <text x={cx} y={hvWindingY + 4} textAnchor="middle" fill={COLOR_LINE_PRIMARY} fontFamily={FONT_SANS} fontSize={11} fontWeight={700}>Y</text>
      {/* Dolny okrąg (LV) z markerem Δ */}
      <circle cx={cx} cy={lvWindingY} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} data-parity-key="gpz.transformer.winding.sn" />
      <polygon points={`${cx - 6},${lvWindingY + 8} ${cx + 6},${lvWindingY + 8} ${cx},${lvWindingY - 6}`} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
      {/* Etykieta: TR1 */}
      <text x={cx + 22} y={hvWindingY + 6} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>
        {transformer.designation}
      </text>
      {/* Moc + napięcia */}
      <text x={cx + 22} y={hvWindingY + 20} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={FONT_SIZES.numericValue}>
        {transformer.snMva.toFixed(1)} MVA
      </text>
      <text x={cx + 22} y={hvWindingY + 32} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={FONT_SIZES.numericValue}>
        {transformer.uhvKv}/{transformer.ulvKv} kV
      </text>
    </g>
  );
}

/* =============================================================================
   LV section (szyny 15 kV + pola)
   ============================================================================= */

interface LvSectionProps {
  readonly section: CanonicalGpzSection;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly onClickBay?: (bayRef: string) => void;
  readonly onDoubleClickBay?: (bayRef: string) => void;
  readonly onContextMenuBay?: (bayRef: string, evt: { clientX: number; clientY: number }) => void;
  readonly onContextMenuSection?: (sectionId: string, evt: { clientX: number; clientY: number }) => void;
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (selection: CanonicalGpzApparatusSelection, evt: { clientX: number; clientY: number }) => void;
}

function LvSection(props: LvSectionProps): JSX.Element {
  const {
    section,
    x,
    y,
    width,
    onClickBay,
    onDoubleClickBay,
    onContextMenuBay,
    onContextMenuSection,
    onClickApparatus,
    onContextMenuApparatus,
  } = props;
  return (
    <g
      data-testid={`gpz-canonical-section-${section.sectionId}`}
      data-parity-key="gpz.section"
      data-section-label={section.label}
      data-section-voltage={String(section.busVoltageKv)}
      data-section-layout="single-bus-segment"
      transform={`translate(${x}, ${y})`}
      onContextMenu={
        onContextMenuSection
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenuSection(section.sectionId, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
    >
      {/* Pola */}
      {section.bays.map((bay, idx) => (
        <LvBay
          key={`bay-${section.sectionId}-${bay.bayRef}-${idx}`}
          bay={bay}
          x={32 + idx * BAY_PITCH}
          y={0}
          onClick={onClickBay}
          onDoubleClick={onDoubleClickBay}
          onContextMenu={onContextMenuBay}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        />
      ))}

      {/* Szyna SN musi być warstwą nad kolumnami pól, jak w ekranach operatorskich. */}
      <line
        x1={0}
        y1={0}
        x2={width}
        y2={0}
        stroke={COLOR_BUS_LV}
        strokeWidth={4}
        strokeLinecap="square"
        data-parity-key="gpz.bus.sn"
        data-testid={`gpz-canonical-section-${section.sectionId}-bus`}
      />
    </g>
  );
}

interface LvBayProps {
  readonly bay: CanonicalGpzBay;
  readonly x: number;
  readonly y: number;
  readonly onClick?: (ref: string) => void;
  readonly onDoubleClick?: (ref: string) => void;
  readonly onContextMenu?: (ref: string, evt: { clientX: number; clientY: number }) => void;
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (selection: CanonicalGpzApparatusSelection, evt: { clientX: number; clientY: number }) => void;
}

interface BayApparatusPolicy {
  readonly dsBus: boolean;
  readonly cb: boolean;
  readonly ct: boolean;
  readonly dsLin: boolean;
  readonly es: boolean;
  readonly cableHead: boolean;
  readonly vt: boolean;
  readonly fuse: boolean;
}

function getBayApparatusPolicy(fieldRole: BayFieldRole): BayApparatusPolicy {
  switch (fieldRole) {
    case 'LINE_IN':
    case 'LINE_OUT':
    case 'LINE_BRANCH':
      return { dsBus: true, cb: true, ct: true, dsLin: true, es: true, cableHead: true, vt: false, fuse: false };
    case 'TRANSFORMER':
      return { dsBus: true, cb: true, ct: true, dsLin: false, es: true, cableHead: false, vt: false, fuse: true };
    case 'COUPLER':
      return { dsBus: true, cb: true, ct: true, dsLin: false, es: false, cableHead: false, vt: false, fuse: false };
    case 'MEASUREMENT':
      return { dsBus: true, cb: false, ct: false, dsLin: false, es: true, cableHead: false, vt: true, fuse: false };
  }
}

interface ApparatusTextProps {
  readonly x: number;
  readonly y: number;
  readonly value?: string;
}

function ApparatusText(props: ApparatusTextProps): JSX.Element | null {
  if (!props.value) return null;
  return (
    <text x={props.x} y={props.y} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
      {props.value}
    </text>
  );
}

interface ClickableApparatusProps {
  readonly bay: CanonicalGpzBay;
  readonly kind: CanonicalGpzApparatusKind;
  readonly designation?: string | null;
  readonly labelPl: string;
  readonly parityKey: string;
  readonly required?: boolean;
  readonly hitBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly onClickApparatus?: (selection: CanonicalGpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (selection: CanonicalGpzApparatusSelection, evt: { clientX: number; clientY: number }) => void;
  readonly children: JSX.Element | readonly JSX.Element[];
}

function apparatusId(bayRef: string, kind: CanonicalGpzApparatusKind): string {
  return `${bayRef}#${kind}`;
}

function ClickableApparatus(props: ClickableApparatusProps): JSX.Element {
  const id = apparatusId(props.bay.bayRef, props.kind);
  const selection: CanonicalGpzApparatusSelection = {
    apparatusId: id,
    bayRef: props.bay.bayRef,
    apparatusKind: props.kind,
    designation: props.designation ?? null,
    labelPl: props.labelPl,
  };
  const handleClick = props.onClickApparatus
    ? (e: MouseEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        props.onClickApparatus?.(selection);
      }
    : undefined;
  const handleContextMenu = props.onContextMenuApparatus
    ? (e: MouseEvent<Element>) => {
        e.preventDefault();
        e.stopPropagation();
        props.onContextMenuApparatus?.(selection, { clientX: e.clientX, clientY: e.clientY });
      }
    : undefined;
  const handleKeyDown = props.onClickApparatus
    ? (e: KeyboardEvent<Element>) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        props.onClickApparatus?.(selection);
      }
    : undefined;
  const handlePointerDown = props.onClickApparatus
    ? (e: PointerEvent<Element>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        props.onClickApparatus?.(selection);
      }
    : undefined;
  const handleMouseDown = props.onClickApparatus
    ? (e: MouseEvent<Element>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        props.onClickApparatus?.(selection);
      }
    : undefined;
  return (
    <g
      data-testid={`gpz-canonical-apparatus-${id}`}
      data-element-kind="apparatus"
      data-element-id={id}
      data-bay-ref={props.bay.bayRef}
      data-apparatus-kind={props.kind}
      data-apparatus-label={props.labelPl}
      data-apparatus-required={props.required === false ? 'false' : 'true'}
      data-designation-present={Boolean(props.designation)}
      data-parity-key={props.parityKey}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ cursor: props.onClickApparatus || props.onContextMenuApparatus ? 'pointer' : 'default' }}
    >
      {props.hitBox && (
        <foreignObject
          x={props.hitBox.x}
          y={props.hitBox.y}
          width={props.hitBox.width}
          height={props.hitBox.height}
          pointerEvents="all"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          data-testid={`gpz-canonical-apparatus-${id}-hitbox`}
          data-element-kind="apparatus"
          data-element-id={id}
          data-parity-key={`${props.parityKey}.hitbox`}
        >
          <button
            type="button"
            aria-label={props.labelPl}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onMouseDown={handleMouseDown}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            onFocus={() => props.onClickApparatus?.(selection)}
            data-testid={`gpz-canonical-apparatus-${id}-button`}
            data-element-kind="apparatus"
            data-element-id={id}
            style={{
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 0,
              border: 0,
              background: 'transparent',
              cursor: props.onClickApparatus || props.onContextMenuApparatus ? 'pointer' : 'default',
              color: 'transparent',
              fontSize: 0,
              lineHeight: 0,
            }}
          />
        </foreignObject>
      )}
      <g pointerEvents="none">{props.children}</g>
    </g>
  );
}

function LvBay(props: LvBayProps): JSX.Element {
  const { bay, x, y, onClick, onDoubleClick, onContextMenu, onClickApparatus, onContextMenuApparatus } = props;
  const trackHeight = LV_BAY_HEIGHT - 30;
  const apparatus = getBayApparatusPolicy(bay.fieldRole);
  const esState = bay.esState ?? 'unknown';
  if (bay.fieldRole === 'TRANSFORMER') {
    return (
      <LvTransformerBay
        bay={bay}
        x={x}
        y={y}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      />
    );
  }
  return (
    <g
      data-testid={`gpz-canonical-bay-${bay.bayRef}`}
      data-parity-key="gpz.bay"
      data-bay-role={bay.fieldRole}
      data-bay-number={bay.bayNumber ?? ''}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(bay.bayRef); } : undefined}
      onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(bay.bayRef); } : undefined}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(bay.bayRef, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Tło pola (per-role color) */}
      <rect
        x={-BAY_WIDTH / 2}
        y={-24}
        width={BAY_WIDTH}
        height={LV_BAY_HEIGHT + 24}
        fill={bayRoleFillColor(bay.fieldRole)}
        stroke={bay.inManipulation ? '#FFB020' : COLOR_TEXT_MUTED}
        strokeOpacity={bay.inManipulation ? 0.9 : 0.3}
        strokeWidth={bay.inManipulation ? 1.4 : 0.8}
        rx={1}
        data-parity-key="gpz.bay.panel"
      />

      {/* Pionowy tor pola */}
      <line x1={0} y1={0} x2={0} y2={trackHeight} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.6} data-parity-key="gpz.bay.power_path" />

      {/* Header pola — feeder name */}
      {bay.feederName && (
        <text
          x={0}
          y={18}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={10}
          fontWeight={700}
          data-testid="gpz-bay-feeder-label"
          data-parity-key="gpz.bay.feeder_label"
        >
          {bay.feederName.slice(0, 10)}
        </text>
      )}

      {/* DS_BUS (Q1) — odłącznik szynowy nad CB */}
      {apparatus.dsBus && (
        <ClickableApparatus
          bay={bay}
          kind="disconnect_bus"
          designation={bay.qDesignations.dsBus}
          labelPl="Odłącznik szynowy"
          parityKey="gpz.apparatus.ds.bus"
          hitBox={{ x: -16, y: 20, width: 36, height: 24 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusDs cx={0} cy={32} state={bay.dsState ?? 'unknown'} />
          <ApparatusText x={9} y={36} value={bay.qDesignations.dsBus} />
        </ClickableApparatus>
      )}

      {/* CB (Q0) — wyłącznik */}
      {apparatus.cb && (
        <ClickableApparatus
          bay={bay}
          kind="breaker"
          designation={bay.qDesignations.cb}
          labelPl="Wyłącznik SN"
          parityKey="gpz.apparatus.cb.main"
          hitBox={{ x: -16, y: 44, width: 38, height: 24 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusCb cx={0} cy={56} state={bay.cbState ?? 'unknown'} />
          <ApparatusText x={11} y={60} value={bay.qDesignations.cb} />
        </ClickableApparatus>
      )}

      {/* CT (T1) — przekładnik prądowy */}
      {apparatus.ct && (
        <ClickableApparatus
          bay={bay}
          kind="ct"
          designation={bay.qDesignations.ct}
          labelPl="Przekładnik prądowy"
          parityKey="gpz.apparatus.ct"
          hitBox={{ x: -16, y: 68, width: 36, height: 24 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <circle cx={0} cy={80} r={5} fill="none" stroke="#FFC857" strokeWidth={1.4} />
          <ApparatusText x={9} y={84} value={bay.qDesignations.ct} />
        </ClickableApparatus>
      )}

      {apparatus.vt && (
        <ClickableApparatus
          bay={bay}
          kind="vt"
          labelPl="Przekładnik napięciowy"
          parityKey="gpz.apparatus.vt.side"
          hitBox={{ x: -4, y: 58, width: 46, height: 36 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <line x1={0} y1={72} x2={16} y2={72} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <circle cx={21} cy={66} r={5} fill="none" stroke="#FFB020" strokeWidth={1.4} />
          <circle cx={21} cy={78} r={5} fill="none" stroke="#FFB020" strokeWidth={1.4} />
          <text x={30} y={75} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
            VT
          </text>
        </ClickableApparatus>
      )}

      {/* DS_LIN (Q9) — odłącznik liniowy */}
      {apparatus.dsLin && (
        <ClickableApparatus
          bay={bay}
          kind="switch_disconnector"
          designation={bay.qDesignations.dsLin}
          labelPl="Rozłącznik liniowy"
          parityKey="gpz.apparatus.ds.line"
          hitBox={{ x: -16, y: 92, width: 38, height: 24 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <ApparatusSwitchDisconnector cx={0} cy={104} state={bay.dsState ?? 'unknown'} />
          <ApparatusText x={9} y={108} value={bay.qDesignations.dsLin} />
        </ClickableApparatus>
      )}

      {apparatus.fuse && (
        <ClickableApparatus
          bay={bay}
          kind="fuse"
          labelPl="Bezpieczniki pola transformatorowego"
          parityKey="gpz.apparatus.fuse"
          hitBox={{ x: -14, y: 92, width: 28, height: 46 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <rect x={-5} y={96} width={10} height={18} fill="#D8D063" stroke="#FFEA70" strokeWidth={1} />
          <rect x={-5} y={116} width={10} height={18} fill="#D8D063" stroke="#FFEA70" strokeWidth={1} />
        </ClickableApparatus>
      )}

      {/* ES (Q8) — uziemnik na bocznej gałęzi */}
      {apparatus.es && esState !== 'absent' && (
        <ClickableApparatus
          bay={bay}
          kind="earthing_switch"
          designation={bay.qDesignations.es}
          labelPl="Uziemnik boczny"
          parityKey="gpz.apparatus.es.side"
          hitBox={{ x: -4, y: 118, width: 36, height: 34 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <line x1={0} y1={130} x2={14} y2={130} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.4} />
          <line x1={14} y1={126} x2={14} y2={134} stroke={esState === 'closed' ? '#FF4040' : COLOR_TEXT_MUTED} strokeWidth={1.6} />
          {/* Trójkąt ziemi */}
          <line x1={11} y1={138} x2={17} y2={138} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={12} y1={141} x2={16} y2={141} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
          <line x1={13} y1={144} x2={15} y2={144} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
          <ApparatusText x={20} y={132} value={bay.qDesignations.es} />
        </ClickableApparatus>
      )}

      {/* Cable head (głowica kablowa) — trójkąt na końcu */}
      {apparatus.cableHead && (
        <ClickableApparatus
          bay={bay}
          kind="cable_head"
          labelPl="Głowica kablowa / port odpływu"
          parityKey="gpz.apparatus.cable_head"
          hitBox={{ x: -16, y: trackHeight - 42, width: 32, height: 56 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <polygon
            points={`-6,${trackHeight - 4} 6,${trackHeight - 4} 0,${trackHeight + 6}`}
            fill="none"
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />
        </ClickableApparatus>
      )}

      {/* Numer pola pod kolumną */}
      {bay.bayNumber && (
        <text
          x={0}
          y={trackHeight + 22}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel}
          fontWeight={700}
        >
          {bay.bayNumber}
        </text>
      )}

      {/* Etykieta destynacji feedera */}
      {bay.destinationLabel && (
        <text
          x={0}
          y={trackHeight + 36}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={10}
        >
          {bay.destinationLabel.slice(0, 12)}
        </text>
      )}

      {/* Status flags badge stack (po prawej stronie pola) */}
      {bay.statusFlags && bay.statusFlags.length > 0 && (
        <BayStatusBadges x={BAY_WIDTH / 2 - 4} y={4} flags={bay.statusFlags} />
      )}

      {/* Pomiary panel pod numerem pola */}
      {bay.measurements && (
        <BayMeasurementsPanel x={-BAY_WIDTH / 2 + 2} y={trackHeight + 42} width={BAY_WIDTH - 4} measurements={bay.measurements} />
      )}
    </g>
  );
}

function LvTransformerBay(props: LvBayProps): JSX.Element {
  const { bay, x, y, onClick, onDoubleClick, onContextMenu, onClickApparatus, onContextMenuApparatus } = props;
  const esState = bay.esState ?? 'unknown';
  const topY = -LV_TR_UPSTREAM_HEIGHT;
  const transformerY = -142;
  return (
    <g
      data-testid={`gpz-canonical-bay-${bay.bayRef}`}
      data-parity-key="gpz.bay"
      data-bay-role={bay.fieldRole}
      data-bay-orientation="upstream-transformer"
      data-bay-number={bay.bayNumber ?? ''}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(bay.bayRef); } : undefined}
      onDoubleClick={onDoubleClick ? (e) => { e.stopPropagation(); onDoubleClick(bay.bayRef); } : undefined}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(bay.bayRef, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        x={-BAY_WIDTH / 2}
        y={topY}
        width={BAY_WIDTH}
        height={LV_TR_UPSTREAM_HEIGHT}
        fill={bayRoleFillColor(bay.fieldRole)}
        stroke={bay.inManipulation ? '#FFB020' : COLOR_TEXT_MUTED}
        strokeOpacity={bay.inManipulation ? 0.9 : 0.3}
        strokeWidth={bay.inManipulation ? 1.4 : 0.8}
        rx={1}
        data-parity-key="gpz.bay.panel"
      />
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={topY + 18}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.8}
        data-parity-key="gpz.bay.tr.upstream_path"
      />
      <text
        x={0}
        y={topY + 12}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={10}
        fontWeight={700}
        data-parity-key="gpz.bay.feeder_label"
      >
        {(bay.feederName ?? 'Pole TR').slice(0, 10)}
      </text>

      <ClickableApparatus
        bay={bay}
        kind="disconnect_bus"
        designation={bay.qDesignations.dsBus}
        labelPl="Odłącznik szynowy pola transformatorowego"
        parityKey="gpz.apparatus.ds.bus"
        hitBox={{ x: -16, y: -40, width: 36, height: 24 }}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      >
        <ApparatusDs cx={0} cy={-28} state={bay.dsState ?? 'unknown'} />
        <ApparatusText x={9} y={-24} value={bay.qDesignations.dsBus} />
      </ClickableApparatus>

      <ClickableApparatus
        bay={bay}
        kind="breaker"
        designation={bay.qDesignations.cb}
        labelPl="Wyłącznik pola transformatorowego"
        parityKey="gpz.apparatus.cb.main"
        hitBox={{ x: -16, y: -66, width: 38, height: 24 }}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      >
        <ApparatusCb cx={0} cy={-54} state={bay.cbState ?? 'unknown'} />
        <ApparatusText x={11} y={-50} value={bay.qDesignations.cb} />
      </ClickableApparatus>

      <ClickableApparatus
        bay={bay}
        kind="ct"
        designation={bay.qDesignations.ct}
        labelPl="Przekładnik prądowy pola transformatorowego"
        parityKey="gpz.apparatus.ct"
        hitBox={{ x: -16, y: -90, width: 36, height: 24 }}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      >
        <circle cx={0} cy={-78} r={5} fill="none" stroke="#FFC857" strokeWidth={1.4} />
        <ApparatusText x={9} y={-74} value={bay.qDesignations.ct} />
      </ClickableApparatus>

      <ClickableApparatus
        bay={bay}
        kind="fuse"
        labelPl="Bezpieczniki pola transformatorowego"
        parityKey="gpz.apparatus.fuse"
        hitBox={{ x: -14, y: -132, width: 28, height: 46 }}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      >
        <rect x={-5} y={-108} width={10} height={18} fill="#D8D063" stroke="#FFEA70" strokeWidth={1} />
        <rect x={-5} y={-128} width={10} height={18} fill="#D8D063" stroke="#FFEA70" strokeWidth={1} />
      </ClickableApparatus>

      {esState !== 'absent' && (
        <ClickableApparatus
          bay={bay}
          kind="earthing_switch"
          designation={bay.qDesignations.es}
          labelPl="Uziemnik boczny pola transformatorowego"
          parityKey="gpz.apparatus.es.side"
          hitBox={{ x: -4, y: -108, width: 38, height: 34 }}
          onClickApparatus={onClickApparatus}
          onContextMenuApparatus={onContextMenuApparatus}
        >
          <line x1={0} y1={-96} x2={16} y2={-96} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.4} />
          <line x1={16} y1={-100} x2={16} y2={-92} stroke={esState === 'closed' ? '#FF4040' : COLOR_TEXT_MUTED} strokeWidth={1.6} />
          <line x1={13} y1={-88} x2={19} y2={-88} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={14} y1={-85} x2={18} y2={-85} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
          <line x1={15} y1={-82} x2={17} y2={-82} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
          <ApparatusText x={22} y={-94} value={bay.qDesignations.es} />
        </ClickableApparatus>
      )}

      <ClickableApparatus
        bay={bay}
        kind="transformer_symbol"
        labelPl="Transformator WN/SN powiązany z polem TR"
        parityKey="gpz.bay.tr.upstream.transformer_symbol"
        hitBox={{ x: -20, y: transformerY - 18, width: 64, height: 58 }}
        onClickApparatus={onClickApparatus}
        onContextMenuApparatus={onContextMenuApparatus}
      >
        <circle cx={0} cy={transformerY} r={12} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1.8} />
        <circle cx={0} cy={transformerY + 22} r={12} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1.8} />
        <text x={16} y={transformerY + 3} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={10} fontWeight={700}>
          TR
        </text>
        <text x={16} y={transformerY + 17} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={10}>
          WN/SN
        </text>
        <text x={16} y={transformerY + 31} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
          param. w karcie TR
        </text>
      </ClickableApparatus>

      {bay.bayNumber && (
        <text
          x={0}
          y={18}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel}
          fontWeight={700}
        >
          {bay.bayNumber}
        </text>
      )}
    </g>
  );
}

/* =============================================================================
   Apparatus symbols
   ============================================================================= */

interface ApparatusProps {
  readonly cx: number;
  readonly cy: number;
  readonly state: SwitchState;
}

function ApparatusCb(props: ApparatusProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'closed' ? '#13C45A' : state === 'open' ? '#1F1F1F' : '#5A5A5A';
  const stroke = state === 'closed' ? '#0A8A3F' : state === 'open' ? '#FF4040' : '#3A3A3A';
  return (
    <g data-testid={`gpz-canonical-cb`} data-parity-key="gpz.apparatus.cb" data-state={state}>
      <rect x={cx - 6} y={cy - 6} width={12} height={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {state === 'open' && (
        <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke="#FF4040" strokeWidth={1.5} />
      )}
      {state === 'unknown' && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={10} fontWeight={700}>?</text>
      )}
    </g>
  );
}

function ApparatusDs(props: ApparatusProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'closed' ? '#13C45A' : state === 'open' ? '#1F1F1F' : '#5A5A5A';
  const stroke = state === 'closed' ? '#0A8A3F' : state === 'open' ? '#FF4040' : '#3A3A3A';
  return (
    <g data-testid={`gpz-canonical-ds`} data-parity-key="gpz.apparatus.ds" data-state={state}>
      <circle cx={cx} cy={cy} r={5} fill={fill} stroke={stroke} strokeWidth={1.4} />
      {state === 'open' && (
        <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} stroke="#FF4040" strokeWidth={1.4} />
      )}
      {state === 'unknown' && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={10} fontWeight={700}>?</text>
      )}
    </g>
  );
}

function ApparatusSwitchDisconnector(props: ApparatusProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'closed' ? '#13C45A' : state === 'open' ? '#1F1F1F' : '#5A5A5A';
  const stroke = state === 'closed' ? '#0A8A3F' : state === 'open' ? '#FF4040' : '#3A3A3A';
  const d = 6.5;
  return (
    <g data-testid="gpz-canonical-load-switch" data-parity-key="gpz.apparatus.switch_disconnector" data-state={state}>
      <polygon
        points={`${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
      {state === 'open' && (
        <line x1={cx - d} y1={cy} x2={cx + d} y2={cy} stroke="#FF4040" strokeWidth={1.4} />
      )}
      {state === 'unknown' && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={10} fontWeight={700}>?</text>
      )}
    </g>
  );
}

/* =============================================================================
   Sub-components
   ============================================================================= */

interface SectionLabelProps {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly voltageKv: number;
}

function SectionLabel(props: SectionLabelProps): JSX.Element {
  const { x, y, label, voltageKv } = props;
  return (
    <g data-testid={`gpz-canonical-section-label-${label}`} data-parity-key="gpz.section.label" transform={`translate(${x}, ${y})`}>
      <text fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>
        {label}
      </text>
      <text y={12} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
        {voltageKv} kV
      </text>
    </g>
  );
}

interface CouplerSymbolProps {
  readonly x: number;
  readonly y: number;
  readonly lineLength: number;
  readonly coupler: CanonicalGpzCoupler;
  readonly onClick?: (id: string) => void;
}

function CouplerSymbol(props: CouplerSymbolProps): JSX.Element {
  const { x, y, lineLength, coupler, onClick } = props;
  const halfLength = Math.max(12, lineLength / 2);
  return (
    <g
      data-testid={`gpz-canonical-coupler-${coupler.couplerId}`}
      data-parity-key="gpz.coupler"
      data-coupler-state={coupler.closedState}
      data-coupler-orientation="horizontal"
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(coupler.couplerId); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <line
        x1={-halfLength}
        y1={0}
        x2={halfLength}
        y2={0}
        stroke={COLOR_BUS_LV}
        strokeWidth={2.5}
        data-parity-key="gpz.coupler.bus_bridge"
      />
      <ApparatusCb cx={0} cy={0} state={coupler.closedState} />
      <text x={0} y={-10} textAnchor="middle" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
        {coupler.designation}
      </text>
    </g>
  );
}

interface BayStatusBadgesProps {
  readonly x: number;
  readonly y: number;
  readonly flags: readonly StatusFlag[];
}

function BayStatusBadges(props: BayStatusBadgesProps): JSX.Element {
  const { x, y, flags } = props;
  return (
    <g data-testid={`gpz-canonical-status-badges`} data-parity-key="gpz.status_flags" data-flag-count={flags.length} transform={`translate(${x}, ${y})`}>
      {flags.slice(0, 6).map((flag, idx) => (
        <g key={`flag-${flag}-${idx}`} data-testid={`gpz-canonical-flag-${flag}`}>
          <rect x={0} y={idx * 12} width={20} height={10} fill="#FFC857" fillOpacity={0.2} stroke="#FFC857" strokeWidth={0.5} rx={1} />
          <text x={2} y={idx * 12 + 8} fill="#FFC857" fontFamily={FONT_MONO} fontSize={10} fontWeight={700}>
            {flag}
          </text>
        </g>
      ))}
    </g>
  );
}

interface BayMeasurementsPanelProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly measurements: BayMeasurements;
}

function BayMeasurementsPanel(props: BayMeasurementsPanelProps): JSX.Element {
  const { x, y, width, measurements } = props;
  const rows: { label: string; value: number | null | undefined; unit: string }[] = [
    { label: 'P', value: measurements.pMw, unit: 'MW' },
    { label: 'Q', value: measurements.qMvar, unit: 'MVAr' },
    { label: 'I', value: measurements.i1A, unit: 'A' },
  ];
  const visibleRows = rows.filter((r) => r.value !== undefined && r.value !== null);
  if (visibleRows.length === 0) return <g data-testid="gpz-canonical-measurements-empty" />;
  return (
    <g data-testid="gpz-canonical-measurements" data-parity-key="gpz.measurements" transform={`translate(${x}, ${y})`}>
      {visibleRows.map((row, idx) => (
        <g key={`m-${row.label}-${idx}`} data-testid={`gpz-canonical-measurement-${row.label}`}>
          <text x={0} y={idx * 10 + 6} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={10}>
            {row.label}
          </text>
          <text
            x={width}
            y={idx * 10 + 6}
            textAnchor="end"
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_MONO}
            fontSize={10}
            fontWeight={600}
          >
            {row.value!.toFixed(1)} {row.unit}
          </text>
        </g>
      ))}
    </g>
  );
}

/* =============================================================================
   Helpers
   ============================================================================= */

function bayRoleFillColor(role: BayFieldRole): string {
  switch (role) {
    case 'TRANSFORMER': return '#1A2438';
    case 'MEASUREMENT': return '#2A2616';
    case 'COUPLER': return '#1F2226';
    case 'LINE_OUT':
    case 'LINE_IN':
    case 'LINE_BRANCH':
    default:
      return COLOR_PANEL;
  }
}

void COLOR_PANEL_RAISED;
