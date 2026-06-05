/**
 * GpzRenderer — kanoniczny renderer GPZ (Phase 0A operator-grade rebuild).
 *
 * GPZ NIE jest ikoną ani prostokątem 200×80. GPZ to blok stacyjny z torem
 * mocy: zasilanie 110 kV → transformator 110/SN → szyny SN → pola
 * odpływowe SN. Renderer pokazuje minimalną poprawną strukturę inżynierską
 * od LOD 0; na LOD ≥ 1 deleguje do `GpzSwitchgearRenderer`, który dodaje
 * sekcje z faktycznymi polami i sprzęgłami.
 *
 * Reguły:
 *   - geometria deterministyczna; rozmiar wynika z `transformerCount /
 *     mvSectionCount / outgoingBayCount`.
 *   - kolor zaznaczenia z tokenu `COLOR_SELECTION` (nie hardkod).
 *   - stany diagnostyczne (`stale`, `invalid`) są widoczne, ale nieinwazyjne.
 *   - back-compat: stare wywołania bez nowych propsów dostają sensowne
 *     wartości domyślne (1 TR, 1 sekcja, 4 odpływy).
 */

import {
  COLOR_BUS_LV,
  COLOR_LINE_PRIMARY,
  COLOR_LINE_SECONDARY,
  COLOR_PANEL_RAISED,
  COLOR_PARTIAL,
  COLOR_REPORT_BLOCKED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_WARN,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
  STROKE_FIELD_TRACK_PX,
} from '../theme/tokens';
import type { LodLevel } from '../lod/LodPolicy';
import {
  GpzSwitchgearRenderer,
  type GpzCouplerDescriptor,
  type GpzSectionDescriptor,
  type TransformerMeasurements,
} from './GpzSwitchgearRenderer';
import type { GpzApparatusSelection } from './gpzApparatusSelection';

// =============================================================================
// Geometry constants
// =============================================================================

const HORIZONTAL_PADDING = 14;
const VERTICAL_PADDING = 14;
const HV_LINE_LENGTH = 22; // długość poziomej kreski 110 kV nad TR
const TR_GAP = 16; // odstęp między HV-line a TR
const TR_RADIUS = 9; // promień jednego "uzwojenia" symbolu TR
const TR_WINDING_GAP = 7; // pionowy odstęp między dwoma uzwojeniami
const TR_TO_BUS_GAP = 18; // odstęp między TR a górną szyną SN
const SECTION_BUS_GAP = 16; // odstęp między sekcjami szyn (pionowy)
const BUS_TO_BAYS_GAP = 14; // odstęp między ostatnią szyną a polami
const BAY_DROP_LENGTH = 16; // długość pionowej kreski pola odpływowego
const BAY_HORIZONTAL_PITCH = 14; // odstęp poziomy między polami

const MIN_BUS_LENGTH = 140;
const MIN_HEIGHT = 110;

// =============================================================================
// Public types
// =============================================================================

