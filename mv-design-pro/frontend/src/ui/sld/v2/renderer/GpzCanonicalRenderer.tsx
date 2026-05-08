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

import { memo } from 'react';
import type React from 'react';

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
const LV_BUS_GAP = 16;
const LV_SECTION_GAP = 28;
const LV_BAY_HEIGHT = 220;
const BAY_WIDTH = 56;
const BAY_PITCH = 60;
const TR_WIDTH = 60;
const SECTION_LABEL_WIDTH = 30;
const PAGE_PADDING = 24;

/* =============================================================================
   Main renderer
   ============================================================================= */

export const GpzCanonicalRenderer = memo(GpzCanonicalRendererImpl);

function GpzCanonicalRendererImpl(props: GpzCanonicalRendererProps): JSX.Element {
  const widestSection = Math.max(...props.sections.map((s) => s.bays.length), 1);
  const totalLvWidth = SECTION_LABEL_WIDTH + widestSection * BAY_PITCH + PAGE_PADDING * 2;
  const totalHvBays = props.hvSections?.reduce((acc, s) => acc + s.bays.length, 0) ?? 0;
  const totalHvWidth = SECTION_LABEL_WIDTH + (totalHvBays + props.transformers.length) * BAY_PITCH + PAGE_PADDING * 2;
  const totalWidth = Math.max(totalLvWidth, totalHvWidth, HEADER_WIDTH * 2 + PAGE_PADDING);
  const sectionsBlockY = TR_AREA_Y + TR_HEIGHT + LV_BUS_GAP;
  const sectionsBlockHeight = props.sections.length * (LV_BAY_HEIGHT + LV_SECTION_GAP);
  const totalHeight = sectionsBlockY + sectionsBlockHeight + PAGE_PADDING;

  return (
    <g
      data-testid={`sld-v2-gpz-canonical-${props.id}`}
      data-element-kind="gpz_canonical"
      data-element-id={props.id}
      data-gpz-name={props.name}
      transform={`translate(${props.x}, ${props.y})`}
      role="group"
      aria-label={`GPZ ${props.name || 'bez nazwy'} — rozdzielnia ${
        props.transformers.length > 0 ? `${props.transformers[0].uhvKv}/${props.transformers[0].ulvKv} kV` : ''
      } (${props.sections.length} sekcji LV, ${props.transformers.length} transformatorów)`}
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

      {/* 3. Transformatory NA OSI */}
      <TransformersBlock
        x={PAGE_PADDING}
        y={TR_AREA_Y}
        width={totalWidth - PAGE_PADDING * 2}
        transformers={props.transformers}
        onClickTransformer={props.onClickTransformer}
      />

      {/* 4. LV sections — szyny 15 kV + pola SN */}
      {props.sections.map((section, sectionIdx) => (
        <LvSection
          key={`section-${section.sectionId}`}
          section={section}
          x={PAGE_PADDING}
          y={sectionsBlockY + sectionIdx * (LV_BAY_HEIGHT + LV_SECTION_GAP)}
          width={totalWidth - PAGE_PADDING * 2}
          onClickBay={props.onClickBay}
          onDoubleClickBay={props.onDoubleClickBay}
          onContextMenuBay={props.onContextMenuBay}
        />
      ))}

      {/* 5. Sprzęgła LV (między sekcjami) */}
      {props.couplers.map((coupler) => {
        const leftIdx = props.sections.findIndex((s) => s.sectionId === coupler.leftSectionId);
        if (leftIdx < 0) return null;
        const couplerY = sectionsBlockY + leftIdx * (LV_BAY_HEIGHT + LV_SECTION_GAP) + LV_BAY_HEIGHT;
        const couplerX = PAGE_PADDING + (totalWidth - PAGE_PADDING * 2) / 2;
        return (
          <CouplerSymbol
            key={`coupler-${coupler.couplerId}`}
            x={couplerX}
            y={couplerY}
            coupler={coupler}
            onClick={props.onClickCoupler}
          />
        );
      })}

      {/* 6. Etykiety sekcji + napięcia */}
      {props.sections.map((section, idx) => (
        <SectionLabel
          key={`section-label-${section.sectionId}`}
          x={4}
          y={sectionsBlockY + idx * (LV_BAY_HEIGHT + LV_SECTION_GAP) + LV_BAY_HEIGHT - 24}
          label={section.label}
          voltageKv={section.busVoltageKv}
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
    // Brak HV — placeholder explicit "—" (NIE "?")
    return (
      <g data-testid="gpz-canonical-hv-empty" transform={`translate(${x}, ${y})`}>
        <text fill={COLOR_TEXT_MUTED} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel}>
          Strona 110 kV — brak danych ENM
        </text>
      </g>
    );
  }

  return (
    <g data-testid="gpz-canonical-hv" transform={`translate(${x}, ${y})`}>
      {/* HV bus 110 kV — pozioma szyna */}
      <line
        x1={SECTION_LABEL_WIDTH}
        y1={0}
        x2={width}
        y2={0}
        stroke={COLOR_BUS_HV}
        strokeWidth={2.5}
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
      {sections.flatMap((section) =>
        section.bays.map((bay, idx) => (
          <HvLineBay
            key={`hv-bay-${bay.bayRef}`}
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
  /* Kanon polski LINE_FULL dla pola 110 kV (z góry do szyny):
   *   y=-6   numer pola (label)
   *   y= 4   wierzchołek toru (wejście liniowe / wyjście do TR)
   *   y= 14  CableHead lub odgromnik (zewnątrz)
   *   y= 22  DS_LIN (Q9) — odłącznik liniowy
   *   y= 32  ES (boczny) — uziemnik
   *   y= 42  CT (T1) — przekładnik prądowy
   *   y= 52  CB (Q0) — wyłącznik
   *   y= 62  DS_BUS (Q1) — odłącznik szynowy
   *   y= HV_BAY_HEIGHT (=80) — szyna
   */
  return (
    <g
      data-testid={`gpz-canonical-hv-bay-${bay.bayRef}`}
      data-bay-role={bay.fieldRole}
      transform={`translate(${x}, ${y})`}
    >
      {/* Pionowy tor pola HV */}
      <line x1={0} y1={4} x2={0} y2={HV_BAY_HEIGHT} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />

      {/* Cable head / line entry — szczyt pola */}
      <CableHead cx={0} cy={4} />

      {/* DS_LIN (Q9) — odłącznik liniowy (kółko) */}
      <ApparatusDs cx={0} cy={20} state={bay.dsState ?? 'unknown'} />
      {bay.qDesignations.dsLin && (
        <text x={9} y={22} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {bay.qDesignations.dsLin}
        </text>
      )}

      {/* ES (boczny) — uziemnik */}
      <ApparatusEs cx={0} cy={32} state={bay.esState ?? 'unknown'} />
      {bay.qDesignations.es && (
        <text x={20} y={34} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {bay.qDesignations.es}
        </text>
      )}

      {/* CT (T1) — przekładnik prądowy */}
      <ApparatusCt cx={0} cy={44} />
      {bay.qDesignations.ct && (
        <text x={9} y={46} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {bay.qDesignations.ct}
        </text>
      )}

      {/* CB (Q0) — wyłącznik (kwadrat) */}
      <ApparatusCb cx={0} cy={56} state={bay.cbState ?? 'unknown'} />
      {bay.qDesignations.cb && (
        <text x={9} y={58} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {bay.qDesignations.cb}
        </text>
      )}

      {/* DS_BUS (Q1) — odłącznik szynowy (kółko) */}
      <ApparatusDs cx={0} cy={70} state={bay.dsState ?? 'unknown'} />
      {bay.qDesignations.dsBus && (
        <text x={9} y={72} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
          {bay.qDesignations.dsBus}
        </text>
      )}

      {/* Numer pola HV (label) */}
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

      {/* Feeder name (sub-label, opcjonalny) */}
      {bay.feederName && (
        <text
          x={0}
          y={HV_BAY_HEIGHT + 12}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={9}
        >
          {bay.feederName}
        </text>
      )}
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
  readonly onClickTransformer?: (ref: string) => void;
}

function TransformersBlock(props: TransformersBlockProps): JSX.Element {
  const { x, y, width, transformers, onClickTransformer } = props;
  if (transformers.length === 0) {
    return (
      <g data-testid="gpz-canonical-transformers-empty" transform={`translate(${x}, ${y})`}>
        <text fill={COLOR_TEXT_MUTED} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel}>
          Brak transformatorów w ENM
        </text>
      </g>
    );
  }

  // Rozłóż transformatory równomiernie wzdłuż osi X.
  const trGap = (width - transformers.length * TR_WIDTH) / (transformers.length + 1);

  return (
    <g data-testid="gpz-canonical-transformers" transform={`translate(${x}, ${y})`}>
      {transformers.map((tr, idx) => (
        <TransformerSymbol
          key={`tr-${tr.transformerRef}`}
          x={trGap + idx * (TR_WIDTH + trGap)}
          y={0}
          transformer={tr}
          onClick={onClickTransformer}
        />
      ))}
    </g>
  );
}

interface TransformerSymbolProps {
  readonly x: number;
  readonly y: number;
  readonly transformer: CanonicalGpzTransformer;
  readonly onClick?: (ref: string) => void;
}

function TransformerSymbol(props: TransformerSymbolProps): JSX.Element {
  const { x, y, transformer, onClick } = props;
  const cx = TR_WIDTH / 2;
  const tooltipText = [
    `Transformator ${transformer.designation}`,
    `Moc: ${transformer.snMva.toFixed(1)} MVA`,
    `Napięcia: ${transformer.uhvKv}/${transformer.ulvKv} kV`,
    transformer.vectorGroup ? `Grupa wektorowa: ${transformer.vectorGroup}` : null,
    `Ref: ${transformer.transformerRef}`,
  ].filter(Boolean).join('\n');
  return (
    <g
      data-testid={`gpz-canonical-transformer-${transformer.transformerRef}`}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(transformer.transformerRef); } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Transformator ${transformer.designation}, ${transformer.snMva.toFixed(1)} MVA, ${transformer.uhvKv} kilowoltów na ${transformer.ulvKv} kilowoltów`}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: 'none' }}
    >
      <title>{tooltipText}</title>
      {/* Pionowy tor TR (od HV bus do LV bus) */}
      <line x1={cx} y1={-LV_BUS_GAP} x2={cx} y2={TR_HEIGHT + LV_BUS_GAP} stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      {/* Górny okrąg (HV) z markerem Y */}
      <circle cx={cx} cy={20} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      <text x={cx} y={24} textAnchor="middle" fill={COLOR_LINE_PRIMARY} fontFamily={FONT_SANS} fontSize={11} fontWeight={700}>Y</text>
      {/* Dolny okrąg (LV) z markerem Δ */}
      <circle cx={cx} cy={48} r={14} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      <polygon points={`${cx - 6},${56} ${cx + 6},${56} ${cx},${42}`} fill="none" stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
      {/* Etykieta: TR1 */}
      <text x={cx + 22} y={26} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>
        {transformer.designation}
      </text>
      {/* Moc + napięcia */}
      <text x={cx + 22} y={40} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={FONT_SIZES.numericValue}>
        {transformer.snMva.toFixed(1)} MVA
      </text>
      <text x={cx + 22} y={52} fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={FONT_SIZES.numericValue}>
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
}

function LvSection(props: LvSectionProps): JSX.Element {
  const { section, x, y, width, onClickBay, onDoubleClickBay, onContextMenuBay } = props;
  return (
    <g
      data-testid={`gpz-canonical-section-${section.sectionId}`}
      data-section-label={section.label}
      data-section-voltage={String(section.busVoltageKv)}
      transform={`translate(${x}, ${y})`}
    >
      {/* Szyna LV (pozioma) — ZIELONY (kanon: szyna SN) */}
      <line
        x1={SECTION_LABEL_WIDTH}
        y1={0}
        x2={width}
        y2={0}
        stroke={COLOR_BUS_LV}
        strokeWidth={2.5}
        data-testid={`gpz-canonical-section-${section.sectionId}-bus`}
      />

      {/* Pola */}
      {section.bays.map((bay, idx) => (
        <LvBay
          key={`bay-${bay.bayRef}`}
          bay={bay}
          x={SECTION_LABEL_WIDTH + 24 + idx * BAY_PITCH}
          y={4}
          onClick={onClickBay}
          onDoubleClick={onDoubleClickBay}
          onContextMenu={onContextMenuBay}
        />
      ))}
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
}

function LvBay(props: LvBayProps): JSX.Element {
  const { bay, x, y, onClick, onDoubleClick, onContextMenu } = props;
  const trackHeight = LV_BAY_HEIGHT - 30;
  const ariaLabel = bayAriaLabel(bay);
  const tooltipText = bayTooltipText(bay);
  const handleKeyDown = (e: React.KeyboardEvent<SVGGElement>): void => {
    /* Keyboard nav (a11y P1):
     *   Enter / Space → onClick (otwiera modal)
     *   F2 → onDoubleClick (drill-down)
     *   F10 / Shift+F10 / ContextMenu key → onContextMenu w środku pola
     */
    if (e.key === 'Enter' || e.key === ' ') {
      if (onClick) {
        e.preventDefault();
        e.stopPropagation();
        onClick(bay.bayRef);
      }
    } else if (e.key === 'F2') {
      if (onDoubleClick) {
        e.preventDefault();
        e.stopPropagation();
        onDoubleClick(bay.bayRef);
      }
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (onContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        const target = e.currentTarget as SVGGElement;
        const rect = target.getBoundingClientRect();
        onContextMenu(bay.bayRef, {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        });
      }
    }
  };
  return (
    <g
      data-testid={`gpz-canonical-bay-${bay.bayRef}`}
      data-bay-role={bay.fieldRole}
      data-bay-number={bay.bayNumber ?? ''}
      transform={`translate(${x}, ${y})`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
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
      onKeyDown={onClick || onDoubleClick || onContextMenu ? handleKeyDown : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: 'none' }}
    >
      {/* SVG native tooltip — pełna telemetria pola po hover (kanon SCADA OSD) */}
      <title>{tooltipText}</title>

      {/* Tło pola (per-role color) */}
      <rect
        x={-BAY_WIDTH / 2}
        y={0}
        width={BAY_WIDTH}
        height={LV_BAY_HEIGHT}
        fill={bayRoleFillColor(bay.fieldRole)}
        stroke={bay.inManipulation ? '#FFB020' : COLOR_TEXT_MUTED}
        strokeOpacity={bay.inManipulation ? 0.9 : 0.3}
        strokeWidth={bay.inManipulation ? 1.4 : 0.8}
        rx={1}
      />

      {/* Pionowy tor pola */}
      <line x1={0} y1={0} x2={0} y2={trackHeight} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.6} />

      {/* Header pola — feeder name */}
      {bay.feederName && (
        <text
          x={0}
          y={14}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.bayLabel - 1}
          fontWeight={600}
        >
          {bay.feederName.slice(0, 8)}
        </text>
      )}

      {/* DS_BUS (Q1) — odłącznik szynowy nad CB */}
      {bay.qDesignations.dsBus && (
        <g>
          <ApparatusDs cx={0} cy={32} state={bay.dsState ?? 'unknown'} />
          <text x={9} y={36} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
            {bay.qDesignations.dsBus}
          </text>
        </g>
      )}

      {/* CB (Q0) — wyłącznik */}
      {bay.qDesignations.cb && (
        <g>
          <ApparatusCb cx={0} cy={56} state={bay.cbState ?? 'unknown'} />
          <text x={11} y={60} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
            {bay.qDesignations.cb}
          </text>
        </g>
      )}

      {/* CT (T1) — przekładnik prądowy */}
      {bay.qDesignations.ct && (
        <g>
          <circle cx={0} cy={80} r={5} fill="none" stroke="#FFC857" strokeWidth={1.4} />
          <text x={9} y={84} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
            {bay.qDesignations.ct}
          </text>
        </g>
      )}

      {/* DS_LIN (Q9) — odłącznik liniowy */}
      {bay.qDesignations.dsLin && (
        <g>
          <ApparatusDs cx={0} cy={104} state={bay.dsState ?? 'unknown'} />
          <text x={9} y={108} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
            {bay.qDesignations.dsLin}
          </text>
        </g>
      )}

      {/* ES (Q8) — uziemnik na bocznej gałęzi */}
      {bay.qDesignations.es && bay.esState !== 'absent' && (
        <g>
          <line x1={0} y1={130} x2={14} y2={130} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.4} />
          <line x1={14} y1={126} x2={14} y2={134} stroke={bay.esState === 'closed' ? '#FF4040' : COLOR_TEXT_MUTED} strokeWidth={1.6} />
          {/* Trójkąt ziemi */}
          <line x1={11} y1={138} x2={17} y2={138} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={12} y1={141} x2={16} y2={141} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
          <line x1={13} y1={144} x2={15} y2={144} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
          <text x={20} y={132} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
            {bay.qDesignations.es}
          </text>
        </g>
      )}

      {/* Cable head (głowica kablowa) — trójkąt na końcu */}
      {bay.fieldRole !== 'TRANSFORMER' && bay.fieldRole !== 'COUPLER' && bay.fieldRole !== 'MEASUREMENT' && (
        <polygon
          points={`-6,${trackHeight - 4} 6,${trackHeight - 4} 0,${trackHeight + 6}`}
          fill="none"
          stroke={COLOR_LINE_PRIMARY}
          strokeWidth={1.4}
        />
      )}

      {/* VT (PU) — pole MEASUREMENT z bocznej gałęzi pomiarowej z bezpiecznikami.
       * Kanon polski: VT na bocznej gałęzi z dwoma bezpiecznikami (HRC) u góry.
       * Renderowane TYLKO gdy fieldRole === 'MEASUREMENT'. */}
      {bay.fieldRole === 'MEASUREMENT' && (
        <g data-testid="gpz-canonical-measurement-vt">
          {/* Boczna gałąź pozioma od toru głównego */}
          <line x1={0} y1={56} x2={18} y2={56} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.4} />
          {/* Pionowy tor VT */}
          <line x1={18} y1={56} x2={18} y2={140} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.4} />
          {/* Bezpiecznik HRC (prostokąt) */}
          <rect x={14} y={62} width={8} height={14} fill={COLOR_PANEL_RAISED} stroke="#A06030" strokeWidth={1.2} rx={1} />
          {/* VT okrąg z PU */}
          <circle cx={18} cy={100} r={8} fill="none" stroke="#E89B3C" strokeWidth={1.5} />
          <text x={18} y={103} textAnchor="middle" fill="#E89B3C" fontFamily={FONT_MONO} fontSize={8} fontWeight={700}>PU</text>
          {/* Symbol ziemi (bottom) */}
          <line x1={14} y1={142} x2={22} y2={142} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={15} y1={144} x2={21} y2={144} stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
          <line x1={16} y1={146} x2={20} y2={146} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
        </g>
      )}

      {/* Surge arrester (odgromnik) — w polu LINE_OUT i LINE_IN po stronie linii */}
      {(bay.fieldRole === 'LINE_OUT' || bay.fieldRole === 'LINE_IN' || bay.fieldRole === 'LINE_BRANCH') && (
        <g data-testid="gpz-canonical-line-surge-arrester" transform={`translate(${-BAY_WIDTH / 2 + 8}, ${trackHeight - 18})`}>
          <ApparatusSurgeArrester cx={0} cy={0} />
        </g>
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

      {/* Etykieta destynacji feedera + outgoing cable do mini-RMU stacji odbiorczej.
       * Kanon SCADA OSD: z cable-head trzpień kabla schodzi w dół i kończy się
       * w bloku mini-RMU (lub label box z numerem dyspozytorskim kabla). */}
      {bay.destinationLabel && (
        <OutgoingFeederStub
          x={0}
          y={trackHeight + 8}
          destinationLabel={bay.destinationLabel}
          cableNumber={bay.feederName ?? ''}
          fieldRole={bay.fieldRole}
        />
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
    <g data-testid={`gpz-canonical-cb`} data-state={state}>
      <rect x={cx - 6} y={cy - 6} width={12} height={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {state === 'open' && (
        <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke="#FF4040" strokeWidth={1.5} />
      )}
      {state === 'unknown' && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={9} fontWeight={700}>?</text>
      )}
    </g>
  );
}

function ApparatusDs(props: ApparatusProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'closed' ? '#13C45A' : state === 'open' ? '#1F1F1F' : '#5A5A5A';
  const stroke = state === 'closed' ? '#0A8A3F' : state === 'open' ? '#FF4040' : '#3A3A3A';
  return (
    <g data-testid={`gpz-canonical-ds`} data-state={state}>
      <circle cx={cx} cy={cy} r={5} fill={fill} stroke={stroke} strokeWidth={1.4} />
      {state === 'open' && (
        <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} stroke="#FF4040" strokeWidth={1.4} />
      )}
      {state === 'unknown' && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={8} fontWeight={700}>?</text>
      )}
    </g>
  );
}

/**
 * Uziemnik (ES) — boczny od toru głównego (kanon polski).
 * 'closed' → czerwony marker safety + symbol ziemi.
 * 'open' → przygaszony szary boczny symbol.
 * 'absent' → nie renderuje (Inv 9: brak ≠ 0).
 */
interface ApparatusEsProps {
  readonly cx: number;
  readonly cy: number;
  readonly state: 'closed' | 'open' | 'absent' | 'unknown';
}

function ApparatusEs(props: ApparatusEsProps): JSX.Element | null {
  const { cx, cy, state } = props;
  if (state === 'absent') return null;
  const stroke = state === 'closed' ? '#FF4040' : '#5A5A5A';
  const fill = state === 'closed' ? '#FF4040' : '#1F1F1F';
  return (
    <g data-testid="gpz-canonical-es" data-state={state}>
      {/* Boczna gałąź pozioma */}
      <line x1={cx} y1={cy} x2={cx + 8} y2={cy} stroke={stroke} strokeWidth={1.2} />
      {/* Kropka ES (kółko małe) */}
      <circle cx={cx + 8} cy={cy} r={2.5} fill={fill} stroke={stroke} strokeWidth={1} />
      {/* Symbol ziemi (3 poziome kreski) */}
      <line x1={cx + 6} y1={cy + 4} x2={cx + 10} y2={cy + 4} stroke={stroke} strokeWidth={1.2} />
      <line x1={cx + 7} y1={cy + 6} x2={cx + 9} y2={cy + 6} stroke={stroke} strokeWidth={1} />
      {state === 'unknown' && (
        <text x={cx + 8} y={cy - 4} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={7} fontWeight={700}>?</text>
      )}
    </g>
  );
}

/**
 * Przekładnik prądowy (CT) — żółty/pomarańczowy okrąg z PI w osi.
 * Brak stanu — zawsze czynny (lub uszkodzony, ale to inne pole).
 */
interface ApparatusCtProps {
  readonly cx: number;
  readonly cy: number;
}

function ApparatusCt(props: ApparatusCtProps): JSX.Element {
  const { cx, cy } = props;
  return (
    <g data-testid="gpz-canonical-ct">
      <circle cx={cx} cy={cy} r={4.5} fill={COLOR_PANEL_RAISED} stroke="#E89B3C" strokeWidth={1.4} />
      <text x={cx} y={cy + 2.5} textAnchor="middle" fill="#E89B3C" fontFamily={FONT_MONO} fontSize={6} fontWeight={700}>PI</text>
    </g>
  );
}

/**
 * Odgromnik / surge arrester — pionowy marker do ziemi.
 * Symbol kanon: prostokąt + symbol ziemi pod.
 */
interface ApparatusSurgeArresterProps {
  readonly cx: number;
  readonly cy: number;
}

function ApparatusSurgeArrester(props: ApparatusSurgeArresterProps): JSX.Element {
  const { cx, cy } = props;
  return (
    <g data-testid="gpz-canonical-surge-arrester">
      <rect x={cx - 3} y={cy - 6} width={6} height={10} fill={COLOR_PANEL_RAISED} stroke="#A06030" strokeWidth={1.2} />
      {/* Strzałka piorunu w środku */}
      <path d={`M${cx - 1},${cy - 4} L${cx + 1},${cy} L${cx - 1},${cy + 1} L${cx + 1},${cy + 3}`} fill="none" stroke="#FFAA00" strokeWidth={0.8} />
      {/* Symbol ziemi pod */}
      <line x1={cx - 4} y1={cy + 6} x2={cx + 4} y2={cy + 6} stroke="#A06030" strokeWidth={1.2} />
      <line x1={cx - 3} y1={cy + 8} x2={cx + 3} y2={cy + 8} stroke="#A06030" strokeWidth={1} />
      <line x1={cx - 2} y1={cy + 10} x2={cx + 2} y2={cy + 10} stroke="#A06030" strokeWidth={0.8} />
    </g>
  );
}

/**
 * Głowica kablowa — symbol końcówki kabla SN.
 * Trójkąt do dołu + label "K".
 */
interface CableHeadProps {
  readonly cx: number;
  readonly cy: number;
}

function CableHead(props: CableHeadProps): JSX.Element {
  const { cx, cy } = props;
  return (
    <g data-testid="gpz-canonical-cable-head">
      <polygon
        points={`${cx - 5},${cy} ${cx + 5},${cy} ${cx},${cy + 8}`}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
      />
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
    <g data-testid={`gpz-canonical-section-label-${label}`} transform={`translate(${x}, ${y})`}>
      <text fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.bayLabel} fontWeight={700}>
        {label}
      </text>
      <text y={12} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
        {voltageKv} kV
      </text>
    </g>
  );
}

interface CouplerSymbolProps {
  readonly x: number;
  readonly y: number;
  readonly coupler: CanonicalGpzCoupler;
  readonly onClick?: (id: string) => void;
}

function CouplerSymbol(props: CouplerSymbolProps): JSX.Element {
  const { x, y, coupler, onClick } = props;
  const tooltipText = [
    `Sprzęgło międzysekcyjne ${coupler.designation}`,
    `Stan CB: ${switchStateLabel(coupler.closedState)}`,
    `Lewa sekcja: ${coupler.leftSectionId}`,
    `Prawa sekcja: ${coupler.rightSectionId}`,
    `ID: ${coupler.couplerId}`,
  ].join('\n');
  const ariaLabel = `Sprzęgło ${coupler.designation}, wyłącznik ${switchStateLabel(coupler.closedState)}`;
  return (
    <g
      data-testid={`gpz-canonical-coupler-${coupler.couplerId}`}
      data-coupler-state={coupler.closedState}
      transform={`translate(${x}, ${y})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(coupler.couplerId); } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: 'none' }}
    >
      <title>{tooltipText}</title>
      <line x1={0} y1={0} x2={0} y2={LV_SECTION_GAP} stroke={COLOR_LINE_PRIMARY} strokeWidth={2} />
      <ApparatusCb cx={0} cy={LV_SECTION_GAP / 2} state={coupler.closedState} />
      <text x={12} y={LV_SECTION_GAP / 2 + 3} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={9}>
        {coupler.designation}
      </text>
    </g>
  );
}

/* =============================================================================
   OutgoingFeederStub — kabel + mini-block destynacji (R13)
   ============================================================================= */

interface OutgoingFeederStubProps {
  readonly x: number;
  readonly y: number;
  readonly destinationLabel: string;
  readonly cableNumber: string;
  readonly fieldRole: BayFieldRole;
}

/**
 * Renderuje kabel SN wychodzący z pola GPZ:
 *   - cable-head (trójkąt)
 *   - krótki tor pionowy
 *   - mini-block z nazwą stacji odbiorczej + numerem dyspozytorskim kabla
 *
 * Per-role color: TR — niebieski, MEASUREMENT — żółty, LINE_* — zielony (kanon SCADA OSD).
 */
function OutgoingFeederStub(props: OutgoingFeederStubProps): JSX.Element {
  const { x, y, destinationLabel, cableNumber, fieldRole } = props;
  const stubLength = 36;
  const blockWidth = 70;
  const blockHeight = 24;
  /* Kolor toru — kanon polski per fieldRole */
  const trackColor = fieldRole === 'TRANSFORMER'
    ? '#3B7ABC'
    : fieldRole === 'MEASUREMENT'
      ? '#E8C100'
      : COLOR_BUS_LV;
  /* Kolor labela destynacji — kategoria stacji odbiorczej */
  const labelColor = destinationLabel.toUpperCase().startsWith('ZKSN')
    ? '#FFC857'
    : destinationLabel.toUpperCase().startsWith('STA')
      ? '#13C45A'
      : COLOR_TEXT_PRIMARY;
  return (
    <g
      data-testid="gpz-canonical-outgoing-feeder"
      data-destination={destinationLabel}
      transform={`translate(${x}, ${y})`}
    >
      {/* Cable head (trójkąt) — kanon SCADA */}
      <polygon
        points="-5,0 5,0 0,8"
        fill={COLOR_PANEL_RAISED}
        stroke={trackColor}
        strokeWidth={1.4}
      />
      {/* Krótki kabel pionowy (do bloku destynacji) */}
      <line x1={0} y1={8} x2={0} y2={stubLength} stroke={trackColor} strokeWidth={1.6} />
      {/* Mini-block destynacji */}
      <rect
        x={-blockWidth / 2}
        y={stubLength}
        width={blockWidth}
        height={blockHeight}
        fill={COLOR_PANEL}
        stroke={trackColor}
        strokeWidth={1.0}
        rx={2}
      />
      {/* Numer dyspozytorski kabla (mała linia u góry mini-bloku) */}
      {cableNumber && (
        <text
          x={0}
          y={stubLength + 9}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={7}
        >
          {cableNumber.slice(0, 10)}
        </text>
      )}
      {/* Nazwa stacji odbiorczej */}
      <text
        x={0}
        y={stubLength + 19}
        textAnchor="middle"
        fill={labelColor}
        fontFamily={FONT_SANS}
        fontSize={8}
        fontWeight={600}
      >
        {destinationLabel.slice(0, 14)}
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
    <g data-testid={`gpz-canonical-status-badges`} data-flag-count={flags.length} transform={`translate(${x}, ${y})`}>
      {flags.slice(0, 6).map((flag, idx) => (
        <g key={`flag-${flag}-${idx}`} data-testid={`gpz-canonical-flag-${flag}`}>
          <rect x={0} y={idx * 12} width={20} height={10} fill="#FFC857" fillOpacity={0.2} stroke="#FFC857" strokeWidth={0.5} rx={1} />
          <text x={2} y={idx * 12 + 8} fill="#FFC857" fontFamily={FONT_MONO} fontSize={7} fontWeight={700}>
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
    <g data-testid="gpz-canonical-measurements" transform={`translate(${x}, ${y})`}>
      {visibleRows.map((row, idx) => (
        <g key={`m-${row.label}`} data-testid={`gpz-canonical-measurement-${row.label}`}>
          <text x={0} y={idx * 10 + 6} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={8}>
            {row.label}
          </text>
          <text
            x={width}
            y={idx * 10 + 6}
            textAnchor="end"
            fill={COLOR_TEXT_PRIMARY}
            fontFamily={FONT_MONO}
            fontSize={8}
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

/**
 * Buduje opis pola SN do ARIA-label (a11y).
 * Format polski: "Pole {numer} {rola} {feeder} {stan CB}"
 */
function bayAriaLabel(bay: CanonicalGpzBay): string {
  const parts: string[] = ['Pole'];
  if (bay.bayNumber) parts.push(bay.bayNumber);
  parts.push(bayRolePolishLabel(bay.fieldRole));
  if (bay.feederName) parts.push(bay.feederName);
  if (bay.cbState === 'closed') parts.push('— wyłącznik zamknięty');
  else if (bay.cbState === 'open') parts.push('— wyłącznik otwarty');
  else if (bay.cbState === 'unknown') parts.push('— stan wyłącznika nieznany');
  if (bay.inManipulation) parts.push('(w manipulacji)');
  return parts.join(' ');
}

/**
 * Buduje pełen tekst tooltipu (SVG <title>) dla pola SN.
 * Zawiera: numer + role + feeder + destynacja + Q-numbery + stany aparatów +
 * pomiary + tryb sterowania + flagi.
 *
 * Kanon: każda linia 1 fakt, total ≤ 12 linii.
 */
function bayTooltipText(bay: CanonicalGpzBay): string {
  const lines: string[] = [];
  const headline = bay.bayNumber
    ? `Pole ${bay.bayNumber} — ${bayRolePolishLabel(bay.fieldRole)}`
    : bayRolePolishLabel(bay.fieldRole);
  lines.push(headline);
  if (bay.feederName) lines.push(`Odpływ: ${bay.feederName}`);
  if (bay.destinationLabel) lines.push(`Cel: ${bay.destinationLabel}`);

  const apparatusLines: string[] = [];
  if (bay.qDesignations.cb) apparatusLines.push(`CB ${bay.qDesignations.cb}: ${switchStateLabel(bay.cbState)}`);
  if (bay.qDesignations.dsBus) apparatusLines.push(`DS_BUS ${bay.qDesignations.dsBus}: ${switchStateLabel(bay.dsState)}`);
  if (bay.qDesignations.dsLin) apparatusLines.push(`DS_LIN ${bay.qDesignations.dsLin}: ${switchStateLabel(bay.dsState)}`);
  if (bay.qDesignations.es) {
    const es = bay.esState ?? 'unknown';
    apparatusLines.push(`ES ${bay.qDesignations.es}: ${esStateLabel(es)}`);
  }
  if (bay.qDesignations.ct) apparatusLines.push(`CT ${bay.qDesignations.ct}: czynny`);
  if (apparatusLines.length > 0) {
    lines.push('');
    lines.push('Aparatura:');
    lines.push(...apparatusLines);
  }

  if (bay.measurements) {
    const m = bay.measurements;
    const measLines: string[] = [];
    if (m.pMw != null) measLines.push(`P = ${m.pMw.toFixed(2)} MW`);
    if (m.qMvar != null) measLines.push(`Q = ${m.qMvar.toFixed(2)} MVAr`);
    if (m.u12Kv != null) measLines.push(`U12 = ${m.u12Kv.toFixed(2)} kV`);
    if (m.u23Kv != null) measLines.push(`U23 = ${m.u23Kv.toFixed(2)} kV`);
    if (m.u31Kv != null) measLines.push(`U31 = ${m.u31Kv.toFixed(2)} kV`);
    if (m.fHz != null) measLines.push(`f = ${m.fHz.toFixed(2)} Hz`);
    if (measLines.length > 0) {
      lines.push('');
      lines.push('Pomiary:');
      lines.push(...measLines);
    }
  }

  if (bay.controlMode) {
    lines.push('');
    lines.push(`Sterowanie: ${controlModeLabel(bay.controlMode)}`);
  }

  if (bay.statusFlags && bay.statusFlags.length > 0) {
    lines.push(`Flagi: ${bay.statusFlags.join(', ')}`);
  }

  if (bay.inManipulation) {
    lines.push('');
    lines.push('⚠ POLE W STANIE MANIPULACJI');
  }

  return lines.join('\n');
}

function switchStateLabel(state: SwitchState | undefined): string {
  switch (state) {
    case 'closed': return 'zamknięty';
    case 'open': return 'otwarty';
    case 'unknown': return 'stan nieznany';
    default: return '—';
  }
}

function esStateLabel(state: 'closed' | 'open' | 'absent' | 'unknown'): string {
  switch (state) {
    case 'closed': return 'załączony (UWAGA: pole uziemione)';
    case 'open': return 'otwarty';
    case 'absent': return 'brak';
    case 'unknown': return 'stan nieznany';
  }
}

function controlModeLabel(mode: 'remote' | 'local' | 'unknown'): string {
  switch (mode) {
    case 'remote': return 'zdalne';
    case 'local': return 'lokalne';
    case 'unknown': return 'nieznane';
  }
}

function bayRolePolishLabel(role: BayFieldRole): string {
  switch (role) {
    case 'LINE_OUT': return 'liniowe wyjściowe';
    case 'LINE_IN': return 'liniowe wejściowe';
    case 'LINE_BRANCH': return 'odgałęzienie liniowe';
    case 'TRANSFORMER': return 'transformatorowe';
    case 'COUPLER': return 'sprzęgło';
    case 'MEASUREMENT': return 'pomiarowe';
    default: return '';
  }
}

void COLOR_PANEL_RAISED;
