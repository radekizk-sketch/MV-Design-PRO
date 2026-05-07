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
  COLOR_BADGE_BG_LIGHT,
  COLOR_BADGE_BG_RED,
  COLOR_BADGE_BG_YELLOW,
  COLOR_BADGE_STATUS_BLOCKED,
  COLOR_BADGE_STATUS_NEUTRAL,
  COLOR_BADGE_STATUS_OK,
  COLOR_BADGE_TEXT_DARK,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_GROUND_FAULT,
  COLOR_KAS_LED,
  COLOR_LINE_PRIMARY,
  COLOR_MANIPULATION_BG,
  COLOR_MEASUREMENT_VALUE,
  COLOR_NODE,
  COLOR_PANEL,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_MUTED,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
  STROKE_BUSBAR_PX,
  STROKE_FIELD_TRACK_PX,
  STROKE_TRUNK_LINE_PX,
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
const BAY_COLUMN_WIDTH = 64;
const BAY_COLUMN_HEIGHT = 110;
const BAY_GAP = 6;
const BAY_HEADER_HEIGHT = 12;
const BAY_NUMBER_GAP = 14;

/* Vertical "Sterowanie zdalne/lokalne" label on left margin of bay. */
const STEROWANIE_LABEL_X_OFFSET = 6;
const STEROWANIE_FONT_SIZE = 7;
const COUPLER_BAY_WIDTH = 120;
const COUPLER_BAY_HEIGHT = BAY_COLUMN_HEIGHT;
const COUPLER_LEG_INSET = 18;
const COUPLER_DS_OFFSET_Y = 22;
const COUPLER_HORIZONTAL_OFFSET_Y = 36;
const COUPLER_BAY_NUMBER_OFFSET_Y = 8;
const SECTION_INTER_GAP = 28;
const APPARATUS_PITCH = 18;
const CB_SIZE = 9;
const DS_RADIUS = 4.5;
const TRIANGLE_SIZE = 6;
const CT_RADIUS = 3.5;
const SECTION_BUS_OVERHANG = 10;
const VERTICAL_PADDING = 10;
const HORIZONTAL_PADDING = 14;

/* Apparatus column geometry inside bay (left-center of column). */
const APPARATUS_COL_X_OFFSET = 18;
/* State-badge column geometry inside bay (right of apparatus). */
const BADGE_COL_X_OFFSET = 36;
const BADGE_WIDTH = 22;
const BADGE_LABEL_HEIGHT = 8;
const BADGE_STATUS_HEIGHT = 8;
const BADGE_ROW_HEIGHT = BADGE_LABEL_HEIGHT + BADGE_STATUS_HEIGHT + 1; // 17
const BADGE_FONT_SIZE = 7;

/* KAS LED + label (under bay number). */
const KAS_LED_RADIUS = 3;
const KAS_ROW_HEIGHT = 16;

/* Measurement panel (under KAS row). */
const MEASUREMENT_ROW_HEIGHT = 10;
const MEASUREMENT_PANEL_HEADER_HEIGHT = 12;
const MEASUREMENT_FONT_SIZE = 8;

/* Outgoing feeder + magistrala SN (kanon SCADA two-bus). */
const OUTGOING_FEEDER_DROP_PX = 36;
const FIELD_TRUNK_GAP_PX = 16;
const FIELD_TRUNK_FONT_SIZE = 10;
const FEEDER_LABEL_FONT_SIZE = 8;

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

/**
 * Stan funkcji wtórnej (zabezpieczenia / automatyki) na polu.
 *
 *  - `enabled`   → "Zal." (zielony) — funkcja aktywna w gotowości
 *  - `disabled`  → "Odbl." (szary) — funkcja odblokowana ale nieaktywna
 *  - `restricted`→ "Odst." (czerwony) — odstawiona ręcznie
 *  - `blocked`   → "Zabl." (czerwony bg) — zablokowana logicznie
 */
export type SecondaryFlagState = 'enabled' | 'disabled' | 'restricted' | 'blocked';

/**
 * Architektura wtórna pola — flagi zabezpieczeń i automatyk.
 *
 * Każde pole SCADA pokazuje stos badge'y dla aktywnych funkcji wtórnych:
 *   SPZ  — Samoczynne Ponowne Załączenie (auto-reclosure)
 *   SCO  — Samoczynne Częstotliwościowe Odciążanie
 *   OWG  — Ochrona Wstecznie Generatora / Overcurrent Generator
 *   NZ   — Niskonapięciowe Zabezpieczenie
 *   LRW  — Lokalna Rezerwa Wyłącznikowa
 *   ARN  — Automatyczna Regulacja Napięcia
 *   BKR  — Blokada wyłącznika (transformatorowy)
 *   STYCZ.— Stycznik (contactor)
 *   AWSC — Automatyczne Wyłączenie Sieci Cieplnej / dedykowana automatyka
 *   ZS   — Zwarcie Szynowe
 *   SZR  — Samoczynne Załączenie Rezerwy
 */
export interface BaySecondaryFlags {
  readonly spz?: SecondaryFlagState;
  readonly sco?: SecondaryFlagState;
  readonly owg?: SecondaryFlagState;
  readonly nz?: SecondaryFlagState;
  readonly lrw?: SecondaryFlagState;
  readonly arn?: SecondaryFlagState;
  readonly bkr?: SecondaryFlagState;
  readonly stycz?: SecondaryFlagState;
  readonly awsc?: SecondaryFlagState;
  readonly zs?: SecondaryFlagState;
  readonly szr?: SecondaryFlagState;
}