export interface GpzRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly voltageHighKv: number;
  /**
   * Czy `voltageHighKv` pochodzi z faktycznych danych ENM (transformer.uhv_kv
   * lub bus.voltage_kv) — `false` oznacza fallback display-only (Invariant 9).
   * Renderer pokazuje "?" zamiast wartości gdy `false`. Domyślnie `true`
   * (backwards compat).
   */
  readonly voltageHighKvKnown?: boolean;
  readonly voltageLowKv: number;
  readonly selected?: boolean;
  readonly onClick?: (id: string) => void;

  // ===== Phase 0A — operator-grade canonical structure =====
  /** Liczba transformatorów 110/SN (≥ 1). Domyślnie 1. */
  readonly transformerCount?: number;
  /** Liczba sekcji szyn SN (≥ 1). Domyślnie 1. */
  readonly mvSectionCount?: number;
  /** Liczba pól odpływowych SN. Domyślnie 4. */
  readonly outgoingBayCount?: number;
  /** Wyniki / dane są nieaktualne (badge ostrzegawczy, geometria niezmieniona). */
  readonly stale?: boolean;
  /** Konfiguracja jest niepoprawna / niekompletna (badge błędu, nieinwazyjny). */
  readonly invalid?: boolean;

  // ===== Phase 0A — delegacja do GpzSwitchgearRenderer (LOD ≥ 1) =====
  readonly lod?: LodLevel;
  /** Sekcje GPZ (z ENM `gpz_sections[]`) — używane tylko na LOD ≥ 1. */
  readonly sections?: readonly GpzSectionDescriptor[];
  /** Sprzęgła międzysekcyjne — LOD ≥ 1. */
  readonly couplers?: readonly GpzCouplerDescriptor[];
  /**
   * Sekcje strony 110 kV (HV bus). Włączają tryb two-bus topology w
   * GpzSwitchgearRenderer (LOD ≥ 1).
   */
  readonly hvSections?: readonly GpzSectionDescriptor[];
  /** Sprzęgła międzysekcyjne na 110 kV. */
  readonly hvCouplers?: readonly GpzCouplerDescriptor[];
  /** Pomiary i opisy stanu transformatorów (Temp. oleju, Uarn, NZACZ, MVA, flow). */
  readonly transformerMeasurements?: readonly TransformerMeasurements[];
  /** Tekst akcji w pasku tytułu (np. "Kasowanie sygnalizacji zabezpieczeń"). */
  readonly titleBarAction?: string;
  /**
   * Etykieta magistrali sieci terenowej (kanon SCADA). Pusty string ukrywa
   * Opis strefy wyprowadzeń SN, niezdefiniowane → domyślne "Wyprowadzenia SN".
   */
  readonly fieldTrunkLabel?: string;
  /** Liczba odpływów SN — używane do wnioskowania `outgoingBayCount` przy LOD 0 z ENM. */
  readonly feedersCount?: number;
  /** Refy transformatorów index-aligned do kolumn TR (włącza klik transformatora). */
  readonly transformerRefs?: readonly string[];
  readonly onClickSection?: (sectionId: string) => void;
  readonly onClickBay?: (bayRef: string) => void;
  readonly onDoubleClickBay?: (bayRef: string) => void;
  readonly onContextMenuBay?: (bayRef: string, evt: { clientX: number; clientY: number }) => void;
  readonly onContextMenuSection?: (sectionId: string, evt: { clientX: number; clientY: number }) => void;
  readonly onClickApparatus?: (selection: GpzApparatusSelection) => void;
  readonly onContextMenuApparatus?: (
    selection: GpzApparatusSelection,
    evt: { clientX: number; clientY: number },
  ) => void;
  readonly onClickKas?: (bayRef: string) => void;
  readonly onClickCoupler?: (couplerId: string) => void;
  readonly onClickTransformer?: (transformerRef: string) => void;
  readonly onResetSignals?: () => void;
}

// =============================================================================
// Renderer entry — decyzja delegacji
// =============================================================================

function shouldDelegateToSwitchgear(props: GpzRendererProps): boolean {
  if (props.lod === undefined) return false;
  if (props.lod < 1) return false;
  return (props.sections?.length ?? 0) > 0;
}

export function GpzRenderer(props: GpzRendererProps): JSX.Element {
  if (shouldDelegateToSwitchgear(props)) {
    return (
      <GpzSwitchgearRenderer
        id={props.id}
        x={props.x}
        y={props.y}
        name={props.name}
        voltageHighKv={props.voltageHighKv}
        voltageHighKvKnown={props.voltageHighKvKnown}
        voltageLowKv={props.voltageLowKv}
        sections={props.sections ?? []}
        couplers={props.couplers ?? []}
        hvSections={props.hvSections}
        hvCouplers={props.hvCouplers}
        transformerCount={props.transformerCount}
        transformerMeasurements={props.transformerMeasurements}
        transformerRefs={props.transformerRefs}
        titleBarAction={props.titleBarAction}
        fieldTrunkLabel={props.fieldTrunkLabel}
        selected={props.selected}
        onClick={props.onClick}
        onClickSection={props.onClickSection}
        onClickBay={props.onClickBay}
        onDoubleClickBay={props.onDoubleClickBay}
        onContextMenuBay={props.onContextMenuBay}
        onContextMenuSection={props.onContextMenuSection}
        onClickApparatus={props.onClickApparatus}
        onContextMenuApparatus={props.onContextMenuApparatus}
        onClickKas={props.onClickKas}
        onClickCoupler={props.onClickCoupler}
        onClickTransformer={props.onClickTransformer}
        onResetSignals={props.onResetSignals}
      />
    );
  }
  return <GpzCompactBlock {...props} />;
}

