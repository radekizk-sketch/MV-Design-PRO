/**
 * SLD V2 - MiniBlockRmuRenderer.
 *
 * Mini-blok stacji dla LOD 0-2. To nie jest dekoracyjny kafel: renderer
 * pokazuje mini-rozdzielnice SN z szyna, polami i aparatami wynikajacymi
 * z faktycznych bays[].
 */

import type { MouseEvent } from 'react';

import type { BayPrimaryDeviceKind, BayPrimaryPlacement } from '../../../../types/enm';
import {
  COLOR_BG,
  COLOR_BUS_LV,
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_SELECTION,
  COLOR_TEXT_MUTED,
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
import {
  ApparatusCbSquare,
  ApparatusEarthingSwitch,
  ApparatusFuse,
  ApparatusLvBreaker,
  ApparatusSwitchDisconnector,
  ApparatusTransformerSymbol,
} from './GpzApparatusSymbols';
import { DerSourceSymbol } from './DerRenderer';

// =============================================================================
// Constants
// =============================================================================

const OVERVIEW_WIDTH = 118;
const OVERVIEW_HEIGHT = 96;
const COMPACT_WIDTH = 220;
const COMPACT_HEIGHT = 240;
const DETAIL_WIDTH = 220;
const DETAIL_HEIGHT = 164;
const DETAIL_DER_WIDTH = 340;
const DETAIL_DER_HEIGHT = 280;
const COMPACT_TERRAIN_PORT_Y = -96;
const COMPACT_EXTERNAL_BRIDGE_CLEARANCE = 18;

// K30-19/31: variant-aware device sizing now via getVariantApparatusHeight()
// w MiniBlockBayLayout. Kolory DER trzymamy lokalnie przy rendererze stacji.

const COLOR_DER_PV = '#FFC857';
const COLOR_DER_BESS = '#5BB8FF';
const COLOR_DER_FW = '#5BFFD9';
const COLOR_SCADA_SHADOW = '#05070A';

type SymbolClickHandler = (elementId: string) => (e: MouseEvent<SVGGElement>) => void;

// =============================================================================
// Public types
// =============================================================================

/**
 * F9.2 (SLD_CAD_SPEC_V3 §12.1) — jeden aparat pola, uporządkowany wg fizycznej
 * ścieżki mocy. Projekcja `Bay.primary_devices` (ENM) — patrz
 * `enmToSldAdapter.ts` `projectBayPrimaryDevices()` dla reguł sortowania i
 * STOP-notatki o dostępności danych.
 */
export interface BayPrimaryDeviceView {
  readonly kind: BayPrimaryDeviceKind;
  readonly placement: BayPrimaryPlacement;
  readonly sectionSide?: 'LEFT' | 'CENTER' | 'RIGHT' | null;
  readonly deviceRef: string;
  /** Uproszczony stan (mirror `cbState`/`dsState`/`esState` vocabulary).
   *  `undefined` gdy ENM nie niesie `switch_state` dla tego aparatu. */
  readonly switchState?: 'closed' | 'open' | 'unknown';
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): `BayPrimaryDevice.linked_ref` — dla
   *  aparatów pomiarowych (CT/VT) wskazuje `Measurement.ref_id` (wzorzec
   *  potwierdzony w `backend/src/application/field_read_model.py:488`).
   *  Fundament dopasowania kotwicy miernika „M" (`compose/protectionMarking.ts`
   *  `resolveMeterAnchor`) — `undefined` gdy ENM nie niesie `linked_ref`. */
  readonly linkedRef?: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator PER-APARAT
   *  jako DANA projektowa (`BayPrimaryDevice.designation`) — ma pierwszeństwo
   *  nad fallbackiem konwencji `apparatusIdentifiers` (`compose/
   *  apparatusSequence.ts`). `undefined` gdy ENM nie niesie tej danej dla
   *  aparatu (render pozostaje przy konwencji, znacznik
   *  `data-designation-source="konwencja"`). */
  readonly designation?: string;
}

/**
 * F9.9 (SLD_CAD_SPEC_V3 §17.2) — adnotacja zabezpieczeń JEDNEGO pola,
 * projekcja `Bay.protection_codes` + `Bay.protection_ref` →
 * `ProtectionAssignment` (`v2/canvas/enmToSldAdapter.ts`
 * `resolveBayProtectionMarking`). `codes` jest ZAWSZE niepuste (adapter
 * zwraca `undefined` dla całego pola, gdy `Bay.protection_codes` jest puste —
 * §17.2 „brak danych = brak oznaczenia"). `breakerRef`/`ctRef` to SUROWE
 * referencje ENM (`ProtectionAssignment.breaker_ref`/`ct_ref`) — dopasowanie
 * na KONKRETNY aparat NARYSOWANEGO stosu dzieje się w `compose/
 * protectionMarking.ts` (adapter nie zna geometrii/kolejności rysowania).
 */