/**
 * Pomiary pola — wyświetlane w panelu pomiarowym pod numerem pola.
 *
 * Wszystkie wartości są opcjonalne — renderer pokazuje tylko te dostarczone.
 * Kanoniczna kolejność wierszy w panelu (top → bottom):
 *   napięcia fazowe (U1/U2/U3) → międzyfazowe (U12/U23/U31) → zerowe (U0)
 *   → częstotliwość (f) → moce (P/Q/Idł) → prądy (I1/I2/I3).
 *
 * Jednostki:
 *   u1..3, u12..31, u0 — kV (napięcia)
 *   f                  — Hz (częstotliwość)
 *   p, q               — MW / Mvar
 *   i1..3              — A
 *   idl                — kA (prąd doziemny)
 *
 * Typy bayów SCADA (pełna gama referencyjna):
 *   - Outgoing line:  P, Q, I1-3
 *   - PN (voltage):   U1-3, U12-31, U0, f
 *   - TR feeder:      P, Q, I1-3 + opcjonalnie U
 *   - Wszystkie:      f opcjonalna
 */
export interface BayMeasurements {
  readonly p?: number;
  readonly q?: number;
  readonly i1?: number;
  readonly i2?: number;
  readonly i3?: number;
  readonly idl?: number;
  readonly f?: number;
  readonly u1?: number;
  readonly u2?: number;
  readonly u3?: number;
  readonly u12?: number;
  readonly u23?: number;
  readonly u31?: number;
  readonly u0?: number;
}

/** Stan markera zwarcia doziemnego (cyan circle u góry pola). */
export type GroundFaultMarkerState = 'normal' | 'detected' | 'fault';

/**
 * Tryb sterowania pola — wyświetlany jako pionowa etykieta na lewym
 * marginesie kolumny pola.
 *   - `remote` → "STEROWANIE ZDALNE" (zielony)
 *   - `local`  → "STEROWANIE LOKALNE" (żółty/ostrzegawczy)
 *   - `unknown`→ etykieta przygaszona
 */
export type BayControlMode = 'remote' | 'local' | 'unknown';

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
  /**
   * Architektura wtórna pola — stos badge'y SPZ/SCO/OWG/NZ/LRW/ARN/...
   * Renderowane tylko jeśli `secondary` jest dostarczone.
   */
  readonly secondary?: BaySecondaryFlags;
  /** Przekładnia CT, np. "200/5", "300/5". Wyświetlana obok markera CT. */
  readonly ctRatio?: string;
  /** Czy renderować przycisk KAS (kasowanie sygnalizacji) pod numerem pola. */
  readonly hasKasButton?: boolean;
  /** Marker zwarcia doziemnego (cyan circle u góry pola). */
  readonly groundFault?: GroundFaultMarkerState;
  /** Czy pole jest w stanie manipulacji (yellow background highlight). */
  readonly inManipulation?: boolean;
  /** Pomiary pola — renderowane w panelu pod numerem pola. */
  readonly measurements?: BayMeasurements;
  /**
   * Tryb sterowania pola — wyświetlany jako pionowa etykieta na lewym
   * marginesie ("STEROWANIE ZDALNE" / "STEROWANIE LOKALNE"). Brak → brak etykiety.
   */
  readonly controlMode?: BayControlMode;
  /**
   * Numer P-* identyfikatora aparatu (np. "P133", "C434", "PE32").
   * Wyświetlany jako mała przygaszona etykieta pod LED-em KAS. Wymaga
   * `hasKasButton: true` żeby był widoczny.
   */
  readonly pNumber?: string;
  /**
   * Wychodzący feeder pola liniowego (kanoniczny dla bays
   * `LINE_OUT`/`GPZ_LINE_BAY`/`LINE_BRANCH`). Definiuje cel kabla wychodzącego
   * z głowicy do magistrali sieci terenowej.
   *
   * Renderer w trybie two-bus rozszerza kolumnę pola: pionowy kabel z
   * cable-head w dół do trunk line, oznaczenie celu (np. "→ ST-001 SADY"),
   * koloryzacja zgodna z `energized` (zielony pod napięciem, szary
   * de-energized).
   *
   * Jeśli pole nie jest pole liniowe (np. TRANSFORMER, MEASUREMENT) — feeder
   * nie powinien być definiowany.
   */
  readonly outgoingFeeder?: {
    /** Etykieta celu (np. "→ Sady ST-001", "→ NMO-12"). */
    readonly destination: string;
    /** Czy feeder pod napięciem (driver kolorystyki). */
    readonly energized?: boolean;
    /** Numer odpływu / linii (np. "L-203"). Renderowany jako sub-label. */
    readonly feederNumber?: string;
  };
}

/**
 * Kierunek przepływu mocy przez transformator (kanon SCADA — strzałka pod TR).
 *   - `down` → moc płynie z 110 kV w dół do SN (nominalny tryb GPZ)
 *   - `up`   → moc płynie z SN do 110 kV (eksport, np. duże źródło OZE)
 *   - `none` → brak strzałki (brak danych lub TR wyłączony)
 */
export type TransformerPowerFlow = 'down' | 'up' | 'none';

/**
 * Pomiary i opisy stanu transformatora wyświetlane przy symbolu TR.
 *
 * Wszystkie pola opcjonalne — renderer pokazuje wyłącznie dostarczone wartości.
 * Kanon SCADA (Tauron / Energa / PSE):
 *   - `oilTemperatureC` → temp. oleju w °C (np. 47.2)
 *   - `uarnKv`          → napięcie regulacyjne odczepu (np. 15.4)
 *   - `nzacz`           → numer zakresu odczepu (np. "9/19" lub "NZACZ 9")
 *   - `flow`            → kierunek przepływu mocy
 *   - `apparentMva`     → moc pozorna w MVA (np. 16.0)
 */