// =============================================================================
// GpzCompactBlock — kanoniczny minimalny tor 110 kV → TR → SN → odpływy
// =============================================================================

function compactGpzOverviewName(name: string): string {
  const trimmed = name.trim();
  const code = trimmed.match(/\bGPZ-[A-Z0-9]{1,4}\b/i)?.[0];
  if (code && trimmed.length > 16) return code.toUpperCase();
  return trimmed;
}

function GpzCompactBlock(props: GpzRendererProps): JSX.Element {
  const transformerCount = Math.max(1, props.transformerCount ?? 1);
  const mvSectionCount = Math.max(1, props.mvSectionCount ?? 1);
  const displayName = compactGpzOverviewName(props.name);
  // Jeśli liczba odpływów nie podana wprost, ustaw 4 (typowe minimum) lub
  // skorzystaj z `feedersCount` (z ENM) jeśli dostarczone.
  const outgoingBayCount = Math.max(
    0,
    props.outgoingBayCount ?? props.feedersCount ?? 4,
  );

  const baysWidth = Math.max(0, outgoingBayCount - 1) * BAY_HORIZONTAL_PITCH + 4;
  const busLength = Math.max(MIN_BUS_LENGTH, baysWidth + 2 * HORIZONTAL_PADDING);
  const totalWidth = busLength + 2 * HORIZONTAL_PADDING;

  const heightForStructure =
    VERTICAL_PADDING +
    18 + // miejsce na nazwę
    HV_LINE_LENGTH +
    TR_GAP +
    transformerCount * (2 * TR_RADIUS + TR_WINDING_GAP) +
    TR_TO_BUS_GAP +
    mvSectionCount * (STROKE_BUSBAR_PX + SECTION_BUS_GAP) +
    BUS_TO_BAYS_GAP +
    BAY_DROP_LENGTH +
    14;
  const totalHeight = Math.max(MIN_HEIGHT, heightForStructure);

  const stroke = props.selected ? COLOR_SELECTION : COLOR_LINE_PRIMARY;
  const strokeWidth = props.selected ? 2 : 1.5;

  return (
    <g
      data-testid={`sld-v2-gpz-${props.id}`}
      data-element-kind="gpz_block"
      data-element-id={props.id}
      data-transformer-count={String(transformerCount)}
      data-mv-section-count={String(mvSectionCount)}
      data-outgoing-bay-count={String(outgoingBayCount)}
      data-gpz-name={props.name}
      data-gpz-overview-label={displayName}
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
      {/* Korpus stacji */}
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

      {/* Nazwa GPZ (góra-lewa) */}
      <text
        x={HORIZONTAL_PADDING}
        y={VERTICAL_PADDING + 4}
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.bayLabel}
        fontWeight={700}
      >
        {displayName}
      </text>
      <text
        x={totalWidth - HORIZONTAL_PADDING}
        y={VERTICAL_PADDING + 4}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {props.voltageHighKv} / {props.voltageLowKv} kV
      </text>

      {/* Tor mocy: 110 kV → TR → szyny SN → odpływy */}
      <PowerTowerColumn
        cx={totalWidth / 2}
        startY={VERTICAL_PADDING + 18}
        transformerCount={transformerCount}
        mvSectionCount={mvSectionCount}
        outgoingBayCount={outgoingBayCount}
        busLength={busLength}
        voltageHighKv={props.voltageHighKv}
        voltageLowKv={props.voltageLowKv}
      />

      {/* Diagnostyczne badge (stale / invalid) — nieinwazyjne, prawy górny róg. */}
      {props.invalid && (
        <DiagnosticBadge
          cx={totalWidth - HORIZONTAL_PADDING}
          cy={VERTICAL_PADDING + 14}
          color={COLOR_REPORT_BLOCKED}
          titlePl="Konfiguracja GPZ jest niekompletna"
        />
      )}
      {!props.invalid && props.stale && (
        <DiagnosticBadge
          cx={totalWidth - HORIZONTAL_PADDING}
          cy={VERTICAL_PADDING + 14}
          color={COLOR_PARTIAL}
          titlePl="Wyniki nieaktualne — model uległ zmianie"
        />
      )}
    </g>
  );
}