export interface BayProtectionMarkingView {
  readonly codes: readonly string[];
  readonly breakerRef?: string;
  readonly ctRef?: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): `ProtectionAssignment.
   *  ct_refs_secondary` — CT dodatkowe strefy różnicowej (87T). `undefined`/
   *  puste = strefa 2×CT NIE jest modelowana (dotychczasowe uproszczenie
   *  §20.2 „obecność transformatora" pozostaje w mocy, `compose/
   *  protectionTopologyValidation.ts`). */
  readonly ctRefsSecondary?: readonly string[];
}

/**
 * F10.4 (SLD_CAD_SPEC_V3 §18.3) — adnotacja JEDNEGO aparatu CT toru głównego:
 * identyfikator (`Measurement.name` — pole engineering-friendly, ODRÓŻNIONE
 * od `ref_id` technicznego, wzorzec identyczny z §19.2 „numer/nazwa linii" —
 * `Cable`/`OverheadLine.name`) + przekładnia sformatowana z `Measurement.
 * rating.ratio_primary`/`ratio_secondary` (np. „300/5" — CZYSTE formatowanie,
 * zero fizyki/zaokrągleń). BEZ-DOMAIN: oba pola źródłowe (`name`, `rating`)
 * JUŻ ISTNIEJĄ w ENM (`backend/src/enm/models.py:455-470`) — układ pomiarowy
 * (3×CT fazowe / Ferranti-I0, `arrangement` niżej) to F10.6 (D3, DOMAIN,
 * `Measurement.ct_arrangement`). Dopasowanie na aparat CT NARYSOWANEGO stosu przez
 * `measurementRef === BayPrimaryDevice.linked_ref` (wzorzec
 * `meteringMeasurementRef`/`resolveMeterAnchor`, `compose/protectionMarking.ts`).
 */
export interface CtRatingAnnotationView {
  readonly measurementRef: string;
  readonly identifier: string;
  readonly ratioText: string;
  /** F10.6 (SLD_CAD_SPEC_V3 §18.3, D3, V12K-036): układ pomiarowy —
   *  `Measurement.ct_arrangement`. `undefined` gdy dana niedostarczona (WHITE
   *  BOX — adnotacja rysuje sam identyfikator+przekładnię bez członu układu,
   *  §18.3 „zero zgadywania"). */
  readonly arrangement?: '3xCT' | 'ferranti';
  /** W5 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §12–15/uwaga 7 „CT pomiarowy vs
   *  zabezpieczeniowy") — przeznaczenie CT z `Measurement.purpose`. Wariant CT
   *  Z DANYCH, nie z domysłu: `undefined` gdy pomiar nie niesie `purpose`
   *  (uczciwy brak, rejestr braków — §0.2 karty W5). Kanał GEOMETRYCZNIE
   *  NEUTRALNY: przenoszony na `OwnedLabel.ctPurpose` → atrybut DOM
   *  `data-ct-purpose` (audyt), NIE dokładany do tekstu etykiety (zero zmiany
   *  szerokości/kotwic — inwariant W5 „geometria bez dryfu"). */
  readonly purpose?: 'protection' | 'metering' | 'combined';
}

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
  /** F9.2 (SLD_CAD_SPEC_V3 §12.1): uporządkowana lista aparatów pola z
   *  `Bay.primary_devices` (ENM), gdy dane niepuste. `undefined` gdy pole nie
   *  niesie `primary_devices` — konwencja-wg-roli (§12.4, fallback rysunkowy)
   *  NIE jest projektowana tutaj (poza zakresem F9.2, patrz F9.3). */
  readonly primaryDevices?: readonly BayPrimaryDeviceView[];
  /** W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwaga 10): identyfikator
   *  KONFIGURACJI pola — stabilny, deterministyczny (backend `config_ref`).
   *  Niesiony do meta sceny (`configId`) przez `compose/station.ts`, żeby render
   *  nie zgadywał wyposażenia z typu pola. `undefined` gdy pole bez szablonu. */
  readonly configId?: string;
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): adnotacja zabezpieczeń tego pola —
   *  `undefined` gdy `Bay.protection_codes` puste/nieobecne (brak danych =
   *  brak oznaczenia, §17.2 dosłownie). */
  readonly protectionMarking?: BayProtectionMarkingView;
  /** F9.9 (SLD_CAD_SPEC_V3 §17.2): `Measurement.ref_id` pomiaru
   *  `purpose==='metering'` powiązanego z tym polem (`bay_ref`) — `undefined`
   *  gdy brak takiego pomiaru. Dopasowanie na aparat stosu (miernik „M")
   *  przez `linkedRef` w `compose/protectionMarking.ts`. */
  readonly meteringMeasurementRef?: string;
  /** Recenzja NO-GO 2026-07-17 pkt 11: mierzona WIELKOŚĆ miernika — z
   *  `Measurement.measurement_type` pomiaru rozliczeniowego (CT⇒prąd „A",
   *  VT⇒napięcie „V"). Glif miernika pokazuje literę wielkości zamiast
   *  mylącego „M" (odczytywanego jako napęd silnikowy). `undefined` = dana
   *  nieznana, glif zostaje przy „M" + rozstrzygnięcie w legendzie. */
  readonly meteringQuantity?: 'A' | 'V';
  /** F10.4 (SLD_CAD_SPEC_V3 §18.3): adnotacje przekładni CT tego pola —
   *  JEDNA pozycja per aparat CT z `Measurement.rating` obecnym. `undefined`
   *  gdy pole nie niesie żadnego CT z ratingiem (brak danych = brak
   *  oznaczenia, §18.3 dosłownie — zero „z domysłu"). */
  readonly ctRatingAnnotations?: readonly CtRatingAnnotationView[];
  /** F10.6 (SLD_CAD_SPEC_V3 §20.2, D4, V12K-036): `Measurement.
   *  vt_arrangement` WSZYSTKICH VT tego pola (wartości niepuste, deduplikowane).
   *  `undefined`/puste = dana układu VT niedostarczona dla ŻADNEGO VT pola —
   *  `protectionFunctionTopologyGaps` (`compose/protectionTopologyValidation.ts`)
   *  degraduje 67N do dotychczasowego uproszczenia (sama obecność VT). */
  readonly vtArrangements?: readonly ('open_delta' | 'star')[];
}

export interface MiniBlockDerBadge {
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly count: number;
  readonly connectionSide?: 'nn' | 'sn' | 'dedicated';
  readonly hasBlockTransformer?: boolean;
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
  readonly transformerRefs?: readonly string[];
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
  /** Aktualna skala viewportu SLD. Uzywana tylko do czytelnosci etykiet overview. */
  readonly viewportScale?: number;
}

// =============================================================================
// Renderer
// =============================================================================

function normalizeLabelToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isGenericStationDisplayName(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeLabelToken(value);
  return /^(nowa\s+stacja|stacja\s+sn\/nn(\s+\d+)?|stacja\s+(przelotowa|koncowa|odgalezna|sekcyjna)(\s+sn\/nn)?)(\s+\d+)?$/.test(normalized);
}

function formatTransformerRatedPower(kva: number): string {
  return kva >= 1000
    ? `${(kva / 1000).toFixed(1).replace('.', ',')} MVA`
    : `${kva} kVA`;
}

function overviewStationCodeScale(viewportScale: number | null | undefined): number {
  if (viewportScale === null || viewportScale === undefined || !Number.isFinite(viewportScale) || viewportScale <= 0) {
    return 1;
  }
  return Math.min(4, Math.max(1, 0.9 / viewportScale));
}

function capWorldFontSize(
  worldFontSize: number,
  viewportScale: number | null | undefined,
  maxScreenPx: number,
  minWorldFontSize = 5,
): number {
  if (
    viewportScale === null
    || viewportScale === undefined
    || !Number.isFinite(viewportScale)
    || viewportScale <= 1
  ) {
    return worldFontSize;
  }
  return Math.max(minWorldFontSize, Math.min(worldFontSize, maxScreenPx / viewportScale));
}

function overviewDerSummary(
  derBadges: readonly MiniBlockDerBadge[],
): { label: string; color: string } | null {
  const first = derBadges.find((badge) => badge.count > 0);
  if (!first) return null;
  const suffix = first.count > 1 ? String(first.count) : '';
  switch (first.kind) {
    case 'PV':
      return { label: `PV${suffix}`, color: COLOR_DER_PV };
    case 'BESS':
      return { label: `BESS${suffix}`, color: COLOR_DER_BESS };
    case 'FW':
      return { label: `FW${suffix}`, color: COLOR_DER_FW };
  }
}

function overviewDerMarkerShape(
  kind: MiniBlockDerBadge['kind'],
): 'hexagon' | 'square' | 'triangle' {
  if (kind === 'PV') return 'hexagon';
  if (kind === 'BESS') return 'square';
  return 'triangle';
}

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
      ? 62
      : showPvCircuit
        ? offsetY + height - 28
        : 72;
  const labelTypeY = variant === 'overview'
    ? labelNameY + 13
    : variant === 'compact'
      ? 82
      : showPvCircuit
        ? labelNameY + 12
        : labelNameY + 13;
  const stationNameTextY = labelTypeY + 16;
  const labelPowerY = variant === 'compact'
    ? 120
    : stationNameTextY + (variant === 'detail' && !showPvCircuit ? 22 : 14);
  const auxBadgeY = labelPowerY + 16;
  const showDetailedBadges = variant !== 'overview' && (variant !== 'detail' || Boolean(props.selected));
  const headerBadgeY = variant === 'compact' ? 66 : labelNameY - 4;
  const nnCountBadgeX = variant === 'detail' ? 56 : 48;
  const alarmBadgeX = showDetailedBadges && props.nnFeedersCount > 0 ? -34 : 26;
  const labelFontSize = capWorldFontSize(
    variant === 'overview' ? 10 : variant === 'compact' ? 10 : showPvCircuit ? 9 : 10,
    props.viewportScale,
    16,
  );
  const typeFontSize = capWorldFontSize(
    variant === 'overview' ? 9 : variant === 'compact' ? 8 : showPvCircuit ? 8 : 9,
    props.viewportScale,
    14,
  );
  const stationCodeFontSize = capWorldFontSize(14, props.viewportScale, 24, 6);
  const nnCountFontSize = capWorldFontSize(10, props.viewportScale, 16);
  const auxBadgeFontSize = capWorldFontSize(9, props.viewportScale, 14);
  const transformerPowerFontSize = capWorldFontSize(FONT_SIZES.technicalPanel, props.viewportScale, 15);
  const hasSnBayTopology = props.snBays.length > 0;
  const primaryTransformerRef = props.transformerRefs?.[0] ?? null;
  const stationCodeLabel = props.stationCode
    ?? ((props.name || '').match(/\b(S\d{2,3})\b/)?.[1] ?? null);
  const normalizedName = normalizeLabelToken(props.name);
  const normalizedCode = stationCodeLabel ? normalizeLabelToken(stationCodeLabel) : null;
  const stationNameLabel = stationCodeLabel && (
    isGenericStationDisplayName(props.name)
    || (normalizedCode != null && normalizedName.startsWith(`${normalizedCode} `))
  )
    ? null
    : (props.name || '').length > 22 ? (props.name || '').slice(0, 20) + '…' : props.name;
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
      data-station-not-rectangle="true"
      data-readable-label-stack={variant !== 'overview' ? 'true' : undefined}
      data-port-anchor-count={String(props.snBays.length)}
      transform={`translate(${props.x}, ${props.y})`}
      role={props.onClick ? 'button' : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      aria-label={props.onClick ? `Stacja SN/nN ${props.name || props.id}` : undefined}
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
      onContextMenu={
        props.onClick
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              props.onClick?.(props.id);
            }
          : undefined
      }
      onKeyDown={
        props.onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onClick?.(props.id);
              }
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
        opacity={0}
        stroke="transparent"
        strokeWidth={0}
        rx={4}
        ry={4}
        data-parity-key="station.mini.body"
      />
      {props.selected && variant !== 'overview' && (
        <MiniBlockSelectionCorners
          id={props.id}
          width={width}
          height={height}
          variant={variant}
        />
      )}

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
      {variant === 'overview' && (() => {
        const snBusColor = miniBlockBusColorForVoltage(props.busVoltageKv ?? null);
        const code = stationCodeLabel;
        const hasDer = props.derBadges.length > 0;
        const hasLoad = (props.totalLoadKw ?? 0) > 0;
        const overviewBays: readonly MiniBlockBayDescriptor[] = props.snBays.length > 0
          ? props.snBays.slice(0, 4)
          : [
              {
                bayRef: `${props.id}/overview/we`,
                fieldRole: FIELD_ROLE.LINE_IN,
                designation: 'WE',
                hasMissingRequiredDevice: false,
              },
              {
                bayRef: `${props.id}/overview/wy`,
                fieldRole: FIELD_ROLE.LINE_OUT,
                designation: 'WY',
                hasMissingRequiredDevice: false,
              },
              {
                bayRef: `${props.id}/overview/tr`,
                fieldRole: FIELD_ROLE.TRANSFORMER,
                designation: 'TR',
                hasMissingRequiredDevice: false,
              },
            ];
        const RMU_W = OVERVIEW_WIDTH;
        const busY = -12;
        const left = -RMU_W / 2 + 14;
        const right = RMU_W / 2 - 14;
        const span = Math.max(1, overviewBays.length - 1);
        const codeScale = overviewStationCodeScale(props.viewportScale);
        const codeLabelWidth = Math.max(30, (code?.length ?? 3) * 8 + 12);
        const derSummary = overviewDerSummary(props.derBadges);
        const derMarkerShape = derSummary ? overviewDerMarkerShape(props.derBadges.find((badge) => badge.count > 0)?.kind ?? 'PV') : null;
        const hasDerBlockTransformer = props.derBadges.some((badge) => badge.hasBlockTransformer);
        return (
          <g
            data-testid={`sld-v2-mini-rmu-overview-${props.id}`}
            data-renderer="mini-rmu-overview"
            data-station-not-rectangle="true"
          >
            <rect
              x={-OVERVIEW_WIDTH / 2}
              y={-OVERVIEW_HEIGHT / 2}
              width={OVERVIEW_WIDTH}
              height={OVERVIEW_HEIGHT}
              fill="transparent"
              opacity={props.selected ? 1 : 0}
              stroke={props.selected ? COLOR_SELECTION : 'transparent'}
              strokeWidth={props.selected ? 1.4 : 0}
              strokeDasharray={props.selected ? '5 4' : undefined}
              data-parity-key="station.mini.body.hitarea"
            />
            {/* Granica stacji: cienki obrys przerywany, ostre rogi, bez
                wypełnienia (język rysunku zamiast karty). */}
            <rect
              x={-RMU_W / 2 - 5}
              y={busY - 31}
              width={RMU_W + 10}
              height={77}
              fill="none"
              stroke={COLOR_TEXT_MUTED}
              strokeWidth={0.8}
              strokeDasharray="6 4"
              opacity={0.55}
              data-testid={`sld-v2-mini-rmu-overview-enclosure-${props.id}`}
              data-element-kind="rmu_enclosure"
              data-cad-role="station_boundary_dashed"
            />
            <line
              data-testid={`sld-v2-mini-rmu-sn-row-${props.id}`}
              data-parity-key="station.mini.bus.sn"
              data-bus-voltage-kv={props.busVoltageKv ?? ''}
              x1={-RMU_W / 2}
              y1={busY}
              x2={RMU_W / 2}
              y2={busY}
              stroke={snBusColor}
              strokeWidth={3.4}
              strokeLinecap="butt"
            />
            {overviewBays.map((bay, index) => {
              const x = overviewBays.length === 1 ? 0 : left + ((right - left) * index) / span;
              const isLine = isLineLikeFieldRole(bay.fieldRole);
              const isTransformer =
                bay.fieldRole === FIELD_ROLE.TRANSFORMER
                || bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER;
              const roleLabel = overviewFieldRoleLabel(bay.fieldRole, index);
              return (
                <g
                  key={bay.bayRef}
                  data-testid={`sld-v2-mini-rmu-bay-marker-${props.id}-${bay.bayRef}`}
                  data-bay-role={bay.fieldRole}
                  data-port-role={roleLabel}
                  data-port-magnet="true"
                  data-busbar-section="SN"
                  data-field-direction={isLine ? 'upstream-network' : 'downstream-station'}
                  data-element-kind="station_overview_bay"
                  data-element-id={bay.bayRef}
                  data-hit-area={handleSymbolClick ? 'true' : undefined}
                  role={handleSymbolClick ? 'button' : undefined}
                  tabIndex={handleSymbolClick ? 0 : undefined}
                  aria-label={handleSymbolClick ? `Pole ${roleLabel} ${bay.designation}` : undefined}
                  onClick={handleSymbolClick?.(bay.bayRef)}
                  onDoubleClick={handleSymbolClick?.(bay.bayRef)}
                  onContextMenu={handleSymbolClick ? (event) => {
                    event.preventDefault();
                    handleSymbolClick(bay.bayRef)(event);
                  } : undefined}
                  onKeyDown={handleSymbolClick ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      props.onClick?.(bay.bayRef);
                    }
                  } : undefined}
                  style={handleSymbolClick ? { cursor: 'pointer' } : undefined}
                >
                  <rect
                    x={x - 22}
                    y={isLine ? busY - 54 : isTransformer ? busY + 18 : busY - 42}
                    width={44}
                    height={isTransformer ? 92 : 86}
                    fill="transparent"
                    pointerEvents={handleSymbolClick ? 'all' : 'none'}
                    data-hit-area="true"
                    data-testid={`sld-v2-mini-rmu-overview-bay-hit-area-${props.id}-${bay.bayRef}`}
                  />
                  <circle
                    cx={x}
                    cy={isLine ? busY - 31 : isTransformer ? busY + 50 : busY - 20}
                    r={13}
                    fill="transparent"
                    data-hit-area="true"
                    data-testid={`sld-v2-mini-rmu-port-anchor-${props.id}-${roleLabel}`}
                    data-port-magnet="true"
                    data-port-role={roleLabel}
                    data-busbar-section="SN"
                    pointerEvents="all"
                  />
                  {isLine ? (
                    <>
                      <line x1={x} y1={busY} x2={x} y2={busY - 26} stroke={snBusColor} strokeWidth={2.1} />
                      <circle
                        cx={x}
                        cy={busY - 31}
                        r={4.2}
                        fill="#07111C"
                        stroke={snBusColor}
                        strokeWidth={1.5}
                        data-testid={`sld-v2-mini-rmu-port-${props.id}-${roleLabel}`}
                        data-port-magnet="true"
                        data-port-role={roleLabel}
                        data-busbar-section="SN"
                      />
                      <polygon
                        points={`${x},${busY - 20} ${x + 7},${busY - 13} ${x},${busY - 6} ${x - 7},${busY - 13}`}
                        fill="#0A8D43"
                        stroke={snBusColor}
                        strokeWidth={1.1}
                        data-apparatus-kind="switch_disconnector"
                        data-symbol-canon="switch_disconnector_rotated_square"
                      />
                      <line x1={x + 8} y1={busY - 13} x2={x + 17} y2={busY - 13} stroke="#A8B5BD" strokeWidth={1} />
                      <line x1={x + 17} y1={busY - 13} x2={x + 17} y2={busY - 4} stroke="#A8B5BD" strokeWidth={1} />
                    </>
                  ) : isTransformer ? (
                    <>
                      <line x1={x} y1={busY} x2={x} y2={busY + 27} stroke={snBusColor} strokeWidth={2.1} />
                      <rect
                        x={x - 4}
                        y={busY + 11}
                        width={8}
                        height={15}
                        fill="#0D2818"
                        stroke={snBusColor}
                        strokeWidth={1}
                        data-apparatus-kind="fuse"
                        data-symbol-canon="fuse_vertical_rectangle"
                      />
                      <g
                        data-testid={
                          primaryTransformerRef
                            ? `sld-symbol-mini-transformer-${primaryTransformerRef}`
                            : `sld-v2-mini-rmu-tr-triangle-${props.id}`
                        }
                        data-element-id={primaryTransformerRef ?? undefined}
                        data-symbol-canon="transformer_intersecting_circles"
                        data-transformer-circles-intersect="true"
                        data-transformer-circle-overlap-px={7.2}
                        role={primaryTransformerRef && handleSymbolClick ? 'button' : undefined}
                        tabIndex={primaryTransformerRef && handleSymbolClick ? 0 : undefined}
                        aria-label={primaryTransformerRef && handleSymbolClick ? 'Transformator SN/nN stacji' : undefined}
                        onClick={primaryTransformerRef ? handleSymbolClick?.(primaryTransformerRef) : undefined}
                        onDoubleClick={primaryTransformerRef ? handleSymbolClick?.(primaryTransformerRef) : undefined}
                        onContextMenu={primaryTransformerRef && handleSymbolClick ? (event) => {
                          event.preventDefault();
                          handleSymbolClick(primaryTransformerRef)(event);
                        } : undefined}
                        onKeyDown={primaryTransformerRef && handleSymbolClick ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleSymbolClick(primaryTransformerRef)(event as unknown as MouseEvent<SVGGElement>);
                          }
                        } : undefined}
                        style={primaryTransformerRef && handleSymbolClick ? { cursor: 'pointer' } : undefined}
                      >
                        <title>TR - transformator stacji</title>
                        <rect
                          x={x - 14}
                          y={busY + 21}
                          width={28}
                          height={30}
                          fill="transparent"
                          pointerEvents="all"
                          data-testid={
                            primaryTransformerRef
                              ? `sld-symbol-mini-transformer-${primaryTransformerRef}-hitbox`
                              : undefined
                          }
                        />
                        <circle
                          cx={x}
                          cy={busY + 34}
                          r={6.6}
                          fill="#07111C"
                          stroke="#DDF7FF"
                          strokeWidth={1.4}
                          data-transformer-winding="SN"
                          data-symbol-canon="transformer_winding_circle"
                        />
                        <circle
                          cx={x}
                          cy={busY + 40}
                          r={6.6}
                          fill="#07111C"
                          stroke="#DDF7FF"
                          strokeWidth={1.4}
                          data-transformer-winding="nN"
                          data-symbol-canon="transformer_winding_circle"
                        />
                      </g>
                      <line
                        data-testid={`sld-v2-mini-rmu-lv-row-${props.id}`}
                        data-parity-key="station.mini.bus.lv"
                        x1={x - 20}
                        y1={busY + 50}
                        x2={x + 20}
                        y2={busY + 50}
                        stroke="#3FA9F5"
                        strokeWidth={2.4}
                      />
                    </>
                  ) : (
                    <>
                      <line x1={x} y1={busY} x2={x} y2={busY - 20} stroke={snBusColor} strokeWidth={1.8} />
                      <rect x={x - 4} y={busY - 17} width={8} height={8} fill="#07111C" stroke={snBusColor} strokeWidth={1.2} />
                    </>
                  )}
                  <title>{`${roleLabel} - ${bay.designation}`}</title>
                </g>
              );
            })}
            {code && (
              <g
                data-testid={`sld-v2-mini-rmu-overview-code-${props.id}`}
                data-overview-label-scale={codeScale.toFixed(2)}
                transform={`translate(0, 24) scale(${codeScale})`}
              >
                <text
                  data-code-label-width={codeLabelWidth}
                  x={0}
                  y={1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={snBusColor}
                  fontFamily="sans-serif"
                  fontSize={12}
                  fontWeight={900}
                  letterSpacing={0}
                  paintOrder="stroke"
                  stroke={COLOR_SCADA_SHADOW}
                  strokeWidth={2.4}
                >
                  {code}
                </text>
              </g>
            )}
            {props.busVoltageKv != null && (
              <text
                x={0}
                y={41}
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
            {hasDer && derSummary && (
              <g
                data-testid={`sld-v2-mini-rmu-overview-${props.id}-der`}
                data-overview-label-mode="marker"
                data-der-kind={props.derBadges.find((badge) => badge.count > 0)?.kind ?? ''}
                data-block-transformer={hasDerBlockTransformer ? 'true' : 'false'}
                transform={`translate(${OVERVIEW_WIDTH / 2 - 11}, ${OVERVIEW_HEIGHT / 2 - 12})`}
              >
                <g data-marker-shape={derMarkerShape}>
                  <DerSourceSymbol
                    cx={0}
                    cy={0}
                    half={5}
                    kind={props.derBadges.find((badge) => badge.count > 0)?.kind ?? 'PV'}
                    stroke={derSummary.color}
                    strokeWidth={1}
                  />
                </g>
                {hasDerBlockTransformer && (
                  <g
                    data-testid={`sld-v2-mini-rmu-overview-${props.id}-der-block-transformer`}
                    transform="translate(8, -5)"
                  >
                    <circle cx={0} cy={-2} r={2.2} fill="#0A1018" stroke="#13C45A" strokeWidth={0.8} />
                    <circle cx={0} cy={2} r={2.2} fill="#0A1018" stroke="#13C45A" strokeWidth={0.8} />
                  </g>
                )}
                <title>{derSummary.label}</title>
              </g>
            )}
            {hasLoad && (
              <circle cx={-OVERVIEW_WIDTH / 2 + 8} cy={OVERVIEW_HEIGHT / 2 - 10} r={2.5} fill="#7DD3FC" stroke="#0A0E14" strokeWidth={0.5} />
            )}
            {props.isNop && (
              <g data-testid={`sld-v2-mini-rmu-overview-${props.id}-nop`}>
                <circle cx={OVERVIEW_WIDTH / 2 - 9} cy={-OVERVIEW_HEIGHT / 2 + 9} r={5} fill="#7A1414" stroke="#FF333D" strokeWidth={1.2} />
                <text
                  x={OVERVIEW_WIDTH / 2 - 9}
                  y={-OVERVIEW_HEIGHT / 2 + 11}
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
      {hasSnBayTopology && variant !== 'overview' && (() => {
        const snBusColor = miniBlockBusColorForVoltage(props.busVoltageKv ?? null);
        const layout = computeMiniBlockLayout(
          variant,
          props.snBays,
          props.hasTransformer,
          variant === 'detail' && MINI_BLOCK_FOOTPRINT[props.footprintType].hasLvSection ? props.nnFeedersCount : 0,
          showPvCircuit,
        );
        const trBayX = layout.trColumn?.x ?? 0;
        const terrainColumns = layout.snColumns.filter(({ bay }) => isLineLikeFieldRole(bay.fieldRole));
        const externalBridgeGap = variant === 'compact' && terrainColumns.length >= 2
          ? {
              left: Math.min(...terrainColumns.map((col) => col.x)) + COMPACT_EXTERNAL_BRIDGE_CLEARANCE,
              right: Math.max(...terrainColumns.map((col) => col.x)) - COMPACT_EXTERNAL_BRIDGE_CLEARANCE,
              y: COMPACT_TERRAIN_PORT_Y,
            }
          : null;
        return (
          <g data-testid={`sld-v2-mini-rmu-bay-layout-${props.id}`}>
            {variant === 'compact' && (
              <g
                data-testid={`sld-v2-mini-rmu-enclosure-${props.id}`}
                data-element-kind="rmu_enclosure"
                data-layout-role="station_switchgear_frame"
              >
                {/* Granica stacji: cienka linia PRZERYWANA, ostre rogi, bez
                    wypełnienia — konwencja rysunkowa CAD (obrys obiektu),
                    zamiast karty-kafla. */}
                <rect
                  x={layout.busLeft - 20}
                  y={COMPACT_TERRAIN_PORT_Y + 10}
                  width={(layout.busRight - layout.busLeft) + 40}
                  height={layout.busY - COMPACT_TERRAIN_PORT_Y + 104}
                  fill="none"
                  stroke={COLOR_TEXT_MUTED}
                  strokeWidth={0.8}
                  strokeDasharray="6 4"
                  opacity={0.55}
                  pointerEvents="none"
                  data-cad-role="station_boundary_dashed"
                />
              </g>
            )}
            {externalBridgeGap && externalBridgeGap.right > externalBridgeGap.left && (
              <g
                data-testid={`sld-v2-mini-rmu-compact-no-external-bridge-${props.id}`}
                data-guard="no_external_we_wy_bridge"
                data-render-contract="mask_only_not_electrical_element"
                data-visible-label="false"
                data-external-y={externalBridgeGap.y}
                data-busbar-y={layout.busY}
                data-gap-left={externalBridgeGap.left}
                data-gap-right={externalBridgeGap.right}
                pointerEvents="none"
              >
                {/* Maska w kolorze kanwy — niewidoczna przerwa toru, nie
                    czarny prostokąt (dopasowanie do COLOR_BG). */}
                <rect
                  x={externalBridgeGap.left}
                  y={externalBridgeGap.y - 13}
                  width={externalBridgeGap.right - externalBridgeGap.left}
                  height={26}
                  fill={COLOR_BG}
                  stroke="none"
                  strokeWidth={0}
                  data-role="external_trunk_visual_cut"
                />
              </g>
            )}
            {/* SN busbar — horizontal line connecting tops of all bay columns.
                K30-40: stroke per voltage class (busVoltageKv).
                K30-118: data-busbar-topology indicator (ABB SafeRing=single,
                Schneider RM6=cellular). Heuristic: footprint mv_lv_sectional
                = cellular (sekcjowana), inne = single (wspólna szyna).
                K30-127 audyt fix: VISUAL DIFFERENTIATION — cellular bus
                renderowany jako 2 parallel lines (3 px apart) per IEC 60617
                ("segregated busbars"); single = standard solid line. */}
            {(() => {
              const isCellular = props.footprintType === 'mv_lv_sectional';
              return (
                <>
                  <line
                    x1={layout.busLeft}
                    y1={layout.busY}
                    x2={layout.busRight}
                    y2={layout.busY}
                    stroke={snBusColor}
                    strokeWidth={variant === 'compact' ? STROKE_BUSBAR_PX : STROKE_BUSBAR_PX + 1}
                    strokeLinecap="butt"
                    data-parity-key="station.mini.bus.sn"
                    data-bus-voltage-kv={props.busVoltageKv ?? ''}
                    data-busbar-topology={isCellular ? 'cellular' : 'single'}
                    data-cad-role={variant === 'compact' ? 'internal_station_busbar' : undefined}
                  />
                  {isCellular && (
                    <line
                      x1={layout.busLeft}
                      y1={layout.busY + 3}
                      x2={layout.busRight}
                      y2={layout.busY + 3}
                      stroke={snBusColor}
                      strokeWidth={STROKE_BUSBAR_PX}
                      strokeLinecap="butt"
                      strokeDasharray="4 2"
                      data-testid={`sld-v2-mini-rmu-bus-cellular-secondary-${props.id}`}
                    />
                  )}
                </>
              );
            })()}

            {/* SN bay columns — vertical stacks z apparatus per IEC 60617 */}
            {layout.snColumns.map((col, index) => {
              const portRole = miniBlockPortRoleLabel(col.bay.fieldRole, index);
              const portSide = miniBlockPortSide(col.bay.fieldRole);
              const fieldDirection = miniBlockFieldDirection(col.bay.fieldRole);
              const portAnchorY = miniBlockPortAnchorY(col.bay.fieldRole, layout.busY, variant);
              const showPortLabel = miniBlockPortLabelVisible(col.bay.fieldRole, variant);
              const portAnchorId = `${props.id}/port/${col.bay.bayRef}`;
              const fieldHitTop = Math.min(portAnchorY, layout.busY) - 24;
              const fieldHitHeight = Math.max(72, Math.abs(layout.busY - portAnchorY) + 112);
              return (
                <g
                  key={col.bay.bayRef}
                  data-testid={`sld-v2-mini-rmu-field-${props.id}-${col.bay.bayRef}`}
                  data-bay-role={col.bay.fieldRole}
                  data-port-role={portRole}
                  data-port-side={portSide}
                  data-field-direction={fieldDirection}
                  data-hit-area={handleSymbolClick ? 'true' : undefined}
                  role={handleSymbolClick ? 'button' : undefined}
                  tabIndex={handleSymbolClick ? 0 : undefined}
                  aria-label={handleSymbolClick ? `Pole ${portRole} ${col.bay.designation}` : undefined}
                  onClick={handleSymbolClick?.(col.bay.bayRef)}
                  onDoubleClick={handleSymbolClick?.(col.bay.bayRef)}
                  onContextMenu={handleSymbolClick ? (event) => {
                    event.preventDefault();
                    handleSymbolClick(col.bay.bayRef)(event);
                  } : undefined}
                  onKeyDown={handleSymbolClick ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      props.onClick?.(col.bay.bayRef);
                    }
                  } : undefined}
                  style={handleSymbolClick ? { cursor: 'pointer' } : undefined}
                >
                  <rect
                    x={col.x - 22}
                    y={fieldHitTop}
                    width={44}
                    height={fieldHitHeight}
                    fill="transparent"
                    pointerEvents={handleSymbolClick ? 'all' : 'none'}
                    data-hit-area="true"
                    data-testid={`sld-v2-mini-rmu-field-hit-area-${props.id}-${col.bay.bayRef}`}
                  />
                  <g
                    data-testid={`sld-v2-mini-rmu-port-anchor-${props.id}-${col.bay.bayRef}`}
                    data-element-kind="station_port"
                    data-element-id={portAnchorId}
                    data-domain-ref={col.bay.bayRef}
                    data-port-role={portRole}
                    data-port-side={portSide}
                    data-field-direction={fieldDirection}
                    data-port-magnet="true"
                    data-busbar-section="SN"
                    transform={`translate(${col.x}, ${portAnchorY})`}
                    role={handleSymbolClick ? 'button' : undefined}
                    tabIndex={handleSymbolClick ? 0 : undefined}
                    aria-label={handleSymbolClick ? `Port ${portRole} pola ${col.bay.designation}` : undefined}
                    onClick={handleSymbolClick?.(col.bay.bayRef)}
                    onDoubleClick={handleSymbolClick?.(col.bay.bayRef)}
                    onContextMenu={handleSymbolClick ? (event) => {
                      event.preventDefault();
                      handleSymbolClick(col.bay.bayRef)(event);
                    } : undefined}
                    onKeyDown={handleSymbolClick ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSymbolClick(col.bay.bayRef)(event as unknown as MouseEvent<SVGGElement>);
                      }
                    } : undefined}
                    style={handleSymbolClick ? { cursor: 'pointer' } : undefined}
                  >
                    <title>{`${portRole} - ${col.bay.designation}`}</title>
                    {(portSide === 'terrain_network' || portSide === 'source_connection') && portAnchorY < layout.busY && variant !== 'compact' && (
                      <line
                        x1={0}
                        y1={0}
                        x2={0}
                        y2={layout.busY - portAnchorY}
                        stroke={snBusColor}
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        opacity={0.86}
                        data-testid={`sld-v2-mini-rmu-port-drop-${props.id}-${col.bay.bayRef}`}
                      />
                    )}
                    <rect
                      x={-14}
                      y={-9}
                      width={28}
                      height={18}
                      rx={2}
                      ry={2}
                      fill="transparent"
                      stroke="transparent"
                      data-hit-area="true"
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={3.4}
                      fill="#07111C"
                      stroke={snBusColor}
                      strokeWidth={1.2}
                    />
                    {showPortLabel && (
                      <text
                        x={0}
                        y={-5.5}
                        textAnchor="middle"
                        fill="#DDF7FF"
                        fontFamily={FONT_SANS}
                        fontSize={variant === 'detail' ? 8 : 7}
                        fontWeight={900}
                        paintOrder="stroke"
                        stroke={COLOR_SCADA_SHADOW}
                        strokeWidth={2}
                      >
                        {portRole}
                      </text>
                    )}
                    <title>{`${portRole} - ${col.bay.designation}`}</title>
                  </g>
                  {variant === 'compact' ? (
                    <CompactDirectionalBayColumn
                      x={col.x}
                      busY={layout.busY}
                      bay={col.bay}
                      bayIndex={index}
                      stationId={props.id}
                      roleLabel={portRole}
                      busColor={snBusColor}
                      transformerVectorGroup={props.transformerVectorGroup ?? null}
                      transformerRef={primaryTransformerRef}
                      nnFeedersCount={props.nnFeedersCount}
                      onSymbolClick={handleSymbolClick}
                    />
                  ) : (
                    <BayColumnSn
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
                      showRoleBadge={props.footprintType !== 'switching_station'}
                      showDesignationLabel
                      roleBadgeLabel={portRole}
                    />
                  )}
                </g>
              );
            })}

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
                <g
                  data-testid={`sld-v2-mini-rmu-tr-bay-${props.id}`}
                  data-element-id={primaryTransformerRef ?? undefined}
                >
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
                  <g
                    data-testid={
                      primaryTransformerRef
                        ? `sld-symbol-mini-transformer-${primaryTransformerRef}`
                        : `sld-v2-mini-rmu-transformer-symbol-${props.id}`
                    }
                    data-element-id={primaryTransformerRef ?? undefined}
                    data-symbol-canon="transformer_intersecting_circles"
                    data-transformer-circles-intersect="true"
                    data-transformer-circle-overlap-px={2 * 5 - 5}
                    role={primaryTransformerRef && handleSymbolClick ? 'button' : undefined}
                    tabIndex={primaryTransformerRef && handleSymbolClick ? 0 : undefined}
                    aria-label={primaryTransformerRef && handleSymbolClick ? 'Transformator SN/nN stacji' : undefined}
                    onClick={primaryTransformerRef ? handleSymbolClick?.(primaryTransformerRef) : undefined}
                    onDoubleClick={primaryTransformerRef ? handleSymbolClick?.(primaryTransformerRef) : undefined}
                    onContextMenu={primaryTransformerRef && handleSymbolClick ? (event) => {
                      event.preventDefault();
                      handleSymbolClick(primaryTransformerRef)(event);
                    } : undefined}
                    onKeyDown={primaryTransformerRef && handleSymbolClick ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSymbolClick(primaryTransformerRef)(event as unknown as MouseEvent<SVGGElement>);
                      }
                    } : undefined}
                    style={primaryTransformerRef && handleSymbolClick ? { cursor: 'pointer' } : undefined}
                  >
                    <title>TR - transformator stacji</title>
                    <ApparatusTransformerSymbol cx={trBayX} cy={trCy} />
                    <rect
                      x={trBayX - 14}
                      y={trTop - 4}
                      width={28}
                      height={trBottom - trTop + 8}
                      fill="transparent"
                      pointerEvents="all"
                      data-testid={
                        primaryTransformerRef
                          ? `sld-symbol-mini-transformer-${primaryTransformerRef}-hitbox`
                          : undefined
                      }
                    />
                  </g>
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
                      {formatTransformerRatedPower(props.transformerRatedKva)}
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
        const code = stationCodeLabel;
        if (!code) return null;
        const nopRing = props.isNop ? '#FF333D' : '#7EC8FF';
        const nopText = props.isNop ? '#FF333D' : '#7EC8FF';
        return (
          <g data-testid={`sld-v2-mini-station-code-${props.id}`} data-is-nop={props.isNop ? 'true' : 'false'} transform={`translate(0, ${headerBadgeY})`}>
            {/* Kod stacji jako tekst rysunkowy (bez badge-boxa) — język CAD,
                nie chip UI. Halo (paintOrder stroke) = konwencja SCADA na
                ciemnym tle, nie tło-pigułka. */}
            <text x={0} y={1} textAnchor="middle" fill={nopText} fontFamily={FONT_SANS} fontSize={stationCodeFontSize} fontWeight={900} letterSpacing={0.8} paintOrder="stroke" stroke={COLOR_SCADA_SHADOW} strokeWidth={2.5} data-badge-ring={nopRing}>
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
      {showDetailedBadges && props.nnFeedersCount > 0 && (
        <g
          data-testid={`sld-v2-mini-station-nn-count-${props.id}`}
          data-feeders-count={props.nnFeedersCount}
          transform={`translate(${nnCountBadgeX}, ${headerBadgeY})`}
        >
          <text
            x={0}
            y={1}
            textAnchor="middle"
            fill="#4EC9B0"
            fontFamily={FONT_SANS}
            fontSize={nnCountFontSize}
            fontWeight={900}
            paintOrder="stroke"
            stroke={COLOR_SCADA_SHADOW}
            strokeWidth={2}
          >
            {`${props.nnFeedersCount} nN`}
          </text>
        </g>
      )}

      {/* K30-8: alarm triangle obok code badge (mini block layout) */}
      {props.alarmSeverity && (() => {
        const color = props.alarmSeverity === 'critical' ? '#FF6B6B' : props.alarmSeverity === 'important' ? '#FF8B5C' : '#FFD166';
        return (
        <g data-testid={`sld-v2-mini-station-alarm-${props.id}`} data-alarm-severity={props.alarmSeverity} transform={`translate(${alarmBadgeX}, ${headerBadgeY})`}>
            <polygon points="0,-11 9,5 -9,5" fill={color} stroke="#0A0E14" strokeWidth={1} />
            <text x={0} y={3} textAnchor="middle" fill="#0A0E14" fontFamily={FONT_SANS} fontSize={10} fontWeight={900}>
              !
            </text>
          </g>
        );
      })()}
      {/* K30-57: hide name label w overview variant (clutter at zoom-out) */}
      {variant !== 'overview' && stationNameLabel && (
        <text
          x={0}
          y={stationNameTextY}
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
          {stationNameLabel}
        </text>
      )}

      {/* K30-15.3: load (L) + DER generation (G) badges per stacja.
       *  Eksploatacyjny diff: stacja z load 100 kW vs ZKSN bez load
       *  vs hybrid PV+BESS 1500 kW visible bezpośrednio. */}
      {showDetailedBadges && props.totalLoadKw && props.totalLoadKw > 0 && (
        <g data-testid={`sld-v2-mini-station-load-${props.id}`} transform={`translate(-28, ${auxBadgeY})`}>
          <text x={0} y={2} textAnchor="middle" fill="#FF8B5C" fontFamily={FONT_SANS} fontSize={auxBadgeFontSize} fontWeight={900} paintOrder="stroke" stroke={COLOR_SCADA_SHADOW} strokeWidth={2}>
            L {props.totalLoadKw >= 1000 ? `${(props.totalLoadKw / 1000).toFixed(1)}MW` : `${props.totalLoadKw}kW`}
          </text>
        </g>
      )}
      {showDetailedBadges && props.totalGenerationKw != null && props.totalGenerationKw > 0 && (
        <g data-testid={`sld-v2-mini-station-gen-${props.id}`} transform={`translate(28, ${auxBadgeY})`}>
          <text x={0} y={2} textAnchor="middle" fill="#7EE0B5" fontFamily={FONT_SANS} fontSize={auxBadgeFontSize} fontWeight={900} paintOrder="stroke" stroke={COLOR_SCADA_SHADOW} strokeWidth={2}>
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
        fill={COLOR_TEXT_SECONDARY}
        fontFamily={FONT_SANS}
        fontSize={typeFontSize}
        fontWeight={700}
        paintOrder="stroke"
        stroke={COLOR_SCADA_SHADOW}
        strokeWidth={showPvCircuit ? 1.2 : 3}
        data-parity-key="station.mini.type"
      >
        {MINI_BLOCK_FOOTPRINT[props.footprintType].shortCodePl}
      </text>
      )}

      {variant === 'compact' && !showPvCircuit && props.transformerRatedKva !== null && (
        <text
          x={0}
          y={labelPowerY}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={transformerPowerFontSize}
          fontWeight={700}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={2}
          data-parity-key="station.mini.transformer.power"
        >
          {formatTransformerRatedPower(props.transformerRatedKva)}
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

      {/* K30-57: full DerBadges tylko w compact/detail; overview ma small
          indicator dot wewnątrz station circle (już renderowany powyżej). */}
      {variant !== 'overview' && props.derBadges.length > 0 && (
        showPvCircuit && props.derBadges.every((badge) => (badge.connectionSide ?? 'nn') === 'nn') ? (
          <g aria-hidden="true" data-parity-key="station.mini.der_badges">
            <g data-parity-key="station.mini.der_badge" />
          </g>
        ) : (
          <DerBadges
            offsetX={offsetX}
            offsetY={offsetY}
            badges={showPvCircuit
              ? props.derBadges.filter((badge) => (badge.connectionSide ?? 'nn') !== 'nn')
              : props.derBadges}
            viewportScale={props.viewportScale}
            showLabels={variant !== 'detail' || Boolean(props.selected)}
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
          <title>Zakres danych technicznych do przeliczenia</title>
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
  const layout = computeMiniBlockLayout(variant, snBays, true, 0, hasPvCircuit);
  const linePorts = layout.snColumns.filter(({ bay }) => isLineLikeFieldRole(bay.fieldRole));
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
    || role === FIELD_ROLE.RMU_LINE
    || isDerFieldRole(role);
}

function isDerFieldRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.DER_PV
    || role === FIELD_ROLE.DER_BESS
    || role === FIELD_ROLE.DER_FW;
}

function overviewFieldRoleLabel(
  role: FieldRole,
  index: number,
): 'WE' | 'WY' | 'ODG' | 'TR' | 'SPR' | 'POM' | 'PV' | 'BESS' | 'FW' {
  if (role === FIELD_ROLE.LINE_IN) return 'WE';
  if (role === FIELD_ROLE.LINE_OUT) return 'WY';
  if (role === FIELD_ROLE.LINE_BRANCH) return 'ODG';
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) return 'TR';
  if (role === FIELD_ROLE.COUPLER) return 'SPR';
  if (role === FIELD_ROLE.MEASUREMENT) return 'POM';
  if (role === FIELD_ROLE.DER_PV) return 'PV';
  if (role === FIELD_ROLE.DER_BESS) return 'BESS';
  if (role === FIELD_ROLE.DER_FW) return 'FW';
  if (role === FIELD_ROLE.RMU_LINE) return index === 0 ? 'WE' : 'WY';
  return 'WY';
}

function miniBlockPortRoleLabel(
  role: FieldRole,
  index: number,
): 'WE' | 'WY' | 'ODG' | 'TR' | 'SPR' | 'POM' | 'L' | 'PV' | 'BESS' | 'FW' {
  if (role === FIELD_ROLE.GPZ_LINE_BAY) return 'L';
  if (role === FIELD_ROLE.RMU_LINE) return index === 0 ? 'WE' : index === 1 ? 'WY' : 'ODG';
  return overviewFieldRoleLabel(role, index);
}

function miniBlockPortSide(
  role: FieldRole,
): 'terrain_network' | 'source_connection' | 'transformer' | 'coupler' | 'measurement' {
  if (isDerFieldRole(role)) return 'source_connection';
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) return 'transformer';
  if (role === FIELD_ROLE.COUPLER) return 'coupler';
  if (role === FIELD_ROLE.MEASUREMENT) return 'measurement';
  return 'terrain_network';
}

function miniBlockFieldDirection(
  role: FieldRole,
): 'upstream-network' | 'source-connection' | 'downstream-station' | 'internal-coupler' | 'measurement' {
  if (isDerFieldRole(role)) return 'source-connection';
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) return 'downstream-station';
  if (role === FIELD_ROLE.COUPLER) return 'internal-coupler';
  if (role === FIELD_ROLE.MEASUREMENT) return 'measurement';
  return 'upstream-network';
}

function miniBlockPortAnchorY(
  role: FieldRole,
  busY: number,
  variant: 'overview' | 'compact' | 'detail',
): number {
  if (variant === 'compact' && isLineLikeFieldRole(role)) return COMPACT_TERRAIN_PORT_Y;
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) {
    if (variant === 'compact') return busY + 86;
    return busY + (variant === 'detail' ? 58 : 48);
  }
  return busY - (variant === 'detail' ? 15 : 12);
}

function miniBlockPortLabelVisible(
  role: FieldRole,
  variant: 'overview' | 'compact' | 'detail',
): boolean {
  if (variant === 'detail') return true;
  if (isDerFieldRole(role)) return true;
  return !(isLineLikeFieldRole(role) || role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER);
}

// =============================================================================
// Sub-renderers
// =============================================================================

function MiniBlockSelectionCorners(props: {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly variant: 'compact' | 'detail';
}): JSX.Element {
  const corner = props.variant === 'compact' ? 14 : 12;
  const inset = props.variant === 'compact' ? 12 : 8;
  const effectiveWidth = props.variant === 'compact' ? Math.min(props.width, 184) : props.width;
  const effectiveHeight = props.variant === 'compact' ? Math.min(props.height, 176) : props.height;
  const left = -effectiveWidth / 2 + inset;
  const right = effectiveWidth / 2 - inset;
  const top = -effectiveHeight / 2 + inset;
  const bottom = effectiveHeight / 2 - inset;
  const corners = [
    { x: left, y: top, hx: corner, hy: corner },
    { x: right, y: top, hx: -corner, hy: corner },
    { x: left, y: bottom, hx: corner, hy: -corner },
    { x: right, y: bottom, hx: -corner, hy: -corner },
  ] as const;
  return (
    <g
      data-testid={`sld-v2-mini-rmu-selection-corners-${props.id}`}
      data-selection-style="cad_corner_handles"
      pointerEvents="none"
    >
      {corners.map((cornerSpec, index) => (
        <g key={`${props.id}-selection-corner-${index}`}>
          <line
            x1={cornerSpec.x}
            y1={cornerSpec.y}
            x2={cornerSpec.x + cornerSpec.hx}
            y2={cornerSpec.y}
            stroke={COLOR_SELECTION}
            strokeWidth={1.4}
            strokeLinecap="square"
          />
          <line
            x1={cornerSpec.x}
            y1={cornerSpec.y}
            x2={cornerSpec.x}
            y2={cornerSpec.y + cornerSpec.hy}
            stroke={COLOR_SELECTION}
            strokeWidth={1.4}
            strokeLinecap="square"
          />
        </g>
      ))}
    </g>
  );
}

function CompactTransformerSymbol(props: {
  readonly cx: number;
  readonly cy: number;
  readonly vectorGroup?: string | null;
}): JSX.Element {
  const r = 7;
  const gap = 7;
  return (
    <g
      data-testid="sld-v2-mini-rmu-compact-transformer-symbol"
      data-symbol-canon="transformer_intersecting_circles"
      data-transformer-circles-intersect="true"
      data-transformer-circle-overlap-px={2 * r - gap}
    >
      <circle
        cx={props.cx}
        cy={props.cy - gap / 2}
        r={r}
        fill="#07111C"
        stroke="#DDF7FF"
        strokeWidth={1.5}
        data-transformer-winding="SN"
        data-symbol-canon="transformer_winding_circle"
      />
      <circle
        cx={props.cx}
        cy={props.cy + gap / 2}
        r={r}
        fill="#07111C"
        stroke="#DDF7FF"
        strokeWidth={1.5}
        data-transformer-winding="nN"
        data-symbol-canon="transformer_winding_circle"
      />
      <line
        x1={props.cx}
        y1={props.cy + gap / 2 + r}
        x2={props.cx}
        y2={props.cy + gap / 2 + r + 4}
        stroke="#DDF7FF"
        strokeWidth={1.2}
      />
      <line
        x1={props.cx - 5}
        y1={props.cy + gap / 2 + r + 4}
        x2={props.cx + 5}
        y2={props.cy + gap / 2 + r + 4}
        stroke="#DDF7FF"
        strokeWidth={1.2}
      />
      <line
        x1={props.cx - 3.2}
        y1={props.cy + gap / 2 + r + 6}
        x2={props.cx + 3.2}
        y2={props.cy + gap / 2 + r + 6}
        stroke="#DDF7FF"
        strokeWidth={1}
      />
      {props.vectorGroup && (
        <text
          x={props.cx + 12}
          y={props.cy + 3}
          fill="#FFD166"
          fontFamily="monospace"
          fontSize={7}
          fontWeight={800}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={1.2}
        >
          {props.vectorGroup}
        </text>
      )}
    </g>
  );
}

interface CompactDirectionalBayColumnProps {
  readonly x: number;
  readonly busY: number;
  readonly bay: MiniBlockBayDescriptor;
  readonly bayIndex: number;
  readonly stationId: string;
  readonly roleLabel: string;
  readonly busColor: string;
  readonly transformerVectorGroup?: string | null;
  readonly transformerRef?: string | null;
  /** K30-128: liczba realnych odpływów nN (z ENM nn_field_specs FEEDER). TR bay
   *  rysuje N gałęzi na szynie nN zamiast gołego kikuta. 0 → brak odpływów. */
  readonly nnFeedersCount?: number;
  readonly onSymbolClick?: SymbolClickHandler;
}

function CompactDirectionalBayColumn(props: CompactDirectionalBayColumnProps): JSX.Element {
  const {
    x,
    busY,
    bay,
    bayIndex,
    stationId,
    roleLabel,
    busColor,
    transformerVectorGroup,
    transformerRef,
    nnFeedersCount = 0,
    onSymbolClick,
  } = props;
  const isLineBay = isLineLikeFieldRole(bay.fieldRole);
  const isTransformerBay =
    bay.fieldRole === FIELD_ROLE.TRANSFORMER || bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER;
  const elementId = `${stationId}/bay/${bay.bayRef}`;
  const clickHandler = onSymbolClick?.(elementId);
  const transformerClickHandler = transformerRef ? onSymbolClick?.(transformerRef) : undefined;

  if (isLineBay) {
    const portY = COMPACT_TERRAIN_PORT_Y;
    const cableHeadY = portY + 13;
    const breakerY = busY - 36;
    const switchY = busY - 20;
    const earthY = busY - 10;
    const labelY = portY - 9;
    const portCaption = roleLabel === 'ODG' && bay.designation.trim() !== ''
      ? bay.designation.trim()
      : roleLabel;
    const portCaptionWidth = Math.max(26, portCaption.length * 6 + 10);
    return (
      <g
        data-testid={`sld-v2-bay-column-sn-${bay.bayRef}`}
        data-compact-testid={`sld-v2-mini-rmu-compact-line-bay-${stationId}-${bay.bayRef}`}
        data-flow-direction="line_from_bus_up_to_terrain"
        data-bay-role={bay.fieldRole}
        data-port-role={roleLabel}
        data-hit-area={clickHandler ? 'true' : undefined}
        role={clickHandler ? 'button' : undefined}
        tabIndex={clickHandler ? 0 : undefined}
        aria-label={clickHandler ? `Pole ${roleLabel} ${bay.designation}` : undefined}
        onClick={clickHandler}
        onDoubleClick={clickHandler}
        onContextMenu={clickHandler ? (event) => {
          event.preventDefault();
          clickHandler(event);
        } : undefined}
        onKeyDown={clickHandler ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            clickHandler(event as unknown as MouseEvent<SVGGElement>);
          }
        } : undefined}
        style={clickHandler ? { cursor: 'pointer' } : undefined}
      >
        <title>{`Pole ${roleLabel} ${bay.designation}`}</title>
        {/* Pole = oś z symbolami, nie panel: rect zostaje wyłącznie jako
            niewidoczny hit-area (bez wypełnienia/tintu — język rysunku). */}
        <rect
          x={x - 16}
          y={portY + 9}
          width={32}
          height={busY - portY + 34}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
          data-hit-area="true"
          data-testid={`sld-v2-mini-rmu-compact-field-cell-${stationId}-${bay.bayRef}`}
        />
        <line
          x1={x}
          y1={portY}
          x2={x}
          y2={cableHeadY - 7}
          stroke={busColor}
          strokeWidth={2}
          strokeLinecap="round"
          data-testid={`sld-v2-mini-rmu-compact-external-stub-${stationId}-${bay.bayRef}`}
          data-parity-key="station.mini.external_stub.compact"
        />
        <line
          x1={x}
          y1={cableHeadY + 4}
          x2={x}
          y2={busY}
          stroke={busColor}
          strokeWidth={1.55}
          strokeLinecap="round"
          data-testid={`sld-v2-mini-rmu-compact-line-drop-${stationId}-${bay.bayRef}`}
          data-parity-key="station.mini.bay_drop_to_bus.compact"
        />
        <polygon
          points={`${x},${cableHeadY - 7} ${x - 6},${cableHeadY + 4} ${x + 6},${cableHeadY + 4}`}
          fill="#07111C"
          stroke={busColor}
          strokeWidth={1.2}
          data-testid={`sld-v2-mini-rmu-compact-cable-head-${stationId}-${bay.bayRef}`}
          data-symbol-canon="cable_head_triangle"
        />
        <ApparatusCbSquare
          cx={x}
          cy={breakerY}
          state={bay.cbState ?? 'closed'}
          energized={(bay.cbState ?? 'closed') === 'closed'}
        />
        <ApparatusSwitchDisconnector
          cx={x}
          cy={switchY}
          state={bay.dsState ?? 'closed'}
          energized={(bay.dsState ?? 'closed') === 'closed'}
        />
        <ApparatusEarthingSwitch
          cxAxis={x}
          cy={earthY}
          state={bay.esState ?? 'open'}
          side={bayIndex % 2 === 0 ? 'RIGHT' : 'LEFT'}
        />
        <g
          data-testid={`sld-v2-mini-rmu-compact-port-caption-${stationId}-${bay.bayRef}`}
          data-label-placement="above_terrain_port"
          data-caption-width={portCaptionWidth}
        >
          <text
            x={x}
            y={labelY}
            textAnchor="middle"
            fill="#DDF7FF"
            fontFamily={FONT_SANS}
            fontSize={8}
            fontWeight={900}
            paintOrder="stroke"
            stroke={COLOR_SCADA_SHADOW}
            strokeWidth={1.4}
          >
            {portCaption}
          </text>
        </g>
        {bay.hasMissingRequiredDevice && (
          <circle cx={x + 13} cy={switchY} r={3} fill="#FF7B00" stroke={COLOR_SELECTION} strokeWidth={0.5}>
            <title>Aparatura pola SN nie ma kompletnego pakietu katalogowego</title>
          </circle>
        )}
        <title>{`${roleLabel} - ${bay.designation}`}</title>
      </g>
    );
  }

  if (isTransformerBay) {
    const switchY = busY + 18;
    const fuseY = busY + 35;
    const trCy = busY + 61;
    const trTop = trCy - 10;
    const trBottom = trCy + 18;
    const lvY = busY + 86;
    return (
      <g
        data-testid={`sld-v2-bay-column-sn-${bay.bayRef}`}
        data-compact-testid={`sld-v2-mini-rmu-compact-tr-bay-${stationId}-${bay.bayRef}`}
        data-flow-direction="transformer_from_bus_down_to_lv"
        data-bay-role={bay.fieldRole}
        data-port-role={roleLabel}
        data-hit-area={clickHandler ? 'true' : undefined}
        role={clickHandler ? 'button' : undefined}
        tabIndex={clickHandler ? 0 : undefined}
        aria-label={clickHandler ? `Pole ${roleLabel} ${bay.designation}` : undefined}
        onClick={clickHandler}
        onDoubleClick={clickHandler}
        onContextMenu={clickHandler ? (event) => {
          event.preventDefault();
          clickHandler(event);
        } : undefined}
        onKeyDown={clickHandler ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            clickHandler(event as unknown as MouseEvent<SVGGElement>);
          }
        } : undefined}
        style={clickHandler ? { cursor: 'pointer' } : undefined}
      >
        <title>{`Pole ${roleLabel} ${bay.designation}`}</title>
        <rect
          x={x - 18}
          y={busY - 5}
          width={36}
          height={96}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
          data-hit-area="true"
          data-testid={`sld-v2-mini-rmu-compact-field-cell-${stationId}-${bay.bayRef}`}
        />
        <line x1={x} y1={busY} x2={x} y2={lvY} stroke={busColor} strokeWidth={1.8} strokeLinecap="round" />
        <ApparatusSwitchDisconnector
          cx={x}
          cy={switchY}
          state={bay.dsState ?? 'closed'}
          energized={(bay.dsState ?? 'closed') === 'closed'}
        />
        <ApparatusFuse cx={x} cy={fuseY} state="healthy" />
        <ApparatusEarthingSwitch
          cxAxis={x}
          cy={switchY + 8}
          state={bay.esState ?? 'open'}
          side="LEFT"
        />
        <line x1={x} y1={fuseY + 7} x2={x} y2={trTop} stroke={busColor} strokeWidth={1.6} />
        <g
          data-testid={
            transformerRef
              ? `sld-symbol-mini-transformer-${transformerRef}`
              : `sld-v2-mini-rmu-compact-transformer-host-${stationId}-${bay.bayRef}`
          }
          data-element-id={transformerRef ?? undefined}
          data-symbol-canon="transformer_intersecting_circles"
          data-transformer-circles-intersect="true"
          data-transformer-circle-overlap-px={7}
          data-hit-area={transformerClickHandler ? 'true' : undefined}
          role={transformerClickHandler ? 'button' : undefined}
          tabIndex={transformerClickHandler ? 0 : undefined}
          aria-label={transformerClickHandler ? 'Transformator SN/nN stacji' : undefined}
          onClick={transformerClickHandler}
          onDoubleClick={transformerClickHandler}
          onContextMenu={transformerClickHandler ? (event) => {
            event.preventDefault();
            transformerClickHandler(event);
          } : undefined}
          onKeyDown={transformerClickHandler ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              transformerClickHandler(event as unknown as MouseEvent<SVGGElement>);
            }
          } : undefined}
          style={transformerClickHandler ? { cursor: 'pointer' } : undefined}
        >
          <title>TR - transformator stacji</title>
          <CompactTransformerSymbol cx={x} cy={trCy} vectorGroup={transformerVectorGroup} />
          <rect
            x={x - 16}
            y={trCy - 18}
            width={32}
            height={42}
            fill="transparent"
            pointerEvents="all"
            data-hit-area="true"
            data-testid={transformerRef ? `sld-symbol-mini-transformer-${transformerRef}-hitbox` : undefined}
          />
        </g>
        <line
          x1={x}
          y1={trBottom}
          x2={x}
          y2={lvY}
          stroke="#7DD3FC"
          strokeWidth={1.8}
          data-parity-key="station.mini.tr.secondary_lead.compact"
        />
        {(() => {
          // K30-128: realne odpływy nN jako N gałęzi na szynie nN (zamiast
          // gołego kikuta z napisem "nN"). Liczba = realny FEEDER count z ENM
          // (nn_field_specs). Szyna rozszerza się tak, by N odpływów było
          // czytelnie rozłożonych; każdy = kanon wyłącznik nN (IEC 60617) z
          // krótkim torem wyprowadzenia. BEZ fabrykowanych prądów/obciążeń —
          // tylko struktura odpływów obecna w modelu.
          const feeders = Math.max(0, Math.min(6, Math.floor(nnFeedersCount)));
          const feederPitch = 16;
          const halfBus = Math.max(26, feeders > 0 ? ((feeders - 1) * feederPitch) / 2 + 12 : 26);
          const cbY = lvY + 9;
          const outgoingY = cbY + 9;
          const startX = feeders > 1 ? x - ((feeders - 1) * feederPitch) / 2 : x;
          return (
            <>
              <line
                x1={x - halfBus}
                y1={lvY}
                x2={x + halfBus}
                y2={lvY}
                stroke="#7DD3FC"
                strokeWidth={2.3}
                data-parity-key="station.mini.bus.lv.compact"
                data-feeders-count={feeders}
                data-testid={`sld-v2-mini-rmu-compact-lv-row-${stationId}-${bay.bayRef}`}
              />
              {feeders > 0 &&
                Array.from({ length: feeders }).map((_, fi) => {
                  const fx = startX + fi * feederPitch;
                  const odplywId = `${stationId}/nn-odplyw/${fi}`;
                  const feederClick = onSymbolClick?.(`${odplywId}/cb`);
                  return (
                    <g
                      key={`lv-feeder-${fi}`}
                      data-parity-key="station.mini.lv_feeder.compact"
                      data-testid={`sld-v2-mini-rmu-compact-lv-feeder-${stationId}-${bay.bayRef}-${fi}`}
                      data-feeder-index={fi}
                      role={feederClick ? 'button' : undefined}
                      tabIndex={feederClick ? 0 : undefined}
                      aria-label={feederClick ? `Odpływ nN ${fi + 1}` : undefined}
                      onClick={feederClick}
                      onKeyDown={feederClick ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          feederClick(event as unknown as MouseEvent<SVGGElement>);
                        }
                      } : undefined}
                      style={feederClick ? { cursor: 'pointer' } : undefined}
                    >
                      <title>{`Odpływ nN ${fi + 1}`}</title>
                      <line
                        x1={fx}
                        y1={lvY}
                        x2={fx}
                        y2={cbY - 3}
                        stroke="#7DD3FC"
                        strokeWidth={1.4}
                      />
                      <ApparatusLvBreaker cx={fx} cy={cbY} state="closed" />
                      <line
                        x1={fx}
                        y1={cbY + 3}
                        x2={fx}
                        y2={outgoingY}
                        stroke="#7DD3FC"
                        strokeWidth={1.4}
                      />
                      <circle cx={fx} cy={outgoingY} r={1.6} fill="#7DD3FC" />
                    </g>
                  );
                })}
            </>
          );
        })()}
        <text
          x={x - 31}
          y={lvY + 3}
          textAnchor="end"
          fill="#7DD3FC"
          fontFamily={FONT_SANS}
          fontSize={7}
          fontWeight={800}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={1.2}
        >
          nN
        </text>
        {/* Oznaczenie TR NAD linią vector group (CompactTransformerSymbol
            rysuje "Dyn…" na (cx+12, cy+3)) — stos TR / Dyn11 jak na realnym
            SLD, zamiast dwóch etykiet na tej samej linii bazowej (kolizja
            "DyTR1" z audytu SCADA-parity). */}
        <text
          x={x + 18}
          y={trCy - 6}
          textAnchor="start"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_SANS}
          fontSize={8}
          fontWeight={800}
          paintOrder="stroke"
          stroke={COLOR_SCADA_SHADOW}
          strokeWidth={1.6}
        >
          TR
        </text>
        {bay.hasMissingRequiredDevice && (
          <circle cx={x + 13} cy={switchY} r={3} fill="#FF7B00" stroke={COLOR_SELECTION} strokeWidth={0.5}>
            <title>Aparatura pola transformatorowego nie ma kompletnego pakietu katalogowego</title>
          </circle>
        )}
        <title>{`${roleLabel} - ${bay.designation}`}</title>
      </g>
    );
  }

  return (
    <BayColumnSn
      x={x}
      busY={busY}
      bayRole={bay.fieldRole}
      bayRef={bay.bayRef}
      designation={bay.designation}
      apparatusStack={['DS', 'CB', 'ES']}
      variant="compact"
      stationId={stationId}
      hasMissing={bay.hasMissingRequiredDevice}
      onSymbolClick={onSymbolClick}
      cbState={bay.cbState}
      dsState={bay.dsState}
      esState={bay.esState}
      showRoleBadge={false}
      showDesignationLabel={false}
      roleBadgeLabel={roleLabel}
    />
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
      {/* Przedział PV/nN: granica przerywana bez wypełnienia (CAD), ostre rogi. */}
      <rect
        x={-86}
        y={baseY + 1}
        width={172}
        height={76}
        fill="none"
        stroke="#6F5A17"
        strokeWidth={0.8}
        strokeDasharray="4 3"
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
              fill="none"
              stroke="none"
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
  viewportScale?: number;
  showLabels?: boolean;
}

function DerBadges(props: DerBadgesProps): JSX.Element {
  const { offsetY, badges, showLabels = true, viewportScale } = props;
  const labelYOffset = 19;
  const powerYOffset = 31;
  const badgePitch = 52;
  const badgeStartX = -((badges.length - 1) * badgePitch) / 2;
  const derLabelFontSize = capWorldFontSize(8, viewportScale, 14);
  const derCountFontSize = capWorldFontSize(9, viewportScale, 14);
  const derPowerFontSize = capWorldFontSize(7.5, viewportScale, 13);
  // K30-15.2: distinct geometric shape per DER type per IEC 60617-5 convention
  // (PV=hexagon, BESS=square z napisem 'B', FW=triangle z napisem 'W').
  // Etykiety mocy rozstawiamy od srodka, zeby uklady hybrydowe PV+BESS+FW
  // pozostaly czytelne w LOD 2.
  return (
    <g data-testid="sld-v2-mini-rmu-der-badges" data-parity-key="station.mini.der_badges">
      {badges.map((badge, idx) => {
        const cx = badgeStartX + idx * badgePitch;
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
            {/* Symbol źródła IEC 60617 (kontur w kolorze typu, wnętrze kanwy)
                zamiast wypełnionego kształtu-kafla (redesign 2026-07 §1c). */}
            <DerSourceSymbol cx={cx} cy={cy} half={9} kind={badge.kind} stroke={fill} strokeWidth={1.2} />
            <title>{`${badge.kind}: ${badge.count} szt.`}</title>
            {/* K30-67: label przeniesiony pod symbol (IEC 60617 nie ma labels
                wewnątrz symbol — wewnątrz jest sinusoida/strzałka). */}
            {showLabels && (
              <text
                data-testid={`sld-v2-mini-rmu-der-badge-label-${badge.kind}`}
                x={cx}
                y={cy + labelYOffset}
                textAnchor="middle"
                fill={fill}
                fontFamily={FONT_SANS}
                fontSize={derLabelFontSize}
                fontWeight={900}
                letterSpacing={0}
                paintOrder="stroke"
                stroke="#05070A"
                strokeWidth={2}
              >
                {label}
              </text>
            )}
            {badge.count > 1 && showLabels && (
              <text
                x={cx + 11}
                y={cy - 8}
                textAnchor="start"
                fill={fill}
                fontFamily={FONT_SANS}
                fontSize={derCountFontSize}
                fontWeight={900}
              >
                ×{badge.count}
              </text>
            )}
            {/* K30-55 Phase E: aggregated P_mw (realna moc generacji, nie atrapa) */}
            {showLabels && typeof badge.totalPMw === 'number' && badge.totalPMw > 0 && (
              <text
                data-testid={`sld-v2-mini-rmu-der-badge-power-${badge.kind}`}
                x={cx}
                y={cy + powerYOffset}
                textAnchor="middle"
                fill={fill}
                fontFamily="monospace"
                fontSize={derPowerFontSize}
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
            {badge.hasBlockTransformer && (
              <g
                data-testid={`sld-v2-mini-rmu-der-badge-block-transformer-${badge.kind}`}
                transform={`translate(${cx + 18}, ${cy + 7})`}
              >
                <circle cx={0} cy={-3} r={3.2} fill="#0A1018" stroke="#13C45A" strokeWidth={1} />
                <circle cx={0} cy={3} r={3.2} fill="#0A1018" stroke="#13C45A" strokeWidth={1} />
                <title>Transformator blokowy OZE</title>
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