export interface TransformerMeasurements {
  readonly oilTemperatureC?: number;
  readonly uarnKv?: number;
  readonly nzacz?: string;
  readonly flow?: TransformerPowerFlow;
  readonly apparentMva?: number;
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
  /** Numer pola lewej nogi sprzęgła (np. "15"). */
  readonly bayNumberLeft?: string;
  /** Numer pola prawej nogi sprzęgła (np. "17"). */
  readonly bayNumberRight?: string;
  /**
   * Architektura wtórna sprzęgła — najczęściej SZR (Samoczynne Załączenie
   * Rezerwy), opcjonalnie SPZ. Renderowane jako stos badge'y.
   */
  readonly secondary?: BaySecondaryFlags;
  /** Czy renderować przycisk "KAS SP" (kasowanie sygnalizacji sprzęgła poprzecznego). */
  readonly hasKasSp?: boolean;
  /** Czy renderować przycisk "KAS SZR" (kasowanie sygnalizacji SZR). */
  readonly hasKasSzr?: boolean;
  /** Prąd pomiarowy sprzęgła w A — wyświetlany pod CB jako "I  X". */
  readonly currentI?: number;
  /** Czy sprzęgło jest w stanie manipulacji (yellow background). */
  readonly inManipulation?: boolean;
}

export interface GpzSwitchgearRendererProps {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly voltageHighKv: number;
  readonly voltageLowKv: number;
  /**
   * Sekcje strony SN (np. 15 kV) — main bus rendererowany tradycyjnie u dołu
   * w trybie two-bus albo w środku w trybie single-bus.
   */
  readonly sections: readonly GpzSectionDescriptor[];
  readonly couplers: readonly GpzCouplerDescriptor[];
  /**
   * Sekcje strony 110 kV (HV bus). Obecność włącza tryb **two-bus**:
   *   ── 110 kV bus ── (HV bays poniżej)
   *           |  TR1 / TR2 / ...
   *   ── 15 kV bus ── (LV bays poniżej)
   *
   * Pusta tablica lub brak → tryb single-bus (zachowanie sprzed Phase 0A
   * refinement two-bus).
   */
  readonly hvSections?: readonly GpzSectionDescriptor[];
  readonly hvCouplers?: readonly GpzCouplerDescriptor[];
  readonly transformerCount?: number;
  /**
   * Pomiary i opisy stanu transformatorów wyświetlane przy symbolach TR (Y/Δ).
   * Jeśli podano `n` elementów, każdy element odnosi się do TR o tym samym
   * indeksie (TR1 → index 0, TR2 → index 1). Brak elementu → brak panelu
   * pomiarowego dla danego TR.
   */
  readonly transformerMeasurements?: readonly TransformerMeasurements[];
  /**
   * Tekst akcji w pasku tytułu (kanon SCADA: "Kasowanie sygnalizacji
   * zabezpieczeń"). Renderowany po prawej stronie pod napięciem.
   */
  readonly titleBarAction?: string;
  /**
   * Etykieta magistrali sieci terenowej — pozioma trunk line poniżej pól
   * liniowych SN, do której dochodzą feedery wychodzące. Domyślnie:
   * "Magistrala SN — sieć terenowa". Pusty string ukrywa trunk line.
   *
   * Renderowany tylko w trybie two-bus i tylko jeśli przynajmniej jedno pole
   * LV ma `outgoingFeeder`.
   */
  readonly fieldTrunkLabel?: string;
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
  const sortedHvSections = props.hvSections
    ? [...props.hvSections].sort((a, b) => a.order - b.order)
    : [];
  const transformerCount = Math.max(1, props.transformerCount ?? 1);
  const isTwoBus = sortedHvSections.length > 0;
  const layout = computeSwitchgearLayout(sortedSections, props.couplers);
  const hvLayout = isTwoBus
    ? computeSwitchgearLayout(sortedHvSections, props.hvCouplers ?? [])
    : null;

  /* Maksymalna głębokość footera (KAS + panel pomiarowy) wśród wszystkich pól. */
  const footerDepth = computeMaxFooterDepth(sortedSections);
  const hvFooterDepth = isTwoBus ? computeMaxFooterDepth(sortedHvSections) : 0;

  const layoutMaxWidth = Math.max(layout.totalWidth, hvLayout?.totalWidth ?? 0);
  const totalWidth = Math.max(360, layoutMaxWidth + 2 * HORIZONTAL_PADDING);

  /* Czy istnieje przynajmniej jedno pole liniowe SN z outgoing feeder? */
  const hasOutgoingFeeders =
    isTwoBus && sortedSections.some((s) => s.bays.some((b) => b.outgoingFeeder));
  /* Czy renderować magistralę SN (trunk line)? Domyślnie tak, gdy są feedery. */
  const showFieldTrunk = hasOutgoingFeeders && props.fieldTrunkLabel !== '';
  const fieldTrunkLabel = props.fieldTrunkLabel ?? 'Magistrala SN — sieć terenowa';

  const TWO_BUS_TR_GAP = 84; // TR symbol + measurements between HV LV buses
  const fieldTrunkZoneHeight = hasOutgoingFeeders
    ? OUTGOING_FEEDER_DROP_PX + (showFieldTrunk ? FIELD_TRUNK_GAP_PX + FIELD_TRUNK_FONT_SIZE + 6 : 0)
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
        {props.voltageHighKv} / {props.voltageLowKv} kV
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