// =============================================================================
// Sub-renderers
// =============================================================================

interface PowerTowerColumnProps {
  cx: number;
  startY: number;
  transformerCount: number;
  mvSectionCount: number;
  outgoingBayCount: number;
  busLength: number;
  voltageHighKv: number;
  voltageLowKv: number;
}

function PowerTowerColumn(props: PowerTowerColumnProps): JSX.Element {
  const {
    cx,
    startY,
    transformerCount,
    mvSectionCount,
    outgoingBayCount,
    busLength,
    voltageHighKv,
    voltageLowKv,
  } = props;

  // Y kursor — schodzimy w dół renderując kolejne sekcje toru mocy.
  let cursor = startY;

  // 110 kV — pozioma linia + label.
  const hvLineY = cursor;
  cursor += HV_LINE_LENGTH;

  // Pionowa kreska między 110 kV a transformatorem.
  const hvDropStart = hvLineY;
  const hvDropEnd = cursor + TR_GAP;
  cursor = hvDropEnd;

  // Transformator(y) — symbol IEC 60617 (dwa sprzężone okręgi) per TR.
  const transformersY: { topY: number; bottomY: number }[] = [];
  for (let i = 0; i < transformerCount; i++) {
    const topY = cursor + TR_RADIUS;
    const bottomY = topY + TR_RADIUS + TR_WINDING_GAP + TR_RADIUS;
    transformersY.push({ topY, bottomY });
    cursor = bottomY + (i < transformerCount - 1 ? 6 : 0);
  }
  cursor += TR_TO_BUS_GAP;

  // Pionowa kreska TR → góra szyny SN.
  const trToBusStart = transformersY[transformersY.length - 1].bottomY;
  const trToBusEnd = cursor;

  // Sekcje szyn SN.
  const sectionsY: number[] = [];
  for (let i = 0; i < mvSectionCount; i++) {
    sectionsY.push(cursor);
    cursor += SECTION_BUS_GAP;
  }
  cursor += BUS_TO_BAYS_GAP - SECTION_BUS_GAP;

  // Pola odpływowe — pionowe drops z ostatniej szyny.
  const lastBusY = sectionsY[sectionsY.length - 1];
  const baysY = lastBusY;
  const baysX = computeBayPositions(cx, outgoingBayCount);

  return (
    <g data-testid="sld-v2-gpz-power-tower">
      {/* Linia 110 kV — pozioma */}
      <line
        x1={cx - HV_LINE_LENGTH / 2}
        y1={hvLineY}
        x2={cx + HV_LINE_LENGTH / 2}
        y2={hvLineY}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_BUSBAR_PX}
        data-testid="sld-v2-gpz-hv-feed"
      />
      <text
        x={cx + HV_LINE_LENGTH / 2 + 4}
        y={hvLineY + 3}
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
      >
        {`Zasilanie ${voltageHighKv} kV`}
      </text>

      {/* Pionowy łącznik 110 kV → TR */}
      <line
        x1={cx}
        y1={hvDropStart}
        x2={cx}
        y2={hvDropEnd}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* Transformatory (dwa sprzężone okręgi per TR) */}
      {transformersY.map((tr, idx) => (
        <TransformerSymbol
          key={`tr-${idx}`}
          cx={cx}
          topCenterY={tr.topY}
          bottomCenterY={tr.bottomY - TR_RADIUS}
          designation={`TR${idx + 1}`}
        />
      ))}

      {/* Pionowy łącznik TR → szyny SN */}
      <line
        x1={cx}
        y1={trToBusStart}
        x2={cx}
        y2={trToBusEnd}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={STROKE_FIELD_TRACK_PX}
      />

      {/* Szyny SN (poziome) — zielona szyna SN (15 kV) zgodnie z konwencją
          dyspozytorską (COLOR_BUS_LV): odróżnia poziom SN od białego toru 110 kV
          (COLOR_BUS_HV) nad transformatorem i wiąże GPZ wizualnie z zasilanym
          zielonym torem mocy 15 kV. NIE koliduje z czerwienią (alarm/otwarty). */}
      {sectionsY.map((y, idx) => (
        <g key={`sn-bus-${idx}`} data-testid={`sld-v2-gpz-sn-bus-${idx}`}>
          <line
            x1={cx - busLength / 2}
            y1={y}
            x2={cx + busLength / 2}
            y2={y}
            stroke={COLOR_BUS_LV}
            strokeWidth={STROKE_BUSBAR_PX}
          />
          <text
            x={cx + busLength / 2 + 4}
            y={y + 3}
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
          >
            {`Sekcja SN ${roman(idx + 1)} (${voltageLowKv} kV)`}
          </text>
        </g>
      ))}

      {/* Pola odpływowe — pionowe kreski z ostatniej szyny */}
      {baysX.map((bx, idx) => (
        <line
          key={`bay-${idx}`}
          x1={bx}
          y1={baysY}
          x2={bx}
          y2={baysY + BAY_DROP_LENGTH}
          stroke={COLOR_LINE_SECONDARY}
          strokeWidth={STROKE_FIELD_TRACK_PX}
          data-testid={`sld-v2-gpz-outgoing-bay-${idx}`}
        />
      ))}
      {outgoingBayCount > 0 && (
        <text
          x={cx}
          y={baysY + BAY_DROP_LENGTH + 11}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.technicalPanel}
        >
          {`${outgoingBayCount}× pole odpływowe SN`}
        </text>
      )}
    </g>
  );
}

interface TransformerSymbolProps {
  cx: number;
  topCenterY: number;
  bottomCenterY: number;
  designation: string;
}

/**
 * Kanoniczny symbol transformatora 110/SN — dwa sprzężone okręgi (IEC 60617).
 *
 * Geometria stała; viewBox per symbol invariant.
 */
function TransformerSymbol(props: TransformerSymbolProps): JSX.Element {
  const { cx, topCenterY, bottomCenterY, designation } = props;
  return (
    <g data-testid="sld-v2-gpz-transformer-symbol">
      <circle
        cx={cx}
        cy={topCenterY}
        r={TR_RADIUS}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.4}
      />
      <circle
        cx={cx}
        cy={bottomCenterY}
        r={TR_RADIUS}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.4}
      />
      <title>{`Transformator 110/SN — ${designation}`}</title>
      {/* Etykieta TR po prawej stronie */}
      <text
        x={cx + TR_RADIUS + 4}
        y={(topCenterY + bottomCenterY) / 2 + 3}
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel}
        fontWeight={600}
      >
        {designation}
      </text>
    </g>
  );
}

interface DiagnosticBadgeProps {
  cx: number;
  cy: number;
  color: string;
  titlePl: string;
}

function DiagnosticBadge(props: DiagnosticBadgeProps): JSX.Element {
  return (
    <g data-testid="sld-v2-gpz-diagnostic-badge" data-diagnostic-color={props.color}>
      <circle cx={props.cx - 4} cy={props.cy - 4} r={4} fill={props.color} stroke={COLOR_WARN} strokeWidth={0.8}>
        <title>{props.titlePl}</title>
      </circle>
    </g>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function computeBayPositions(cx: number, count: number): number[] {
  if (count <= 0) return [];
  const totalWidth = (count - 1) * BAY_HORIZONTAL_PITCH;
  const startX = cx - totalWidth / 2;
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(startX + i * BAY_HORIZONTAL_PITCH);
  }
  return positions;
}

function roman(n: number): string {
  if (n <= 0) return '';
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  let value = n;
  for (const [v, sym] of map) {
    while (value >= v) {
      result += sym;
      value -= v;
    }
  }
  return result;
}