          {/* Pozioma szyna 110 kV (HV bus) */}
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={hvBusY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={hvBusY}
            stroke={COLOR_DEVICE_OPEN}
            strokeWidth={STROKE_BUSBAR_PX}
            data-testid="sld-v2-gpz-switchgear-hv-bus"
          />
          <text
            x={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG - 4}
            y={hvBusY + 3}
            textAnchor="end"
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
            data-testid="sld-v2-gpz-switchgear-hv-bus-label-left"
          >
            {`${props.voltageHighKv}kV`}
          </text>
          <text
            x={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG + 4}
            y={hvBusY + 3}
            textAnchor="start"
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel}
            fontWeight={600}
            data-testid="sld-v2-gpz-switchgear-hv-bus-label-right"
          >
            {`${props.voltageHighKv}kV`}
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
                />
              );
            }
            return (
              <CouplerBay
                key={`hv-coupler-${cell.coupler.couplerId}`}
                x={HORIZONTAL_PADDING + cell.x}
                busY={hvBusY}
                coupler={cell.coupler}
              />
            );
          })}

          {/* HV etykiety sekcji */}
          {hvLayout.sectionLabels.map((label) => (
            <text
              key={`hv-label-${label.sectionId}`}
              x={HORIZONTAL_PADDING + label.x}
              y={hvBusY - 4}
              fill={COLOR_TEXT_SECONDARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.technicalPanel}
              fontWeight={700}
              data-testid={`sld-v2-gpz-hv-section-label-${label.sectionId}`}
            >
              {label.text}
            </text>
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
          />

          {/* Pozioma szyna 15 kV (LV bus) */}
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={lvBusY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={lvBusY}
            stroke={COLOR_DEVICE_CLOSED}
            strokeWidth={STROKE_BUSBAR_PX}
            data-testid="sld-v2-gpz-switchgear-lv-bus"
          />
          <text
            x={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG - 4}
            y={lvBusY + 3}
            textAnchor="end"
            fill={COLOR_DEVICE_CLOSED}
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
            fill={COLOR_DEVICE_CLOSED}
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
                />
              );
            }
            return (
              <CouplerBay
                key={`lv-coupler-${cell.coupler.couplerId}`}
                x={HORIZONTAL_PADDING + cell.x}
                busY={lvBusY}
                coupler={cell.coupler}
              />
            );
          })}

          {/* LV etykiety sekcji */}
          {layout.sectionLabels.map((label) => (
            <text
              key={`lv-label-${label.sectionId}`}
              x={HORIZONTAL_PADDING + label.x}
              y={lvBusY - 4}
              fill={COLOR_TEXT_SECONDARY}
              fontFamily={FONT_SANS}
              fontSize={FONT_SIZES.technicalPanel}
              fontWeight={700}
              data-testid={`sld-v2-gpz-section-label-${label.sectionId}`}
            >
              {label.text}
            </text>
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
}

function HvTowerColumn(props: HvTowerColumnProps): JSX.Element {
  const { cx, topY, bottomY, transformerCount, voltageHighKv, voltageLowKv, measurements } = props;

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

          {/* Strzałka kierunku przepływu (kanon SCADA: nad TR) */}
          {measurements?.[idx]?.flow && measurements[idx].flow !== 'none' && (
            <TransformerFlowArrow
              cx={trX - TR_RADIUS - 6}
              cy={(trTopCenterY + trBottomCenterY) / 2}
              direction={measurements[idx].flow as 'up' | 'down'}
              trIndex={idx}
            />
          )}

          {/* Panel pomiarów TR po lewej (Temp. oleju / Uarn / NZACZ / MVA) */}
          {measurements?.[idx] && (
            <TransformerMeasurementPanel
              x={trX - TR_RADIUS - 12}
              y={(trTopCenterY + trBottomCenterY) / 2 + TR_RADIUS + 12}
              data={measurements[idx]}
              trIndex={idx}
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
      ))}
    </g>
  );
}

// =============================================================================
// Field trunk zone (pola liniowe SN → magistrala sieci terenowej)
// =============================================================================

interface FieldTrunkZoneProps {
  /** Cells z layoutu LV (zawiera bays + couplery z pozycjami x). */
  readonly cells: readonly Cell[];
  /** Poziome offset dla wszystkich pozycji (HORIZONTAL_PADDING). */
  readonly hOffset: number;
  /** Pełna szerokość rozdzielni (do trunk line endpoints). */
  readonly totalWidth: number;
  /** Y pozycja dolnej krawędzi LV bays (po footerze) — start zone. */
  readonly lvBaysBottomY: number;
  /** Czy renderować trunk line + label. */
  readonly showTrunk: boolean;
  /** Etykieta magistrali (np. "Magistrala SN — sieć terenowa"). */
  readonly trunkLabel: string;
}

/**
 * Renderuje strefę magistrali sieci terenowej.
 *
 * Każde pole liniowe SN z `outgoingFeeder` rozszerza pionowy kabel od dolnej
 * krawędzi LV bay do trunk line. Każdy feeder ma etykietę celu (np. "→ Sady
 * ST-001") i opcjonalnie numer linii.
 *
 * Trunk line — pozioma linia ciągła łącząca wszystkie outgoing feedery; pod
 * nią etykieta zbiorcza (kanon SCADA: "Magistrala SN — sieć terenowa").
 */
function FieldTrunkZone(props: FieldTrunkZoneProps): JSX.Element {
  const { cells, hOffset, totalWidth, lvBaysBottomY, showTrunk, trunkLabel } = props;
  const trunkY = lvBaysBottomY + OUTGOING_FEEDER_DROP_PX;

  /* Zbieramy bays z outgoingFeeder + ich centerline X. */
  const feederColumns = cells
    .filter((cell): cell is Extract<Cell, { kind: 'bay' }> => cell.kind === 'bay')
    .filter((cell) => cell.bay.outgoingFeeder !== undefined)
    .map((cell) => ({
      bay: cell.bay,
      cx: hOffset + cell.x + APPARATUS_COL_X_OFFSET,
      bayBottomX: hOffset + cell.x + BAY_COLUMN_WIDTH / 2,
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
      {/* Pionowe kable wychodzące z każdego pola liniowego do trunk */}
      {feederColumns.map((col) => {
        const feeder = col.bay.outgoingFeeder!;
        const energized = feeder.energized ?? true;
        const stroke = energized ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED;
        return (
          <g
            key={`feeder-${col.bay.bayRef}`}
            data-testid={`sld-v2-gpz-outgoing-feeder-${col.bay.bayRef}`}
            data-feeder-energized={energized ? 'true' : 'false'}
          >
            <line
              x1={col.cx}
              y1={lvBaysBottomY}
              x2={col.cx}
              y2={trunkY}
              stroke={stroke}
              strokeWidth={STROKE_FIELD_TRACK_PX}
            />
            {/* Etykieta celu (przy trunk, pod kablem) */}
            <text
              x={col.bayBottomX}
              y={trunkY + (showTrunk ? FIELD_TRUNK_GAP_PX + FIELD_TRUNK_FONT_SIZE : 12)}
              textAnchor="middle"
              fill={energized ? COLOR_TEXT_PRIMARY : COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={FEEDER_LABEL_FONT_SIZE}
              fontWeight={600}
              data-testid={`sld-v2-gpz-outgoing-feeder-destination-${col.bay.bayRef}`}
            >
              {feeder.destination}
            </text>
            {feeder.feederNumber && (
              <text
                x={col.bayBottomX}
                y={trunkY + (showTrunk ? FIELD_TRUNK_GAP_PX + FIELD_TRUNK_FONT_SIZE * 2 + 2 : 22)}
                textAnchor="middle"
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

      {/* Magistrala SN — pozioma trunk line */}
      {showTrunk && (
        <>
          <line
            x1={HORIZONTAL_PADDING - SECTION_BUS_OVERHANG}
            y1={trunkY}
            x2={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG}
            y2={trunkY}
            stroke={COLOR_DEVICE_CLOSED}
            strokeWidth={STROKE_TRUNK_LINE_PX}
            data-testid="sld-v2-gpz-field-trunk-line"
          />
          {/* Etykieta trunk po prawej */}
          <text
            x={totalWidth - HORIZONTAL_PADDING + SECTION_BUS_OVERHANG + 4}
            y={trunkY + 3}
            textAnchor="start"
            fill={COLOR_TEXT_SECONDARY}
            fontFamily={FONT_SANS}
            fontSize={FONT_SIZES.technicalPanel - 1}
            fontWeight={600}
            data-testid="sld-v2-gpz-field-trunk-label"
          >
            {trunkLabel}
          </text>
        </>
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
  const { cx, topY, bottomY, transformerCount, voltageHighKv, voltageLowKv, measurements } = props;
  const trSpacing = 80;
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
      {trsX.map((trX, idx) => (
        <g
          key={`twobus-tr-${idx}`}
          data-testid="sld-v2-gpz-switchgear-transformer-symbol"
          data-tr-index={String(idx)}
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
  const fill = direction === 'up' ? COLOR_BADGE_BG_YELLOW : COLOR_KAS_LED;
  const size = 4;
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
}

/**
 * Panel pomiarów transformatora (Temp. oleju / Uarn / NZACZ / MVA).
 * Renderowany po lewej stronie symbolu TR jako stos label/value.
 */
function TransformerMeasurementPanel(props: TransformerMeasurementPanelProps): JSX.Element {
  const { x, y, data, trIndex } = props;
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
              x={x}
              y={rowY}
              textAnchor="end"
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.label}
            </text>
            <text
              x={x + 4}
              y={rowY}
              textAnchor="start"
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
  const apparatusCx = x + APPARATUS_COL_X_OFFSET;

  /* Y-kursor: kolumna jest hanging-DOWN, busY = górna krawędź. */
  const headerY = busY + 2;
  const bodyTopY = headerY + BAY_HEADER_HEIGHT + 2;
  const cbY = bodyTopY + 8;
  const ctY = cbY + APPARATUS_PITCH;
  const dsY = ctY + APPARATUS_PITCH;
  const triangleY = dsY + APPARATUS_PITCH * 0.85;
  const columnBottomY = busY + BAY_COLUMN_HEIGHT;

  /* Tło kolumny — yellow manipulation highlight ma pierwszeństwo nad neutralnym. */
  const columnFill = bay.inManipulation ? COLOR_MANIPULATION_BG : COLOR_PANEL;
  const columnStroke = bay.inManipulation ? COLOR_BADGE_BG_YELLOW : COLOR_TEXT_MUTED;
  const columnStrokeOpacity = bay.inManipulation ? 0.9 : 0.3;

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
        strokeWidth={bay.inManipulation ? 1.2 : 0.8}
        rx={1}
        data-testid="sld-v2-gpz-bay-body"
      />

      {/* Nagłówek pola — feeder name lub designation */}
      <text
        x={apparatusCx}
        y={headerY + 9}
        textAnchor="middle"
        fill={COLOR_TEXT_PRIMARY}
        fontFamily={FONT_SANS}
        fontSize={FONT_SIZES.technicalPanel - 1}
        fontWeight={600}
        data-testid="sld-v2-gpz-bay-header"
      >
        {(bay.feederName ?? bay.designation).slice(0, 8)}
      </text>

      {/* Vertical "STEROWANIE ZDALNE/LOKALNE" label na lewym marginesie */}
      {bay.controlMode && (
        <SterowanieLabel
          cx={x + STEROWANIE_LABEL_X_OFFSET}
          cyTop={bodyTopY + 4}
          cyBottom={busY + BAY_COLUMN_HEIGHT - 4}
          mode={bay.controlMode}
        />
      )}

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

      {/* CB (filled square) */}
      <ApparatusCbSquare cx={apparatusCx} cy={cbY} state={cbState} energized={energization === 'energized'} />

      {/* CT primary (small open circle) + ratio label po lewej */}
      <CtPrimary cx={apparatusCx} cy={ctY} ratio={bay.ctRatio} />

      {/* DS (filled circle) */}
      <ApparatusDsCircle cx={apparatusCx} cy={dsY} state={dsState} energized={energization === 'energized'} />

      {/* Cable head triangle (downward) */}
      <ApparatusCableHead cx={apparatusCx} cy={triangleY} energized={energization === 'energized'} />

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
        <KasButton cx={x + BAY_COLUMN_WIDTH / 2} cy={kasY} pNumber={bay.pNumber} />
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

      {/* Tooltip aria. */}
      <title>{`${bay.designation} (${bay.fieldRole}) — ${describeEnergizationPl(energization)}`}</title>
    </g>
  );
}

/* =============================================================================
   SCADA decorations: BadgeStack, KasButton, MeasurementPanel, GroundFaultMarker, CtPrimary
   ============================================================================= */

interface BadgeStackProps {
  readonly x: number;
  readonly y: number;
  readonly flags: BaySecondaryFlags;
}

/** Renderuje stos badge'y zabezpieczeń (SPZ/SCO/OWG/NZ/LRW/ARN/...). */
function BadgeStack(props: BadgeStackProps): JSX.Element {
  const { x, y, flags } = props;
  const items = collectBadges(flags);
  return (
    <g data-testid="sld-v2-gpz-bay-badge-stack" data-badge-count={String(items.length)}>
      {items.map((item, idx) => (
        <BadgeRow
          key={item.code}
          x={x}
          y={y + idx * BADGE_ROW_HEIGHT}
          code={item.code}
          state={item.state}
        />
      ))}
    </g>
  );
}

interface BadgeRowProps {
  readonly x: number;
  readonly y: number;
  readonly code: string;
  readonly state: SecondaryFlagState;
}

function BadgeRow(props: BadgeRowProps): JSX.Element {
  const { x, y, code, state } = props;
  const visual = badgeVisual(code, state);
  const labelTextY = y + BADGE_LABEL_HEIGHT - 1.5;
  const statusTextY = y + BADGE_LABEL_HEIGHT + BADGE_STATUS_HEIGHT - 1;
  return (
    <g
      data-testid={`sld-v2-gpz-bay-badge-${code.toLowerCase()}`}
      data-badge-code={code}
      data-badge-state={state}
    >
      <rect
        x={x}
        y={y}
        width={BADGE_WIDTH}
        height={BADGE_LABEL_HEIGHT}
        fill={visual.labelBg}
        stroke={visual.labelBorder}
        strokeWidth={0.5}
        rx={1}
      />
      <text
        x={x + BADGE_WIDTH / 2}
        y={labelTextY}
        textAnchor="middle"
        fill={visual.labelFg}
        fontFamily={FONT_SANS}
        fontSize={BADGE_FONT_SIZE}
        fontWeight={700}
      >
        {code}
      </text>
      <text
        x={x + BADGE_WIDTH / 2}
        y={statusTextY}
        textAnchor="middle"
        fill={visual.statusColor}
        fontFamily={FONT_SANS}
        fontSize={BADGE_FONT_SIZE - 0.5}
        fontWeight={600}
      >
        {statusLabel(state)}
      </text>
    </g>
  );
}

interface KasButtonProps {
  readonly cx: number;
  readonly cy: number;
  /** Etykieta przycisku (domyślnie "KAS"). Sprzęgło używa "KAS SP", "KAS SZR". */
  readonly label?: string;
  /** Test-id rodzica (domyślnie "sld-v2-gpz-bay-kas"). */
  readonly testId?: string;
  /** Test-id LED (domyślnie "sld-v2-gpz-bay-kas-led"). */
  readonly ledTestId?: string;
  /** Numer P-* identyfikatora pod LED-em (np. "P133", "C434"). Renderowany gdy podany. */
  readonly pNumber?: string;
}

function KasButton(props: KasButtonProps): JSX.Element {
  const {
    cx,
    cy,
    label = 'KAS',
    testId = 'sld-v2-gpz-bay-kas',
    ledTestId = 'sld-v2-gpz-bay-kas-led',
    pNumber,
  } = props;
  return (
    <g data-testid={testId} data-kas-label={label}>
      <text
        x={cx - 4}
        y={cy + 1}
        textAnchor="end"
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={9}
        fontWeight={700}
      >
        {label}
      </text>
      <circle
        cx={cx + 4}
        cy={cy - 2}
        r={KAS_LED_RADIUS}
        fill={COLOR_KAS_LED}
        data-testid={ledTestId}
      />
      {pNumber && (
        <text
          x={cx + 4}
          y={cy + 8}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_SANS}
          fontSize={6.5}
          fontWeight={500}
          data-testid={`${testId}-pnumber`}
        >
          {pNumber}
        </text>
      )}
    </g>
  );
}

interface MeasurementPanelProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly feederName?: string;
  readonly measurements: BayMeasurements;
}

function MeasurementPanel(props: MeasurementPanelProps): JSX.Element {
  const { x, y, width, feederName, measurements } = props;
  const rows = collectMeasurementRows(measurements);
  const labelX = x - width / 2 + 4;
  const valueX = x + width / 2 - 4;
  return (
    <g data-testid="sld-v2-gpz-bay-measurement-panel" data-row-count={String(rows.length)}>
      {feederName && (
        <text
          x={x}
          y={y + 8}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={MEASUREMENT_FONT_SIZE}
          fontWeight={600}
        >
          {feederName.slice(0, 10)}
        </text>
      )}
      {rows.map((row, idx) => {
        const rowY = y + MEASUREMENT_PANEL_HEADER_HEIGHT + idx * MEASUREMENT_ROW_HEIGHT;
        return (
          <g key={row.label} data-testid={`sld-v2-gpz-bay-measurement-${row.label.toLowerCase()}`}>
            <text
              x={labelX}
              y={rowY + MEASUREMENT_FONT_SIZE - 1}
              fill={COLOR_TEXT_MUTED}
              fontFamily={FONT_SANS}
              fontSize={MEASUREMENT_FONT_SIZE}
            >
              {row.label}
            </text>
            <text
              x={valueX}
              y={rowY + MEASUREMENT_FONT_SIZE - 1}
              textAnchor="end"
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

interface GroundFaultMarkerProps {
  readonly cx: number;
  readonly cy: number;
  readonly state: GroundFaultMarkerState;
}

function GroundFaultMarker(props: GroundFaultMarkerProps): JSX.Element {
  const { cx, cy, state } = props;
  const fill = state === 'fault' ? COLOR_GROUND_FAULT : COLOR_PANEL_RAISED;
  return (
    <g data-testid="sld-v2-gpz-bay-ground-fault" data-state={state}>
      <circle cx={cx} cy={cy} r={3} fill={fill} stroke={COLOR_GROUND_FAULT} strokeWidth={1.2} />
    </g>
  );
}

interface SterowanieLabelProps {
  readonly cx: number;
  readonly cyTop: number;
  readonly cyBottom: number;
  readonly mode: BayControlMode;
}

/**
 * Pionowa etykieta trybu sterowania na lewym marginesie pola.
 *
 * Tekst rotowany -90° (czyta się od dołu do góry — kanon SCADA).
 * Pozycjonowany w pionowej środkowej osi `cx` w przedziale (cyTop, cyBottom).
 */
function SterowanieLabel(props: SterowanieLabelProps): JSX.Element {
  const { cx, cyTop, cyBottom, mode } = props;
  const cy = (cyTop + cyBottom) / 2;
  const text = sterowanieText(mode);
  const fill = sterowanieColor(mode);
  return (
    <g data-testid="sld-v2-gpz-bay-sterowanie" data-control-mode={mode}>
      <text
        transform={`rotate(-90, ${cx}, ${cy})`}
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        fill={fill}
        fontFamily={FONT_SANS}
        fontSize={STEROWANIE_FONT_SIZE}
        fontWeight={700}
        letterSpacing={0.5}
      >
        {text}
      </text>
    </g>
  );
}

function sterowanieText(mode: BayControlMode): string {
  switch (mode) {
    case 'remote':
      return 'STEROWANIE ZDALNE';
    case 'local':
      return 'STEROWANIE LOKALNE';
    case 'unknown':
      return 'STEROWANIE ?';
  }
}

function sterowanieColor(mode: BayControlMode): string {
  switch (mode) {
    case 'remote':
      return COLOR_BADGE_STATUS_OK;
    case 'local':
      return COLOR_BADGE_BG_YELLOW;
    case 'unknown':
      return COLOR_TEXT_MUTED;
  }
}

interface CtPrimaryProps {
  readonly cx: number;
  readonly cy: number;
  readonly ratio?: string;
}

function CtPrimary(props: CtPrimaryProps): JSX.Element {
  const { cx, cy, ratio } = props;
  return (
    <g data-testid="sld-v2-gpz-bay-ct-primary">
      <circle cx={cx} cy={cy} r={CT_RADIUS} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
      {ratio && (
        <text
          x={cx - CT_RADIUS - 2}
          y={cy + 3}
          textAnchor="end"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={7}
          fontWeight={600}
          data-testid="sld-v2-gpz-bay-ct-ratio"
        >
          {ratio}
        </text>
      )}
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

  /* CB visual: closed = green filled, open = cyan hollow (kanon SCADA). */
  const cbFill = closed ? COLOR_DEVICE_CLOSED : COLOR_PANEL_RAISED;
  const cbStroke = closed ? COLOR_DEVICE_CLOSED_BORDER : COLOR_SELECTION;

  /* Track / wire color: green when coupler closed (current path), white otherwise. */
  const trackColor = closed ? COLOR_DEVICE_CLOSED : COLOR_LINE_PRIMARY;

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
      data-closed={String(closed)}
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
        stroke={closed ? COLOR_DEVICE_CLOSED_BORDER : COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        data-testid="sld-v2-gpz-coupler-ds-left"
      />
      <circle
        cx={rightLegX}
        cy={dsY}
        r={DS_RADIUS}
        fill={COLOR_PANEL_RAISED}
        stroke={closed ? COLOR_DEVICE_CLOSED_BORDER : COLOR_LINE_PRIMARY}
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

      {/* CB sprzęgła w środku poziomej części (cyan hollow gdy open, green gdy closed) */}
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
        data-state={closed ? 'closed' : 'open'}
      />

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
        />
      )}

      <title>{`${coupler.designation} — ${closed ? 'zamknięte' : 'otwarte'}`}</title>
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

/* =============================================================================
   SCADA helpers — badge visuals, measurement rows, footer depth
   ============================================================================= */

interface BadgeItem {
  readonly code: string;
  readonly state: SecondaryFlagState;
  readonly order: number;
}

/**
 * Kanoniczne uporządkowanie badge'y SCADA — zgodne z wzorcem operatorskim:
 * SPZ → SCO → OWG → NZ → LRW → ARN → BKR → STYCZ. → AWSC → ZS → SZR.
 */
const BADGE_ORDER: ReadonlyArray<{ key: keyof BaySecondaryFlags; code: string }> = [
  { key: 'spz', code: 'SPZ' },
  { key: 'sco', code: 'SCO' },
  { key: 'owg', code: 'OWG' },
  { key: 'nz', code: 'NZ' },
  { key: 'lrw', code: 'LRW' },
  { key: 'arn', code: 'ARN' },
  { key: 'bkr', code: 'BKR' },
  { key: 'stycz', code: 'STYCZ' },
  { key: 'awsc', code: 'AWSC' },
  { key: 'zs', code: 'ZS' },
  { key: 'szr', code: 'SZR' },
];

const BADGE_MAX_VISIBLE = 5;

function collectBadges(flags: BaySecondaryFlags): readonly BadgeItem[] {
  const items: BadgeItem[] = [];
  BADGE_ORDER.forEach((entry, idx) => {
    const state = flags[entry.key];
    if (state) {
      items.push({ code: entry.code, state, order: idx });
    }
  });
  return items.slice(0, BADGE_MAX_VISIBLE);
}

interface BadgeVisual {
  readonly labelBg: string;
  readonly labelFg: string;
  readonly labelBorder: string;
  readonly statusColor: string;
}

/** Mapa code → kolor tła. SPZ/ARN/SZR = żółty, SCO/NZ/LRW/AWSC/ZS = czerwony, reszta = jasny. */
function badgeVisual(code: string, state: SecondaryFlagState): BadgeVisual {
  const yellow = code === 'SPZ' || code === 'ARN' || code === 'SZR';
  const red = code === 'SCO' || code === 'NZ' || code === 'LRW' || code === 'AWSC' || code === 'ZS';
  const labelBg = yellow ? COLOR_BADGE_BG_YELLOW : red ? COLOR_BADGE_BG_RED : COLOR_BADGE_BG_LIGHT;
  const labelFg = red ? COLOR_TEXT_PRIMARY : COLOR_BADGE_TEXT_DARK;
  const labelBorder = red ? COLOR_BADGE_STATUS_BLOCKED : COLOR_TEXT_MUTED;
  const statusColor = statusColorFor(state);
  return { labelBg, labelFg, labelBorder, statusColor };
}

function statusColorFor(state: SecondaryFlagState): string {
  switch (state) {
    case 'enabled':
      return COLOR_BADGE_STATUS_OK;
    case 'disabled':
      return COLOR_BADGE_STATUS_NEUTRAL;
    case 'restricted':
    case 'blocked':
      return COLOR_BADGE_STATUS_BLOCKED;
  }
}

function statusLabel(state: SecondaryFlagState): string {
  switch (state) {
    case 'enabled':
      return 'Zal.';
    case 'disabled':
      return 'Odbl.';
    case 'restricted':
      return 'Odst.';
    case 'blocked':
      return 'Zabl.';
  }
}

interface MeasurementRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Buduje wiersze panelu pomiarowego w kanonicznej kolejności SCADA:
 *   1. Napięcia fazowe (U1, U2, U3)
 *   2. Napięcia międzyfazowe (U12, U23, U31)
 *   3. Napięcie zerowe (U0)
 *   4. Częstotliwość (f)
 *   5. Moce (P, Q, Idł)
 *   6. Prądy (I1, I2, I3)
 *
 * Każdy wiersz pojawia się tylko gdy dostarczona wartość.
 */
function collectMeasurementRows(m: BayMeasurements): readonly MeasurementRow[] {
  const rows: MeasurementRow[] = [];
  if (m.u1 !== undefined) rows.push({ label: 'U1', value: formatVoltage(m.u1) });
  if (m.u2 !== undefined) rows.push({ label: 'U2', value: formatVoltage(m.u2) });
  if (m.u3 !== undefined) rows.push({ label: 'U3', value: formatVoltage(m.u3) });
  if (m.u12 !== undefined) rows.push({ label: 'U12', value: formatVoltage(m.u12) });
  if (m.u23 !== undefined) rows.push({ label: 'U23', value: formatVoltage(m.u23) });
  if (m.u31 !== undefined) rows.push({ label: 'U31', value: formatVoltage(m.u31) });
  if (m.u0 !== undefined) rows.push({ label: 'U0', value: formatVoltage(m.u0) });
  if (m.f !== undefined) rows.push({ label: 'f', value: formatFrequency(m.f) });
  if (m.p !== undefined) rows.push({ label: 'P', value: formatNumber(m.p) });
  if (m.q !== undefined) rows.push({ label: 'Q', value: formatNumber(m.q) });
  if (m.idl !== undefined) rows.push({ label: 'Idł', value: formatNumber(m.idl) });
  if (m.i1 !== undefined) rows.push({ label: 'I1', value: formatInteger(m.i1) });
  if (m.i2 !== undefined) rows.push({ label: 'I2', value: formatInteger(m.i2) });
  if (m.i3 !== undefined) rows.push({ label: 'I3', value: formatInteger(m.i3) });
  return rows;
}

function hasAnyMeasurement(m: BayMeasurements): boolean {
  return (
    m.p !== undefined ||
    m.q !== undefined ||
    m.idl !== undefined ||
    m.i1 !== undefined ||
    m.i2 !== undefined ||
    m.i3 !== undefined ||
    m.f !== undefined ||
    m.u1 !== undefined ||
    m.u2 !== undefined ||
    m.u3 !== undefined ||
    m.u12 !== undefined ||
    m.u23 !== undefined ||
    m.u31 !== undefined ||
    m.u0 !== undefined
  );
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

function formatInteger(value: number): string {
  if (Number.isNaN(value)) return '—';
  return Math.round(value).toString();
}

/** Napięcia zawsze 1 dec (kanon SCADA — np. "15.4"). */
function formatVoltage(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

/** Częstotliwość zawsze 2 dec (kanon SCADA — np. "49.94"). */
function formatFrequency(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value.toFixed(2);
}

function computeMaxFooterDepth(sections: readonly GpzSectionDescriptor[]): number {
  let kasDepth = 0;
  let measurementDepth = 0;
  for (const section of sections) {
    for (const bay of section.bays) {
      if (bay.hasKasButton) {
        kasDepth = Math.max(kasDepth, KAS_ROW_HEIGHT);
      }
      if (bay.measurements && hasAnyMeasurement(bay.measurements)) {
        const rowCount = collectMeasurementRows(bay.measurements).length;
        const depth =
          MEASUREMENT_PANEL_HEADER_HEIGHT + rowCount * MEASUREMENT_ROW_HEIGHT + 4;
        measurementDepth = Math.max(measurementDepth, depth);
      }
    }
  }
  return kasDepth + measurementDepth;
}
