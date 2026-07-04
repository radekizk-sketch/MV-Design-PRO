/**
 * enmToSldAdapter — adapter danych ENM → propsy rendererów SldCanvasV2.
 *
 * Iteracja 11 dostawy. Czysta, deterministyczna funkcja:
 *   buildSldDataFromSnapshot(snapshot, logicalViews) → {
 *     gpzs, sections, cableRuns, stations, ders
 *   }
 *
 * Reguły:
 *  - Brak fałszywych danych: jeśli snapshot pusty → puste tablice.
 *  - Layout deterministyczny: pozycje obliczane ze stabilnych slotów hierarchii.
 *  - Brak interpretacji fizycznej: tylko geometria + identyfikatory.
 *
 * Slot system:
 *  - GPZ row:    y = Y_GPZ
 *  - Sections:   y = Y_SECTIONS (sztywna szyna pod GPZ)
 *  - Trunks:     y = Y_RUN_BASE + i × RUN_PITCH (kanały Y per ciąg)
 *  - Stations:   x = X_STATIONS_START + j × STATION_PITCH
 *  - DERs:       offset (RIGHT) względem stacji macierzystej
 */

import type {
  BayDeviceState,
  BayRuntimeState,
  BaySwitchState,
  Cable,
  EnergyNetworkModel,
  LogicalViewsV1,
  Bus,
  Branch,
  Substation,
  BranchPointSN,
  Source,
  Generator,
  Bay,
  GPZSection,
  Transformer,
} from '../../../../types/enm';
import type { GpzRendererProps } from '../renderer/GpzRenderer';
import type { SectionRendererProps } from '../renderer/SectionRenderer';
import {
  applyLayoutToGpzs,
  applyLayoutToStations,
  buildSldLayoutGeometry,
} from './sldGeometryFromLayout';
import {
  STATION_RUN_TRUNK_OFFSET_Y,
  type StationOnRunRendererProps,
} from '../renderer/StationOnRunRenderer';
import {
  deriveFootprintType,
  type StationFootprintType,
} from '../renderer/MiniBlockFootprints';
import {
  miniBlockStationPortOffsets,
  type MiniBlockBayDescriptor,
  type MiniBlockDerBadge,
} from '../renderer/MiniBlockRmuRenderer';
import type { DerRendererProps } from '../renderer/DerRenderer';
import type { ConnectionRendererProps } from '../renderer/ConnectionRenderer';
import type {
  EarthingSwitchState,
  GpzApparatusSwitchState,
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
} from '../renderer/GpzSwitchgearRenderer';
import { ENM_BAY_ROLE_TO_FIELD_ROLE, FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import { buildSupplyPathHighlight, type SupplyPathHighlight } from './SupplyPathHighlighter';
import {
  buildPowerFlowIndex,
  type SldFlowDirection,
  type SldPowerFlowCompanion,
} from './SldPowerFlowCompanion';
import { LABEL_PRIORITY, computeDeclutterMetrics, declutterLabels } from './LabelDeclutter';
import type {
  SldBranchPointMarker,
  SldLabelSpec,
  SldReadabilityReport,
  SldRunCorridor,
  SldTerminalBinding,
  SldTerminalElementType,
  SldTopologyRun,
} from './SldTopologyContracts';
import { selectStationDistributionTransformerRefs } from '../../../network-build/stationTransformerSelection';

// =============================================================================
// Telemetry mapping (Phase 0B-1: BayRuntimeState → GpzBayDescriptor)
// =============================================================================

/**
 * Mapuje ENM BayDeviceState (PL) → GpzApparatusSwitchState (UI canon).
 * `_naped_rozbrojony` warianty traktujemy jako odpowiednio closed/open
 * (operator widzi pozycję mechaniczną; informacja o napędzie idzie do
 * `interlock_blocked` flag w pending state).
 * 'awaria' → 'unknown' (renderer pokazuje neutral z badge ostrzegawczym).
 */
function mapDeviceStateToSwitch(state: BayDeviceState | undefined): GpzApparatusSwitchState | undefined {
  if (state === undefined) return undefined;
  switch (state) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'open';
    case 'nieznany':
    case 'awaria':
      return 'unknown';
  }
}

function mapDeviceStateToEs(state: BayDeviceState | undefined): EarthingSwitchState | undefined {
  if (state === undefined) return undefined;
  switch (state) {
    case 'zamkniety':
    case 'zamkniety_naped_rozbrojony':
      return 'closed';
    case 'otwarty':
    case 'otwarty_naped_rozbrojony':
      return 'open';
    case 'nieznany':
    case 'awaria':
      return 'unknown';
  }
}

/**
 * Wybiera BaySwitchState dla aparatu danego rodzaju z `runtime_state.primary_device_states`.
 * Klucze tej mapy to `device_ref` z ENM (ID elementu). Konwencja Phase 0B-1: klucz
 * zawiera substring identyfikatora aparatu — 'cb' (CB), 'ds_lin'/'ds-lin' (DS_LIN),
 * 'ds_bus'/'ds-bus' (DS_BUS), 'es' (ES). Klucz NIE może zawierać dwóch kategorii
 * jednocześnie (deterministyczne API).
 *
 * Wzorce dopasowania (kolejność ważna, sprawdzane po prefiksie kategorii):
 *  - DS_BUS: zawiera 'ds_bus' lub 'ds-bus' lub kończy się '_dsbus'
 *  - DS_LIN: zawiera 'ds_lin' lub 'ds-lin' lub kończy się '_dslin' lub '_ds' (bez 'bus')
 *  - CB: zawiera '_cb' lub kończy się 'cb' (po lower-case) i nie ma 'ds'/'es'
 *  - ES: zawiera '_es' lub kończy się 'es' i nie ma 'ds'/'cb'
 *
 * Brak dopasowania → undefined (renderer pokaże 'unknown' przy braku danych).
 */
type DeviceCategory = 'cb' | 'ds_lin' | 'ds_bus' | 'es';

function classifyDeviceKey(key: string): DeviceCategory | undefined {
  const k = key.toLowerCase();
  if (k.includes('ds_bus') || k.includes('ds-bus') || k.endsWith('dsbus')) return 'ds_bus';
  if (k.includes('ds_lin') || k.includes('ds-lin') || k.endsWith('dslin')) return 'ds_lin';
  if (k.includes('_es') || /(?:^|[^a-z])es$/.test(k) || k.endsWith('_earthing')) return 'es';
  if (k.includes('_cb') || /(?:^|[^a-z])cb$/.test(k) || k.endsWith('_breaker')) return 'cb';
  if (k.includes('_ds') || /(?:^|[^a-z])ds$/.test(k)) return 'ds_lin';
  return undefined;
}

function pickFirstStateForCategory(
  states: Record<string, BaySwitchState> | undefined,
  category: DeviceCategory,
): BaySwitchState | undefined {
  if (!states) return undefined;
  /* Sortujemy klucze deterministycznie aby wybór był stabilny gdy >1 device
   * w danej kategorii (np. 2 CB w polu OZE). */
  const keys = Object.keys(states).sort();
  for (const key of keys) {
    if (classifyDeviceKey(key) === category) return states[key];
  }
  return undefined;
}

interface TelemetryProjection {
  readonly cbState?: GpzApparatusSwitchState;
  readonly dsState?: GpzApparatusSwitchState;
  readonly esState?: EarthingSwitchState;
  readonly inManipulation?: boolean;
}

/**
 * Projektuje BayRuntimeState → częściowy GpzBayDescriptor.
 * Brak runtime_state → puste pola (renderer pokazuje neutral 'unknown').
 */
export function projectBayTelemetry(runtime: BayRuntimeState | null | undefined): TelemetryProjection {
  if (!runtime) return {};
  const cb = pickFirstStateForCategory(runtime.primary_device_states, 'cb');
  const dsLin = pickFirstStateForCategory(runtime.primary_device_states, 'ds_lin');
  const es = pickFirstStateForCategory(runtime.primary_device_states, 'es');
  /* Manipulation: pending_command niezakończone LUB jakiś interlock_blocked
   * sygnalizuje że pole jest aktywnie zarządzane → renderer wyróżnia żółtym tłem. */
  const interlockOnAny = Boolean(
    cb?.interlock_blocked || dsLin?.interlock_blocked || es?.interlock_blocked,
  );
  const inManipulation = runtime.pending_command !== null && runtime.pending_command !== undefined
    ? true
    : interlockOnAny
      ? true
      : undefined;
  return {
    cbState: mapDeviceStateToSwitch(cb?.actual_state),
    dsState: mapDeviceStateToSwitch(dsLin?.actual_state),
    esState: mapDeviceStateToEs(es?.actual_state),
    inManipulation,
  };
}

// =============================================================================
// Slot constants (deterministic layout)
// =============================================================================

const X_GPZ = 100;
const Y_GPZ = 80;
const GPZ_WIDTH = 200;
const GPZ_SPACING = 520;

function gpzXByIndex(index: number): number {
  return X_GPZ + index * GPZ_SPACING;
}

const Y_SECTIONS = 200;
const SECTION_X_BASE = 100;
const SECTION_PITCH = 320;
const SECTION_WIDTH = 280;

const RUN_PITCH = 220;
const X_STATIONS_START = 900;
// K30-4: increased 220→380 dla czytelnego station-to-station spacing
// (Projektant/CAD specjaliści: symbol min 24 px @ LOD-2 = effective).
const STATION_PITCH = 380;

// K30-51 LAYOUT OVERHAUL — distance-based station X positioning.
// `cumKm` is already computed in buildStations() (linia ~1129) but was only
// used as distanceFromGpzKm label. Layout used uniform `posInRun * STATION_PITCH`.
// Now we map cumKm → pixels so stations are spaced by actual cable length.
const GPZ_TRUNK_HEAD_X = X_GPZ + GPZ_WIDTH + 60;  // GPZ end + connector gap
const PX_PER_KM = 400;                              // K30-54: scale-up (was 200) — visible cable gaps
// K30-54: STATION_MIN_PITCH bumped 160 → 320 (mini-block DETAIL_WIDTH=220 +
// padding 50 each side = 320). Previous 160 caused mini-block overlap dla
// K30 seed (avg segment ~100m → cumKm × 200 px/km = 20 px proposed,
// Math.max(20, prev+160) = prev+160 → stations overlapping because 160 < 220 width).
const STATION_MIN_PITCH = 320;
const STATION_DEFAULT_PITCH = 320;
const POST_STATION_SEGMENT_PITCH = 180;

/**
 * K30-51: oblicz station X z cumKm (cumulative cable length z GPZ).
 * Returns proposed X anchored za GPZ trunk head, clamped by min pitch
 * vs previousX żeby unikać overlap. PosInRun fallback gdy cumKm=0.
 */
function stationXFromCumKm(
  trunkStartX: number,
  cumKm: number,
  posInRun: number,
  previousX: number | null,
  minimumBaseX: number = X_STATIONS_START,
): number {
  const distancePx =
    cumKm > 0
      ? cumKm * PX_PER_KM
      : (posInRun + 1) * STATION_DEFAULT_PITCH;
  // V-03: dla lateralu minimumBaseX = X stacji-rodzica (rozłożone drzewo);
  // dla magistrali pozostaje X_STATIONS_START (zachowanie historyczne).
  const minimumX = minimumBaseX + posInRun * STATION_DEFAULT_PITCH;
  const proposedX = Math.max(trunkStartX + distancePx, minimumX);
  if (previousX === null) return proposedX;
  return Math.max(proposedX, previousX + STATION_MIN_PITCH);
}

const CANONICAL_PAGE_PADDING = 24;
const CANONICAL_HEADER_WIDTH = 320;
const CANONICAL_SECTION_LABEL_WIDTH = 30;
const CANONICAL_LV_SECTION_MIN_WIDTH = 260;
const CANONICAL_LV_SECTION_COUPLER_GAP = 72;
const CANONICAL_BAY_WIDTH = 74;
const CANONICAL_BAY_PITCH = 82;
const CANONICAL_TR_AREA_Y = 280;
const CANONICAL_TR_HEIGHT = 80;
// Musi być zgodne z GpzCanonicalRenderer.LV_BUS_GAP: przestrzeń pola TR
// między dolnym zaciskiem transformatora a rozdzielnią SN.
const CANONICAL_LV_BUS_GAP = 110;
const CANONICAL_LV_BAY_HEIGHT = 250;
const CANONICAL_LV_TRACK_HEIGHT = CANONICAL_LV_BAY_HEIGHT - 30;
const CANONICAL_LV_BLOCK_Y = CANONICAL_TR_AREA_Y + CANONICAL_TR_HEIGHT + CANONICAL_LV_BUS_GAP;
const CANONICAL_GPZ_FRAME_BOTTOM_Y =
  Y_GPZ + CANONICAL_LV_BLOCK_Y + CANONICAL_LV_BAY_HEIGHT + CANONICAL_PAGE_PADDING;
const CANONICAL_CABLE_HEAD_TIP_Y =
  Y_GPZ
  + CANONICAL_LV_BLOCK_Y
  + CANONICAL_LV_TRACK_HEIGHT
  + 6;
const GPZ_FIELD_CABLE_HEAD_CLEARANCE_Y = 44;
// Kanał poziomy musi być poza ramką GPZ. W przeciwnym razie wygląda jak wspólna szyna głowic.
const Y_RUN_BASE = CANONICAL_GPZ_FRAME_BOTTOM_Y + GPZ_FIELD_CABLE_HEAD_CLEARANCE_Y;
const GPZ_FIELD_CABLE_HEAD_Y = CANONICAL_CABLE_HEAD_TIP_Y;
const PENDING_RUN_LENGTH = 140;

const DER_COMPACT_STEP_Y = 40;

// =============================================================================
// Cable/line run helpers
// =============================================================================

interface CableRunRendererPropsLight {
  id: string;
  runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  pathPoints: ReadonlyArray<{ x: number; y: number }>;
  segmentKind: 'cable_sn' | 'overhead_line_sn';
  segmentRefs?: readonly string[];
  segmentPaths?: ReadonlyArray<{
    segmentRef: string;
    pathPoints: ReadonlyArray<{ x: number; y: number }>;
    /** K30-33: per-segment wariant kabla (izolacja+materiał) — renderer
     *  używa do różnicowania koloru/grubości stroke. */
    variant?: {
      insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN';
      conductor: 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN';
    };
    /** RECOVERY step 5 (connection_contract / §16): jawna TOŻSAMOŚĆ terminali
     *  tego odcinka wprost z ENM — każda renderowana krawędź jest
     *  terminal-to-terminal (busRef = szyna ENM, ownerRef = stacja właściciel).
     *  Geometria końcówek pochodzi z pozycji tych terminali, nie z gołych
     *  współrzędnych slotowych. */
    fromTerminal?: SegmentTerminalRef;
    toTerminal?: SegmentTerminalRef;
  }>;
  label?: string;
  segmentLabels?: ReadonlyArray<{
    segmentRef: string;
    text: string;
    x: number;
    y: number;
  }>;
  pendingEndpoint?: boolean;
  /** True gdy któryś z segmentów (Cable / OverheadLine) ma brak
   *  `endpoint_a_port` lub `endpoint_b_port` — wymaga ręcznego
   *  domknięcia w E-12 (segment SN). Renderer pokazuje dashed stroke
   *  i czerwony marker. */
  missingEndpointPort?: boolean;
  /** Lista segmentów z brakującymi portami (do tooltip / panelu
   *  problemów). */
  missingPortSegmentRefs?: readonly string[];
  /** Czy wszystkie segmenty są pod napięciem zgodnie z `SupplyPathHighlighter`
   *  (topologia, nie fizyka). Renderer może użyć tej flagi do podświetlenia
   *  zielonym torem mocy gdy aktywny jest tryb operatorski. */
  energized?: boolean;
  /** Czy któryś z segmentów jest punktem otwartym (NMO / status='open')
   *  zgodnie z `SupplyPathHighlighter.openPointBranchRefs`. */
  containsOpenPoint?: boolean;
  /** Punkty otwarte NA torze: pozycja {x,y} (geometria sąsiednich segmentów —
   *  miejsce, gdzie zielony tor się rozcina) + REALNY identyfikator łącznika
   *  (nazwa z modelu, bez fabrykowanych numerów). Renderer rysuje wyrazisty
   *  czerwony znacznik cut-point. Deterministyczne: czysta projekcja danych
   *  otwartego łącznika z `open_point_branch_refs`. */
  openPointMarkers?: readonly {
    id: string;
    x: number;
    y: number;
    label: string;
  }[];
  /** K30-41: napięcie ciągu [kV] z `inferRunVoltageKv`. Renderer dobiera tint
   *  stroke (gdy brak per-segment variant) + rysuje voltage chip przy starcie. */
  voltageKv?: number | null;
  /** P-A POWER-FLOW TOR (one truth): per-segment direction READ from the frozen
   *  solver companion (NOT geometry). 'forward' = power flows along the ENM
   *  branch orientation (from→to, which the route is drawn in); 'reverse' =
   *  against it (OZE backfeed). Renderer flips the arrow on 'reverse'. Absent ⇒
   *  no solver companion ⇒ renderer falls back to geometric arrows. */
  segmentDirections?: Readonly<Record<string, SldFlowDirection>>;
  /** P-A: run-level direction (solver) for the representative energized segment —
   *  drives the single overview flow arrow at L0/L1 where per-segment paths are
   *  not drawn. Absent ⇒ geometric fallback. */
  flowDirection?: SldFlowDirection;
  /** P-A: per-segment energization READ from the solver companion
   *  (`energized_branch_refs`). A segment NOT solved by the solver is
   *  de-energized → renderer dims it. Absent ⇒ topology fallback (`energized`). */
  segmentEnergized?: Readonly<Record<string, boolean>>;
}

type RunPoint = { x: number; y: number };

/** RECOVERY step 5: named terminal of a rendered cable segment (from ENM). */
interface SegmentTerminalRef {
  /** ENM bus ref of this endpoint (the electrical node). */
  readonly busRef: string | null;
  /** Owning station ref if the bus resolves to a station; null for a GPZ/pole
   *  bus or an inline splice terminal. */
  readonly ownerRef: string | null;
}

function isCableLikeBranch(b: Branch): boolean {
  return b.type === 'cable' || b.type === 'line_overhead';
}

function isMediumVoltageNetworkBranch(snapshot: EnergyNetworkModel, branch: Branch): boolean {
  const voltages = [readBusVoltageKv(snapshot, branch.from_bus_ref), readBusVoltageKv(snapshot, branch.to_bus_ref)]
    .filter((value): value is number => value !== null);
  if (voltages.length === 0) return true;
  return voltages.some((value) => value >= 1);
}

function readBusVoltageKv(snapshot: EnergyNetworkModel, busRef: string | null | undefined): number | null {
  if (!busRef) return null;
  const bus = (snapshot.buses ?? []).find((candidate) => candidate.ref_id === busRef || candidate.id === busRef);
  return typeof bus?.voltage_kv === 'number' ? bus.voltage_kv : null;
}

/** Detekcja odcinków bez realnych terminali elektrycznych.
 *
 * `endpoint_a_port` / `endpoint_b_port` są precyzyjną geometrią portu, ale
 * nie mogą same malować odcinka jako awaryjnego, jeżeli ENM ma poprawne
 * `from_bus_ref` i `to_bus_ref`. W przeciwnym razie prawidłowe ciągi SN
 * wyglądały jak błędne mimo zachowanej topologii.
 */
function detectMissingEndpointPorts(
  segments: readonly Branch[],
): { missing: boolean; missingSegmentRefs: readonly string[] } {
  const missingSegmentRefs: string[] = [];
  for (const seg of segments) {
    if (seg.type !== 'cable' && seg.type !== 'line_overhead') continue;
    if (!seg.from_bus_ref || !seg.to_bus_ref) {
      missingSegmentRefs.push(seg.ref_id);
    }
  }
  return {
    missing: missingSegmentRefs.length > 0,
    missingSegmentRefs,
  };
}

function classifySegmentKind(b: Branch): 'cable_sn' | 'overhead_line_sn' {
  return b.type === 'cable' ? 'cable_sn' : 'overhead_line_sn';
}

function stationCodeFromName(rawName: string | null | undefined, fallbackOrder: number): string {
  const name = rawName ?? '';
  const explicitCode = name.match(/\bS\d{2,3}\b/i);
  if (explicitCode) return explicitCode[0].toUpperCase();
  const stationOrdinal = name.match(/\bStacja\s+SN\/nN\s+0*(\d{1,3})\b/i)
    ?? name.match(/\bST[-\s]?0*(\d{1,3})\b/i);
  if (stationOrdinal) {
    const ordinal = Number.parseInt(stationOrdinal[1], 10);
    if (Number.isFinite(ordinal) && ordinal > 0) {
      return `S${String(ordinal).padStart(2, '0')}`;
    }
  }
  return `S${String(fallbackOrder).padStart(2, '0')}`;
}

/**
 * K30-58: normalizacja station name z OSD-grade Polish terminology.
 * K30 seed używa ad-hoc nazw "Stacja inline" / "Stacja terminal" które są
 * non-IEC. Konwertujemy do canonical nazw per IEC 61850 / OSD convention.
 */
function normalizeStationName(rawName: string | null | undefined, fallback: string): string {
  const name = (rawName ?? '').trim();
  if (!name) return fallback;
  // Replace ad-hoc "Stacja inline/terminal/branch/sectional" z OSD-compliant
  return name
    .replace(/^Stacja\s+inline\b/iu, 'Stacja przelotowa SN/nN')
    .replace(/^Stacja\s+terminal\b/iu, 'Stacja końcowa SN/nN')
    .replace(/^Stacja\s+branch\b/iu, 'Stacja odgałęźna SN/nN')
    .replace(/^Stacja\s+sectional\b/iu, 'Stacja sekcyjna SN/nN');
}

/**
 * K30-33: ekstrahuje wariant kabla (izolacja + materiał żyły) z catalog_ref,
 * pola `insulation` (jeśli Cable), oraz materialized_params. Używane przez
 * renderer do per-segment koloru/grubości.
 *
 * Heurystyka rozpoznawania:
 * - Linia napowietrzna → OVERHEAD + Al (lub AlSt jeśli AFL)
 * - Cable insulation explicit (XLPE/PVC/PAPER) → użyj
 * - catalog_ref zawiera 'epr' → EPR
 * - catalog_ref zawiera 'xlpe' → XLPE
 * - catalog_ref zawiera 'pvc' → PVC
 * - catalog_ref zawiera 'papier'/'paper'/'IRPSn' → PAPER
 * - catalog_ref zawiera '-cu-' lub 'cu-' lub ' cu ' → Cu, default Al
 */
function inferCableVariant(branch: Branch): {
  insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN';
  conductor: 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN';
} {
  if (branch.type === 'line_overhead') {
    const haystack = (branch.catalog_ref ?? '').toLowerCase();
    const conductor = haystack.includes('afl') || haystack.includes('alst')
      ? 'AlSt' as const
      : haystack.includes('cu')
        ? 'Cu' as const
        : 'Al' as const;
    return { insulation: 'OVERHEAD', conductor };
  }
  if (branch.type !== 'cable') {
    return { insulation: 'UNKNOWN', conductor: 'UNKNOWN' };
  }
  const cable = branch as Cable;
  const ref = (cable.catalog_ref ?? '').toLowerCase();
  let insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'UNKNOWN' = 'UNKNOWN';
  if (cable.insulation === 'XLPE') insulation = 'XLPE';
  else if (cable.insulation === 'PVC') insulation = 'PVC';
  else if (cable.insulation === 'PAPER') insulation = 'PAPER';
  if (insulation === 'UNKNOWN') {
    if (ref.includes('xlpe')) insulation = 'XLPE';
    else if (ref.includes('epr')) insulation = 'EPR';
    else if (ref.includes('pvc')) insulation = 'PVC';
    else if (ref.includes('papier') || ref.includes('paper') || ref.includes('irpsn')) {
      insulation = 'PAPER';
    }
  }
  const conductor = /\bcu\b|-cu-|cu-/i.test(ref) ? 'Cu' as const : 'Al' as const;
  return { insulation, conductor };
}

// =============================================================================
// Adapter result shape
// =============================================================================

export interface SldDataPayload {
  readonly gpzs: GpzRendererProps[];
  readonly sections: SectionRendererProps[];
  readonly cableRuns: CableRunRendererPropsLight[];
  readonly stations: StationOnRunRendererProps[];
  readonly branchPoints: readonly SldBranchPointMarker[];
  readonly ders: DerRendererProps[];
  /** Połączenia DER-stacja — ortogonalne ścieżki L kształtu od portu szyny stacji do DER. */
  readonly derConnections: ConnectionRendererProps[];
  readonly topologyCorridors: readonly SldRunCorridor[];
  readonly topologyRuns: readonly SldTopologyRun[];
  readonly terminalBindings: readonly SldTerminalBinding[];
  readonly labelSpecs: readonly SldLabelSpec[];
  readonly readabilityReport: SldReadabilityReport;
  /** Wynik `SupplyPathHighlighter` — czysta topologia operatorska (bez fizyki).
   *  Renderery mogą subskrybować flagę `energized` na poziomie cableRuns /
   *  sections / stations, gdy tryb operatorski „Pokaż tor zasilania" jest
   *  aktywny. */
  readonly supplyPath: SupplyPathHighlight;
  /** P-A: header for the active power-flow case (state declaration shown on the
   *  canvas). Present iff a frozen-solver companion was supplied to
   *  `buildSldDataFromSnapshot`; the per-segment direction/energization on
   *  `cableRuns`/`stations` then come from THAT solver result (one truth). */
  readonly powerFlow: SldPowerFlowCaseHeader | null;
}

export interface SldPowerFlowCaseHeader {
  readonly caseRef: string;
  readonly caseLabel: string;
  readonly converged: boolean;
  readonly enmHash: string;
}

const EMPTY_SUPPLY_PATH_FROZEN: SupplyPathHighlight = Object.freeze({
  energizedBusRefs: Object.freeze([]) as readonly string[],
  energizedBranchRefs: Object.freeze([]) as readonly string[],
  energizedTransformerRefs: Object.freeze([]) as readonly string[],
  openPointBranchRefs: Object.freeze([]) as readonly string[],
  energizedSubstationRefs: Object.freeze([]) as readonly string[],
  energizedGeneratorRefs: Object.freeze([]) as readonly string[],
  sourceRefs: Object.freeze([]) as readonly string[],
});

const EMPTY_SLD_DATA: SldDataPayload = Object.freeze({
  gpzs: [],
  sections: [],
  cableRuns: [],
  stations: [],
  branchPoints: [],
  ders: [],
  derConnections: [],
  topologyCorridors: [],
  topologyRuns: [],
  terminalBindings: [],
  labelSpecs: [],
  readabilityReport: Object.freeze({
    score: 100,
    totalLabels: 0,
    placedLabels: 0,
    hiddenLabels: 0,
    criticalCollisions: 0,
    hiddenCriticalLabelRefs: Object.freeze([]) as readonly string[],
    orphanStationRefs: Object.freeze([]) as readonly string[],
    orphanSegmentRefs: Object.freeze([]) as readonly string[],
    missingTerminalRefs: Object.freeze([]) as readonly string[],
    topologyContinuity: 'continuous',
    labelPlacements: Object.freeze([]) as readonly [],
  }),
  supplyPath: EMPTY_SUPPLY_PATH_FROZEN,
  powerFlow: null,
});

// =============================================================================
// Open-point (NMO / open section-switch) marker projection
// =============================================================================

type OpenPointMarker = { id: string; x: number; y: number; label: string };

/**
 * Project the FROZEN power-flow companion's `open_point_branch_refs` (open
 * switches / NMO) onto precise on-path marker positions + their REAL identifier.
 *
 * The open switch is not itself a drawn cable segment, so it is anchored to the
 * geometry of the adjacent cable segment(s) sharing the switch's bus node — the
 * exact spot where the energized green path breaks. The label is the switch's
 * model `name` (compacted); when the model carries NO operator number, a short
 * "NO" badge is used (data honesty — never a fabricated "P-xx").
 *
 * Pure projection of open-point data → deterministic (sorted refs, array-order
 * geometry lookup).
 */
function buildOpenPointMarkersByRun(
  snapshot: EnergyNetworkModel,
  openPointSet: ReadonlySet<string>,
  cableRuns: readonly CableRunRendererPropsLight[],
): Map<string, OpenPointMarker[]> {
  const byRun = new Map<string, OpenPointMarker[]>();
  if (openPointSet.size === 0) return byRun;

  const branchByRef = new Map((snapshot.branches ?? []).map((b) => [b.ref_id, b]));

  for (const openRef of [...openPointSet].sort((a, b) => a.localeCompare(b))) {
    const openBranch = branchByRef.get(openRef);
    // Bus nodes the open point connects; for an open switch these are its two
    // helper nodes (the adjacent cables terminate on them).
    const busNodes = new Set<string>(
      [openBranch?.from_bus_ref, openBranch?.to_bus_ref].filter(
        (ref): ref is string => typeof ref === 'string' && ref.length > 0,
      ),
    );

    let runId: string | null = null;
    let incoming: RunPoint | null = null; // path END touching the switch (green side)
    let outgoing: RunPoint | null = null; // path START leaving the switch (dim side)
    // Direct case: the open ref itself is a drawn segment (kept for robustness).
    let selfMid: RunPoint | null = null;

    for (const run of cableRuns) {
      for (const segmentPath of run.segmentPaths ?? []) {
        const points = segmentPath.pathPoints;
        if (points.length < 2) continue;
        if (segmentPath.segmentRef === openRef) {
          selfMid = points[Math.floor(points.length / 2)];
          runId = run.id;
          continue;
        }
        if (busNodes.size === 0) continue;
        const segBranch = branchByRef.get(segmentPath.segmentRef);
        if (!segBranch) continue;
        if (segBranch.to_bus_ref && busNodes.has(segBranch.to_bus_ref)) {
          incoming = points[points.length - 1];
          runId = run.id; // anchor marker on the run that owns the feeding side
        }
        if (segBranch.from_bus_ref && busNodes.has(segBranch.from_bus_ref)) {
          outgoing = points[0];
          if (runId === null) runId = run.id;
        }
      }
    }

    // Place the marker at the open point itself — the join between the energized
    // (incoming) cable end and the de-energized (outgoing) cable start. The
    // gap-midpoint lands exactly where the green path breaks (and self-corrects
    // for the renderer's station-port snap, which nudges segment ends toward this
    // join). Falls back to whichever side exists when only one neighbour is found.
    let position: RunPoint | null = null;
    if (incoming && outgoing) {
      position = { x: (incoming.x + outgoing.x) / 2, y: (incoming.y + outgoing.y) / 2 };
    } else {
      position = incoming ?? outgoing ?? selfMid;
    }
    if (!position || runId === null) continue;

    const marker: OpenPointMarker = {
      id: openRef,
      x: Math.round(position.x),
      y: Math.round(position.y),
      label: compactOpenPointLabel(openBranch?.name ?? null),
    };
    const list = byRun.get(runId);
    if (list) list.push(marker);
    else byRun.set(runId, [marker]);
  }

  return byRun;
}

/**
 * Compact dispatcher label for an open point. Uses the switch's REAL model name
 * when present (trimmed/clipped so it never collides with node labels); falls
 * back to a short "NO" (otwarty) badge when the model has no name. NEVER invents
 * an operator "P-xx" number that is not in the data.
 */
function compactOpenPointLabel(name: string | null): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return 'NO';
  // Keep it short for an on-line marker; clip overly long station-switch names.
  const MAX = 22;
  return trimmed.length > MAX ? `${trimmed.slice(0, MAX - 1)}…` : trimmed;
}

// =============================================================================
// Main builder
// =============================================================================

export function buildSldDataFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
  powerFlow?: SldPowerFlowCompanion | null,
): SldDataPayload {
  if (!snapshot) return EMPTY_SLD_DATA;

  let gpzs = buildGpzs(snapshot);
  const sections = buildSections(snapshot);
  let stations = buildStations(snapshot);
  let cableRuns = buildCableRuns(snapshot, logicalViews, stations);
  let branchPoints = buildBranchPointMarkers(snapshot, cableRuns, stations);
  const stationLikeLayout = separateStationLikeNodesOnRuns(stations, branchPoints);
  if (stationLikeLayout.changed) {
    stations = stationLikeLayout.stations;
    branchPoints = stationLikeLayout.branchPoints;
    cableRuns = buildCableRuns(snapshot, logicalViews, stations);
  }

  // Migracja geometrii §4: pozycje węzłów (stacje/GPZ) z JEDNEJ prawdy drzewa
  // (LayoutEngine), nie ze slotów (`Y_RUN_BASE`, `X_STATIONS_START + j×pitch`).
  // Bramka: tylko gdy silnik zbudował realne drzewo (≥1 krawędź) — inaczej
  // pozostaje geometria slotowa (render działa). Przesuwamy stacje/GPZ, a potem
  // PRZEBUDOWUJEMY cable-runs i branch-pointy z nowych pozycji stacji: istniejący
  // `buildCableRuns` wyprowadza trasę z `station.x/y` (oraz głowic pól), więc kable
  // podążają za stacjami-drzewa istniejącą (działającą) logiką routingu — bez
  // sklejania per-segment (które dla wielostacyjnych ciągów dawało plątaninę).
  const layout = buildSldLayoutGeometry(snapshot, snapshot.header?.hash_sha256 ?? 'enm');
  if (layout) {
    stations = applyLayoutToStations(stations, layout);
    gpzs = applyLayoutToGpzs(gpzs, layout);
    // R2: punkty wyjścia magistral z węzłów GPZ (prawa krawędź bloku, środek
    // wysokości) — magistrala rysuje się OD GPZ, nie od slotowej głowicy.
    const trunkOriginByOwner = new Map<string, RunPoint>();
    for (const gpz of gpzs) {
      const node = layout.nodeByRef.get(gpz.id);
      if (node) {
        trunkOriginByOwner.set(gpz.id, { x: node.x + node.width, y: node.y + node.height / 2 });
      }
    }
    cableRuns = buildCableRuns(snapshot, logicalViews, stations, trunkOriginByOwner);
    branchPoints = buildBranchPointMarkers(snapshot, cableRuns, stations);
  }

  const { ders, derConnections } = buildDers(snapshot, stations);
  const supplyPath = buildSupplyPathHighlight(snapshot);
  const topologyProjection = buildSldTopologyProjection(snapshot, {
    gpzs,
    cableRuns,
    stations,
    branchPoints,
    ders,
  });

  // P-A POWER-FLOW TOR — ONE TRUTH. When a frozen-solver companion is supplied,
  // energization + per-segment direction are READ from the solver result (the SLD
  // is a projection of the math model). Without a companion, fall back to the
  // topology-only `SupplyPathHighlighter` (no direction) — pre-P-A behaviour.
  const pfIndex = buildPowerFlowIndex(powerFlow ?? null);

  const energizedBranchSet = new Set(supplyPath.energizedBranchRefs);
  const openPointSet = pfIndex
    ? new Set(powerFlow?.open_point_branch_refs ?? [])
    : new Set(supplyPath.openPointBranchRefs);

  // SCADA open-point furniture: resolve each open switch to a precise on-path
  // position (where the energized green path breaks) + its REAL identifier
  // (switch name from the model — no fabricated "P-xx"). The open switch itself
  // is not a cable segment, so it is anchored to the geometry of the adjacent
  // cable segment(s) that DO have a rendered path.
  const openPointMarkersByRun = buildOpenPointMarkersByRun(snapshot, openPointSet, cableRuns);

  const cableRunsAnnotated = cableRuns.map((run) => {
    const runMarkers = openPointMarkersByRun.get(run.id) ?? [];
    const refs = run.segmentRefs ?? [];
    if (refs.length === 0) {
      return runMarkers.length > 0
        ? { ...run, containsOpenPoint: true, openPointMarkers: runMarkers }
        : run;
    }
    if (pfIndex) {
      // Solver-driven: per-segment energization + direction, READ (not computed).
      const segmentEnergized: Record<string, boolean> = {};
      const segmentDirections: Record<string, SldFlowDirection> = {};
      for (const ref of refs) {
        segmentEnergized[ref] = pfIndex.isBranchEnergized(ref);
        segmentDirections[ref] = pfIndex.directionOf(ref);
      }
      const allEnergized = refs.every((ref) => segmentEnergized[ref]);
      const anyOpenPoint = runMarkers.length > 0 || refs.some((ref) => openPointSet.has(ref));
      // Run-level arrow uses the first energized segment that carries a real
      // (non-zero) direction; this is the representative flow at L0/L1.
      const representative =
        refs.find((ref) => segmentDirections[ref] === 'forward' || segmentDirections[ref] === 'reverse');
      const flowDirection: SldFlowDirection = representative
        ? segmentDirections[representative]
        : 'none';
      return {
        ...run,
        energized: allEnergized,
        containsOpenPoint: anyOpenPoint,
        openPointMarkers: runMarkers.length > 0 ? runMarkers : undefined,
        segmentEnergized,
        segmentDirections,
        flowDirection,
      };
    }
    // Topology fallback (no solver companion).
    const allEnergized = refs.every((ref) => energizedBranchSet.has(ref));
    const anyOpenPoint = runMarkers.length > 0 || refs.some((ref) => openPointSet.has(ref));
    return {
      ...run,
      energized: allEnergized,
      containsOpenPoint: anyOpenPoint,
      openPointMarkers: runMarkers.length > 0 ? runMarkers : undefined,
    };
  });

  // Per-station energization from the solver (SN bus in the slack island).
  const stationsAnnotated = pfIndex
    ? stations.map((station) => ({
        ...station,
        energized: stationEnergizedFromSolver(station.id, pfIndex),
      }))
    : stations;

  return {
    gpzs,
    sections,
    cableRuns: cableRunsAnnotated,
    stations: stationsAnnotated,
    branchPoints,
    ders,
    derConnections,
    topologyCorridors: topologyProjection.topologyCorridors,
    topologyRuns: topologyProjection.topologyRuns,
    terminalBindings: topologyProjection.terminalBindings,
    labelSpecs: topologyProjection.labelSpecs,
    readabilityReport: topologyProjection.readabilityReport,
    supplyPath,
    powerFlow: powerFlow
      ? {
          caseRef: powerFlow.case_ref,
          caseLabel: powerFlow.case_label,
          converged: powerFlow.converged,
          enmHash: powerFlow.enm_hash,
        }
      : null,
  };
}

/** Station SN bus energization READ from the solver companion (one truth). The
 *  station id is `stn/<hash>/station`; its SN bus is `stn/<hash>/sn_bus`. */
function stationEnergizedFromSolver(
  stationId: string,
  pfIndex: ReturnType<typeof buildPowerFlowIndex>,
): boolean {
  if (!pfIndex) return true;
  const base = stationId.endsWith('/station')
    ? stationId.slice(0, -'/station'.length)
    : stationId;
  // Energized iff either the SN or nN bus is in the solver slack island.
  return (
    pfIndex.isBusEnergized(`${base}/sn_bus`)
    || pfIndex.isBusEnergized(`${base}/nn_bus`)
    || pfIndex.isBusEnergized(stationId)
  );
}

interface SldTopologyProjection {
  readonly topologyCorridors: readonly SldRunCorridor[];
  readonly topologyRuns: readonly SldTopologyRun[];
  readonly terminalBindings: readonly SldTerminalBinding[];
  readonly labelSpecs: readonly SldLabelSpec[];
  readonly readabilityReport: SldReadabilityReport;
}

function buildSldTopologyProjection(
  snapshot: EnergyNetworkModel,
  rendered: {
    readonly gpzs: readonly GpzRendererProps[];
    readonly cableRuns: readonly CableRunRendererPropsLight[];
    readonly stations: readonly StationOnRunRendererProps[];
    readonly branchPoints: readonly SldBranchPointMarker[];
    readonly ders: readonly DerRendererProps[];
  },
): SldTopologyProjection {
  const fieldStationByRef = collectFieldStationByRef(snapshot);
  const lineRuns = buildSldLineRunsForLayout(snapshot, fieldStationByRef);
  const topologyCorridors = buildRunCorridors(lineRuns, rendered);
  const topologyRuns = buildTopologyRuns(lineRuns, snapshot, rendered);
  const terminalBindings = buildTerminalBindings(snapshot, topologyRuns, rendered);
  const labelSpecs = buildLabelSpecs(rendered);
  const orphanStationRefs = buildOrphanStationRefs(fieldStationByRef, lineRuns);
  const orphanSegmentRefs = buildOrphanSegmentRefs(snapshot, topologyRuns);
  const missingTerminalRefs = buildMissingTerminalRefs(snapshot, terminalBindings);
  const readabilityReport = buildReadabilityReport({
    labelSpecs,
    orphanStationRefs,
    orphanSegmentRefs,
    missingTerminalRefs,
  });

  return {
    topologyCorridors,
    topologyRuns,
    terminalBindings,
    labelSpecs,
    readabilityReport,
  };
}

function buildRunCorridors(
  lineRuns: readonly SldLineRunForLayout[],
  rendered: {
    readonly gpzs: readonly GpzRendererProps[];
    readonly cableRuns: readonly CableRunRendererPropsLight[];
    readonly stations: readonly StationOnRunRendererProps[];
  },
): readonly SldRunCorridor[] {
  const corridors: SldRunCorridor[] = [{
    id: 'corridor-gpz',
    kind: 'gpz',
    laneIndex: 0,
    yMin: Y_GPZ,
    yMax: Y_RUN_BASE,
    label: 'GPZ i rozdzielnia SN',
    stationCount: rendered.gpzs.length,
    runRef: null,
    parentRunRef: null,
    sourceRunRef: null,
    nopStationRef: null,
    tapPoint: null,
    routePoints: [],
  }];
  lineRuns
    .slice()
    .sort(compareLineRunsForLayout)
    .forEach((run, index) => {
      const kind =
        run.run_kind === 'main_trunk'
          ? 'main-trunk'
          : run.run_kind === 'branch'
            ? 'branch'
            : 'ring-return';
      const laneIndex = index + 1;
      corridors.push({
        id: `corridor-${run.id}`,
        kind,
        laneIndex,
        yMin: Y_RUN_BASE + index * RUN_PITCH,
        yMax: Y_RUN_BASE + index * RUN_PITCH + RUN_PITCH,
        label: safeTopologyRunLabel(run, index),
        stationCount: run.stations.length,
        runRef: run.id,
        parentRunRef: run.parent_run_ref ?? null,
        sourceRunRef: run.parent_run_ref ?? null,
        nopStationRef: run.nop_station_ref ?? null,
        tapPoint: computeRunTapPoint(run, rendered.stations, rendered.cableRuns),
        routePoints: computeRunRoutePoints(run, rendered.cableRuns),
      });
    });
  return corridors;
}

function buildTopologyRuns(
  lineRuns: readonly SldLineRunForLayout[],
  snapshot: EnergyNetworkModel,
  rendered: {
    readonly cableRuns: readonly CableRunRendererPropsLight[];
    readonly stations: readonly StationOnRunRendererProps[];
  },
): readonly SldTopologyRun[] {
  const branchByRef = new Map((snapshot.branches ?? []).map((branch) => [branch.ref_id, branch]));
  return lineRuns
    .slice()
    .sort(compareLineRunsForLayout)
    .map((run, index) => {
      const segmentRefs = lineRunSegmentRefs(run);
      const stationRefs = run.stations
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((station) => station.substation_ref);
      const terminalRefs = segmentRefs.flatMap((segmentRef) => [
        `${segmentRef}:A`,
        `${segmentRef}:B`,
      ]);
      const laneIndex = index + 1;
      return {
        id: run.id,
        kind: run.run_kind,
        label: safeTopologyRunLabel(run, index),
        corridorId: `corridor-${run.id}`,
        laneIndex,
        orderInRun: index,
        parentRunRef: run.parent_run_ref ?? null,
        sourceRunRef: run.parent_run_ref ?? null,
        branchOriginStationRef: run.branch_origin_station_ref ?? null,
        nopStationRef: run.nop_station_ref ?? null,
        startingBayRef: run.starting_bay_ref ?? null,
        startingPortRef: run.starting_port_ref ?? null,
        tapPoint: computeRunTapPoint(run, rendered.stations, rendered.cableRuns),
        distanceFromSourceM: computeRunDistanceFromSourceM(run, branchByRef),
        routePoints: computeRunRoutePoints(run, rendered.cableRuns),
        segmentRefs,
        stationRefs,
        terminalRefs,
      } satisfies SldTopologyRun;
    });
}

function buildTerminalBindings(
  snapshot: EnergyNetworkModel,
  topologyRuns: readonly SldTopologyRun[],
  rendered: {
    readonly cableRuns: readonly CableRunRendererPropsLight[];
    readonly stations: readonly StationOnRunRendererProps[];
    readonly ders: readonly DerRendererProps[];
  },
): readonly SldTerminalBinding[] {
  const branchByRef = new Map((snapshot.branches ?? []).map((branch) => [branch.ref_id, branch]));
  const runBySegmentRef = new Map<string, SldTopologyRun>();
  for (const run of topologyRuns) {
    for (const segmentRef of run.segmentRefs) {
      runBySegmentRef.set(segmentRef, run);
    }
  }
  const bindings: SldTerminalBinding[] = [];

  for (const run of topologyRuns) {
    for (const segmentRef of run.segmentRefs) {
      const branch = branchByRef.get(segmentRef);
      if (!branch) continue;
      const topologyRun = runBySegmentRef.get(segmentRef) ?? null;
      const pointA = findSegmentEndpointPoint(rendered.cableRuns, segmentRef, 'A');
      const pointB = findSegmentEndpointPoint(rendered.cableRuns, segmentRef, 'B');
      bindings.push({
        id: `${segmentRef}:A`,
        elementRef: segmentRef,
        elementType: classifyBranchEndpointElementType(snapshot, branch, 'A'),
        terminalRef: `${segmentRef}:A`,
        busRef: resolveBranchEndpointBusRef(snapshot, branch, 'A'),
        portRef: resolveBranchEndpointPortRef(snapshot, branch, 'A'),
        runRef: topologyRun?.id ?? null,
        laneIndex: topologyRun?.laneIndex ?? null,
        orderInRun: topologyRun?.segmentRefs.indexOf(segmentRef) ?? null,
        distanceFromSourceM: topologyRun?.distanceFromSourceM ?? null,
        x: pointA?.x ?? null,
        y: pointA?.y ?? null,
      });
      bindings.push({
        id: `${segmentRef}:B`,
        elementRef: segmentRef,
        elementType: classifyBranchEndpointElementType(snapshot, branch, 'B'),
        terminalRef: `${segmentRef}:B`,
        busRef: resolveBranchEndpointBusRef(snapshot, branch, 'B'),
        portRef: resolveBranchEndpointPortRef(snapshot, branch, 'B'),
        runRef: topologyRun?.id ?? null,
        laneIndex: topologyRun?.laneIndex ?? null,
        orderInRun: topologyRun?.segmentRefs.indexOf(segmentRef) ?? null,
        distanceFromSourceM: topologyRun?.distanceFromSourceM ?? null,
        x: pointB?.x ?? null,
        y: pointB?.y ?? null,
      });
    }
  }

  for (const station of rendered.stations) {
    const topologyRun = findTopologyRunForStation(topologyRuns, station.id);
    bindings.push({
      id: `${station.id}:station-node`,
      elementRef: station.id,
      elementType: 'station',
      terminalRef: `${station.id}:sn-node`,
      runRef: topologyRun?.id ?? null,
      laneIndex: topologyRun?.laneIndex ?? null,
      orderInRun: topologyRun?.stationRefs.indexOf(station.id) ?? null,
      distanceFromSourceM: station.distanceFromGpzKm != null
        ? Math.round(station.distanceFromGpzKm * 1000)
        : null,
      x: station.x,
      y: station.y,
    });
  }

  for (const der of rendered.ders) {
    bindings.push({
      id: `${der.id}:pcc`,
      elementRef: der.id,
      elementType: 'der',
      terminalRef: `${der.id}:pcc`,
      runRef: null,
      x: der.x,
      y: der.y,
    });
  }

  return bindings.sort((a, b) => a.id.localeCompare(b.id));
}

function buildLabelSpecs(rendered: {
  readonly gpzs: readonly GpzRendererProps[];
  readonly cableRuns: readonly CableRunRendererPropsLight[];
  readonly stations: readonly StationOnRunRendererProps[];
  readonly branchPoints: readonly SldBranchPointMarker[];
  readonly ders: readonly DerRendererProps[];
}): readonly SldLabelSpec[] {
  const labels: SldLabelSpec[] = [];

  for (const gpz of rendered.gpzs) {
    pushLabel(labels, {
      id: `label:gpz:${gpz.id}`,
      ownerRef: gpz.id,
      ownerKind: 'gpz',
      text: compactPublicLabel(gpz.name || 'GPZ'),
      priority: LABEL_PRIORITY.GPZ,
      anchorPoint: { x: gpz.x, y: gpz.y },
      preferredAnchor: 'top-right',
    });
  }

  for (const run of rendered.cableRuns) {
    const points = run.pathPoints;
    // Etykietę ciągu kotwiczymy na środku NAJDŁUŻSZEGO odcinka poziomego trasy
    // (a nie na narożniku L-kształtu), aby na przeglądzie (L0) opis kabla
    // magistrali leżał wzdłuż zielonego toru — jak na referencji SCADA — z dala
    // od bloku GPZ i pól startowych. Fallback do środka listy punktów.
    const midPoint = longestHorizontalSegmentMidpoint(points)
      ?? (points.length > 0 ? points[Math.floor(points.length / 2)] : { x: 0, y: 0 });
    if (run.label) {
      pushLabel(labels, {
        id: `label:run:${run.id}`,
        ownerRef: run.id,
        ownerKind: 'run',
        text: compactPublicLabel(run.label),
        priority: LABEL_PRIORITY.SEGMENT,
        anchorPoint: midPoint,
        preferredAnchor: 'top',
        // Rzadka etykieta L0 tylko dla magistrali/głównego fidera.
        isTrunk: run.runKind === 'main_trunk',
      });
    }
    for (const segmentLabel of run.segmentLabels ?? []) {
      pushLabel(labels, {
        id: `label:segment:${segmentLabel.segmentRef}`,
        ownerRef: segmentLabel.segmentRef,
        ownerKind: 'segment',
        text: compactPublicLabel(segmentLabel.text),
        priority: LABEL_PRIORITY.SEGMENT,
        anchorPoint: { x: segmentLabel.x, y: segmentLabel.y },
        preferredAnchor: 'top',
      });
    }
  }

  for (const station of rendered.stations) {
    const label = station.stationCode
      ? `${station.stationCode} ${station.topologicalType ?? 'stacja SN/nN'}`
      : compactPublicLabel(station.name);
    pushLabel(labels, {
      id: `label:station:${station.id}`,
      ownerRef: station.id,
      ownerKind: station.isNop ? 'nop' : 'station',
      text: label,
      priority: station.isNop ? LABEL_PRIORITY.NMO : LABEL_PRIORITY.STATION,
      anchorPoint: { x: station.x, y: station.y },
      preferredAnchor: 'bottom',
    });
  }

  for (const branchPoint of rendered.branchPoints) {
    pushLabel(labels, {
      id: `label:branch-point:${branchPoint.id}`,
      ownerRef: branchPoint.id,
      ownerKind: 'branch_point',
      text: branchPoint.branchPointType === 'zksn' ? 'ZKSN' : 'Słup rozg.',
      priority: branchPoint.branchPointType === 'zksn' ? LABEL_PRIORITY.NMO : LABEL_PRIORITY.STATION,
      anchorPoint: { x: branchPoint.x, y: branchPoint.y },
      preferredAnchor: branchPoint.branchPointType === 'zksn' ? 'bottom' : 'top',
    });
  }

  for (const der of rendered.ders) {
    pushLabel(labels, {
      id: `label:der:${der.id}`,
      ownerRef: der.id,
      ownerKind: 'der',
      text: compactPublicLabel(
        der.nominalPowerKw ? `${der.kind} ${formatPolishNumber(der.nominalPowerKw / 1000)} MW` : der.kind,
      ),
      priority: LABEL_PRIORITY.SEGMENT,
      anchorPoint: { x: der.x, y: der.y },
      preferredAnchor: 'right',
    });
  }

  return labels.sort((a, b) => a.id.localeCompare(b.id));
}

function buildOrphanStationRefs(
  fieldStationByRef: ReadonlyMap<string, Substation>,
  lineRuns: readonly SldLineRunForLayout[],
): readonly string[] {
  const runStationRefs = new Set<string>();
  for (const run of lineRuns) {
    for (const station of run.stations) {
      runStationRefs.add(station.substation_ref);
    }
  }
  return [...fieldStationByRef.keys()]
    .filter((stationRef) => !runStationRefs.has(stationRef))
    .sort((a, b) => a.localeCompare(b));
}

function buildOrphanSegmentRefs(
  snapshot: EnergyNetworkModel,
  topologyRuns: readonly SldTopologyRun[],
): readonly string[] {
  const coveredSegments = new Set(topologyRuns.flatMap((run) => run.segmentRefs));
  return (snapshot.branches ?? [])
    .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(snapshot, branch))
    .map((branch) => branch.ref_id)
    .filter((segmentRef) => !coveredSegments.has(segmentRef))
    .sort((a, b) => a.localeCompare(b));
}

function buildMissingTerminalRefs(
  snapshot: EnergyNetworkModel,
  terminalBindings: readonly SldTerminalBinding[],
): readonly string[] {
  const branchRefs = new Set((snapshot.branches ?? []).map((branch) => branch.ref_id));
  return terminalBindings
    .filter((binding) =>
      branchRefs.has(binding.elementRef) && (!binding.busRef || !binding.portRef),
    )
    .map((binding) => binding.terminalRef)
    .sort((a, b) => a.localeCompare(b));
}

function buildReadabilityReport(args: {
  readonly labelSpecs: readonly SldLabelSpec[];
  readonly orphanStationRefs: readonly string[];
  readonly orphanSegmentRefs: readonly string[];
  readonly missingTerminalRefs: readonly string[];
}): SldReadabilityReport {
  const placements = declutterLabels(args.labelSpecs);
  const metrics = computeDeclutterMetrics(placements);
  const specById = new Map(args.labelSpecs.map((spec) => [spec.id, spec]));
  const hiddenCriticalLabelRefs = placements
    .filter((placement) => placement.hidden)
    .map((placement) => specById.get(placement.id))
    .filter((spec): spec is SldLabelSpec => spec !== undefined && spec.priority >= LABEL_PRIORITY.STATION)
    .map((spec) => spec.ownerRef)
    .sort((a, b) => a.localeCompare(b));
  const criticalCollisions = hiddenCriticalLabelRefs.length;
  const topologyPenalty =
    args.orphanStationRefs.length * 20
    + args.orphanSegmentRefs.length * 15
    + args.missingTerminalRefs.length * 5;
  const labelPenalty = metrics.hiddenLabels * 2 + criticalCollisions * 15;
  const score = Math.max(0, 100 - topologyPenalty - labelPenalty);
  const topologyContinuity =
    args.orphanStationRefs.length > 0 || args.orphanSegmentRefs.length > 0
      ? 'broken'
      : args.missingTerminalRefs.length > 0 || criticalCollisions > 0
        ? 'warnings'
        : 'continuous';

  return {
    score,
    totalLabels: metrics.totalLabels,
    placedLabels: metrics.placedLabels,
    hiddenLabels: metrics.hiddenLabels,
    criticalCollisions,
    hiddenCriticalLabelRefs,
    orphanStationRefs: args.orphanStationRefs,
    orphanSegmentRefs: args.orphanSegmentRefs,
    missingTerminalRefs: args.missingTerminalRefs,
    topologyContinuity,
    labelPlacements: placements,
  };
}

/**
 * Środek najdłuższego poziomego odcinka trasy (deterministyczne, czysta funkcja).
 * Używane do kotwiczenia etykiety ciągu wzdłuż toru — `null` gdy brak odcinka
 * poziomego (np. ścieżka czysto pionowa).
 */
function longestHorizontalSegmentMidpoint(
  points: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } | null {
  let best: { x: number; y: number; length: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (Math.abs(start.y - end.y) > 0.5) continue;
    const length = Math.abs(end.x - start.x);
    if (length <= 0) continue;
    if (!best || length > best.length) {
      best = { x: (start.x + end.x) / 2, y: start.y, length };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

function pushLabel(
  labels: SldLabelSpec[],
  spec: Omit<SldLabelSpec, 'width' | 'height'>,
): void {
  const text = compactPublicLabel(spec.text);
  labels.push({
    ...spec,
    text,
    width: estimateLabelWidth(text),
    height: 18,
  });
}

function estimateLabelWidth(text: string): number {
  return Math.min(220, Math.max(34, text.length * 7 + 16));
}

function compactPublicLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'układ SN';
  if (/^(seg|ref|hash)\//i.test(trimmed)) return 'odcinek SN';
  const cleaned = trimmed
    .replace(/seg\/[a-z0-9_-]+/gi, 'odcinek SN')
    .replace(/ref\/[a-z0-9_-]+/gi, 'referencja')
    .replace(/[a-f0-9]{24,}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'układ SN';
}

function safeTopologyRunLabel(run: SldLineRunForLayout, index: number): string {
  const name = typeof run.name === 'string' ? compactPublicLabel(run.name) : '';
  if (name && name !== run.id && !/(^|\/)(seg|ref|hash)(\/|$)/i.test(name)) return name;
  if (run.run_kind === 'branch') return `Odgałęzienie ${String(index + 1).padStart(2, '0')}`;
  if (run.run_kind === 'ring' || run.run_kind === 'loop') return `Pierścień ${String(index + 1).padStart(2, '0')}`;
  return `Ciąg SN ${String(index + 1).padStart(2, '0')}`;
}

function computeRunTapPoint(
  run: SldLineRunForLayout,
  stations: readonly StationOnRunRendererProps[],
  cableRuns: readonly CableRunRendererPropsLight[],
): { x: number; y: number } | null {
  const originRef = run.branch_origin_station_ref ?? null;
  if (originRef) {
    const originStation = stations.find((station) => station.id === originRef);
    if (originStation) return { x: originStation.x, y: originStation.y };
  }
  const firstRoutePoint = computeRunRoutePoints(run, cableRuns)[0];
  return firstRoutePoint ? { x: firstRoutePoint.x, y: firstRoutePoint.y } : null;
}

function computeRunRoutePoints(
  run: SldLineRunForLayout,
  cableRuns: readonly CableRunRendererPropsLight[],
): readonly { x: number; y: number }[] {
  const segmentRefs = lineRunSegmentRefs(run);
  const segmentRefSet = new Set(segmentRefs);
  const cableRun = cableRuns.find((candidate) => candidate.id === run.id)
    ?? cableRuns.find((candidate) =>
      (candidate.segmentRefs ?? []).some((segmentRef) => segmentRefSet.has(segmentRef)),
    );
  if (!cableRun) return [];

  const segmentPoints = (cableRun.segmentPaths ?? [])
    .filter((segmentPath) => segmentRefSet.size === 0 || segmentRefSet.has(segmentPath.segmentRef))
    .flatMap((segmentPath) => segmentPath.pathPoints ?? []);
  return uniqueRoutePoints(segmentPoints.length > 0 ? segmentPoints : cableRun.pathPoints);
}

function computeRunDistanceFromSourceM(
  run: SldLineRunForLayout,
  branchByRef: ReadonlyMap<string, Branch>,
): number | null {
  let totalKm = 0;
  for (const segmentRef of lineRunSegmentRefs(run)) {
    const branch = branchByRef.get(segmentRef);
    const lengthKm = typeof (branch as Cable | undefined)?.length_km === 'number'
      ? (branch as Cable).length_km
      : 0;
    totalKm += Number.isFinite(lengthKm) ? lengthKm : 0;
  }
  return totalKm > 0 ? Math.round(totalKm * 1000) : null;
}

function uniqueRoutePoints(points: readonly { x: number; y: number }[]): readonly { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && Math.abs(previous.x - point.x) <= 0.5 && Math.abs(previous.y - point.y) <= 0.5) {
      continue;
    }
    out.push({ x: point.x, y: point.y });
  }
  return out;
}

function findSegmentEndpointPoint(
  cableRuns: readonly CableRunRendererPropsLight[],
  segmentRef: string,
  side: 'A' | 'B',
): { x: number; y: number } | null {
  for (const run of cableRuns) {
    const segmentPath = run.segmentPaths?.find((path) => path.segmentRef === segmentRef);
    const points = segmentPath?.pathPoints ?? run.pathPoints;
    if (!points || points.length === 0) continue;
    const point = side === 'A' ? points[0] : points[points.length - 1];
    if (point) return point;
  }
  return null;
}

function buildBranchPointMarkers(
  snapshot: EnergyNetworkModel,
  cableRuns: readonly CableRunRendererPropsLight[],
  stations: readonly StationOnRunRendererProps[],
): readonly SldBranchPointMarker[] {
  const branchPoints = snapshot.branch_points ?? [];
  if (branchPoints.length === 0) return [];
  const cableLikeBranches = (snapshot.branches ?? []).filter((branch) =>
    isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(snapshot, branch),
  );
  const markers = branchPoints
    .map((branchPoint) => buildBranchPointMarker(snapshot, branchPoint, cableLikeBranches, cableRuns))
    .filter((marker): marker is SldBranchPointMarker => marker !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  return separateOverlappingBranchPointMarkers(
    separateCoincidentBranchPointMarkers(markers),
    stations,
  );
}

function buildBranchPointMarker(
  snapshot: EnergyNetworkModel,
  branchPoint: BranchPointSN,
  cableLikeBranches: readonly Branch[],
  cableRuns: readonly CableRunRendererPropsLight[],
): SldBranchPointMarker | null {
  const connectedSegments = cableLikeBranches.filter((branch) =>
    branch.from_bus_ref === branchPoint.bus_ref || branch.to_bus_ref === branchPoint.bus_ref,
  );
  const points = connectedSegments
    .map((branch) =>
      findSegmentEndpointPoint(cableRuns, branch.ref_id, branch.to_bus_ref === branchPoint.bus_ref ? 'B' : 'A'),
    )
    .filter((point): point is { x: number; y: number } => point !== null);

  if (points.length === 0) return null;

  const routeAnchor = resolveBranchPointRouteAnchor(snapshot, branchPoint, cableRuns);
  const fallbackAnchor = averageRunPoints(points);
  const anchorX = routeAnchor?.x ?? fallbackAnchor.x;
  const anchorY = routeAnchor?.y ?? fallbackAnchor.y;
  const runRef = findRunRefForBranchPoint(cableRuns, connectedSegments);
  const branchPortCount = branchPointBranchPortCount(branchPoint);
  const switchgearFieldCount = branchPointSwitchgearFieldCount(branchPoint);
  const markerPosition = computeBranchPointMarkerPosition(
    branchPoint,
    anchorX,
    anchorY,
    branchPortCount,
    switchgearFieldCount,
  );
  return {
    id: branchPoint.ref_id,
    name: branchPointPublicName(branchPoint),
    branchPointType: branchPoint.branch_point_type,
    x: markerPosition.x,
    y: markerPosition.y,
    anchorX,
    anchorY,
    runRef,
    parentSegmentRef: branchPoint.parent_segment_id ?? null,
    catalogRef: branchPoint.catalog_ref ?? null,
    switchState: branchPoint.switch_state ?? null,
    branchPortCount,
    switchgearFieldCount,
    hasTransformer: false,
  };
}

function separateCoincidentBranchPointMarkers(
  markers: readonly SldBranchPointMarker[],
): readonly SldBranchPointMarker[] {
  const groups = new Map<string, SldBranchPointMarker[]>();
  for (const marker of markers) {
    const anchorX = marker.anchorX ?? marker.x;
    const anchorY = marker.anchorY ?? marker.y;
    const key = `${Math.round(anchorX / 8) * 8}:${Math.round(anchorY / 8) * 8}`;
    const group = groups.get(key) ?? [];
    group.push(marker);
    groups.set(key, group);
  }

  const separated: SldBranchPointMarker[] = [];
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => a.id.localeCompare(b.id));
    const center = (sorted.length - 1) / 2;
    sorted.forEach((marker, index) => {
      const spread = (index - center) * 56;
      separated.push({
        ...marker,
        x: Math.round(marker.x + spread),
        y: Math.round(marker.y - Math.abs(index - center) * 10),
      });
    });
  }

  return separated.sort((a, b) => a.id.localeCompare(b.id));
}

function separateOverlappingBranchPointMarkers(
  markers: readonly SldBranchPointMarker[],
  stations: readonly StationOnRunRendererProps[],
): readonly SldBranchPointMarker[] {
  const placed: SldBranchPointMarker[] = [];
  const ordered = markers.slice().sort((a, b) =>
    (a.runRef ?? '').localeCompare(b.runRef ?? '')
    || (a.anchorY ?? a.y) - (b.anchorY ?? b.y)
    || (a.anchorX ?? a.x) - (b.anchorX ?? b.x)
    || a.id.localeCompare(b.id),
  );

  for (const marker of ordered) {
    placed.push(firstNonOverlappingBranchPointPosition(marker, placed, stations));
  }

  return placed.sort((a, b) => a.id.localeCompare(b.id));
}

const STATION_LIKE_NODE_MIN_CENTER_GAP = 300;

function separateStationLikeNodesOnRuns(
  stations: readonly StationOnRunRendererProps[],
  branchPoints: readonly SldBranchPointMarker[],
): {
  readonly stations: StationOnRunRendererProps[];
  readonly branchPoints: readonly SldBranchPointMarker[];
  readonly changed: boolean;
} {
  const zksnPoints = branchPoints.filter((point) => point.branchPointType === 'zksn');
  if (stations.length === 0 || zksnPoints.length === 0) {
    return { stations: [...stations], branchPoints, changed: false };
  }

  type StationLikeNode =
    | { readonly kind: 'station'; readonly id: string; readonly x: number; readonly rowY: number }
    | { readonly kind: 'zksn'; readonly id: string; readonly x: number; readonly rowY: number };

  const rowNodes = new Map<string, StationLikeNode[]>();
  const addNode = (node: StationLikeNode) => {
    const key = stationLikeRunRowKey(node.rowY);
    const list = rowNodes.get(key) ?? [];
    list.push(node);
    rowNodes.set(key, list);
  };

  for (const station of stations) {
    addNode({
      kind: 'station',
      id: station.id,
      x: station.x,
      rowY: station.y - STATION_RUN_TRUNK_OFFSET_Y,
    });
  }
  for (const point of zksnPoints) {
    addNode({
      kind: 'zksn',
      id: point.id,
      x: point.anchorX ?? point.x,
      rowY: point.anchorY ?? point.y - STATION_RUN_TRUNK_OFFSET_Y,
    });
  }

  const stationX = new Map<string, number>();
  const zksnX = new Map<string, number>();
  let changed = false;

  for (const nodes of rowNodes.values()) {
    if (!nodes.some((node) => node.kind === 'station') || !nodes.some((node) => node.kind === 'zksn')) {
      continue;
    }

    const ordered = nodes.slice().sort((a, b) =>
      a.x - b.x
      || stationLikeNodeOrder(a.kind) - stationLikeNodeOrder(b.kind)
      || a.id.localeCompare(b.id),
    );
    let previousX: number | null = null;

    for (const node of ordered) {
      const nextX: number = previousX === null
        ? node.x
        : Math.max(node.x, previousX + STATION_LIKE_NODE_MIN_CENTER_GAP);
      previousX = nextX;

      if (Math.abs(nextX - node.x) <= 0.5) continue;
      changed = true;
      if (node.kind === 'station') stationX.set(node.id, Math.round(nextX));
      else zksnX.set(node.id, Math.round(nextX));
    }
  }

  if (!changed) return { stations: [...stations], branchPoints, changed: false };

  return {
    stations: stations.map((station) => {
      const nextX = stationX.get(station.id);
      return nextX === undefined ? station : { ...station, x: nextX };
    }),
    branchPoints: branchPoints.map((point) => {
      const nextX = zksnX.get(point.id);
      if (nextX === undefined) return point;
      return {
        ...point,
        x: nextX,
        anchorX: nextX,
      };
    }),
    changed: true,
  };
}

function stationLikeRunRowKey(rowY: number): string {
  return String(Math.round(rowY / 8) * 8);
}

function stationLikeNodeOrder(kind: 'station' | 'zksn'): number {
  // ZKSN jest rozdzielnicą SN w torze. Przy tym samym punkcie trasy
  // dostaje własny slot przed stacją, aby kabel nie kończył się na etykiecie.
  return kind === 'zksn' ? 0 : 1;
}

function firstNonOverlappingBranchPointPosition(
  marker: SldBranchPointMarker,
  placed: readonly SldBranchPointMarker[],
  stations: readonly StationOnRunRendererProps[],
): SldBranchPointMarker {
  const routeSide = marker.branchPointType === 'zksn' ? 1 : -1;
  const stepY = branchPointCollisionStepY(marker);
  const originalOverlapsStation = stations.some((station) => branchPointOverlapsStation(marker, station));
  const candidates: Array<{ readonly dx: number; readonly dy: number }> =
    marker.branchPointType === 'zksn'
      ? zksnSwitchgearPlacementCandidates(stepY, routeSide)
      : branchPolePlacementCandidates(stepY, routeSide);

  for (const candidate of candidates) {
    const moved = moveBranchPointMarker(
      marker,
      candidate.dx,
      candidate.dy,
      originalOverlapsStation && Math.abs(candidate.dy) <= 0.5,
    );
    if (
      !placed.some((other) => branchPointBoundsOverlap(moved, other))
      && !stations.some((station) => branchPointOverlapsStation(moved, station))
    ) {
      return moved;
    }
  }

  const fallbackIndex = placed.length + 1;
  return {
    ...marker,
    x: Math.round(marker.x + fallbackIndex * 148),
    y: Math.round(marker.y + routeSide * fallbackIndex * stepY),
  };
}

function zksnSwitchgearPlacementCandidates(
  stepY: number,
  routeSide: number,
): Array<{ readonly dx: number; readonly dy: number }> {
  const candidates: Array<{ readonly dx: number; readonly dy: number }> = [{ dx: 0, dy: 0 }];
  const sameRunSlots = [112, 148, 184, 224, 260, 296, 336, 392, 448, 520];
  for (const dx of sameRunSlots) {
    candidates.push(
      { dx: -dx, dy: 0 },
      { dx, dy: 0 },
    );
  }
  for (let tier = 1; tier <= 3; tier += 1) {
    const dy = routeSide * tier * stepY;
    candidates.push(
      { dx: 0, dy },
      { dx: -tier * 148, dy },
      { dx: tier * 148, dy },
    );
  }
  return candidates;
}

function branchPolePlacementCandidates(
  stepY: number,
  routeSide: number,
): Array<{ readonly dx: number; readonly dy: number }> {
  const candidates: Array<{ readonly dx: number; readonly dy: number }> = [{ dx: 0, dy: 0 }];
  for (let tier = 1; tier <= 5; tier += 1) {
    const dy = routeSide * tier * stepY;
    candidates.push(
      { dx: 0, dy },
      { dx: tier * 132, dy },
      { dx: -tier * 132, dy },
      { dx: tier * 132, dy: 0 },
      { dx: -tier * 132, dy: 0 },
    );
  }
  return candidates;
}

function moveBranchPointMarker(
  marker: SldBranchPointMarker,
  dx: number,
  dy: number,
  moveTopologyAnchor: boolean,
): SldBranchPointMarker {
  const movedX = Math.round(marker.x + dx);
  const movedY = Math.round(marker.y + dy);
  const moveZksnTopologyAnchor = marker.branchPointType === 'zksn' && moveTopologyAnchor;
  const anchorX = typeof marker.anchorX === 'number' && Number.isFinite(marker.anchorX)
    ? marker.anchorX
    : null;
  return {
    ...marker,
    x: movedX,
    y: movedY,
    anchorX: moveZksnTopologyAnchor && anchorX !== null ? Math.round(anchorX + dx) : marker.anchorX,
    anchorY: moveZksnTopologyAnchor && marker.anchorY !== null ? marker.anchorY : marker.anchorY,
  };
}

function branchPointCollisionStepY(marker: SldBranchPointMarker): number {
  return marker.branchPointType === 'zksn' ? 168 : 198;
}

function branchPointBoundsOverlap(
  a: SldBranchPointMarker,
  b: SldBranchPointMarker,
): boolean {
  const gap = 18;
  const ab = branchPointVisualBounds(a);
  const bb = branchPointVisualBounds(b);
  return !(
    ab.right + gap <= bb.left
    || bb.right + gap <= ab.left
    || ab.bottom + gap <= bb.top
    || bb.bottom + gap <= ab.top
  );
}

function branchPointVisualBounds(marker: SldBranchPointMarker): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  if (marker.branchPointType === 'zksn') {
    return {
      left: marker.x - 78,
      right: marker.x + 78,
      top: marker.y - 72,
      bottom: marker.y + 76,
    };
  }
  return {
    left: marker.x - 64,
    right: marker.x + 92,
    top: marker.y - 92,
    bottom: marker.y + 84,
  };
}

function branchPointOverlapsStation(
  marker: SldBranchPointMarker,
  station: StationOnRunRendererProps,
): boolean {
  const gap = marker.branchPointType === 'zksn' ? 0 : 24;
  const ab = branchPointVisualBounds(marker);
  const sb = stationVisualBounds(station);
  return !(
    ab.right + gap <= sb.left
    || sb.right + gap <= ab.left
    || ab.bottom + gap <= sb.top
    || sb.bottom + gap <= ab.top
  );
}

function stationVisualBounds(station: StationOnRunRendererProps): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  return {
    left: station.x - 76,
    right: station.x + 76,
    top: station.y - 92,
    bottom: station.y + 132,
  };
}

function computeBranchPointMarkerPosition(
  branchPoint: BranchPointSN,
  anchorX: number,
  anchorY: number,
  branchPortCount: number,
  switchgearFieldCount: number,
): { x: number; y: number } {
  if (branchPoint.branch_point_type === 'zksn') {
    return {
      x: Math.round(anchorX),
      y: Math.round(anchorY + STATION_RUN_TRUNK_OFFSET_Y + Math.max(0, switchgearFieldCount - 3) * 4),
    };
  }

  return {
    x: Math.round(anchorX + 42 + Math.max(0, branchPortCount - 1) * 18),
    y: Math.round(anchorY - 92),
  };
}

function findRunRefForBranchPoint(
  cableRuns: readonly CableRunRendererPropsLight[],
  connectedSegments: readonly Branch[],
): string | null {
  const segmentRefs = new Set(connectedSegments.map((branch) => branch.ref_id));
  const run = cableRuns.find((candidate) =>
    (candidate.segmentRefs ?? []).some((segmentRef) => segmentRefs.has(segmentRef))
    || (candidate.segmentPaths ?? []).some((path) => segmentRefs.has(path.segmentRef)),
  );
  return run?.id ?? null;
}

function branchPointPublicName(branchPoint: BranchPointSN): string {
  const fallback =
    branchPoint.branch_point_type === 'zksn'
      ? 'ZKSN'
      : 'Słup rozgałęźny SN';
  const rawName = `${branchPoint.name ?? ''}`.trim();
  if (!rawName) return fallback;
  if (/(^|\/)(seg|ref|hash|bp)(\/|$)/i.test(rawName)) return fallback;
  if (/[a-f0-9]{24,}/i.test(rawName)) return fallback;
  return rawName;
}

function branchPointBranchPortCount(branchPoint: BranchPointSN): number {
  const direct = branchPoint.ports?.BRANCH?.length;
  if (typeof direct === 'number' && direct > 0) return direct;
  const materialized = branchPoint.materialized_params;
  const routePorts = Array.isArray(materialized?.route_ports) ? materialized.route_ports : [];
  const branchPorts = routePorts.filter((port) =>
    typeof port === 'object'
    && port !== null
    && `${(port as { port_id?: unknown }).port_id ?? ''}`.startsWith('BRANCH'),
  );
  return Math.max(1, branchPorts.length);
}

function branchPointSwitchgearFieldCount(branchPoint: BranchPointSN): number {
  const fields = branchPoint.materialized_params?.switchgear_field_specs;
  if (Array.isArray(fields)) return fields.length;
  return branchPoint.branch_point_type === 'zksn' ? branchPointBranchPortCount(branchPoint) + 2 : 0;
}

function classifyTerminalElementType(
  snapshot: EnergyNetworkModel,
  busRef: string | null | undefined,
): SldTerminalElementType {
  if (!busRef) return 'unknown';
  const branchPoint = (snapshot.branch_points ?? []).find((candidate) => candidate.bus_ref === busRef);
  if (branchPoint?.branch_point_type === 'branch_pole') return 'branch_pole';
  if (branchPoint?.branch_point_type === 'zksn') return 'zksn';
  const stationRef = resolveStationRefForBus(
    busRef,
    stationBusRefMap(snapshot.substations ?? []),
    new Set((snapshot.substations ?? []).map((station) => station.ref_id)),
  );
  if (stationRef) {
    const station = (snapshot.substations ?? []).find((candidate) => candidate.ref_id === stationRef);
    if (station?.station_type === 'gpz') return 'bay';
    if (station?.station_type === 'branch') return 'branch_pole';
    if (station?.station_type === 'switching') return 'zksn';
    return 'station';
  }
  return (snapshot.buses ?? []).some((bus) => bus.ref_id === busRef) ? 'bus' : 'unknown';
}

function stationBusRefMap(substations: readonly Substation[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const station of substations) {
    for (const busRef of station.bus_refs ?? []) {
      out.set(busRef, station.ref_id);
    }
  }
  return out;
}

function readBranchEndpointPort(branch: Branch, side: 'A' | 'B'): string | null {
  const value = side === 'A'
    ? (branch as Cable | { endpoint_a_port?: { port_id?: string } | null }).endpoint_a_port
    : (branch as Cable | { endpoint_b_port?: { port_id?: string } | null }).endpoint_b_port;
  return value?.port_id ?? null;
}

function resolveBranchEndpointBusRef(
  snapshot: EnergyNetworkModel,
  branch: Branch,
  side: 'A' | 'B',
): string | null {
  const busRef = side === 'A' ? branch.from_bus_ref : branch.to_bus_ref;
  if (side === 'A') {
    const bayTerminalBusRef = resolveOriginBayTerminalBusRef(snapshot, branch);
    if (bayTerminalBusRef) return bayTerminalBusRef;
  }
  return busExists(snapshot, busRef) ? busRef : null;
}

function resolveBranchEndpointPortRef(
  snapshot: EnergyNetworkModel,
  branch: Branch,
  side: 'A' | 'B',
): string | null {
  const explicitPort = readBranchEndpointPort(branch, side);
  if (explicitPort) return explicitPort;

  if (side === 'A') {
    const bayTerminalBusRef = resolveOriginBayTerminalBusRef(snapshot, branch);
    if (bayTerminalBusRef) return `${bayTerminalBusRef}:terminal`;

    const originBayRef = readBranchMetaString(branch, 'origin_bay_ref');
    const originPortRole = readBranchMetaString(branch, 'origin_port_role');
    if (originBayRef && originPortRole) return `${originBayRef}#${originPortRole}`;
  }

  const busRef = side === 'A' ? branch.from_bus_ref : branch.to_bus_ref;
  return busExists(snapshot, busRef) ? `${busRef}:terminal` : null;
}

function classifyBranchEndpointElementType(
  snapshot: EnergyNetworkModel,
  branch: Branch,
  side: 'A' | 'B',
): SldTerminalElementType {
  if (side === 'A' && readBranchMetaString(branch, 'origin_bay_ref')) return 'bay';
  return classifyTerminalElementType(snapshot, resolveBranchEndpointBusRef(snapshot, branch, side));
}

function hasResolvedRunEndpoint(
  snapshot: EnergyNetworkModel,
  segments: readonly Branch[],
  stationsOnRun: readonly unknown[],
): boolean {
  if (stationsOnRun.length > 0) return true;
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) return false;
  if (hasConnectedContinuationAtEndpoint(snapshot, lastSegment, 'B')) return true;
  const endpointType = classifyBranchEndpointElementType(snapshot, lastSegment, 'B');
  return (
    endpointType === 'station'
    || endpointType === 'zksn'
    || endpointType === 'branch_pole'
    || endpointType === 'der'
  );
}

function hasConnectedContinuationAtEndpoint(
  snapshot: EnergyNetworkModel,
  segment: Branch,
  side: 'A' | 'B',
): boolean {
  const busRef = resolveBranchEndpointBusRef(snapshot, segment, side);
  if (!busRef) return false;
  const connectedSegments = (snapshot.branches ?? []).filter(
    (candidate) =>
      candidate.ref_id !== segment.ref_id
      && isCableLikeBranch(candidate)
      && isMediumVoltageNetworkBranch(snapshot, candidate)
      && (candidate.from_bus_ref === busRef || candidate.to_bus_ref === busRef),
  );
  return connectedSegments.length > 0;
}

function resolveOriginBayTerminalBusRef(
  snapshot: EnergyNetworkModel,
  branch: Branch,
): string | null {
  const originBayRef = readBranchMetaString(branch, 'origin_bay_ref');
  if (!originBayRef) return null;

  const directBus = (snapshot.buses ?? [])
    .filter((bus) => bus.ref_id.startsWith(`${originBayRef}/`) || bus.id.startsWith(`${originBayRef}/`))
    .sort((a, b) => terminalBusRank(b) - terminalBusRank(a) || a.ref_id.localeCompare(b.ref_id))[0];
  if (directBus) return directBus.ref_id;

  const bayBranchTerminal = (snapshot.branches ?? [])
    .filter((candidate) =>
      candidate.ref_id.startsWith(`${originBayRef}/`)
      || candidate.id.startsWith(`${originBayRef}/`),
    )
    .flatMap((candidate) => [candidate.to_bus_ref, candidate.from_bus_ref])
    .find((busRef) => busRef.startsWith(`${originBayRef}/`) && busExists(snapshot, busRef));

  return bayBranchTerminal ?? null;
}

function terminalBusRank(bus: Bus): number {
  const ref = `${bus.ref_id} ${bus.id}`.toLowerCase();
  if (ref.includes('/terminal')) return 3;
  if (bus.tags?.includes('topology_terminal')) return 2;
  if (bus.meta?.visual_role === 'INLINE_TERMINAL') return 1;
  return 0;
}

function busExists(snapshot: EnergyNetworkModel, busRef: string | null | undefined): busRef is string {
  if (!busRef) return false;
  return (snapshot.buses ?? []).some((bus) => bus.ref_id === busRef || bus.id === busRef);
}

function readBranchMetaString(branch: Branch, key: string): string | null {
  const value = branch.meta?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function findTopologyRunForStation(
  topologyRuns: readonly SldTopologyRun[],
  stationId: string,
): SldTopologyRun | null {
  return topologyRuns.find((run) => run.stationRefs.includes(stationId)) ?? null;
}

// -----------------------------------------------------------------------------
// GPZ
// -----------------------------------------------------------------------------

function buildGpzs(snapshot: EnergyNetworkModel): GpzRendererProps[] {
  const substations = snapshot.substations ?? [];
  const sources = snapshot.sources ?? [];
  const buses = snapshot.buses ?? [];
  const bays = snapshot.bays ?? [];
  const branches = snapshot.branches ?? [];
  const transformers = snapshot.transformers ?? [];

  const gpzStations = substations.filter((s) => s.station_type === 'gpz');

  return gpzStations.map((gpz, idx) => {
    const lvBus = findFirstBusByRefs(buses, gpz.bus_refs);
    const lvVoltageKv = lvBus?.voltage_kv ?? 15;
    /* HV voltage z ENM (transformer.uhv_kv lub bus.voltage_kv).
     * INVARIANT 9: brak danych = `null` propagowane do renderera, NIE
     * fałszywy default 110. Renderer pokaże etykietę "?" zamiast zmyślonego
     * "110 kV" (audyt system §B). */
    const hvVoltageKv = inferHvVoltageKv(transformers, gpz, buses);
    const hvVoltageKvKnown = hvVoltageKv !== null;
    const transformerCount = Math.max(1, gpz.transformer_refs?.length ?? 0);

    /* Buduj sections + couplers + bays z gpz_sections[] (LV side). */
    const { sections, couplers } = buildGpzSnSections({
      gpz,
      bays,
      branches,
      buses,
      substations,
      lvVoltageKv,
    });

    /* HV sections (110 kV): preferuje jawne `gpz_hv_sections[]` z ENM
     * (Phase 0A audit fix 8/8 — eliminacja synthesize). Fallback do synth
     * gdy ENM ich nie ma (BLOCKER-26 z audytu MV — gap backend nadal
     * częściowo otwarty dla pełnego two-bus modelowania). */
    const explicitHvSections = buildHvSectionsFromEnm({
      gpz,
      bays,
      branches,
      buses,
      substations,
      hvVoltageKv: hvVoltageKv ?? 110,
    });
    const hvSections = explicitHvSections.length > 0
      ? explicitHvSections
      : synthesizeHvSections({
          gpz,
          transformers,
          buses,
          sources,
          hvVoltageKv: hvVoltageKv ?? 110,
        });

    const feedersCount = sections.reduce(
      (acc, s) => acc + s.bays.filter((b) => b.fieldRole === FIELD_ROLE.LINE_OUT).length,
      0,
    );

    /* Liczba pól liniowych GPZ z REALNEJ topologii: kable/linie SN wychodzące z
     * szyn sekcji SN (gpz_sections[].bus_ref). To są ciągi, którymi sieć faktycznie
     * wyprowadza z GPZ — nie zmyślona wartość. Używane jako `outgoingBayCount`, gdy
     * ENM nie modeluje jawnych pól odpływowych (bays=∅), żeby GPZ nie był pustym
     * pudłem (źródło sieci musi pokazać swoje pola). */
    const snSectionBusRefs = new Set(
      (gpz.gpz_sections ?? [])
        .map((sec) => sec.bus_ref)
        .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0),
    );
    const outgoingLineFieldCount = branches.filter(
      (b) =>
        isCableLikeBranch(b) &&
        ((b.from_bus_ref != null && snSectionBusRefs.has(b.from_bus_ref)) ||
          (b.to_bus_ref != null && snSectionBusRefs.has(b.to_bus_ref))),
    ).length;
    /* Pola odpływowe: jawne pola LINE_OUT z ENM, w przeciwnym razie realne ciągi
     * wychodzące. Pozostawiamy `undefined` tylko gdy nie ma ani jednego — wtedy
     * renderer użyje swojego sensownego minimum. */
    const outgoingBayCount =
      feedersCount > 0
        ? feedersCount
        : outgoingLineFieldCount > 0
          ? outgoingLineFieldCount
          : undefined;

    return {
      id: gpz.ref_id,
      x: gpzXByIndex(idx),
      y: Y_GPZ,
      name: gpz.name || gpz.ref_id,
      outgoingBayCount,
      /* INVARIANT 9: gdy null, przekazujemy wartość techniczną tylko dla geometrii,
       * a renderer pokazuje klasę WN bez znaku zastępczego. */
      voltageHighKv: hvVoltageKv ?? 110,
      voltageHighKvKnown: hvVoltageKvKnown,
      voltageLowKv: lvVoltageKv,
      transformerCount,
      sections,
      couplers,
      hvSections: hvSections.length > 0 ? hvSections : undefined,
      hvCouplers: undefined, // ENM nie modeluje obecnie HV sprzęgieł — gap udokumentowany
      feedersCount,
    };
  });
}

interface SynthesizeHvArgs {
  readonly gpz: Substation;
  readonly transformers: readonly Transformer[];
  readonly buses: readonly Bus[];
  readonly sources: readonly Source[];
  readonly hvVoltageKv: number;
}

/**
 * Syntetyzuje HV (110 kV) sekcje z istniejących danych ENM:
 *   - TR feeder bays (po jednym na transformator z hv_bus_ref skojarzonym z GPZ)
 *   - Incoming line bays (po jednym na source na tym samym hv_bus_ref)
 *
 * Ta synteza jest deterministyczna i traceable do ENM (`transformer_refs`,
 * `transformer.hv_bus_ref`, `source.bus_ref`). Włącza two-bus topology w
 * renderze gdy GPZ ma faktyczne transformatory 110/SN.
 *
 * Gap: ENM nie modeluje obecnie sprzęgieł HV (110 kV bus jest pojedynczy w
 * większości GPZ); pierścieniowy 110 kV pozostaje przyszłym rozszerzeniem
 * (`gpz_hv_sections` + `hv_couplers`).
 */
/**
 * Phase 0A audit fix 8/8: Buduje GPZ HV sections z jawnych `gpz_hv_sections[]`
 * w ENM (eliminacja BLOCKER-26 — synthesize). Każda sekcja HV ma własny bus
 * i pola przypisane przez `gpz_section_id`.
 *
 * Zwraca pustą listę gdy ENM nie ma `gpz_hv_sections` — wtedy adapter
 * fallbackuje do `synthesizeHvSections`.
 */
interface BuildHvFromEnmArgs {
  readonly gpz: Substation;
  readonly bays: readonly Bay[];
  readonly branches: readonly Branch[];
  readonly buses: readonly Bus[];
  readonly substations: readonly Substation[];
  readonly hvVoltageKv: number;
}

function buildHvSectionsFromEnm(args: BuildHvFromEnmArgs): GpzSectionDescriptor[] {
  const { gpz, bays, branches, buses, substations, hvVoltageKv } = args;
  const hvSections = gpz.gpz_hv_sections ?? [];
  if (hvSections.length === 0) return [];

  return hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const sectionBays = bays.filter(
        (b) => b.substation_ref === gpz.ref_id && b.gpz_section_id === section.section_id,
      );
      const sectionBus = buses.find((b) => b.ref_id === section.bus_ref);
      const sectionVoltageKv = sectionBus?.voltage_kv ?? hvVoltageKv;
      return {
        sectionId: section.section_id,
        order: section.order,
        name: section.name ?? `Sekcja HV ${section.order + 1}`,
        sectionLabel: section.line_field_name ?? `S${section.order + 1}`,
        busVoltageKv: sectionVoltageKv,
        bays: sectionBays.map((bay) =>
          bayDescriptorFromEnm(bay, branches, substations, gpz),
        ),
      };
    });
}

function synthesizeHvSections(args: SynthesizeHvArgs): GpzSectionDescriptor[] {
  const { gpz, transformers, buses, sources, hvVoltageKv } = args;
  const ownTransformers = transformers.filter((tr) =>
    gpz.transformer_refs?.includes(tr.ref_id),
  );
  if (ownTransformers.length === 0) return [];

  /* Wyznacz wspólny HV bus (zwykle jeden dla GPZ-1 / pierścieniowy poprawimy
   * gdy ENM doda hv_sections). Sortowanie deterministyczne — `Set` iteration
   * order nie jest gwarantowane stabilne między engine'ami (audyt system §7). */
  const hvBusRefs = Array.from(
    new Set(ownTransformers.map((tr) => tr.hv_bus_ref).filter(Boolean)),
  ).sort();
  if (hvBusRefs.length === 0) return [];

  const primaryHvBusRef = hvBusRefs[0];
  const hvBus = buses.find((b) => b.ref_id === primaryHvBusRef);
  const sectionVoltageKv = hvBus?.voltage_kv ?? hvVoltageKv;

  /* Incoming line bays — sources na HV busie.
   *
   * INVARIANT 9 (audyt system §1): brak danych ≠ default. Stany aparatów
   * NIE są hardkodowane jako 'closed' — adapter zostawia `undefined`,
   * renderer pokazuje neutral / "brak danych" badge. Zafałszowanie stanu
   * narusza Cardinal Rule (każdy element wizualny → ENM domain ref).
   *
   * Pole synthesized jako derived view z transformer + source data — bayRef
   * ma stabilny prefix `__hv-derived__` (BLOCKER-26 w audycie MV § 6).
   */
  const incomingSources = sources.filter((s) => s.bus_ref === primaryHvBusRef);
  const incomingBays: GpzBayDescriptor[] = incomingSources.map((src, idx) => ({
    bayRef: `${gpz.ref_id}__hv-derived-in-${src.ref_id}`,
    fieldRole: FIELD_ROLE.LINE_IN,
    designation: src.name || src.ref_id,
    feederName: (src.name || src.ref_id).slice(0, 8),
    bayNumber: `${(idx + 1) * 2 + 1}`,
    hasMissingRequiredDevice: false,
    /* energization, cbState, dsState — UNDEFINED (brak telemetrii w ENM).
     * Renderer pokaże 'unknown' (neutral) zamiast fałszywego 'energized'. */
  }));

  /* TR feeder bays. */
  const trBays: GpzBayDescriptor[] = ownTransformers.map((tr, idx) => ({
    bayRef: `${gpz.ref_id}__hv-derived-tr-${tr.ref_id}`,
    fieldRole: FIELD_ROLE.TRANSFORMER,
    designation: tr.name || `TR${idx + 1}`,
    feederName: `TR${idx + 1}`,
    bayNumber: `${(idx + 1) * 2}`,
    hasMissingRequiredDevice: false,
    /* energization/cbState/dsState undefined — patrz wyżej. */
  }));

  return [
    {
      sectionId: `${gpz.ref_id}__hv-sec-1`,
      order: 1,
      name: 'sekcja 110 kV',
      sectionLabel: 'sekcja A',
      busVoltageKv: sectionVoltageKv,
      bays: [...incomingBays, ...trBays],
    },
  ];
}

interface BuildSectionsArgs {
  readonly gpz: Substation;
  readonly bays: readonly Bay[];
  readonly branches: readonly Branch[];
  readonly buses: readonly Bus[];
  readonly substations: readonly Substation[];
  readonly lvVoltageKv: number;
}

interface BuildSectionsResult {
  readonly sections: GpzSectionDescriptor[];
  readonly couplers: GpzCouplerDescriptor[];
}

function buildGpzSnSections(args: BuildSectionsArgs): BuildSectionsResult {
  const { gpz, bays, branches, buses, substations, lvVoltageKv } = args;
  const gpzSections = (gpz.gpz_sections ?? []).slice().sort((a, b) => a.order - b.order);

  const gpzBays = bays.filter((b) => b.substation_ref === gpz.ref_id);
  const couplerBaysByRef = new Map<string, Bay>();
  for (const b of gpzBays) {
    if (b.bay_role === 'COUPLER') {
      couplerBaysByRef.set(b.ref_id, b);
    }
  }

  const sections: GpzSectionDescriptor[] = gpzSections.map((sec) =>
    sectionFromGpzSection(sec, gpzBays, branches, buses, substations, gpz, lvVoltageKv),
  );

  const couplers: GpzCouplerDescriptor[] = [];
  /* Każda granica między sekcją i (i+1) — sprzęgło, jeśli right_coupler_ref bay
   * istnieje i bay_role==='COUPLER'. */
  for (let i = 0; i < gpzSections.length - 1; i++) {
    const left = gpzSections[i];
    const right = gpzSections[i + 1];
    const couplerRef = left.right_coupler_ref ?? right.left_coupler_ref;
    if (!couplerRef) continue;
    const couplerBay = couplerBaysByRef.get(couplerRef);
    if (!couplerBay) continue;
    /* Phase 0B-1: stan sprzęgła z BayRuntimeState gdy obecny — czytamy
     * actual_state CB w polu COUPLER. Brak telemetrii → 'unknown'
     * (Invariant 9). */
    const couplerTelemetry = projectBayTelemetry(couplerBay.runtime_state);
    const couplerClosed: GpzCouplerDescriptor['closed'] = couplerTelemetry.cbState ?? 'unknown';
    couplers.push({
      couplerId: couplerBay.ref_id,
      leftSectionId: left.section_id,
      rightSectionId: right.section_id,
      designation: couplerBay.name || couplerBay.ref_id,
      closed: couplerClosed,
    });
  }

  return { sections, couplers };
}

function sectionFromGpzSection(
  sec: GPZSection,
  gpzBays: readonly Bay[],
  branches: readonly Branch[],
  buses: readonly Bus[],
  substations: readonly Substation[],
  gpz: Substation,
  fallbackVoltageKv: number,
): GpzSectionDescriptor {
  const sectionBus = buses.find((b) => b.ref_id === sec.bus_ref);
  const sectionVoltageKv = sectionBus?.voltage_kv ?? fallbackVoltageKv;

  const sectionBays = gpzBays
    .filter((b) => b.gpz_section_id === sec.section_id)
    .filter((b) => b.bay_role !== 'COUPLER'); // sprzęgła traktujemy osobno

  const bayDescriptors: GpzBayDescriptor[] = sectionBays.map((b) =>
    bayDescriptorFromEnm(b, branches, substations, gpz),
  );

  return {
    sectionId: sec.section_id,
    order: sec.order,
    name: sec.name ?? `Sekcja ${sec.order + 1}`,
    sectionLabel: sec.name ?? `S${sec.order + 1}`,
    busVoltageKv: sectionVoltageKv,
    bays: bayDescriptors,
  };
}

function bayDescriptorFromEnm(
  bay: Bay,
  branches: readonly Branch[],
  substations: readonly Substation[],
  gpz: Substation,
): GpzBayDescriptor {
  const fieldRole = ENM_BAY_ROLE_TO_FIELD_ROLE[bay.bay_role] ?? FIELD_ROLE.GPZ_LINE_BAY;

  /* Outgoing feeder: dla bay_role IN/OUT/FEEDER szukaj branch wychodzący z
   * bus_ref bay'a do innej stacji. Cel = nazwa stacji docelowej.
   *
   * INVARIANT 9: `energized` pozostaje UNDEFINED — adapter nie zna stanu
   * SCADA telemetry feedera (Phase 0B-1 dostarczył runtime_state per-bay,
   * ale `outgoingFeeder.energized` to stan TRUNK linii, nie pola — wymaga
   * osobnego kanału z analizy power flow). Renderer wyświetli neutral
   * kolor (`COLOR_FIELD_TRUNK_NEUTRAL`) zamiast fałszywego "pod napięciem".
   */
  /* Phase 0A audit fix 10/12: outgoingFeeder STRICT z ENM `outgoing_destination_ref`.
   * Eliminacja heurystyki `inferOutgoingFeederDestination` (audyt SLD §C.2).
   * Brak ENM ref → undefined (Invariant 9: brak danych ≠ wnioskowanie z grafu).
   * Wnioskowanie graph-based zachowane jako opt-in fallback przez flagę
   * env (przyszłe rozszerzenie). */
  let outgoingFeeder: GpzBayDescriptor['outgoingFeeder'] | undefined;
  const isLineRole = bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER' || bay.bay_role === 'IN';
  if (isLineRole) {
    const explicitRef = bay.outgoing_destination_ref;
    if (explicitRef) {
      const target = substations.find((s) => s.ref_id === explicitRef);
      const destination = target?.name ?? explicitRef;
      const outgoingBranch = findOutgoingBranchForBay(bay, branches, substations, explicitRef);
      outgoingFeeder = {
        destination: `→ ${destination}`,
        ...(outgoingBranch ? outgoingBranchDisplayData(outgoingBranch) : {}),
      };
    } else {
      /* Backward compat: gdy ENM nie ma `outgoing_destination_ref` (np.
       * legacy ENM przed Phase 0A audit fix 8), użyj graph inference jako
       * fallback. Phase 1+ — usunąć całkowicie i wymuszać explicit ENM. */
      const destination = inferOutgoingFeederDestination(bay, branches, substations, gpz);
      if (destination) {
        const outgoingBranch = findOutgoingBranchForBay(bay, branches, substations);
        outgoingFeeder = {
          destination: `→ ${destination}`,
          ...(outgoingBranch ? outgoingBranchDisplayData(outgoingBranch) : {}),
        };
      }
    }
  }

  /* Phase 0A audit fix 8/8: konsumpcja nowych pól ENM Bay:
   * - bay_number → renderer wyświetla pod kolumną (kanoniczny ID dyspozytorski).
   * - feeder_short_name → UI label feedera (NIE bay.name — które jest długie).
   *
   * esState: większość pól GPZ klasy A ma uziemnik (BHP). Wnioskujemy z field
   * role gdy ENM nie ma explicit telemetry. Sprzęgło COUPLER zwykle bez ES.
   * Stan → 'unknown' (Invariant 9).
   *
   * qDesignations: kanon IEC 81346-2 — generowane deterministycznie z roli.
   */
  const hasEs = isLineRole || bay.bay_role === 'TR' || bay.bay_role === 'MEASUREMENT';

  /* Phase 0B-1: konsumpcja BayRuntimeState — primary_device_states (CB/DS/ES
   * actual_state), control_mode, pending_command. Brak runtime_state → adapter
   * NIE syntezuje stanów (Invariant 9: lepiej 'unknown' niż fałszywy stan). */
  const telemetry = projectBayTelemetry(bay.runtime_state);
  /* esState fallback ladder:
   *  1. telemetry.esState (ENM runtime_state) — najwyższy priorytet
   *  2. 'unknown' gdy hasEs (pole z polityki ma ES, ale brak telemetrii)
   *  3. 'absent' gdy hasEs===false (rola pola bez ES, np. COUPLER) */
  const esState: GpzBayDescriptor['esState'] = telemetry.esState ?? (hasEs ? 'unknown' : 'absent');

  return {
    bayRef: bay.ref_id,
    fieldRole,
    designation: bay.name || bay.ref_id,
    feederName: bay.feeder_short_name ?? bay.name ?? undefined,
    bayNumber: bay.bay_number ?? undefined,
    hasMissingRequiredDevice: (bay.equipment_refs?.length ?? 0) === 0,
    cbState: telemetry.cbState,
    dsState: telemetry.dsState,
    esState,
    inManipulation: telemetry.inManipulation,
    qDesignations: deriveQDesignations(bay.bay_role),
    outgoingFeeder,
  };
}

/**
 * Wnioskuje kanoniczne oznaczenia IEC 81346-2 z roli pola.
 * Konwencja polskich GPZ: Q0=CB, Q1=DS_BUS, Q9=DS_LIN, Q8=ES, T1=CT.
 */
function deriveQDesignations(bayRole: Bay['bay_role']): GpzBayDescriptor['qDesignations'] {
  switch (bayRole) {
    case 'OUT':
    case 'IN':
    case 'FEEDER':
      return { cb: 'Q0', ds: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' };
    case 'TR':
      return { cb: 'Q0', ds: 'Q1', es: 'Q8', ct: 'T1' };
    case 'COUPLER':
      return { cb: 'Q0', ds: 'Q1', ct: 'T1' };
    case 'MEASUREMENT':
      return { ds: 'Q1', es: 'Q8' };
    case 'OZE':
      return { cb: 'Q0', ds: 'Q9', es: 'Q8', ct: 'T1' };
    default:
      return undefined;
  }
}

function inferOutgoingFeederDestination(
  bay: Bay,
  branches: readonly Branch[],
  substations: readonly Substation[],
  gpz: Substation,
): string | null {
  /* Branche dotykające busa pola — jedna z końcówek == bay.bus_ref. */
  for (const br of branches) {
    if (br.from_bus_ref !== bay.bus_ref && br.to_bus_ref !== bay.bus_ref) continue;
    const otherBusRef = br.from_bus_ref === bay.bus_ref ? br.to_bus_ref : br.from_bus_ref;
    /* Stacja zawierająca otherBusRef. */
    const dest = substations.find(
      (s) => s.ref_id !== gpz.ref_id && s.bus_refs.includes(otherBusRef),
    );
    if (dest) return dest.name || dest.ref_id;
  }
  return null;
}

function findOutgoingBranchForBay(
  bay: Bay,
  branches: readonly Branch[],
  substations: readonly Substation[],
  explicitDestinationRef?: string,
): Branch | null {
  const touchingCableLikeBranches = branches.filter((branch) => {
    if (!isCableLikeBranch(branch)) return false;
    return branch.from_bus_ref === bay.bus_ref || branch.to_bus_ref === bay.bus_ref;
  });
  if (touchingCableLikeBranches.length === 0) return null;

  const explicitTarget = explicitDestinationRef
    ? substations.find((station) => station.ref_id === explicitDestinationRef)
    : undefined;
  if (explicitTarget) {
    const branchToTarget = touchingCableLikeBranches.find((branch) => {
      const otherBusRef = branch.from_bus_ref === bay.bus_ref ? branch.to_bus_ref : branch.from_bus_ref;
      return explicitTarget.bus_refs.includes(otherBusRef);
    });
    if (branchToTarget) return branchToTarget;
  }

  return touchingCableLikeBranches[0] ?? null;
}

function outgoingBranchDisplayData(
  branch: Branch,
): Pick<
  NonNullable<GpzBayDescriptor['outgoingFeeder']>,
  'segmentTypeLabel' | 'segmentLengthLabel' | 'catalogLabel'
> {
  const segmentKind = classifySegmentKind(branch);
  return {
    segmentTypeLabel: segmentKindLabel(segmentKind),
    segmentLengthLabel: formatCableRunLength([branch]),
    catalogLabel: readCatalogTypeLabel(branch),
  };
}

function readCatalogTypeLabel(branch: Branch): string | undefined {
  const materialized = readBranchCatalogData(branch);
  if (materialized && typeof materialized === 'object') {
    for (const key of [
      'type_designation',
      'type_label',
      'trade_name',
      'catalog_label',
      'display_name',
      'designation',
      'name',
      'catalog_item_id',
    ]) {
      const raw = materialized[key];
      if (typeof raw === 'string' && raw.trim()) {
        return formatCatalogTypeLabel(raw, materialized);
      }
    }
  }
  return typeof branch.catalog_ref === 'string' && branch.catalog_ref.trim()
    ? formatCatalogTypeLabel(branch.catalog_ref, materialized)
    : undefined;
}

function readBranchCatalogData(branch: Branch): Record<string, unknown> | null {
  const materialized = branch.materialized_params && typeof branch.materialized_params === 'object'
    ? { ...branch.materialized_params }
    : {};
  if (branch.type === 'cable') {
    for (const key of [
      'return_conductor_cross_section_mm2',
      'return_conductor_material',
      'return_conductor_r_ohm_per_km_20c',
      'return_conductor_jth_1s_a_per_mm2',
      'return_conductor_ith_1s_a',
      'cross_section_mm2',
      'number_of_cores',
      'conductor_material',
    ] as const) {
      const value = branch[key];
      if (value !== null && value !== undefined) materialized[key] = value;
    }
  }
  return Object.keys(materialized).length > 0 ? materialized : null;
}

function formatCatalogTypeLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string {
  const value = raw.trim();
  const overheadLineLabel = formatOverheadLineCatalogLabel(value, materialized);
  if (overheadLineLabel) return overheadLineLabel;
  const canonicalCable = value.match(/^cable-base-(xlpe|epr)-(al|cu)-([13])c-(\d+)$/i);
  if (canonicalCable) {
    const [, insulation, conductor, cores, section] = canonicalCable;
    const phaseSet = cores === '1' ? `3×1×${section}` : `3×${section}`;
    return `Kabel SN ${insulation.toUpperCase()} ${conductor.toLowerCase() === 'cu' ? 'Cu' : 'Al'} ${phaseSet} mm²`;
  }
  const publicTypeLabelPattern = /^[\p{L}0-9][\p{L}0-9/ .-]{2,}$/u;
  if (
    publicTypeLabelPattern.test(value)
    && !value.includes(':')
    && !/^cable-/i.test(value)
    && !/^line-/i.test(value)
  ) {
    return formatSingleCoreMvCableCircuitLabel(value, materialized);
  }
  const directTypePattern = /^[A-Z0-9ĄĆĘŁŃÓŚŹŻ][A-Z0-9ĄĆĘŁŃÓŚŹŻ/ .-]{2,}$/u;
  if (directTypePattern.test(value) && !value.includes(':')) {
    return formatSingleCoreMvCableCircuitLabel(value, materialized);
  }

  const normalized = value
    .replace(/^KABEL_SN:/i, '')
    .replace(/^LINIA_SN:/i, '')
    .replace(/@[^@]+$/u, '')
    .replace(/^cable-/i, '')
    .replace(/^line-/i, '')
    .replace(/^enea[-_\s]+operator[-_\s]+/i, '')
    .replace(/^base-/i, '')
    .replace(/^tfk-/i, '')
    .replace(/^nkt-/i, '')
    .replace(/-/gu, ' ')
    .replace(/\bxlpe\b/giu, 'XLPE')
    .replace(/\bal\b/giu, 'Al')
    .replace(/\bst\b/giu, 'St')
    .replace(/\b1c\s+(\d+)\b/iu, '1x$1')
    .replace(/\b3c\s+(\d+)\b/iu, '3x$1')
    .replace(/\b3x(\d+)\b/iu, '3x$1')
    .trim();

  const normalizedLabel = normalized
    ? normalized.toUpperCase().replace(/\bAL\b/u, 'Al').replace(/\bST\b/u, 'St')
    : value;
  return formatSingleCoreMvCableCircuitLabel(normalizedLabel, materialized);
}

function formatOverheadLineCatalogLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string | null {
  const value = raw.trim();
  const catalogItemId = readStringMaterializedValue(materialized, 'catalog_item_id') ?? '';
  const looksLikeOverheadCatalog =
    /^line[-_:]/i.test(value)
    || /^line[-_:]/i.test(catalogItemId)
    || /^LINIA_SN:/i.test(value)
    || /\blinia\s+napowietrzna\b/iu.test(value);
  if (!looksLikeOverheadCatalog) return null;
  const section =
    readNumericMaterializedValue(materialized, 'phase_conductor_cross_section_mm2')
    ?? readNumericMaterializedValue(materialized, 'conductor_cross_section_mm2')
    ?? readNumericMaterializedValue(materialized, 'cross_section_mm2')
    ?? readSectionFromOverheadRef(value)
    ?? readSectionFromOverheadRef(catalogItemId);
  const material =
    readStringMaterializedValue(materialized, 'phase_conductor_material')
    ?? readStringMaterializedValue(materialized, 'conductor_material')
    ?? readMaterialFromOverheadRef(value)
    ?? readMaterialFromOverheadRef(catalogItemId);
  if (!section || !material) return null;
  return `Linia napowietrzna ${formatOverheadMaterial(material)} ${section} mm²`;
}

function readNumericMaterializedValue(
  materialized: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const raw = materialized?.[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function readStringMaterializedValue(
  materialized: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const raw = materialized?.[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function readSectionFromOverheadRef(raw: string): number | null {
  const match = raw.match(/(?:^|[-_\s])(?:al|cu|afl|aal|base)(?:[-_\s]+(?:st|steel))?[-_\s]+(\d{2,4})(?:$|[-_\s])/iu)
    ?? raw.match(/\b(\d{2,4})\s*(?:mm(?:2|²))?\b/iu);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function readMaterialFromOverheadRef(raw: string): string | null {
  if (/\bafl\b/i.test(raw)) return 'AFL';
  if (/\baal\b/i.test(raw)) return 'AAL';
  if (/\bal\b/i.test(raw)) return 'AL';
  if (/\bcu\b/i.test(raw)) return 'CU';
  return null;
}

function formatOverheadMaterial(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === 'CU' || value === 'COPPER') return 'Cu';
  if (value === 'AFL') return 'AFL';
  if (value === 'AAL') return 'AAL';
  return 'Al';
}

function formatSingleCoreMvCableCircuitLabel(
  raw: string,
  materialized?: Record<string, unknown> | null,
): string {
  const value = normalizePhasePrefixLabel(addReturnConductorSection(
    stripCableOwnerPrefix(normalizeCableMultiplicationSigns(raw.trim().replace(/\s+/gu, ' '))),
    materialized,
  ));
  if (!value) return raw;
  const hasThreePhaseSet =
    /^3\s*[x×]\s+/iu.test(value)
    || /\b3\s*[x×]\s*1\s*[x×]\s*\d{2,4}\b/iu.test(value)
    || /\b3\s*[x×]\s*\d{2,4}\b/iu.test(value);
  if (hasThreePhaseSet) return ensureMvCableUnit(value);

  const hasSingleCoreDesignation = /\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?\b/iu.test(value);
  const looksLikeMvCable =
    /\b(?:KABEL\s+SN|NA2XS2Y|N2XS2Y|XRUHAKXS|YHAKXS|YHKXS|YAKXS)\b/iu.test(value);
  if (!hasSingleCoreDesignation || !looksLikeMvCable) return value;

  const withUnit = ensureMvCableUnit(value);
  return `3 × ${withUnit}`;
}

function normalizePhasePrefixLabel(raw: string): string {
  return raw
    .replace(/^3\s*[xX×]\s+/u, '3 × ')
    .replace(/\b([13])\s*[xX×]\s*([13])\s*[xX×]\s*(\d{2,4})/gu, '$1×$2×$3')
    .replace(/\b([13])\s*[xX×]\s*(\d{2,4})(\s*\/\s*\d{1,3})?/gu, (_match, count: string, section: string, screen: string | undefined) => {
      const normalizedScreen = screen ? screen.replace(/\s+/gu, '') : '';
      return `${count}×${section}${normalizedScreen}`;
    });
}

function ensureMvCableUnit(raw: string): string {
  if (/\bmm(?:2|²)\b/iu.test(raw)) return raw;
  return raw.replace(/(\b1×\d{2,4}(?:\s*\/\s*\d{1,3})?)(?!\s*mm)/iu, '$1 mm²');
}

function stripCableOwnerPrefix(raw: string): string {
  const normalized = raw.trim();
  const phasePrefix = normalized.match(/^(3\s*[xX×]\s+)(.+)$/u);
  if (phasePrefix) {
    return `${phasePrefix[1]}${stripCableOwnerPrefix(phasePrefix[2])}`.trim();
  }
  return normalized
    .replace(/^\s*ENEA\s+OPERATOR\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*ENEA\s+OPERATOR\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TELE[-\s]?FONIKA\s+KABLE\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TFK\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*NKT\s+STANDARD\s*[-–—]?\s*/iu, '')
    .trim();
}

function addReturnConductorSection(raw: string, materialized?: Record<string, unknown> | null): string {
  const screenSection = readReturnConductorSection(materialized);
  if (!screenSection) return raw;
  return raw.replace(
    /\b1×(\d{2,4})(?!\s*\/)(\s*mm(?:2|²))?\b/iu,
    (_match, phaseSection: string, unit: string | undefined) =>
      `1×${phaseSection}/${screenSection}${unit ?? ''}`,
  );
}

function readReturnConductorSection(materialized?: Record<string, unknown> | null): string | null {
  const raw = materialized?.return_conductor_cross_section_mm2;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

function normalizeCableMultiplicationSigns(raw: string): string {
  return raw
    .replace(/\b([13])\s*[xX×]\s*([13])\s*[xX×]\s*(\d{2,4})/gu, '$1×$2×$3')
    .replace(/\b([13])\s*[xX×]\s*(\d{2,4})(\s*\/\s*\d{1,3})?/gu, (_match, count: string, section: string, screen: string | undefined) => {
      const normalizedScreen = screen ? screen.replace(/\s+/gu, '') : '';
      return `${count}×${section}${normalizedScreen}`;
    });
}

/**
 * Wnioskuje napięcie strony HV GPZ z dostępnych danych ENM.
 *
 * Reguła deterministyczna (audyt MV §6 BLOCKER-29: zero heurystyk):
 *   1) Trafo skojarzony z GPZ przez `transformer_refs` ma `uhv_kv` → użyj.
 *   2) Bus po stronie HV trafa (`tr.hv_bus_ref`) ma `voltage_kv` → użyj.
 *   3) Brak danych → `null` (Invariant 9: brak danych ≠ 110 kV default).
 *
 * Eliminacja heurystyki "voltage_kv > 30" (niejednoznaczne dla 30 kV
 * wytwórców). Zwracane null sygnalizuje rendererowi, żeby pokazał klasę WN
 * bez zmyślania wartości liczbowej.
 */
function inferHvVoltageKv(
  transformers: readonly Transformer[],
  gpz: Substation,
  buses: readonly Bus[],
): number | null {
  const ownTransformers = transformers.filter((tr) =>
    gpz.transformer_refs?.includes(tr.ref_id),
  );
  /* (1) Wprost z trafo: uhv_kv. */
  for (const tr of ownTransformers) {
    if (tr.uhv_kv) return tr.uhv_kv;
  }
  /* (2) Z busa po stronie HV trafa. */
  for (const tr of ownTransformers) {
    if (!tr.hv_bus_ref) continue;
    const hvBus = buses.find((b) => b.ref_id === tr.hv_bus_ref);
    if (hvBus?.voltage_kv) return hvBus.voltage_kv;
  }
  return null;
}

function findFirstBusByRefs(buses: readonly Bus[], busRefs: readonly string[]): Bus | null {
  for (const ref of busRefs) {
    const bus = buses.find((b) => b.ref_id === ref);
    if (bus) return bus;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Sections (GPZ szyny SN)
// -----------------------------------------------------------------------------

function buildSections(snapshot: EnergyNetworkModel): SectionRendererProps[] {
  const substations = snapshot.substations ?? [];
  const buses = snapshot.buses ?? [];
  const sectionList: SectionRendererProps[] = [];

  for (const gpz of substations.filter((s) => s.station_type === 'gpz')) {
    const sections = gpz.gpz_sections ?? [];
    if (sections.length === 0) continue;

    const sortedSections = [...sections].sort((a, b) => a.order - b.order);

    sortedSections.forEach((sec, idx) => {
      const bus = buses.find((b) => b.ref_id === sec.bus_ref);
      const voltageKv = bus?.voltage_kv ?? 15;
      // Liczba pól dla danej sekcji = liczba bay'ów odwołujących się do tej sekcji.
      const bayCount = (snapshot.bays ?? []).filter(
        (b) => b.gpz_section_id === sec.section_id,
      ).length;
      sectionList.push({
        id: `${gpz.ref_id}__${sec.section_id}`,
        x: SECTION_X_BASE + idx * SECTION_PITCH,
        y: Y_SECTIONS,
        // E11: user-facing section number = 1-based POSITION in the sorted list
        // (`idx + 1`), never the raw `order` field (whose 0-/1-based convention
        // is inconsistent across the model and leaked "Sekcja 0"). Prefer the
        // domain name as the display label when present.
        number: idx + 1,
        displayLabel: sec.name ?? undefined,
        busVoltageKv: voltageKv,
        bayCount,
      });
    });
    void SECTION_WIDTH;
  }
  return sectionList;
}

// -----------------------------------------------------------------------------
// Stations (na ciągach)
// -----------------------------------------------------------------------------

/**
 * Buduje listę stacji na ciągach z dwóch źródeł:
 *  1. **`snapshot.line_runs[]`** (Phase 0B-4 fix): jeśli ENM zawiera explicit
 *     LineRun, każdy ciąg = osobny kanał Y, stacje sortowane po `order`
 *     w `lineRun.stations[]`. Stabilna sortacja po `lineRun.id` (alfabetycznie)
 *     gwarantuje deterministyczne kanały Y.
 *  2. **Kontrola topologii**: stacje pole-wymiarowe NIE wymienione w żadnym
 *     `line_runs[]` nie dostają pozycji na kanwie; trafiają do raportu
 *     czytelności jako błąd materializacji/topologii.
 *
 * Wynik: deterministyczna pozycja stacji w SLD, oparta na ENM truth (Inv 9).
 */
type SldLineRunForLayout = {
  id: string;
  name?: string | null;
  run_kind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  starting_bay_ref: string | null;
  starting_port_ref: string | null;
  segments: Array<{ segment_ref: string; order: number }>;
  stations: Array<{ substation_ref: string; order: number }>;
  nop_station_ref?: string | null;
  parent_run_ref?: string | null;
  branch_origin_station_ref?: string | null;
};

const FIELD_STATION_KINDS = new Set([
  'mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer',
]);

function collectFieldStationByRef(snapshot: EnergyNetworkModel): Map<string, Substation> {
  const fieldStationByRef = new Map<string, Substation>();
  for (const station of snapshot.substations ?? []) {
    if (FIELD_STATION_KINDS.has(station.station_type)) {
      fieldStationByRef.set(station.ref_id, station);
    }
  }
  return fieldStationByRef;
}

function stationShellsForLineInference(
  fieldStationByRef: ReadonlyMap<string, Substation>,
): StationOnRunRendererProps[] {
  return [...fieldStationByRef.values()].map((station) => ({
    id: station.ref_id,
    x: 0,
    y: 0,
    name: station.name || station.ref_id,
    topologicalType: classifyTopologicalType(station),
    nnVoltageLevelsCount: 1,
  }));
}

function resolveFieldStationRefForBus(
  fieldStationByRef: ReadonlyMap<string, Substation>,
  busRef: string | null | undefined,
): string | null {
  if (!busRef) return null;
  for (const station of fieldStationByRef.values()) {
    if ((station.bus_refs ?? []).includes(busRef)) return station.ref_id;
    const baseRef = station.ref_id.endsWith('/station')
      ? station.ref_id.slice(0, -'/station'.length)
      : station.ref_id;
    if (busRef.startsWith(`${baseRef}/`)) return station.ref_id;
  }
  return null;
}

function inferStationRefsForSegments(
  segmentRefs: readonly string[],
  branchByRef: ReadonlyMap<string, Branch>,
  fieldStationByRef: ReadonlyMap<string, Substation>,
): string[] {
  const stationRefs: string[] = [];
  for (const segmentRef of segmentRefs) {
    const branch = branchByRef.get(segmentRef);
    if (!branch) continue;
    const candidates = [branch.to_bus_ref, branch.from_bus_ref]
      .map((busRef) => resolveFieldStationRefForBus(fieldStationByRef, busRef))
      .filter((stationRef): stationRef is string => Boolean(stationRef));
    for (const stationRef of candidates) {
      if (!stationRefs.includes(stationRef)) stationRefs.push(stationRef);
    }
  }
  return stationRefs;
}

function normalizeLineRunForLayout(
  lineRun: NonNullable<EnergyNetworkModel['line_runs']>[number],
  branchByRef: ReadonlyMap<string, Branch> = new Map(),
  splitSegmentRefsByParent: ReadonlyMap<string, readonly string[]> = new Map(),
): SldLineRunForLayout {
  const normalizedSegmentRefs = lineRunSegmentRefs(lineRun);
  const seenSegmentRefs = new Set<string>();
  const expandedSegmentRefs = normalizedSegmentRefs.flatMap((segmentRef) => {
    const splitFromBranchPoints = splitSegmentRefsByParent.get(segmentRef);
    // R2: odcinek cięty ŁĄCZNIKAMI (nie branch-pointami) rozwija się po
    // przyrostkach `_L`/`_R` z realnych gałęzi ENM (rekurencyjnie).
    const splitBySuffix = [...branchByRef.keys()]
      .filter((ref) => ref.startsWith(`${segmentRef}_`))
      .sort((a, b) => a.localeCompare(b));
    const refs = branchByRef.has(segmentRef)
      ? [segmentRef]
      : splitFromBranchPoints
        ? [...splitFromBranchPoints]
        : splitBySuffix.length > 0
          ? splitBySuffix
          : [segmentRef];
    return refs.filter((ref) => {
      if (seenSegmentRefs.has(ref)) return false;
      seenSegmentRefs.add(ref);
      return true;
    });
  });
  return {
    id: lineRun.id,
    name: lineRun.name ?? null,
    run_kind: lineRun.run_kind,
    starting_bay_ref: lineRun.starting_bay_ref ?? null,
    starting_port_ref: lineRun.starting_port_ref ?? null,
    segments: expandedSegmentRefs.map((segment_ref, index) => ({ segment_ref, order: index + 1 })),
    stations: [...lineRun.stations],
    nop_station_ref: lineRun.nop_station_ref ?? null,
    parent_run_ref: lineRun.parent_run_ref ?? null,
    branch_origin_station_ref: lineRun.branch_origin_station_ref ?? null,
  };
}

function splitSegmentRefsByParentFromBranchPoints(
  snapshot: EnergyNetworkModel,
  branchByRef: ReadonlyMap<string, Branch>,
): Map<string, readonly string[]> {
  const refsByParent = new Map<string, readonly string[]>();
  for (const branchPoint of snapshot.branch_points ?? []) {
    const parentRef = branchPoint.parent_segment_id;
    if (!parentRef || branchByRef.has(parentRef)) continue;
    const mainSegmentRefs = branchPointMainSegmentRefs(branchPoint, branchByRef);
    if (mainSegmentRefs.length === 0) continue;
    refsByParent.set(parentRef, mainSegmentRefs);
  }
  return refsByParent;
}

function compareLineRunsForLayout(a: SldLineRunForLayout, b: SldLineRunForLayout): number {
  const aDerived = a.id.startsWith('synth_trunk_') || a.id.startsWith('corridor_sld_');
  const bDerived = b.id.startsWith('synth_trunk_') || b.id.startsWith('corridor_sld_');
  if (aDerived !== bDerived) return aDerived ? 1 : -1;
  const kindRank = lineRunKindLayoutRank(a.run_kind) - lineRunKindLayoutRank(b.run_kind);
  if (kindRank !== 0) return kindRank;
  return a.id.localeCompare(b.id);
}

function lineRunKindLayoutRank(kind: SldLineRunForLayout['run_kind']): number {
  switch (kind) {
    case 'main_trunk':
      return 0;
    case 'branch':
      return 1;
    case 'ring':
    case 'loop':
      return 2;
    default:
      return 3;
  }
}

/**
 * R2: deklarowany odcinek ciągu (`seg/<h>/segment`) może być ROZCIĘTY
 * łącznikami na warianty `_L`/`_R` (rekurencyjnie: `_L_R_L`...). Rysujemy
 * RZECZYWISTE gałęzie ENM: ref bazowy rozwija się do wszystkich połówek
 * w porządku leksykalnym (_L przed _R — zgodnie z orientacją odcinka).
 */
function expandSegmentRefToBranches(
  segmentRef: string,
  branches: readonly Branch[],
): Branch[] {
  const exact = branches.filter((branch) => branch.ref_id === segmentRef);
  if (exact.length > 0) return exact;
  return branches
    .filter((branch) => branch.ref_id.startsWith(`${segmentRef}_`))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
}

/** Ref bazowy odcinka (bez przyrostków cięcia łącznikiem `_L`/`_R`). */
function baseSegmentRef(segmentRef: string): string {
  return segmentRef.replace(/(_[LR])+$/, '');
}

function buildSldLineRunsForLayout(
  snapshot: EnergyNetworkModel,
  fieldStationByRef: ReadonlyMap<string, Substation>,
): SldLineRunForLayout[] {
  const cables = (snapshot.branches ?? [])
    .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(snapshot, branch));
  const branchByRef = new Map(cables.map((branch) => [branch.ref_id, branch]));
  const splitSegmentRefsByParent = splitSegmentRefsByParentFromBranchPoints(snapshot, branchByRef);
  const explicitRuns = (snapshot.line_runs ?? [])
    .map((lineRun) => normalizeLineRunForLayout(lineRun, branchByRef, splitSegmentRefsByParent))
    .map((run) => {
      // R2: gdy line_run nie deklaruje stacji, wyprowadź je z KOŃCÓWEK
      // rzeczywistych odcinków (kolejność elektryczna) — stacje ciągu nie mogą
      // zależeć od resztkowego korytarza.
      if (run.stations.length > 0) return run;
      const inferred = inferStationRefsForSegments(
        run.segments.map((seg) => seg.segment_ref),
        branchByRef,
        fieldStationByRef,
      );
      // Stacja-RODZIC odgałęzienia (origin) leży na ciągu macierzystym — nie
      // jest stacją TEGO ciągu (jej obecność fałszowałaby koniec ciągu i
      // gasiła marker oczekującego zakończenia).
      const firstSegmentRef = [...run.segments].sort((a, b) => a.order - b.order)[0]?.segment_ref;
      const firstBranch = firstSegmentRef ? branchByRef.get(firstSegmentRef) : undefined;
      const originOwner = run.branch_origin_station_ref
        ? resolveFieldStationRefForBus(fieldStationByRef, run.branch_origin_station_ref)
          ?? ownerStationRefFromFieldRef(run.branch_origin_station_ref)
        : run.run_kind === 'branch'
          ? resolveFieldStationRefForBus(fieldStationByRef, firstBranch?.from_bus_ref)
          : null;
      const stations = inferred.filter((stationRef) => stationRef !== originOwner);
      return {
        ...run,
        stations: stations.map((substation_ref, order) => ({ substation_ref, order: order + 1 })),
      };
    });
  const coveredSegments = new Set<string>();
  for (const run of explicitRuns) {
    for (const segmentRef of lineRunSegmentRefs(run)) {
      coveredSegments.add(segmentRef);
      coveredSegments.add(baseSegmentRef(segmentRef));
    }
  }

  const corridorRuns = [...(snapshot.corridors ?? [])]
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .flatMap((corridor, corridorIndex): SldLineRunForLayout[] => {
      const segmentRefs = (corridor.ordered_segment_refs ?? [])
        .filter((segmentRef) =>
          !coveredSegments.has(segmentRef) && !coveredSegments.has(baseSegmentRef(segmentRef))
          // ref z przestrzeni łączników (`sw/...` = punkt NO korytarza) nie jest
          // odcinkiem do rysowania — nie tworzy ciągu resztkowego (gramatyka
          // ref_id ENM, nie heurystyka nazw)
          && !segmentRef.startsWith('sw/'));
      if (segmentRefs.length === 0) return [];
      for (const segmentRef of segmentRefs) coveredSegments.add(segmentRef);
      const stationRefs = uniqueStrings([
        ...(corridor.station_refs ?? []),
        ...inferStationRefsForSegments(segmentRefs, branchByRef, fieldStationByRef),
      ]).filter((stationRef) => fieldStationByRef.has(stationRef));
      return [{
        id: `corridor_sld_${corridor.ref_id || corridor.id || corridorIndex}`,
        run_kind: corridor.corridor_type === 'ring' ? 'ring' : 'main_trunk',
        starting_bay_ref: null,
        starting_port_ref: null,
        segments: segmentRefs.map((segment_ref, order) => ({ segment_ref, order: order + 1 })),
        stations: stationRefs.map((substation_ref, order) => ({ substation_ref, order: order + 1 })),
        nop_station_ref: corridor.no_point_ref ?? null,
      }];
    });

  const uncoveredCables = cables.filter((branch) => !coveredSegments.has(branch.ref_id));
  const layoutRuns: SldLineRunForLayout[] = [...explicitRuns, ...corridorRuns];
  const synthesizedRuns = inferLineRunsFromBranchChain(
    snapshot,
    uncoveredCables,
    stationShellsForLineInference(fieldStationByRef),
  )
    .filter((run) => run.segments.length > 0 && run.stations.length > 0);

  synthesizedRuns.forEach((run, index) => {
    const firstSegment = branchByRef.get(run.segments[0]?.segment_ref ?? '');
    const originStationRef = resolveFieldStationRefForBus(fieldStationByRef, firstSegment?.from_bus_ref);
    const existingRun = originStationRef
      ? layoutRuns.find((candidate) =>
        candidate.stations.some((station) => station.substation_ref === originStationRef),
      )
      : null;

    if (existingRun) {
      const segmentOrderBase = existingRun.segments.reduce(
        (maxOrder, segment) => Math.max(maxOrder, segment.order),
        0,
      );
      const stationOrderBase = existingRun.stations.reduce(
        (maxOrder, station) => Math.max(maxOrder, station.order),
        0,
      );
      existingRun.segments.push(
        ...run.segments.map((segment, segmentIndex) => ({
          ...segment,
          order: segmentOrderBase + segmentIndex + 1,
        })),
      );
      const knownStations = new Set(existingRun.stations.map((station) => station.substation_ref));
      existingRun.stations.push(
        ...run.stations
          .filter((station) => !knownStations.has(station.substation_ref))
          .map((station, stationIndex) => ({
            ...station,
            order: stationOrderBase + stationIndex + 1,
          })),
      );
      return;
    }

    layoutRuns.push({
      id: layoutRuns.length > 0 ? `synth_trunk_extra_${index}` : run.id,
      run_kind: 'main_trunk',
      starting_bay_ref: null,
      starting_port_ref: null,
      segments: run.segments,
      stations: run.stations,
      nop_station_ref: null,
    });
  });

  // V-03: klasyfikuj korytarze odgałęźne jako 'branch' z origin-stacją, by layout
  // rozłożył laterale od stacji-rodzica (drzewo), zamiast stosu lewo-wyrównanego.
  // Run jest lateralem, gdy stacja-rodzic (from_bus pierwszego segmentu) leży na
  // INNYM runie. Główna magistrala wychodzi z GPZ/źródła (origin nie jest stacją).
  const stationToRunId = new Map<string, string>();
  for (const run of layoutRuns) {
    for (const st of run.stations) stationToRunId.set(st.substation_ref, run.id);
  }
  for (const run of layoutRuns) {
    if (run.run_kind !== 'main_trunk') continue;
    const firstSeg = [...run.segments].sort((a, b) => a.order - b.order)[0];
    const branch0 = firstSeg ? branchByRef.get(firstSeg.segment_ref) : null;
    const originStationRef = resolveFieldStationRefForBus(fieldStationByRef, branch0?.from_bus_ref);
    if (!originStationRef) continue;
    const originRunId = stationToRunId.get(originStationRef);
    if (originRunId && originRunId !== run.id) {
      run.run_kind = 'branch';
      run.branch_origin_station_ref = originStationRef;
    }
  }

  return layoutRuns.sort(compareLineRunsForLayout);
}

function buildStations(snapshot: EnergyNetworkModel): StationOnRunRendererProps[] {
  const corridors = snapshot.corridors ?? [];
  const stations: StationOnRunRendererProps[] = [];

  const fieldStationByRef = collectFieldStationByRef(snapshot);

  // K30 audit loop: jeśli ENM nie ma jawnych line_runs ALE branches tworzą
  // łańcuch GPZ→S→S→..., zsynchronizuj line_runs z buildCableRuns. Bez tego
  // stacje wpadają w orphan-fallback (4×5 grid cluster), a kable są jeden
  // wspólny main_trunk — visual inconsistency.
  const lineRuns = buildSldLineRunsForLayout(snapshot, fieldStationByRef);

  /* Phase 0B-4: śledzimy które stacje już zostały umieszczone przez line_runs.
   * Reszta to "orphans" (legacy fallback). */
  const placed = new Set<string>();

  const branchByRef = new Map((snapshot.branches ?? []).map((b) => [b.ref_id, b]));

  // 1. Stacje z line_runs — deterministyczne sortowanie po lineRun.id, potem station.order.
  const sortedRuns = [...lineRuns].sort(compareLineRunsForLayout);
  // Długie ciągi terenowe zawijamy do kanałów SLD. To nie jest limit produktu:
  // ENM może mieć dowolną liczbę stacji, a adapter zachowuje kolejność
  // topologiczną przez układ wężowy zamiast ściskać dużą sieć w jednym rzędzie.
  let stationSequence = 1;
  // V-03: X każdej umieszczonej stacji — by laterale startowały od stacji-rodzica
  // (rozłożone drzewo), a nie wszystkie od lewej krawędzi (stos).
  const stationXByRef = new Map<string, number>();

  sortedRuns.forEach((lr, runIdx) => {
    const sortedStations = [...lr.stations].sort((a, b) => a.order - b.order);
    const sortedSegments = [...lr.segments].sort((a, b) => a.order - b.order);
    // V-03: laterale (branch/ring/loop) startują od X stacji-rodzica; magistrala
    // od GPZ. Gdy rodzic jeszcze nieumieszczony → fallback do zachowania bazowego.
    const originRef = lr.branch_origin_station_ref ?? null;
    const isLateral = lr.run_kind !== 'main_trunk';
    const parentX =
      isLateral && originRef && stationXByRef.has(originRef)
        ? stationXByRef.get(originRef)!
        : null;
    const runStartX = parentX ?? GPZ_TRUNK_HEAD_X;
    const minimumBaseX = parentX ?? X_STATIONS_START;
    // K30-51: track previous station X per row for collision-avoidance (min pitch).
    let previousXInRow: number | null = null;
    sortedStations.forEach((sref, posInRun) => {
      if (placed.has(sref.substation_ref)) return;
      const sub = fieldStationByRef.get(sref.substation_ref);
      if (!sub) return;
      placed.add(sref.substation_ref);
      const stationSldDetails = buildStationMiniBlockDetails(snapshot, sub);
      const isNop = lr.nop_station_ref === sub.ref_id || lr.nop_station_ref === sub.id;
      const cumKm = sortedSegments
        .filter((seg) => seg.order <= sref.order)
        .reduce((acc, seg) => {
          const branch = branchByRef.get(seg.segment_ref);
          const len = 'length_km' in (branch ?? {}) ? (branch as { length_km: number }).length_km : 0;
          return acc + (len ?? 0);
        }, 0);
      const stationCode = stationCodeFromName(sub.name, stationSequence);
      stationSequence += 1;

      // K30-51: distance-based X. CumKm > 0 → exact position from trunk start.
      // CumKm = 0 (no segments yet) → fallback uniform pitch posInRun * default.
      const stationX = stationXFromCumKm(runStartX, cumKm, posInRun, previousXInRow, minimumBaseX);
      previousXInRow = stationX;
      stationXByRef.set(sub.ref_id, stationX);
      if (sub.id) stationXByRef.set(sub.id, stationX);

      stations.push({
        id: sub.ref_id,
        x: stationX,
        y: Y_RUN_BASE + runIdx * RUN_PITCH + STATION_RUN_TRUNK_OFFSET_Y,
        name: normalizeStationName(sub.name, sub.ref_id),
        stationCode,
        topologicalType: classifyTopologicalType(sub),
        nnVoltageLevelsCount: 1,
        footprintType: stationSldDetails.footprintType,
        snBays: stationSldDetails.snBays,
        hasTransformer: stationSldDetails.hasTransformer,
        transformerRefs: stationSldDetails.transformerRefs,
        transformerRatedKva: stationSldDetails.transformerRatedKva,
        nnFeedersCount: stationSldDetails.nnFeedersCount,
        derBadges: stationSldDetails.derBadges,
        totalLoadKw: stationSldDetails.totalLoadKw,
        totalGenerationKw: stationSldDetails.totalGenerationKw,
        alarmSeverity: stationSldDetails.alarmSeverity,
        busVoltageKv: stationSldDetails.mainBusVoltageKv,
        transformerVectorGroup: stationSldDetails.transformerVectorGroup,
        ...(isNop ? { isNop: true } : {}),
        ...(cumKm > 0 ? { distanceFromGpzKm: Math.round(cumKm * 100) / 100 } : {}),
      });
    });
  });

  // 2. Stacje dopięte przez append_station_on_endpoint do corridor.station_refs[].
  const sortedCorridorsWithStations = [...corridors]
    .filter((corridor) => (corridor.station_refs ?? []).length > 0)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  sortedCorridorsWithStations.forEach((corridor, corridorIdx) => {
    (corridor.station_refs ?? []).forEach((substationRef, posInRun) => {
      if (placed.has(substationRef)) return;
      const sub = fieldStationByRef.get(substationRef);
      if (!sub) return;
      placed.add(substationRef);
      const stationSldDetails = buildStationMiniBlockDetails(snapshot, sub);
      stations.push({
        id: sub.ref_id,
        x: X_STATIONS_START + posInRun * STATION_PITCH,
        y:
          Y_RUN_BASE
          + (sortedRuns.length + corridorIdx) * RUN_PITCH
          + STATION_RUN_TRUNK_OFFSET_Y,
        name: normalizeStationName(sub.name, sub.ref_id),
        stationCode: stationCodeFromName(sub.name, stationSequence),
        topologicalType: classifyTopologicalType(sub),
        nnVoltageLevelsCount: 1,
        footprintType: stationSldDetails.footprintType,
        snBays: stationSldDetails.snBays,
        hasTransformer: stationSldDetails.hasTransformer,
        transformerRefs: stationSldDetails.transformerRefs,
        transformerRatedKva: stationSldDetails.transformerRatedKva,
        nnFeedersCount: stationSldDetails.nnFeedersCount,
        derBadges: stationSldDetails.derBadges,
        totalLoadKw: stationSldDetails.totalLoadKw,
        totalGenerationKw: stationSldDetails.totalGenerationKw,
        alarmSeverity: stationSldDetails.alarmSeverity,
        busVoltageKv: stationSldDetails.mainBusVoltageKv,
        transformerVectorGroup: stationSldDetails.transformerVectorGroup,
      });
      stationSequence += 1;
    });
  });

  return stations;
}

interface StationMiniBlockDetails {
  readonly footprintType: StationFootprintType;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer: boolean;
  readonly transformerRefs: readonly string[];
  readonly nnFeedersCount: number;
  readonly derBadges: readonly MiniBlockDerBadge[];
  readonly transformerRatedKva: number | null;
  /** K30-15.3: zsumowane load [kW] na LV side stacji (sum of enm.loads.p_mw). */
  readonly totalLoadKw: number;
  /** K30-15.3: zsumowana DER generation [kW] (sum of enm.generators.p_mw na tej stacji). */
  readonly totalGenerationKw: number;
  readonly alarmSeverity: 'warning' | 'important' | 'critical' | null;
  /** K30-37: napięcie głównej szyny SN stacji [kV] — najwyższe voltage_kv
   *  spośród buses zakotwiczonych do tej stacji. Renderer dobiera tint koloru
   *  szyny zgodnie z konwencją dyspozytorską (WN/SN/nN). */
  readonly mainBusVoltageKv: number | null;
  /** K30-62: vector group transformatora (np. "Dyn5", "Yd11"). Real
   *  industrial SLD pokazuje vector group obok TR symbol per IEC 60076-1. */
  readonly transformerVectorGroup: string | null;
}

/**
 * K30-19: Count nN feeders dla station z ENM meta (nn_field_specs)
 * filtered po bay_role='FEEDER'. Fallback do legacy heuristic gdy meta
 * nieobecna (backward-compat z testami).
 */
function countNnFeedersFromMeta(
  station: Substation,
  derBadges: readonly MiniBlockDerBadge[],
): number {
  const meta = station.meta as { nn_field_specs?: { bay_role?: string }[] } | undefined;
  const specs = meta?.nn_field_specs ?? [];
  if (Array.isArray(specs) && specs.length > 0) {
    const feeders = specs.filter((s) => s?.bay_role === 'FEEDER');
    if (feeders.length > 0) return feeders.length;
  }
  // Legacy fallback: DER presence implies LV-side bus structure
  return derBadges.some((b) => b.connectionSide === 'nn') ? 2 : 1;
}


function buildStationMiniBlockDetails(
  snapshot: EnergyNetworkModel,
  station: Substation,
): StationMiniBlockDetails {
  const derBadges = buildStationDerBadges(snapshot, station.ref_id);
  const explicitBays = buildExplicitStationMiniBays(snapshot, station);
  const derSourceBays = buildDedicatedDerStationMiniBays(snapshot, station, explicitBays);
  const snBays = [...explicitBays, ...derSourceBays];
  const explicitRoles = snBays.map((bay) => bay.fieldRole);
  const hasMvSideDer =
    derSourceBays.length > 0 ||
    derBadges.some((badge) => badge.connectionSide !== 'nn');
  const footprintType = deriveFootprintType(station.station_type, explicitRoles, hasMvSideDer);
  const transformerRefs = collectStationTransformerRefs(snapshot, station);
  const transformerRatedKva = inferTransformerRatedKva(snapshot, transformerRefs);

  // K30-15.3: zsumuj load + DER generation po stronie transformatora stacji.
  // DER z transformatorem blokowym ma osobny tor i nie obciaza TR SN/nN stacji.
  const stationBusRefs = new Set<string>();
  // K30-37: znajdź główną szynę SN stacji (najwyższe voltage_kv > 0.5 kV).
  // 0.4 kV LV-side wykluczamy z "main" — main = SN bus.
  let mainBusVoltageKv: number | null = null;
  for (const bus of snapshot.buses ?? []) {
    const scopedBus = bus as { substation_ref?: string; ref_id: string; voltage_kv?: number };
    if (scopedBus.substation_ref === station.ref_id || scopedBus.substation_ref === station.id) {
      stationBusRefs.add(scopedBus.ref_id);
      const v = scopedBus.voltage_kv;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0.5) {
        if (mainBusVoltageKv == null || v > mainBusVoltageKv) {
          mainBusVoltageKv = v;
        }
      }
    }
  }
  const totalLoadKw = Math.round(
    (snapshot.loads ?? [])
      .filter((l) => stationBusRefs.has(l.bus_ref))
      .reduce((acc, l) => acc + (l.p_mw ?? 0) * 1000, 0)
  );
  const totalGenerationKw = Math.round(
    (snapshot.generators ?? [])
      .filter(
        (g) =>
          (g.station_ref === station.ref_id || g.station_ref === station.id)
          && isStationOwnedDerConnection(g.connection_variant)
      )
      .reduce((acc, g) => acc + (g.p_mw ?? 0) * 1000, 0)
  );
  const alarmSeverity = transformerCapacityAlarm(transformerRatedKva, totalGenerationKw);

  return {
    footprintType,
    snBays,
    transformerRefs,
    hasTransformer:
      transformerRefs.length > 0 ||
      snBays.some((bay) => bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER || bay.fieldRole === FIELD_ROLE.TRANSFORMER),
    // K30-19: derive count z ENM meta (nn_field_specs filtered FEEDER role)
    // jeśli dostępne. Backward-compat fallback do DER-presence heuristic.
    nnFeedersCount: countNnFeedersFromMeta(station, derBadges),
    derBadges,
    transformerRatedKva,
    totalLoadKw,
    totalGenerationKw,
    alarmSeverity,
    mainBusVoltageKv,
    transformerVectorGroup: inferTransformerVectorGroup(snapshot, transformerRefs),
  };
}

/**
 * K30-62: zwróć vector_group z pierwszego transformatora linkowanego ze
 * stacją. Industrial SLD pokazuje vector group per IEC 60076-1 (np. Dyn5,
 * Yd11). Brak vector_group → null (no badge rendered).
 */
function transformerCapacityAlarm(
  transformerRatedKva: number | null,
  stationOwnedGenerationKw: number,
): 'critical' | null {
  if (transformerRatedKva === null || stationOwnedGenerationKw <= 0) return null;
  const requiredKva = stationOwnedGenerationKw / 0.9;
  return requiredKva > transformerRatedKva + 1e-6 ? 'critical' : null;
}

function inferTransformerVectorGroup(
  snapshot: EnergyNetworkModel,
  transformerRefs: readonly string[],
): string | null {
  for (const ref of transformerRefs) {
    const tr = (snapshot.transformers ?? []).find(
      (t) => t.ref_id === ref || t.id === ref,
    );
    if (tr?.vector_group) return tr.vector_group;
  }
  return null;
}

function inferTransformerRatedKva(
  snapshot: EnergyNetworkModel,
  transformerRefs: readonly string[],
): number | null {
  if (transformerRefs.length === 0) return null;
  const transformer = (snapshot.transformers ?? []).find(
    (tr) => transformerRefs.includes(tr.ref_id) || transformerRefs.includes(tr.id ?? ''),
  );
  if (!transformer) return null;
  const kva = Math.round(transformer.sn_mva * 1000);
  return kva > 0 ? kva : null;
}

function collectStationTransformerRefs(
  snapshot: EnergyNetworkModel,
  station: Substation,
): string[] {
  return selectStationDistributionTransformerRefs(snapshot, station);
}

function buildExplicitStationMiniBays(
  snapshot: EnergyNetworkModel,
  station: Substation,
): MiniBlockBayDescriptor[] {
  // K30-65: cache snapshot.branches by ref_id for O(1) equipment lookup
  const branchByRef = new Map(
    (snapshot.branches ?? []).map((b) => [b.ref_id, b]),
  );
  const fieldSpecBays = buildStationMiniBaysFromFieldSpecs(station, branchByRef);
  const stationRefs = new Set([station.ref_id, station.id].filter(Boolean));
  const legacyBays = [...(snapshot.bays ?? [])]
    .filter((bay) => stationRefs.has(bay.substation_ref))
    .sort(compareBaysForSld)
    .map((bay, index) => {
      const fieldRole = mapStationBayRoleToMiniRole(ENM_BAY_ROLE_TO_FIELD_ROLE[bay.bay_role]);
      // K30-64: wire actual switch state z bay.runtime_state.primary_device_states.
      // K30-65: fallback do bay.equipment_refs → snapshot.branches.status gdy
      // runtime_state empty (typowy K30 seed case).
      const states = bayRuntimeSwitchStates(bay)
        ?? deriveBayStatesFromEquipment(bay, branchByRef);
      return {
        bayRef: bay.ref_id,
        fieldRole,
        designation: bay.bay_number ?? bay.feeder_short_name ?? bay.name ?? `Pole ${index + 1}`,
        hasMissingRequiredDevice: bay.equipment_refs.length === 0,
        cbState: states.cb,
        dsState: states.ds,
        esState: states.es,
      };
    });

  if (fieldSpecBays.length > 0) return fieldSpecBays;
  return legacyBays;
}

function buildDedicatedDerStationMiniBays(
  snapshot: EnergyNetworkModel,
  station: Substation,
  existingBays: readonly MiniBlockBayDescriptor[],
): MiniBlockBayDescriptor[] {
  const existingDerRoles = new Set<FieldRole>(
    existingBays
      .map((bay) => bay.fieldRole)
      .filter((role) => role === FIELD_ROLE.DER_PV || role === FIELD_ROLE.DER_BESS || role === FIELD_ROLE.DER_FW),
  );
  const roleCounters = new Map<FieldRole, number>();
  const stationRefs = new Set([station.ref_id, station.id].filter(Boolean));
  return [...(snapshot.generators ?? [])]
    .filter((gen) => stationRefs.has(generatorStationRef(gen) ?? ''))
    .filter((gen) => isDedicatedMvDerConnection(gen.connection_variant))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id, 'pl'))
    .flatMap((gen): MiniBlockBayDescriptor[] => {
      const kind = mapGenTypeToDerKind(gen);
      const fieldRole = derFieldRoleForGenerator(kind);
      if (!fieldRole || existingDerRoles.has(fieldRole)) return [];
      const index = (roleCounters.get(fieldRole) ?? 0) + 1;
      roleCounters.set(fieldRole, index);
      return [{
        bayRef: `${station.ref_id}/der-bay/${sanitizeRefToken(gen.ref_id)}`,
        fieldRole,
        designation: index === 1 ? derFieldDesignation(fieldRole) : `${derFieldDesignation(fieldRole)} ${index}`,
        hasMissingRequiredDevice:
          !gen.catalog_ref ||
          (gen.connection_variant === 'block_transformer' && !gen.blocking_transformer_ref),
        cbState: 'closed',
        dsState: 'closed',
        esState: 'open',
      }];
    });
}

function isDedicatedMvDerConnection(
  connectionVariant: string | null | undefined,
): boolean {
  return connectionVariant === 'block_transformer'
    || connectionVariant === 'DEDICATED_MV_CONNECTION'
    || connectionVariant === 'SOURCE_CONNECTION_STATION';
}

function derFieldRoleForGenerator(kind: DerRendererProps['kind'] | null): FieldRole | null {
  if (kind === 'PV') return FIELD_ROLE.DER_PV;
  if (kind === 'BESS') return FIELD_ROLE.DER_BESS;
  if (kind === 'FW') return FIELD_ROLE.DER_FW;
  return null;
}

function derFieldDesignation(role: FieldRole): string {
  if (role === FIELD_ROLE.DER_PV) return 'PV';
  if (role === FIELD_ROLE.DER_BESS) return 'BESS';
  if (role === FIELD_ROLE.DER_FW) return 'FW';
  return 'OZE';
}

function sanitizeRefToken(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

interface StationFieldSpec {
  readonly field_ref?: string;
  readonly name?: string;
  readonly bay_role?: string;
  readonly bus_ref?: string;
  readonly equipment_refs: readonly string[];
  readonly protection_ref?: string | null;
  readonly tags: readonly string[];
  readonly meta: Record<string, unknown>;
}

function buildStationMiniBaysFromFieldSpecs(
  station: Substation,
  branchByRef: Map<string, Branch>,
): MiniBlockBayDescriptor[] {
  return readStationFieldSpecs(station)
    .sort(compareStationFieldSpecs)
    .map((spec, index) => {
      const fieldRole = stationFieldRoleFromSpec(spec);
      const states = deriveSwitchStatesFromEquipmentRefs(spec.equipment_refs, branchByRef);
      return {
        bayRef: spec.field_ref ?? `${station.ref_id}/field/${index + 1}`,
        fieldRole: mapStationBayRoleToMiniRole(fieldRole),
        designation: stationFieldDesignation(spec, index),
        hasMissingRequiredDevice: spec.equipment_refs.length === 0,
        cbState: states.cb,
        dsState: states.ds,
        esState: states.es,
      };
    });
}

function readStationFieldSpecs(station: Substation): StationFieldSpec[] {
  const rawSpecs = station.meta?.field_specs;
  if (!Array.isArray(rawSpecs)) return [];
  return rawSpecs
    .filter(isPlainRecord)
    .map((raw): StationFieldSpec => ({
      field_ref: getString(raw.field_ref),
      name: getString(raw.name),
      bay_role: getString(raw.bay_role),
      bus_ref: getString(raw.bus_ref),
      equipment_refs: getStringArray(raw.equipment_refs),
      protection_ref: getString(raw.protection_ref),
      tags: getStringArray(raw.tags),
      meta: isPlainRecord(raw.meta) ? raw.meta : {},
    }))
    .filter((spec) => Boolean(spec.field_ref || spec.bus_ref || spec.equipment_refs.length > 0));
}

function compareStationFieldSpecs(a: StationFieldSpec, b: StationFieldSpec): number {
  const rankDiff = stationFieldRoleRank(a) - stationFieldRoleRank(b);
  if (rankDiff !== 0) return rankDiff;
  return stationFieldStableKey(a).localeCompare(stationFieldStableKey(b), 'pl');
}

function stationFieldRoleRank(spec: StationFieldSpec): number {
  const role = stationFieldRoleFromSpec(spec);
  switch (role) {
    case FIELD_ROLE.LINE_IN:
      return 0;
    case FIELD_ROLE.LINE_OUT:
      return 1;
    case FIELD_ROLE.LINE_BRANCH:
      return 2;
    case FIELD_ROLE.TRANSFORMER:
      return 3;
    case FIELD_ROLE.COUPLER:
      return 4;
    case FIELD_ROLE.MEASUREMENT:
      return 5;
    case FIELD_ROLE.DER_PV:
    case FIELD_ROLE.DER_BESS:
    case FIELD_ROLE.DER_FW:
      return 6;
    default:
      return 99;
  }
}

function stationFieldStableKey(spec: StationFieldSpec): string {
  return [spec.field_ref, spec.name, spec.bus_ref].filter(Boolean).join('|');
}

function stationFieldRoleFromSpec(spec: StationFieldSpec): MiniBlockBayDescriptor['fieldRole'] {
  const metaRole = getString(spec.meta.field_role);
  return fieldRoleFromCatalogRole(metaRole)
    ?? fieldRoleFromBayRole(spec.bay_role)
    ?? FIELD_ROLE.LINE_BRANCH;
}

function fieldRoleFromCatalogRole(raw: string | undefined): MiniBlockBayDescriptor['fieldRole'] | null {
  const role = normalizeRole(raw);
  switch (role) {
    case 'LINIA_IN':
    case 'LINE_IN':
    case 'IN':
      return FIELD_ROLE.LINE_IN;
    case 'LINIA_OUT':
    case 'LINE_OUT':
    case 'OUT':
      return FIELD_ROLE.LINE_OUT;
    case 'LINIA_ODG':
    case 'LINE_BRANCH':
    case 'FEEDER':
      return FIELD_ROLE.LINE_BRANCH;
    case 'TRANSFORMATOROWE':
    case 'TRANSFORMER':
    case 'TR':
      return FIELD_ROLE.TRANSFORMER;
    case 'SPRZEGLO':
    case 'COUPLER':
      return FIELD_ROLE.COUPLER;
    case 'POMIAROWE':
    case 'MEASUREMENT':
      return FIELD_ROLE.MEASUREMENT;
    case 'PV_SN':
    case 'PV':
    case 'OZE_PV':
      return FIELD_ROLE.DER_PV;
    case 'BESS_SN':
    case 'BESS':
      return FIELD_ROLE.DER_BESS;
    case 'FW_SN':
    case 'FW':
    case 'FARMA_WIATROWA':
      return FIELD_ROLE.DER_FW;
    default:
      return null;
  }
}

function fieldRoleFromBayRole(raw: string | undefined): MiniBlockBayDescriptor['fieldRole'] | null {
  const role = normalizeRole(raw);
  switch (role) {
    case 'IN':
      return FIELD_ROLE.LINE_IN;
    case 'OUT':
      return FIELD_ROLE.LINE_OUT;
    case 'FEEDER':
      return FIELD_ROLE.LINE_BRANCH;
    case 'TR':
      return FIELD_ROLE.TRANSFORMER;
    case 'COUPLER':
      return FIELD_ROLE.COUPLER;
    case 'MEASUREMENT':
      return FIELD_ROLE.MEASUREMENT;
    case 'OZE':
      return FIELD_ROLE.DER_PV;
    case 'PV_SN':
      return FIELD_ROLE.DER_PV;
    case 'BESS_SN':
      return FIELD_ROLE.DER_BESS;
    case 'FW_SN':
      return FIELD_ROLE.DER_FW;
    default:
      return null;
  }
}

function stationFieldDesignation(spec: StationFieldSpec, index: number): string {
  const role = stationFieldRoleFromSpec(spec);
  switch (role) {
    case FIELD_ROLE.LINE_IN:
      return 'WE';
    case FIELD_ROLE.LINE_OUT:
      return 'WY';
    case FIELD_ROLE.LINE_BRANCH:
      return 'ODG';
    case FIELD_ROLE.TRANSFORMER:
      return 'TR';
    case FIELD_ROLE.COUPLER:
      return 'SPR';
    case FIELD_ROLE.MEASUREMENT:
      return 'POM';
    case FIELD_ROLE.DER_PV:
      return 'PV';
    case FIELD_ROLE.DER_BESS:
      return 'BESS';
    case FIELD_ROLE.DER_FW:
      return 'FW';
    default:
      return spec.name ?? `Pole SN ${index + 1}`;
  }
}

function normalizeRole(raw: string | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * K30-65: fallback when bay.runtime_state empty — derive CB/DS state
 * z bay.equipment_refs lookup w snapshot.branches.
 * Mapping branch.type → kind:
 *   'breaker' / 'switch' → CB
 *   'disconnector' / 'bus_coupler' → DS
 *   ES nie ma w SwitchBranch type — default 'open' (rest).
 */
function deriveBayStatesFromEquipment(
  bay: Bay,
  branchByRef: Map<string, Branch>,
): { cb: 'closed' | 'open' | 'unknown'; ds: 'closed' | 'open' | 'unknown'; es: 'closed' | 'open' | 'unknown' } {
  return deriveSwitchStatesFromEquipmentRefs(bay.equipment_refs, branchByRef);
}

function deriveSwitchStatesFromEquipmentRefs(
  equipmentRefs: readonly string[],
  branchByRef: Map<string, Branch>,
): { cb: 'closed' | 'open' | 'unknown'; ds: 'closed' | 'open' | 'unknown'; es: 'closed' | 'open' | 'unknown' } {
  let cb: 'closed' | 'open' | 'unknown' = 'closed';
  let ds: 'closed' | 'open' | 'unknown' = 'closed';
  const es: 'closed' | 'open' | 'unknown' = 'open';
  for (const ref of equipmentRefs) {
    const branch = branchByRef.get(ref);
    if (!branch) continue;
    const status: 'closed' | 'open' | 'unknown' =
      branch.status === 'closed' ? 'closed'
      : branch.status === 'open' ? 'open'
      : 'unknown';
    if (branch.type === 'breaker' || branch.type === 'switch') cb = status;
    else if (branch.type === 'disconnector' || branch.type === 'bus_coupler') ds = status;
  }
  return { cb, ds, es };
}

/**
 * K30-64: extract per-bay switch state (CB/DS/ES) z runtime_state.
 * Heurystyka: scan primary_device_states z key naming 'cb'/'ds'/'es'
 * (case-insensitive substring match). Real backend może używać explicit
 * device kind labels per BayPrimaryDeviceKind enum.
 *
 * Default jeśli brak data:
 *   cb → 'closed' (energized network normal)
 *   ds → 'closed'
 *   es → 'open' (rest position, only closed during maintenance)
 */
function bayRuntimeSwitchStates(bay: Bay): {
  cb: 'closed' | 'open' | 'unknown';
  ds: 'closed' | 'open' | 'unknown';
  es: 'closed' | 'open' | 'unknown';
} | null {
  const devices = bay.runtime_state?.primary_device_states;
  if (!devices || Object.keys(devices).length === 0) return null;  // fallback
  const mapState = (raw: string | undefined): 'closed' | 'open' | 'unknown' => {
    if (!raw) return 'unknown';
    if (raw.includes('zamknięty') || raw === 'zamkniety') return 'closed';
    if (raw.includes('otwarty')) return 'open';
    return 'unknown';
  };
  let cb: 'closed' | 'open' | 'unknown' = 'closed';
  let ds: 'closed' | 'open' | 'unknown' = 'closed';
  let es: 'closed' | 'open' | 'unknown' = 'open';
  for (const [key, swState] of Object.entries(devices)) {
    const k = key.toLowerCase();
    const state = mapState(swState?.actual_state);
    if (k.includes('cb') || k.includes('breaker') || k.includes('wyłącznik') || k.includes('wylacznik')) cb = state;
    else if (k.includes('ds') || k.includes('disconnector') || k.includes('odłącznik') || k.includes('odlacznik')) ds = state;
    else if (k.includes('es') || k.includes('earth') || k.includes('uziemnik')) es = state;
  }
  return { cb, ds, es };
}

function mapStationBayRoleToMiniRole(fieldRole: MiniBlockBayDescriptor['fieldRole']): MiniBlockBayDescriptor['fieldRole'] {
  if (
    fieldRole === FIELD_ROLE.LINE_IN ||
    fieldRole === FIELD_ROLE.LINE_OUT ||
    fieldRole === FIELD_ROLE.LINE_BRANCH ||
    fieldRole === FIELD_ROLE.GPZ_LINE_BAY
  ) {
    return FIELD_ROLE.RMU_LINE;
  }
  if (fieldRole === FIELD_ROLE.TRANSFORMER) return FIELD_ROLE.RMU_TRANSFORMER;
  return fieldRole;
}

function buildStationDerBadges(
  snapshot: EnergyNetworkModel,
  stationRef: string,
): MiniBlockDerBadge[] {
  // K30-55 Phase E: aggregate {kind, side, count, totalPMw} — pokaż badge
  // tylko gdy istnieją realne generators (p_mw available). Eliminuje atrapy.
  const counters = new Map<string, { kind: 'PV' | 'BESS' | 'FW'; connectionSide?: 'nn' | 'sn' | 'dedicated'; count: number; totalPMw: number; hasBlockTransformer: boolean }>();
  for (const gen of snapshot.generators ?? []) {
    if (generatorStationRef(gen) !== stationRef) continue;
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    if (!isStationOwnedDerConnection(gen.connection_variant)) continue;
    const connectionSide = mapGeneratorConnectionSide(gen);
    const key = `${kind}:${connectionSide}`;
    const current = counters.get(key);
    const pMw = (typeof gen.p_mw === 'number' && Number.isFinite(gen.p_mw)) ? gen.p_mw : 0;
    counters.set(key, {
      kind,
      connectionSide,
      count: (current?.count ?? 0) + 1,
      totalPMw: (current?.totalPMw ?? 0) + pMw,
      hasBlockTransformer: (current?.hasBlockTransformer ?? false) || gen.connection_variant === 'block_transformer',
    });
  }
  return [...counters.values()]
    .map((b) => ({
      kind: b.kind,
      connectionSide: b.connectionSide,
      hasBlockTransformer: b.hasBlockTransformer,
      count: b.count,
      totalPMw: b.totalPMw > 0 ? Math.round(b.totalPMw * 1000) / 1000 : null,
    }))
    .sort((a, b) => `${a.kind}:${a.connectionSide}`.localeCompare(`${b.kind}:${b.connectionSide}`));
}

function generatorStationRef(gen: Generator): string | null {
  return gen.station_ref ?? (typeof gen.meta?.station_ref === 'string' ? gen.meta.station_ref : null);
}

function mapGeneratorConnectionSide(gen: Generator): MiniBlockDerBadge['connectionSide'] {
  switch (gen.connection_variant) {
    case 'nn_side':
    case 'LV_BEHIND_STATION_TRANSFORMER':
      return 'nn';
    case 'block_transformer':
    case 'DEDICATED_MV_CONNECTION':
    case 'SOURCE_CONNECTION_STATION':
      return 'dedicated';
    default:
      return 'sn';
  }
}

function classifyTopologicalType(
  s: Substation,
): StationOnRunRendererProps['topologicalType'] {
  switch (s.station_type) {
    case 'terminal':
      return 'końcowa';
    case 'inline':
      return 'przelotowa';
    case 'branch':
      return 'odgałęźna';
    case 'sectional':
      return 'sekcyjna';
    default:
      return 'końcowa';
  }
}

// -----------------------------------------------------------------------------
// Cable runs (kable + linie napowietrzne SN)
// -----------------------------------------------------------------------------

/**
 * Buduje syntetyczne line_runs gdy ENM nie ma jawnie zdefiniowanych line_runs
 * ALE branches tworzą łańcuch GPZ → station → station → ... łączony przez
 * from_bus_ref/to_bus_ref. Bez tego adapter wpada w fallback "każda branch =
 * osobna prosta linia" co dla K30 (30 cables) daje 30 stacked horizontal lines
 * zamiast jednego głównego ciągu. Adresuje user feedback K30 visualization.
 */
function inferLineRunsFromBranchChain(
  snapshot: EnergyNetworkModel,
  cables: readonly Branch[],
  stations: readonly StationOnRunRendererProps[],
): Array<{
  id: string;
  segments: Array<{ segment_ref: string; order: number }>;
  stations: Array<{ substation_ref: string; order: number }>;
}> {
  if (cables.length === 0) return [];

  // GPZ bus refs (chain roots).
  const gpzBusRefs = new Set<string>();
  for (const s of snapshot.substations ?? []) {
    if (s.station_type === 'gpz') {
      for (const ref of s.bus_refs ?? []) gpzBusRefs.add(ref);
    }
  }

  // Outgoing map: from_bus_ref → cable departing from this bus.
  // GPZ section buses naming: 'gpz/{hash}/section/NNN/bus_sn'.
  // K30 sample: 'gpz/.../section/001/bus_sn' ma outgoing cable.
  const graphRuns = inferLineRunsFromMvBusGraph(snapshot, cables, stations, gpzBusRefs);
  if (graphRuns.length > 0) return graphRuns;

  const outgoing = new Map<string, Branch>();
  for (const c of cables) {
    if (typeof c.from_bus_ref === 'string') outgoing.set(c.from_bus_ref, c);
  }

  // Find chain root buses: GPZ buses that have outgoing cable, OR section_bus
  // pattern (gpz/.../section/NNN/bus_sn).
  const rootBuses: string[] = [];
  for (const busRef of outgoing.keys()) {
    if (gpzBusRefs.has(busRef) || busRef.includes('/section/') && busRef.endsWith('/bus_sn')) {
      rootBuses.push(busRef);
    }
  }
  if (rootBuses.length === 0) return [];

  // Build station-bus-ref map dla rozpoznania, która stacja jest na końcu kabla.
  const stationIds = new Set(stations.map((s) => s.id));

  const visited = new Set<string>();
  const synthRuns: ReturnType<typeof inferLineRunsFromBranchChain> = [];

  for (const rootBus of rootBuses) {
    if (visited.has(rootBus)) continue;
    const chain: Branch[] = [];
    const chainStationRefs: string[] = [];
    let currentBus: string | null = rootBus;
    let safetyCounter = 0;
    while (currentBus && outgoing.has(currentBus) && safetyCounter < 1000) {
      const cable: Branch = outgoing.get(currentBus) as Branch;
      if (visited.has(currentBus)) break;
      visited.add(currentBus);
      chain.push(cable);
      // Wyciągnij stację z to_bus_ref (pattern: 'stn/{hash}/sn_bus').
      const toBusMatch = (cable.to_bus_ref ?? '').match(/^(stn\/[a-f0-9]+)\//);
      if (toBusMatch) {
        const stationRef = `${toBusMatch[1]}/station`;
        if (stationIds.has(stationRef) && !chainStationRefs.includes(stationRef)) {
          chainStationRefs.push(stationRef);
        }
      }
      currentBus = cable.to_bus_ref ?? null;
      safetyCounter += 1;
    }
    if (chain.length > 0) {
      synthRuns.push({
        id: `synth_trunk_${synthRuns.length}`,
        segments: chain.map((c, i) => ({ segment_ref: c.ref_id, order: i + 1 })),
        stations: chainStationRefs.map((ref, i) => ({ substation_ref: ref, order: i + 1 })),
      });
    }
  }

  return synthRuns;
}

function inferLineRunsFromMvBusGraph(
  snapshot: EnergyNetworkModel,
  cables: readonly Branch[],
  stations: readonly StationOnRunRendererProps[],
  gpzBusRefs: ReadonlySet<string>,
): ReturnType<typeof inferLineRunsFromBranchChain> {
  if (stations.length === 0 || cables.length === 0) return [];

  const stationIds = new Set(stations.map((s) => s.id));
  const busVoltageByRef = new Map<string, number>();
  for (const bus of snapshot.buses ?? []) {
    if (typeof bus.ref_id === 'string' && typeof bus.voltage_kv === 'number') {
      busVoltageByRef.set(bus.ref_id, bus.voltage_kv);
    }
    if (typeof bus.id === 'string' && typeof bus.voltage_kv === 'number') {
      busVoltageByRef.set(bus.id, bus.voltage_kv);
    }
  }

  const stationByBusRef = new Map<string, string>();
  const busRefsByStationRef = new Map<string, string[]>();
  for (const substation of snapshot.substations ?? []) {
    if (!stationIds.has(substation.ref_id)) continue;
    const baseRef = substation.ref_id.endsWith('/station')
      ? substation.ref_id.slice(0, -'/station'.length)
      : substation.ref_id;
    const busRefs = uniqueStrings([
      ...(substation.bus_refs ?? []),
      `${baseRef}/sn_bus`,
      `${baseRef}/bus_sn`,
      `${baseRef}/sn_bus_in`,
      `${baseRef}/sn_bus_out`,
    ]).filter((busRef) => {
      const voltageKv = busVoltageByRef.get(busRef);
      return voltageKv === undefined || voltageKv >= 1;
    });
    busRefsByStationRef.set(substation.ref_id, busRefs);
    for (const busRef of busRefs) {
      stationByBusRef.set(busRef, substation.ref_id);
    }
  }

  const outgoing = new Map<string, Branch[]>();
  for (const cable of [...cables].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
    if (typeof cable.from_bus_ref !== 'string') continue;
    const list = outgoing.get(cable.from_bus_ref) ?? [];
    list.push(cable);
    outgoing.set(cable.from_bus_ref, list);
  }

  const stationRootBuses = [...busRefsByStationRef.values()]
    .flat()
    .filter((busRef) => outgoing.has(busRef));
  const rootBuses = uniqueStrings([...outgoing.keys(), ...stationRootBuses])
    .filter((busRef) =>
      gpzBusRefs.has(busRef)
      || (busRef.includes('/section/') && busRef.endsWith('/bus_sn'))
      || stationByBusRef.has(busRef)
    )
    .sort();
  if (rootBuses.length === 0) return [];

  const visitedSegments = new Set<string>();
  const runs: ReturnType<typeof inferLineRunsFromBranchChain> = [];
  for (const rootBus of rootBuses) {
    const chain: Branch[] = [];
    const chainStationRefs: string[] = [];
    let frontier = [rootBus];
    let safetyCounter = 0;

    while (frontier.length > 0 && safetyCounter < 1000) {
      const cable = pickNextOutgoingCable(outgoing, frontier, visitedSegments);
      if (!cable) break;
      visitedSegments.add(cable.ref_id);
      chain.push(cable);

      const stationRef = resolveStationRefForBus(cable.to_bus_ref, stationByBusRef, stationIds);
      if (stationRef && !chainStationRefs.includes(stationRef)) {
        chainStationRefs.push(stationRef);
      }
      frontier = uniqueStrings([
        ...(typeof cable.to_bus_ref === 'string' ? [cable.to_bus_ref] : []),
        ...(stationRef ? busRefsByStationRef.get(stationRef) ?? [] : []),
      ]);
      safetyCounter += 1;
    }

    if (chain.length > 0 && chainStationRefs.length > 0) {
      runs.push({
        id: `synth_trunk_${runs.length}`,
        segments: chain.map((c, i) => ({ segment_ref: c.ref_id, order: i + 1 })),
        stations: chainStationRefs.map((ref, i) => ({ substation_ref: ref, order: i + 1 })),
      });
    }
  }

  return runs;
}

function pickNextOutgoingCable(
  outgoing: ReadonlyMap<string, readonly Branch[]>,
  frontier: readonly string[],
  visitedSegments: ReadonlySet<string>,
): Branch | null {
  for (const busRef of uniqueStrings(frontier).sort()) {
    const next = (outgoing.get(busRef) ?? []).find((branch) => !visitedSegments.has(branch.ref_id));
    if (next) return next;
  }
  return null;
}

function resolveStationRefForBus(
  busRef: string | null | undefined,
  stationByBusRef: ReadonlyMap<string, string>,
  stationIds: ReadonlySet<string>,
): string | null {
  if (!busRef) return null;
  const exact = stationByBusRef.get(busRef);
  if (exact) return exact;
  const stnMatch = busRef.match(/^(stn\/[^/]+)\//);
  if (stnMatch) {
    const stationRef = `${stnMatch[1]}/station`;
    if (stationIds.has(stationRef)) return stationRef;
  }
  for (const stationRef of stationIds) {
    const baseRef = stationRef.endsWith('/station')
      ? stationRef.slice(0, -'/station'.length)
      : stationRef;
    if (busRef.startsWith(`${baseRef}/`)) return stationRef;
  }
  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function resolveLineRunOriginPoint(
  snapshot: EnergyNetworkModel,
  lineRun: SldLineRunForLayout,
  stationByRef: ReadonlyMap<string, StationOnRunRendererProps>,
  builtRuns: readonly CableRunRendererPropsLight[],
): RunPoint | null {
  if (lineRun.run_kind !== 'branch' && lineRun.run_kind !== 'ring' && lineRun.run_kind !== 'loop') {
    return null;
  }

  const originRef = typeof lineRun.branch_origin_station_ref === 'string'
    ? lineRun.branch_origin_station_ref.trim()
    : '';
  if (!originRef) return null;

  const originStation = stationByRef.get(originRef);
  if (originStation) return { x: originStation.x, y: originStation.y };

  // Origin może być refem POLA stacji (`stn/<id>/sn_field/NNN`), nie samej stacji.
  // Wyprowadź ref stacji-właściciela z prefiksu (ta sama konwencja co
  // topologyTree.busOwnerStation: `stn/<id>` → `stn/<id>/station`, `gpz/<id>` →
  // `gpz/<id>/substation`) i spróbuj ponownie. Bez tego odgałęzienie tappujące
  // z pola stacji nie znajdowało origin → spadało do slotowego Y (wisiało po
  // przesunięciu stacji do drzewa).
  const ownerStationRef = ownerStationRefFromFieldRef(originRef);
  if (ownerStationRef) {
    const ownerStation = stationByRef.get(ownerStationRef);
    if (ownerStation) return { x: ownerStation.x, y: ownerStation.y };
  }

  const branchPoint = findBranchPointByRefOrBus(snapshot, originRef);
  if (!branchPoint) return null;

  return resolveBranchPointRouteAnchor(snapshot, branchPoint, builtRuns);
}

/**
 * Ref stacji-właściciela z refu pola/szyny (konwencja prefiksu, zgodna z
 * `topologyTree.busOwnerStation`). Zwraca `null` gdy ref nie pasuje do wzorca.
 */
function ownerStationRefFromFieldRef(ref: string): string | null {
  if (ref.startsWith('stn/')) {
    const id = ref.split('/')[1];
    if (id) return `stn/${id}/station`;
  }
  if (ref.startsWith('gpz/')) {
    const id = ref.split('/')[1];
    if (id) return `gpz/${id}/substation`;
  }
  return null;
}

function findBranchPointByRefOrBus(
  snapshot: EnergyNetworkModel,
  refOrBus: string,
): BranchPointSN | null {
  return (snapshot.branch_points ?? []).find((candidate) =>
    candidate.ref_id === refOrBus || candidate.bus_ref === refOrBus,
  ) ?? null;
}

function resolveBranchPointRouteAnchor(
  snapshot: EnergyNetworkModel,
  branchPoint: BranchPointSN,
  cableRuns: readonly CableRunRendererPropsLight[],
): RunPoint | null {
  const branchByRef = new Map(
    (snapshot.branches ?? [])
      .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(snapshot, branch))
      .map((branch) => [branch.ref_id, branch]),
  );
  const mainSegmentRefs = branchPointMainSegmentRefs(branchPoint, branchByRef);
  const mainPoints = mainSegmentRefs
    .map((segmentRef) => {
      const segment = branchByRef.get(segmentRef);
      return segment ? branchPointEndpointPoint(segment, branchPoint, cableRuns) : null;
    })
    .filter((point): point is RunPoint => point !== null);
  if (mainPoints.length > 0) return averageRunPoints(mainPoints);

  const connectedPoints = [...branchByRef.values()]
    .filter((branch) =>
      branch.from_bus_ref === branchPoint.bus_ref || branch.to_bus_ref === branchPoint.bus_ref,
    )
    .map((segment) => branchPointEndpointPoint(segment, branchPoint, cableRuns))
    .filter((point): point is RunPoint => point !== null);
  return connectedPoints.length > 0 ? averageRunPoints(connectedPoints) : null;
}

function branchPointMainSegmentRefs(
  branchPoint: BranchPointSN,
  branchByRef: ReadonlyMap<string, Branch>,
): string[] {
  const runtimeRefs = getStringArray(branchPoint.runtime_inputs?.main_segment_refs)
    .filter((segmentRef) => branchByRef.has(segmentRef));
  if (runtimeRefs.length > 0) {
    return orderBranchPointMainSegmentRefs(branchPoint, runtimeRefs, branchByRef);
  }

  const occupiedBranchRefs = new Set(
    Object.values(branchPoint.branch_occupied ?? {})
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const expectedType = branchPoint.branch_point_type === 'branch_pole' ? 'line_overhead' : 'cable';
  const connected = [...branchByRef.values()]
    .filter((branch) =>
      (branch.from_bus_ref === branchPoint.bus_ref || branch.to_bus_ref === branchPoint.bus_ref)
      && branch.type === expectedType
      && !occupiedBranchRefs.has(branch.ref_id),
    )
    .map((branch) => branch.ref_id);
  return orderBranchPointMainSegmentRefs(branchPoint, connected, branchByRef);
}

function orderBranchPointMainSegmentRefs(
  branchPoint: BranchPointSN,
  segmentRefs: readonly string[],
  branchByRef: ReadonlyMap<string, Branch>,
): string[] {
  return [...new Set(segmentRefs)]
    .sort((a, b) => {
      const branchA = branchByRef.get(a);
      const branchB = branchByRef.get(b);
      const rankA = branchA ? branchPointMainSegmentRank(branchPoint, branchA) : 9;
      const rankB = branchB ? branchPointMainSegmentRank(branchPoint, branchB) : 9;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });
}

function branchPointMainSegmentRank(branchPoint: BranchPointSN, branch: Branch): number {
  const mainIn = branchPoint.ports?.MAIN_IN;
  const mainOut = branchPoint.ports?.MAIN_OUT;
  if (mainIn && branchTouchesBus(branch, mainIn)) return 0;
  if (mainOut && branchTouchesBus(branch, mainOut)) return 1;
  if (branch.to_bus_ref === branchPoint.bus_ref) return 0;
  if (branch.from_bus_ref === branchPoint.bus_ref) return 1;
  return 2;
}

function branchTouchesBus(branch: Branch, busRef: string): boolean {
  return branch.from_bus_ref === busRef || branch.to_bus_ref === busRef;
}

function branchPointEndpointPoint(
  segment: Branch,
  branchPoint: BranchPointSN,
  cableRuns: readonly CableRunRendererPropsLight[],
): RunPoint | null {
  if (segment.from_bus_ref !== branchPoint.bus_ref && segment.to_bus_ref !== branchPoint.bus_ref) {
    return null;
  }
  return findSegmentEndpointPoint(
    cableRuns,
    segment.ref_id,
    segment.to_bus_ref === branchPoint.bus_ref ? 'B' : 'A',
  );
}

function averageRunPoints(points: readonly RunPoint[]): RunPoint {
  return {
    x: Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: Math.round(points.reduce((sum, point) => sum + point.y, 0) / points.length),
  };
}

// =============================================================================
// R2 — ROUTER KORYTARZOWY (przebudowa globalna 2026-07).
//
// Diagnoza inżynierska: dotychczasowa geometria ciągów zakładała 1 segment =
// 1 stacja i „zamiatała" stacje po współrzędnej X per rząd (snake). Realny ciąg
// magistralny ma między stacjami zaciski pośrednie (kilka odcinków na jeden
// przelot), a kolejność rysowania MUSI być elektryczna (kolejność odcinków
// z line_run/korytarza), nie geometryczna. Skutkiem starego założenia były
// skosy przez stacje i etykiety odcinków rozrzucone poza własnym torem.
//
// Nowa zasada (jak w dokumentacji projektowej OSD):
//  1. KOTWICE ciągu = rzeczywiste końcówki KAŻDEGO odcinka (from_bus/to_bus →
//     stacja albo zacisk pośredni), w kolejności elektrycznej.
//  2. Zaciski pośrednie (bez stacji) dostają deterministyczne pozycje na rzędzie
//     poprzedniej znanej kotwicy, rozłożone równomiernie do następnej znanej.
//  3. Każdy przeskok kotwica→kotwica jest ORTOGONALNY: ten sam rząd = pozioma;
//     ta sama kolumna = pionowa; zmiana rzędu = wzdłuż rzędu do kolumny celu,
//     potem pion (opuszczenie w kolumnie stacji docelowej). Start z punktu
//     źródłowego (głowica pola GPZ / stacja-rodzic odgałęzienia) = pion do
//     rzędu celu, potem poziom.
//  4. Ścieżka odcinka = przeskok jego końcówek; etykieta odcinka leży na JEGO
//     torze (najdłuższy poziomy pododcinek). Tor całego ciągu = konkatenacja.
// =============================================================================

interface CorridorAnchor {
  ref: string;
  kind: 'origin' | 'station' | 'terminal';
  x: number;
  y: number;
  station?: StationOnRunRendererProps;
}

interface CorridorRunGeometry {
  readonly pathPoints: RunPoint[];
  readonly segmentPaths: NonNullable<CableRunRendererPropsLight['segmentPaths']>;
  readonly segmentLabels: NonNullable<CableRunRendererPropsLight['segmentLabels']>;
}

/** Ortogonalny przeskok kotwica→kotwica (reguła 3 routera korytarzowego). */
function corridorHopPath(from: CorridorAnchor, to: CorridorAnchor): RunPoint[] {
  const F = { x: from.x, y: from.y };
  const T = { x: to.x, y: to.y };
  if (Math.abs(F.y - T.y) <= 0.5) return [F, T];
  if (Math.abs(F.x - T.x) <= 0.5) return [F, T];
  if (from.kind === 'origin') {
    // start ciągu: pion z punktu źródłowego do rzędu celu, potem poziom
    return [F, { x: F.x, y: T.y }, T];
  }
  // zmiana rzędu między kotwicami: wzdłuż rzędu do kolumny celu, potem pion
  return [F, { x: T.x, y: F.y }, T];
}

/**
 * Zbuduj geometrię ciągu z RZECZYWISTYCH końcówek odcinków (reguły 1-4).
 * Zwraca null, gdy nie udało się zbudować łańcucha (np. brak odcinków) —
 * wtedy wołający zachowuje geometrię dotychczasową.
 */
function buildCorridorRunGeometry(
  runSegments: readonly Branch[],
  runStations: readonly StationOnRunRendererProps[],
  stationByRef: ReadonlyMap<string, StationOnRunRendererProps>,
  fieldStationByRef: ReadonlyMap<string, Substation>,
  origin: RunPoint,
): CorridorRunGeometry | null {
  if (runSegments.length === 0) return null;

  // --- reguła 1: łańcuch kotwic w kolejności elektrycznej -------------------
  const anchors: CorridorAnchor[] = [
    { ref: '__origin__', kind: 'origin', x: origin.x, y: origin.y },
  ];
  /** indeksy kotwic (from, to) per odcinek — w kolejności runSegments */
  const hops: Array<{ fromIdx: number; toIdx: number }> = [];
  let cursorRef: string | null = null;
  for (const segment of runSegments) {
    const aStationRef = resolveFieldStationRefForBus(fieldStationByRef, segment.from_bus_ref);
    const bStationRef = resolveFieldStationRefForBus(fieldStationByRef, segment.to_bus_ref);
    const aRef = aStationRef ?? segment.from_bus_ref ?? `__a_${anchors.length}`;
    const bRef = bStationRef ?? segment.to_bus_ref ?? `__b_${anchors.length}`;
    let nextRef: string;
    let nextStationRef: string | null;
    if (cursorRef === null || aRef === cursorRef) {
      nextRef = bRef;
      nextStationRef = bStationRef;
      if (cursorRef === null) cursorRef = aRef;
    } else if (bRef === cursorRef) {
      nextRef = aRef;
      nextStationRef = aStationRef;
    } else {
      // rozjazd danych (odcinek nie kontynuuje łańcucha) — kontynuuj od `to`,
      // deterministycznie; brak zgadywania pozycji (kotwica jak każda inna)
      nextRef = bRef;
      nextStationRef = bStationRef;
    }
    const station = nextStationRef ? stationByRef.get(nextStationRef) : undefined;
    anchors.push({
      ref: nextRef,
      kind: station ? 'station' : 'terminal',
      x: station ? station.x : Number.NaN,
      y: station ? stationRunY(station) : Number.NaN,
      ...(station ? { station } : {}),
    });
    hops.push({ fromIdx: anchors.length - 2, toIdx: anchors.length - 1 });
    cursorRef = nextRef;
  }

  // --- fuzja z deklaracją line_run.stations[] --------------------------------
  // Modele aliasowe wiążą stacje ciągu deklaracją stations[] (kolejność
  // elektryczna), a końcówki odcinków używają szyn-aliasów nie rozwiązywalnych
  // prefiksem. Niedopasowane stacje z deklaracji przypisujemy KOLEJNO do
  // nierozwiązanych kotwic w porządku łańcucha — bez zgadywania (obie listy są
  // w kolejności elektrycznej).
  const matchedStationIds = new Set(
    anchors.filter((a) => a.station).map((a) => a.station!.id),
  );
  const unmatchedStations = runStations.filter((st) => !matchedStationIds.has(st.id));
  if (unmatchedStations.length > 0) {
    let fuseIdx = 0;
    for (const anchor of anchors) {
      if (fuseIdx >= unmatchedStations.length) break;
      if (anchor.kind !== 'terminal') continue;
      const st = unmatchedStations[fuseIdx];
      fuseIdx += 1;
      anchor.kind = 'station';
      anchor.station = st;
      anchor.x = st.x;
      anchor.y = stationRunY(st);
    }
  }

  // --- reguła 2: pozycje zacisków pośrednich (interpolacja na rzędzie) ------
  const known = (a: CorridorAnchor): boolean => Number.isFinite(a.x) && Number.isFinite(a.y);
  let i = 1;
  while (i < anchors.length) {
    if (known(anchors[i])) {
      i += 1;
      continue;
    }
    // maksymalny blok nieznanych [i .. j-1]; K1 = anchors[i-1], K2 = anchors[j]
    let j = i;
    while (j < anchors.length && !known(anchors[j])) j += 1;
    const k1 = anchors[i - 1];
    const k2 = j < anchors.length ? anchors[j] : null;
    const count = j - i;
    if (k2) {
      const rowY = k1.kind === 'origin' ? k2.y : k1.y;
      for (let m = 0; m < count; m += 1) {
        const t = (m + 1) / (count + 1);
        anchors[i + m].x = k1.x + (k2.x - k1.x) * t;
        anchors[i + m].y = rowY;
      }
    } else if (k1.kind === 'origin') {
      // ciąg oczekujący (bez żadnej stacji): geometria zgodna z kontraktem
      // odcinka oczekującego (pendingRunEndX) — rozłożona równomiernie;
      // rząd 80 px pod głowicą.
      const total = pendingRunEndX(k1.x, count) - k1.x;
      for (let m = 0; m < count; m += 1) {
        anchors[i + m].x = k1.x + (total * (m + 1)) / count;
        anchors[i + m].y = k1.y + STATION_RUN_TRUNK_OFFSET_Y;
      }
    } else {
      // Ogon za ostatnią stacją (trasa do kolejnego zacisku): przedłuż wzdłuż
      // ORIENTACJI ostatniego przęsła — magistrala pozioma → w prawo; odczep
      // pionowy → w dół (grzebień). Orientację czytamy z poprzedniej znanej
      // kotwicy (k0 → k1). Bez tego ogon odczepu skręcał w bok (artefakt).
      let k0: CorridorAnchor | null = null;
      for (let b = i - 2; b >= 0; b -= 1) {
        if (known(anchors[b])) { k0 = anchors[b]; break; }
      }
      const vertical = k0 !== null && Math.abs(k1.y - k0.y) > Math.abs(k1.x - k0.x);
      if (vertical) {
        const dirY = k0 !== null && k1.y < k0.y ? -1 : 1;
        for (let m = 0; m < count; m += 1) {
          anchors[i + m].x = k1.x;
          anchors[i + m].y = k1.y + dirY * POST_STATION_SEGMENT_PITCH * (m + 1);
        }
      } else {
        const base = (k1.station ? stationOutputX(k1.station) : null) ?? k1.x;
        for (let m = 0; m < count; m += 1) {
          anchors[i + m].x = base + POST_STATION_SEGMENT_PITCH * (m + 1);
          anchors[i + m].y = k1.y;
        }
      }
    }
    i = j;
  }

  // --- doprecyzowanie wejść/wyjść stacji na przeskokach poziomych -----------
  // (linia zatrzymuje się na kolumnie WE, wychodzi z kolumny WY — jak na
  // schemacie dyspozytorskim; przeskoki pionowe zostają w osi stacji)
  const hopFromX = (from: CorridorAnchor, to: CorridorAnchor): number => {
    if (!from.station || Math.abs(from.y - to.y) > 0.5) return from.x;
    const exit = to.x >= from.x ? stationOutputX(from.station) : stationInputX(from.station);
    return exit ?? from.x;
  };
  const hopToX = (from: CorridorAnchor, to: CorridorAnchor): number => {
    if (!to.station) return to.x;
    // Strona wejścia (kolumna WE/WY) obowiązuje, gdy OSTATNI pododcinek
    // przeskoku jest poziomy: ten sam rząd, albo start z punktu źródłowego
    // (pion z głowicy, potem poziom do stacji). Pion kończący (zmiana rzędu
    // między kotwicami) schodzi w osi stacji.
    const sameRow = Math.abs(from.y - to.y) <= 0.5;
    const horizontalFinal = sameRow || (from.kind === 'origin' && Math.abs(from.x - to.x) > 0.5);
    if (horizontalFinal) {
      const entry = from.x <= to.x ? stationInputX(to.station) : stationOutputX(to.station);
      return entry ?? to.x;
    }
    return to.x;
  };

  const segmentPaths: Array<{
    segmentRef: string;
    pathPoints: RunPoint[];
    variant?: { insulation: 'XLPE' | 'EPR' | 'PVC' | 'PAPER' | 'OVERHEAD' | 'UNKNOWN'; conductor: 'Al' | 'Cu' | 'AlSt' | 'UNKNOWN' };
    fromTerminal?: SegmentTerminalRef;
    toTerminal?: SegmentTerminalRef;
  }> = [];
  const terminalOf = (busRef: string | null | undefined): SegmentTerminalRef => ({
    busRef: busRef ?? null,
    ownerRef: busRef
      ? (resolveFieldStationRefForBus(fieldStationByRef, busRef)
        ?? ownerStationRefFromFieldRef(busRef))
      : null,
  });
  const pathPoints: RunPoint[] = [];
  const pushPoint = (p: RunPoint): void => {
    const last = pathPoints[pathPoints.length - 1];
    if (last && Math.abs(last.x - p.x) <= 0.5 && Math.abs(last.y - p.y) <= 0.5) return;
    pathPoints.push(p);
  };
  runSegments.forEach((segment, index) => {
    const { fromIdx, toIdx } = hops[index];
    const from = anchors[fromIdx];
    const to = anchors[toIdx];
    const fx = hopFromX(from, to);
    const tx = hopToX(from, to);
    const hop = corridorHopPath(
      { ...from, x: fx },
      { ...to, x: tx },
    );
    segmentPaths.push({
      segmentRef: segment.ref_id,
      pathPoints: hop,
      variant: inferCableVariant(segment),
      // Terminal-to-terminal identity straight from the ENM branch endpoints —
      // this rendered edge provably connects from_bus → to_bus (§16, E03).
      fromTerminal: terminalOf(segment.from_bus_ref),
      toTerminal: terminalOf(segment.to_bus_ref),
    });
    hop.forEach(pushPoint);
  });

  // --- etykiety odcinków na WŁASNYM torze (dedupe jak K30-52) ---------------
  let previousLabel: string | null = null;
  const segmentLabels: Array<{ segmentRef: string; text: string; x: number; y: number }> = [];
  runSegments.forEach((segment, index) => {
    const label = buildCableRunLabel([segment], classifySegmentKind(segment));
    if (label === previousLabel) return;
    previousLabel = label;
    const point = segmentLabelPointFromPath(segmentPaths[index].pathPoints, index);
    segmentLabels.push({ segmentRef: segment.ref_id, text: label, x: point.x, y: point.y });
  });

  // Tor całego ciągu: usuń punkty współliniowe (czysta polilinia — tylko
  // zmiany kierunku), jak na rysunku technicznym.
  const collapsed: RunPoint[] = [];
  for (const p of pathPoints) {
    const n = collapsed.length;
    if (n >= 2) {
      const a = collapsed[n - 2];
      const b = collapsed[n - 1];
      const collinearH = Math.abs(a.y - b.y) <= 0.5 && Math.abs(b.y - p.y) <= 0.5;
      const collinearV = Math.abs(a.x - b.x) <= 0.5 && Math.abs(b.x - p.x) <= 0.5;
      if (collinearH || collinearV) {
        collapsed[n - 1] = p;
        continue;
      }
    }
    collapsed.push(p);
  }

  return { pathPoints: collapsed, segmentPaths, segmentLabels };
}

function buildCableRuns(
  snapshot: EnergyNetworkModel,
  logicalViews: LogicalViewsV1 | null,
  stations: readonly StationOnRunRendererProps[],
  trunkOriginByOwner?: ReadonlyMap<string, RunPoint>,
): CableRunRendererPropsLight[] {
  const branches = (snapshot.branches ?? [])
    .filter((branch) => isCableLikeBranch(branch) && isMediumVoltageNetworkBranch(snapshot, branch));
  const fieldStationByRef = collectFieldStationByRef(snapshot);
  const lineRuns = buildSldLineRunsForLayout(snapshot, fieldStationByRef);
  const stationByRef = new Map(stations.map((station) => [station.id, station]));
  const runs: CableRunRendererPropsLight[] = [];

  if (lineRuns.length > 0) {
    lineRuns.forEach((lineRun, idx) => {
      const segmentRefs = lineRunSegmentRefs(lineRun);
      // R2: odcinek deklarowany rozwija się do RZECZYWISTYCH gałęzi (połówki
      // cięte łącznikami) — geometria i etykiety liczą się z realnych odcinków.
      const runSegments = segmentRefs
        .flatMap((segmentRef) => expandSegmentRefToBranches(segmentRef, branches));
      const firstSegment = runSegments[0] ?? branches[0] ?? null;
      const segmentKind = firstSegment ? classifySegmentKind(firstSegment) : 'cable_sn';
      const runStations = [...lineRun.stations]
        .sort((a, b) => a.order - b.order)
        .map((stationRef) => stationByRef.get(stationRef.substation_ref))
        .filter((station): station is StationOnRunRendererProps => Boolean(station));
      const startingBayRef = inferRunStartingBayRef(runSegments, lineRun.starting_bay_ref);
      const sourcePoint = resolveLineRunOriginPoint(snapshot, lineRun, stationByRef, runs);
      // Y ciągu: pierwsza stacja ciągu; gdy ciąg nie ma stacji (np. odgałęzienie
      // odpinające się od stacji-rodzica) — Y punktu źródłowego (origin), by
      // odgałęzienie wyszło PRZY stacji-rodzicu (tryb drzewa), a nie spadało do
      // slotowego pasma `Y_RUN_BASE + idx×pitch` (które przy compaccie drzewa
      // wisiałoby daleko pod siecią). Slot tylko gdy brak i stacji, i origin.
      const y = runStations[0]?.y !== undefined
        ? runStations[0].y - STATION_RUN_TRUNK_OFFSET_Y
        : sourcePoint?.y !== undefined
          ? sourcePoint.y
          : Y_RUN_BASE + idx * RUN_PITCH;
      const startX = sourcePoint?.x ?? inferStartingBayOutletX(snapshot, startingBayRef, idx);
      const endX = runStations.length > 0
        ? runStations[runStations.length - 1].x + stationRunEndOffset(runStations[runStations.length - 1])
        : pendingRunEndX(startX, runSegments.length);
      const postStationSegmentCount = Math.max(0, runSegments.length - runStations.length);
      const terminalX = runStations.length > 0
        ? Math.max(endX + postStationSegmentCount * POST_STATION_SEGMENT_PITCH, startX + STATION_PITCH)
        : endX;
      const baseSegmentLabels = buildRunSegmentLabels(
        runSegments,
        runStations,
        startX,
        y,
        terminalX,
        sourcePoint,
      );
      const feederOriginLabel = inferFeederOriginLabel(snapshot, startingBayRef);
      const voltageKv = inferRunVoltageKv(snapshot, runSegments);
      const extraLabels: { segmentRef: string; text: string; x: number; y: number }[] = [];
      if (feederOriginLabel) {
        extraLabels.push({
          segmentRef: `feeder-origin-${lineRun.id}`,
          text: feederOriginLabel,
          x: startX + 14,
          y: GPZ_FIELD_CABLE_HEAD_Y + 14,
        });
      }
      if (voltageKv !== null) {
        // Etykieta napięcia przy początku ciągu, poniżej kabla (strefa mniej zatłoczona)
        const runMidX = startX + Math.max(30, (terminalX - startX) / 4);
        extraLabels.push({
          segmentRef: `voltage-kv-${lineRun.id}`,
          text: `${voltageKv} kV`,
          x: runMidX,
          y: y + 18,
        });
      }
      const segmentLabels = extraLabels.length > 0
        ? [...baseSegmentLabels, ...extraLabels]
        : baseSegmentLabels;

      const portStatus = detectMissingEndpointPorts(runSegments);
      // R2 — router korytarzowy: kotwice z RZECZYWISTYCH końcówek odcinków,
      // kolejność elektryczna, trasowanie ortogonalne (zero skosów). Gdy nie
      // da się zbudować łańcucha — uczciwy fallback do geometrii slotowej.
      // R2: początek magistrali w RZECZYWISTYM węźle GPZ (z układu drzewa),
      // nie w slotowej głowicy — magistrala musi WYCHODZIĆ z GPZ na rysunku.
      const firstSegmentOwner = runSegments.length > 0
        ? (resolveFieldStationRefForBus(fieldStationByRef, runSegments[0].from_bus_ref)
          ?? ownerStationRefFromFieldRef(runSegments[0].from_bus_ref ?? ''))
        : null;
      const gpzOrigin = firstSegmentOwner ? trunkOriginByOwner?.get(firstSegmentOwner) : undefined;
      // Ciąg resztkowy (korytarz z odcinkami spoza jawnych line_runs) może
      // zaczynać się w stacji sieci — wtedy początek toru = ta stacja, nie
      // slotowa głowica GPZ (zero „wiszących" początków).
      const firstSegmentStation = firstSegmentOwner ? stationByRef.get(firstSegmentOwner) : undefined;
      const stationOrigin = firstSegmentStation
        ? { x: firstSegmentStation.x, y: firstSegmentStation.y }
        : undefined;
      const origin = sourcePoint ?? gpzOrigin ?? stationOrigin ?? { x: startX, y: GPZ_FIELD_CABLE_HEAD_Y };
      const corridorGeometry = buildCorridorRunGeometry(
        runSegments,
        runStations,
        stationByRef,
        fieldStationByRef,
        origin,
      );
      const segmentPaths = corridorGeometry
        ? corridorGeometry.segmentPaths
        : buildRunSegmentPaths(runSegments, runStations, startX, y, terminalX, sourcePoint);
      const runPathPoints = corridorGeometry
        ? corridorGeometry.pathPoints
        : [origin, { x: startX, y }, { x: terminalX, y }];
      const effectiveSegmentLabels = corridorGeometry
        ? (extraLabels.length > 0
          ? [...corridorGeometry.segmentLabels, ...extraLabels]
          : corridorGeometry.segmentLabels)
        : segmentLabels;
      runs.push({
        id: lineRun.id,
        runKind: lineRun.run_kind,
        segmentKind,
        segmentRefs: runSegments.map((segment) => segment.ref_id),
        segmentPaths,
        label: buildCableRunLabel(runSegments.length > 0 ? runSegments : firstSegment ? [firstSegment] : [], segmentKind),
        segmentLabels: effectiveSegmentLabels,
        pendingEndpoint: !hasResolvedRunEndpoint(snapshot, runSegments, runStations),
        missingEndpointPort: portStatus.missing,
        missingPortSegmentRefs: portStatus.missingSegmentRefs,
        pathPoints: runPathPoints,
        voltageKv,
      });
    });
    return runs;
  }

  // FALLBACK A (NEW): brak line_runs ALE branches tworzą łańcuch GPZ→S→S→...
  // (≥2 cables w chain) → buduj syntetyczny main_trunk grupujący wszystkie
  // ogniwa łańcucha jako jeden logical run. Adresuje feedback K30: stacje
  // muszą być wizualnie połączone jako jeden ciąg, nie 30 disconnected lines.
  // Trigger TYLKO gdy chain ma ≥2 cables (single-cable case → legacy fallback
  // który czyta bay metadata z branch.meta.origin_bay_ref).
  const synthesizedLineRuns = inferLineRunsFromBranchChain(snapshot, branches, stations)
    .filter((lr) => lr.segments.length >= 2);
  if (synthesizedLineRuns.length > 0) {
    synthesizedLineRuns.forEach((lineRun, idx) => {
      const runSegments = lineRun.segments
        .map((seg) => branches.find((b) => b.ref_id === seg.segment_ref))
        .filter((b): b is Branch => Boolean(b));
      if (runSegments.length === 0) return;
      const runStations = lineRun.stations
        .map((sref) => stationByRef.get(sref.substation_ref))
        .filter((s): s is StationOnRunRendererProps => Boolean(s));
      const segmentKind = classifySegmentKind(runSegments[0]);
      const y = runStations[0]?.y !== undefined
        ? runStations[0].y - STATION_RUN_TRUNK_OFFSET_Y
        : Y_RUN_BASE + idx * RUN_PITCH;
      const firstBayRef = readBranchOriginBayRef(runSegments[0]);
      const startX = inferStartingBayOutletX(snapshot, firstBayRef, idx);
      const endX = runStations.length > 0
        ? runStations[runStations.length - 1].x + stationRunEndOffset(runStations[runStations.length - 1])
        : pendingRunEndX(startX, runSegments.length);
      const postStationSegmentCount = Math.max(0, runSegments.length - runStations.length);
      const terminalX = runStations.length > 0
        ? Math.max(endX + postStationSegmentCount * POST_STATION_SEGMENT_PITCH, startX + STATION_PITCH)
        : endX;
      const segmentLabels = buildRunSegmentLabels(runSegments, runStations, startX, y, terminalX);
      const segmentPaths = buildRunSegmentPaths(runSegments, runStations, startX, y, terminalX);
      const portStatus = detectMissingEndpointPorts(runSegments);
      const voltageKv = inferRunVoltageKv(snapshot, runSegments);
      // K30-10: snake routing dla synthesized line_runs (multi-row case).
      const synthUniqueYs = [...new Set(runStations.map((s) => s.y - STATION_RUN_TRUNK_OFFSET_Y))].sort((a, b) => a - b);
      let synthSnakePoints: { x: number; y: number }[];
      if (synthUniqueYs.length > 1) {
        synthSnakePoints = [{ x: startX, y: GPZ_FIELD_CABLE_HEAD_Y }, { x: startX, y: synthUniqueYs[0] }];
        synthUniqueYs.forEach((rowY, rowIdx) => {
          const stationsInRow = runStations.filter((s) => (s.y - STATION_RUN_TRUNK_OFFSET_Y) === rowY);
          if (stationsInRow.length === 0) return;
          const xs = stationsInRow.map((s) => s.x);
          const enterX = rowIdx % 2 === 0 ? Math.min(...xs) : Math.max(...xs);
          const exitX = rowIdx % 2 === 0 ? Math.max(...xs) : Math.min(...xs);
          if (rowIdx > 0) synthSnakePoints.push({ x: enterX, y: rowY });
          else synthSnakePoints[synthSnakePoints.length - 1] = { x: enterX, y: rowY };
          synthSnakePoints.push({ x: exitX, y: rowY });
        });
      } else {
        synthSnakePoints = [
          { x: startX, y: GPZ_FIELD_CABLE_HEAD_Y },
          { x: startX, y },
          { x: terminalX, y },
        ];
      }
      runs.push({
        id: lineRun.id,
        runKind: 'main_trunk',
        segmentKind,
        segmentRefs: runSegments.map((s) => s.ref_id),
        segmentPaths,
        label: buildCableRunLabel(runSegments, segmentKind),
        segmentLabels,
        pendingEndpoint: false,
        missingEndpointPort: portStatus.missing,
        missingPortSegmentRefs: portStatus.missingSegmentRefs,
        pathPoints: synthSnakePoints.length > 0 ? synthSnakePoints : [
          { x: startX, y: GPZ_FIELD_CABLE_HEAD_Y },
          { x: startX, y },
          { x: terminalX, y },
        ],
        voltageKv,
      });
    });
    return runs;
  }

  if (logicalViews && logicalViews.trunks.length > 0) {
    // Dla każdego trunku — pojedynczy widoczny ciąg główny.
    logicalViews.trunks.forEach((trunk, idx) => {
      const segments = trunk.segments
        .map((segId) => branches.find((b) => b.ref_id === segId))
        .filter((b): b is Branch => Boolean(b));
      if (segments.length === 0) return;

      const y = Y_RUN_BASE + idx * RUN_PITCH;
      const startingBayRef = inferRunStartingBayRef(segments, null);
      const xStart = inferStartingBayOutletX(snapshot, startingBayRef, idx);
      const stationsOnRun = stationsForConnectionY(stations, y);
      const xEnd = stationsOnRun.length > 0
        ? stationsOnRun[stationsOnRun.length - 1].x + stationRunEndOffset(stationsOnRun[stationsOnRun.length - 1])
        : pendingRunEndX(xStart, segments.length);
      const segmentKind = classifySegmentKind(segments[0]);
      const segmentLabels = buildRunSegmentLabels(segments, stationsOnRun, xStart, y, xEnd);
      const segmentPaths = buildRunSegmentPaths(segments, stationsOnRun, xStart, y, xEnd);

      const portStatus = detectMissingEndpointPorts(segments);
      const voltageKv = inferRunVoltageKv(snapshot, segments);
      runs.push({
        id: trunk.corridor_ref,
        runKind: 'main_trunk',
        segmentKind,
        segmentRefs: segments.map((segment) => segment.ref_id),
        segmentPaths,
        label: buildCableRunLabel(segments, segmentKind),
        segmentLabels,
        pendingEndpoint: !hasResolvedRunEndpoint(snapshot, segments, stationsOnRun),
        missingEndpointPort: portStatus.missing,
        missingPortSegmentRefs: portStatus.missingSegmentRefs,
        pathPoints: [
          { x: xStart, y: GPZ_FIELD_CABLE_HEAD_Y },
          { x: xStart, y },
          { x: xEnd, y },
        ],
        voltageKv,
      });
    });

    // Odgałęzienia (branches).
    logicalViews.branches.forEach((br, brIdx) => {
      const segments = br.segments
        .map((segId) => branches.find((b) => b.ref_id === segId))
        .filter((b): b is Branch => Boolean(b));
      if (segments.length === 0) return;
      const segmentKind = classifySegmentKind(segments[0]);
      const yBranch = Y_RUN_BASE + (logicalViews.trunks.length + brIdx) * RUN_PITCH;
      const xStart = X_STATIONS_START + brIdx * STATION_PITCH;
      const xEnd = xStart + 3 * STATION_PITCH;

      const portStatus = detectMissingEndpointPorts(segments);
      const voltageKv = inferRunVoltageKv(snapshot, segments);
      runs.push({
        id: br.branch_id,
        runKind: 'branch',
        segmentKind,
        segmentRefs: segments.map((segment) => segment.ref_id),
        segmentPaths: buildRunSegmentPaths(segments, [], xStart, yBranch, xEnd),
        label: buildCableRunLabel(segments, segmentKind),
        segmentLabels: buildRunSegmentLabels(segments, [], xStart, yBranch, xEnd),
        missingEndpointPort: portStatus.missing,
        missingPortSegmentRefs: portStatus.missingSegmentRefs,
        pathPoints: [
          { x: xStart, y: Y_RUN_BASE - 10 },
          { x: xStart, y: yBranch },
          { x: xEnd, y: yBranch },
        ],
        voltageKv,
      });
    });
    return runs;
  }

  // Tor wstępny: każda branch → osobna prosta linia (nie ma logical_views).
  branches.forEach((b, idx) => {
    const y = Y_RUN_BASE + idx * RUN_PITCH;
    const startingBayRef = readBranchOriginBayRef(b);
    const xStart = inferStartingBayOutletX(snapshot, startingBayRef, idx);
    const stationsOnRun = stationsForConnectionY(stations, y);
    const xEnd = stationsOnRun.length > 0
      ? stationsOnRun[stationsOnRun.length - 1].x + stationRunEndOffset(stationsOnRun[stationsOnRun.length - 1])
      : pendingRunEndX(xStart, 1);
    const segmentKind = classifySegmentKind(b);
    const segmentLabels = buildRunSegmentLabels([b], stationsOnRun, xStart, y, xEnd);
    const segmentPaths = buildRunSegmentPaths([b], stationsOnRun, xStart, y, xEnd);
    const portStatus = detectMissingEndpointPorts([b]);
    const voltageKv = inferRunVoltageKv(snapshot, [b]);
    runs.push({
      id: b.ref_id,
      runKind: 'main_trunk',
      segmentKind,
      segmentRefs: [b.ref_id],
      segmentPaths,
      label: buildCableRunLabel([b], segmentKind),
      segmentLabels,
      pendingEndpoint: !hasResolvedRunEndpoint(snapshot, [b], stationsOnRun),
      missingEndpointPort: portStatus.missing,
      missingPortSegmentRefs: portStatus.missingSegmentRefs,
      pathPoints: [
        { x: xStart, y: GPZ_FIELD_CABLE_HEAD_Y + idx * 4 },
        { x: xStart, y },
        { x: xEnd, y },
      ],
      voltageKv,
    });
  });

  return runs;
}

function pendingRunEndX(startX: number, segmentCount: number): number {
  return startX + PENDING_RUN_LENGTH + Math.max(0, segmentCount - 1) * 110;
}

/**
 * Wyciąga etykietę pola zasilającego (bay_number lub feeder_short_name) dla
 * etykiety początku ciągu pod głowicą kablową GPZ. Pomaga Projektantowi
 * odczytać który pole GPZ zasila który ciąg.
 */
function inferFeederOriginLabel(
  snapshot: EnergyNetworkModel,
  startingBayRef: string | null,
): string | null {
  if (!startingBayRef) return null;
  const bay = (snapshot.bays ?? []).find(
    (b) => b.ref_id === startingBayRef || b.id === startingBayRef,
  );
  return bay?.bay_number ?? bay?.feeder_short_name ?? null;
}

function inferRunVoltageKv(
  snapshot: EnergyNetworkModel,
  segments: readonly Branch[],
): number | null {
  if (segments.length === 0) return null;
  const fromBusRef = segments[0].from_bus_ref;
  const bus = (snapshot.buses ?? []).find(
    (b) => b.ref_id === fromBusRef || b.id === fromBusRef,
  );
  return bus?.voltage_kv ?? null;
}

function buildCableRunLabel(
  segments: readonly Branch[],
  segmentKind: 'cable_sn' | 'overhead_line_sn',
): string {
  const catalogLabels = distinctCatalogLabels(segments);
  const typeLabel =
    catalogLabels.length === 1
      ? catalogLabels[0]
      : catalogLabels.length > 1
        ? 'różne typy katalogowe'
        : 'brak typu katalogowego';
  void segmentKind;
  return `${typeLabel} · ${formatCableRunLength(segments)}`;
}

function segmentKindLabel(segmentKind: 'cable_sn' | 'overhead_line_sn'): string {
  return segmentKind === 'overhead_line_sn' ? 'Linia napowietrzna SN' : 'Kabel SN';
}

function formatCableRunLength(segments: readonly Branch[]): string {
  const lengthKm = totalBranchLengthKm(segments);
  if (lengthKm <= 0) return 'brak długości';
  if (lengthKm < 1) return `${Math.round(lengthKm * 1000)} m`;
  return `${formatPolishNumber(lengthKm)} km`;
}

function formatPolishNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('pl-PL', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function readBranchLengthKm(segment: Branch): number {
  const raw = (segment as unknown as Record<string, unknown>).length_km;
  return typeof raw === 'number' ? raw : Number(raw);
}

function totalBranchLengthKm(segments: readonly Branch[]): number {
  return segments.reduce((sum, segment) => {
    const value = readBranchLengthKm(segment);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
}

function buildRunSegmentLabels(
  segments: readonly Branch[],
  stationsOnRun: readonly StationOnRunRendererProps[],
  startX: number,
  y: number,
  terminalX: number,
  sourcePoint: RunPoint | null = null,
): NonNullable<CableRunRendererPropsLight['segmentLabels']> {
  // K30-52: dedupe consecutive identical labels (np. "EPR Al 1C 150 · 167 m"
  // powtarzane na każdym segmencie clutter trunk). Pokaż label tylko gdy
  // typ kablowy zmienia się względem poprzedniego segmentu, lub gdy to
  // pierwszy segment runa.
  let previousLabel: string | null = null;
  return segments.flatMap((segment, index) => {
    const label = buildCableRunLabel([segment], classifySegmentKind(segment));
    if (label === previousLabel) {
      return [];
    }
    previousLabel = label;
    const pathPoints = buildRunSegmentPathPoints(
      segments,
      stationsOnRun,
      startX,
      y,
      terminalX,
      index,
      sourcePoint,
    );
    const point = segmentLabelPointFromPath(pathPoints, index);
    return [{
      segmentRef: segment.ref_id,
      text: label,
      x: point.x,
      y: point.y,
    }];
  });
}

function buildRunSegmentPaths(
  segments: readonly Branch[],
  stationsOnRun: readonly StationOnRunRendererProps[],
  startX: number,
  y: number,
  terminalX: number,
  sourcePoint: RunPoint | null = null,
): NonNullable<CableRunRendererPropsLight['segmentPaths']> {
  return segments.map((segment, index) => {
    return {
      segmentRef: segment.ref_id,
      pathPoints: buildRunSegmentPathPoints(
        segments,
        stationsOnRun,
        startX,
        y,
        terminalX,
        index,
        sourcePoint,
      ),
      variant: inferCableVariant(segment),
    };
  });
}

function buildRunSegmentPathPoints(
  segments: readonly Branch[],
  stationsOnRun: readonly StationOnRunRendererProps[],
  startX: number,
  y: number,
  terminalX: number,
  index: number,
  sourcePoint: RunPoint | null = null,
): readonly RunPoint[] {
  const previousStation = stationsOnRun[index - 1];
  const nextStation = stationsOnRun[index];
  if (nextStation) {
    const nextDirection = stationRunDirection(nextStation, stationsOnRun);
    const toX = stationEntryX(nextStation, nextDirection) ?? terminalX;
    const toY = stationRunY(nextStation);

    if (!previousStation) {
      return [
        sourcePoint ?? { x: startX, y: GPZ_FIELD_CABLE_HEAD_Y },
        { x: startX, y: toY },
        { x: toX, y: toY },
      ];
    }

    const previousDirection = stationRunDirection(previousStation, stationsOnRun);
    const fromX = stationExitX(previousStation, previousDirection) ?? startX;
    const fromY = stationRunY(previousStation);
    if (Math.abs(fromY - toY) <= 0.5) {
      return [
        { x: fromX, y: fromY },
        { x: toX, y: toY },
      ];
    }

    const points: RunPoint[] = [
      { x: fromX, y: fromY },
      { x: fromX, y: toY },
    ];
    if (Math.abs(fromX - toX) > 0.5) {
      points.push({ x: toX, y: toY });
    }
    return points;
  }

  const anchoredSegments = Math.min(stationsOnRun.length, segments.length);
  const lastStation = anchoredSegments > 0 ? stationsOnRun[anchoredSegments - 1] : null;
  const lastDirection = lastStation ? stationRunDirection(lastStation, stationsOnRun) : 'ltr';
  const remainingStart = anchoredSegments > 0
    ? stationExitX(lastStation ?? undefined, lastDirection) ?? startX
    : startX;
  const remainingEnd = lastDirection === 'rtl'
    ? Math.min(remainingStart - STATION_PITCH, X_STATIONS_START - STATION_PITCH)
    : terminalX;
  const remainingY = lastStation ? stationRunY(lastStation) : y;
  const remainingSegments = Math.max(segments.length - anchoredSegments, 1);
  const remainingIndex = Math.max(0, index - anchoredSegments);
  const segmentPitch = (remainingEnd - remainingStart) / remainingSegments;
  const fromX = remainingStart + segmentPitch * remainingIndex;
  const toX = remainingIndex === remainingSegments - 1
    ? remainingEnd
    : remainingStart + segmentPitch * (remainingIndex + 1);
  if (!lastStation && remainingIndex === 0) {
    return [
      { x: fromX, y: GPZ_FIELD_CABLE_HEAD_Y },
      { x: fromX, y: remainingY },
      { x: toX, y: remainingY },
    ];
  }
  return [
    { x: fromX, y: remainingY },
    { x: toX, y: remainingY },
  ];
}

function stationRunY(station: StationOnRunRendererProps): number {
  return station.y - STATION_RUN_TRUNK_OFFSET_Y;
}

function stationRunDirection(
  station: StationOnRunRendererProps,
  stationsOnRun: readonly StationOnRunRendererProps[],
): 'ltr' | 'rtl' {
  const rowY = stationRunY(station);
  const rowIndex = [...new Set(stationsOnRun.map(stationRunY))]
    .sort((a, b) => a - b)
    .findIndex((candidate) => Math.abs(candidate - rowY) <= 0.5);
  return rowIndex % 2 === 1 ? 'rtl' : 'ltr';
}

function stationEntryX(
  station: StationOnRunRendererProps | undefined,
  direction: 'ltr' | 'rtl',
): number | null {
  return direction === 'rtl' ? stationOutputX(station) : stationInputX(station);
}

function stationExitX(
  station: StationOnRunRendererProps | undefined,
  direction: 'ltr' | 'rtl',
): number | null {
  return direction === 'rtl' ? stationInputX(station) : stationOutputX(station);
}

function segmentLabelPointFromPath(
  pathPoints: readonly RunPoint[],
  index: number,
): RunPoint {
  let bestStart = pathPoints[0] ?? { x: 0, y: 0 };
  let bestEnd = pathPoints[pathPoints.length - 1] ?? bestStart;
  let bestLength = -1;
  for (let pointIndex = 0; pointIndex < pathPoints.length - 1; pointIndex += 1) {
    const start = pathPoints[pointIndex];
    const end = pathPoints[pointIndex + 1];
    if (Math.abs(start.y - end.y) > 0.5) continue;
    const length = Math.abs(end.x - start.x);
    if (length > bestLength) {
      bestStart = start;
      bestEnd = end;
      bestLength = length;
    }
  }
  return {
    x: (bestStart.x + bestEnd.x) / 2,
    y: bestStart.y + (index % 2 === 0 ? -34 : 34),
  };
}

function stationInputX(station: StationOnRunRendererProps | undefined): number | null {
  if (!station) return null;
  return station.x + stationRunStartOffset(station);
}

function stationOutputX(station: StationOnRunRendererProps | undefined): number | null {
  if (!station) return null;
  return station.x + stationRunEndOffset(station);
}

function distinctCatalogLabels(segments: readonly Branch[]): string[] {
  return [...new Set(segments.map(readCatalogTypeLabel).filter((label): label is string => Boolean(label)))];
}

function stationsForConnectionY(
  stations: readonly StationOnRunRendererProps[],
  connectionY: number,
): StationOnRunRendererProps[] {
  return stations
    .filter((station) => Math.abs((station.y - STATION_RUN_TRUNK_OFFSET_Y) - connectionY) <= 0.5)
    .sort((a, b) => a.x - b.x);
}

function lineRunSegmentRefs(
  lineRun: { segments: readonly (string | { segment_ref?: string | null })[] },
): string[] {
  return lineRun.segments
    .map((segment) => typeof segment === 'string' ? segment : segment.segment_ref)
    .filter((segmentRef): segmentRef is string => Boolean(segmentRef));
}

function inferRunStartingBayRef(
  segments: readonly Branch[],
  explicitStartingBayRef: string | null | undefined,
): string | null {
  if (typeof explicitStartingBayRef === 'string' && explicitStartingBayRef.trim()) {
    return explicitStartingBayRef.trim();
  }
  return readBranchOriginBayRef(segments[0]);
}

function readBranchOriginBayRef(segment: Branch | null | undefined): string | null {
  const meta = segment?.meta;
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta.origin_bay_ref ?? meta.field_ref;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function inferStartingBayOutletX(
  snapshot: EnergyNetworkModel,
  startingBayRef: string | null,
  runIndex: number,
): number {
  const canonicalX = inferCanonicalGpzBayOutletX(snapshot, startingBayRef, runIndex);
  if (canonicalX !== null) return canonicalX;

  const gpzCount = (snapshot.substations ?? []).filter((station) => station.station_type === 'gpz').length;
  if (gpzCount > 1) {
    const gpzIndex = Math.min(Math.max(runIndex, 0), gpzCount - 1);
    return gpzXByIndex(gpzIndex) + 48;
  }

  const bays = [...(snapshot.bays ?? [])]
    .filter((bay) => bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER')
    .sort(compareBaysForSld);
  const selectedIndex = startingBayRef
    ? bays.findIndex((bay) => bay.ref_id === startingBayRef || bay.id === startingBayRef)
    : runIndex;
  const bayIndex = selectedIndex >= 0 ? selectedIndex : runIndex;
  return SECTION_X_BASE + 48 + bayIndex * 34;
}

function inferCanonicalGpzBayOutletX(
  snapshot: EnergyNetworkModel,
  startingBayRef: string | null,
  runIndex: number,
): number | null {
  const gpzStations = (snapshot.substations ?? []).filter((station) => station.station_type === 'gpz');
  const selectedBay = startingBayRef
    ? (snapshot.bays ?? []).find((bay) => bay.ref_id === startingBayRef || bay.id === startingBayRef)
    : null;
  const gpzFromBay = selectedBay
    ? gpzStations.find((station) => station.ref_id === selectedBay.substation_ref)
    : null;
  const gpz = gpzFromBay ?? gpzStations[Math.min(runIndex, Math.max(gpzStations.length - 1, 0))];
  if (!gpz) return null;
  const gpzIndex = Math.max(0, gpzStations.findIndex((station) => station.ref_id === gpz.ref_id));

  const sectionIds = (gpz.gpz_sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => section.section_id);
  if (sectionIds.length === 0) return null;

  const gpzBays = (snapshot.bays ?? [])
    .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role !== 'COUPLER');
  if (gpzBays.length === 0) return null;

  const selectedGpzBay = startingBayRef
    ? gpzBays.find((bay) => bay.ref_id === startingBayRef || bay.id === startingBayRef)
    : null;
  const fallbackFeeders = gpzBays.filter((bay) => bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER');
  const fallbackBay = fallbackFeeders[Math.max(0, runIndex % Math.max(fallbackFeeders.length, 1))] ?? gpzBays[0];
  const bay = selectedGpzBay ?? fallbackBay;
  if (!bay) return null;

  const sectionOrder = new Map(sectionIds.map((sectionId, index) => [sectionId, index]));
  const baysBySection = new Map<string, Bay[]>();
  for (const sectionId of sectionIds) baysBySection.set(sectionId, []);
  for (const item of gpzBays) {
    const key = item.gpz_section_id && baysBySection.has(item.gpz_section_id)
      ? item.gpz_section_id
      : sectionIds[0];
    baysBySection.get(key)?.push(item);
  }

  const sectionWidths = sectionIds.map((sectionId) => canonicalLvSectionWidth(baysBySection.get(sectionId)?.length ?? 0));
  const lvSwitchgearWidth =
    sectionWidths.reduce((sum, width) => sum + width, 0)
    + (sectionWidths.length - 1) * CANONICAL_LV_SECTION_COUPLER_GAP;
  const totalWidth = Math.max(
    lvSwitchgearWidth + CANONICAL_PAGE_PADDING * 2,
    CANONICAL_HEADER_WIDTH * 2 + CANONICAL_PAGE_PADDING,
  );
  const lvStartX = Math.max(CANONICAL_PAGE_PADDING, (totalWidth - lvSwitchgearWidth) / 2);

  const targetSectionId = bay.gpz_section_id && sectionOrder.has(bay.gpz_section_id)
    ? bay.gpz_section_id
    : sectionIds[0];
  const targetSectionIndex = sectionOrder.get(targetSectionId) ?? 0;
  const targetSectionBays = baysBySection.get(targetSectionId) ?? [];
  const bayIndex = Math.max(0, targetSectionBays.findIndex((item) => item.ref_id === bay.ref_id || item.id === bay.id));
  const sectionOffset =
    sectionWidths.slice(0, targetSectionIndex).reduce((sum, width) => sum + width, 0)
    + targetSectionIndex * CANONICAL_LV_SECTION_COUPLER_GAP;

  return gpzXByIndex(gpzIndex) + lvStartX + sectionOffset + 32 + bayIndex * CANONICAL_BAY_PITCH;
}

function canonicalLvSectionWidth(bayCountRaw: number): number {
  const bayCount = Math.max(bayCountRaw, 1);
  const baySpan = (bayCount - 1) * CANONICAL_BAY_PITCH + CANONICAL_BAY_WIDTH;
  return Math.max(
    CANONICAL_LV_SECTION_MIN_WIDTH,
    CANONICAL_SECTION_LABEL_WIDTH + 32 + baySpan + 32,
  );
}

function compareBaysForSld(a: Bay, b: Bay): number {
  const bySection = String(a.gpz_section_id ?? '').localeCompare(String(b.gpz_section_id ?? ''));
  if (bySection !== 0) return bySection;
  const aNumber = Number.parseFloat(String(a.bay_number ?? ''));
  const bNumber = Number.parseFloat(String(b.bay_number ?? ''));
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) {
    return aNumber - bNumber;
  }
  return a.ref_id.localeCompare(b.ref_id);
}

function stationRunEndOffset(
  station: StationOnRunRendererProps,
): number {
  const miniBlockOffsets = stationMiniBlockPortOffsets(station);
  if (miniBlockOffsets) return miniBlockOffsets[1] ?? miniBlockOffsets[0];
  switch (station.topologicalType) {
    case 'przelotowa':
    case 'sekcyjna':
      return 28;
    case 'odgałęźna':
      return 36;
    case 'końcowa':
    default:
      return 0;
  }
}

function stationRunStartOffset(
  station: StationOnRunRendererProps,
): number {
  const miniBlockOffsets = stationMiniBlockPortOffsets(station);
  if (miniBlockOffsets) return miniBlockOffsets[0];
  switch (station.topologicalType) {
    case 'przelotowa':
    case 'sekcyjna':
      return -28;
    case 'odgałęźna':
      return -36;
    case 'końcowa':
    default:
      return 0;
  }
}

function stationMiniBlockPortOffsets(
  station: StationOnRunRendererProps,
): readonly [number, number | null] | null {
  if (!station.snBays) return null;
  return miniBlockStationPortOffsets('detail', station.snBays, station.derBadges ?? []);
}

// -----------------------------------------------------------------------------
// DERs (PV/BESS/FW)
// -----------------------------------------------------------------------------

// X offset of station bus right end from station center (STATION_BUS_WIDTH / 2).
const DER_BUS_EXIT_DX = 60;
const DER_GENERIC_OFFSET_RIGHT = 80;
const DER_BLOCK_OFFSET_RIGHT = 260;
const DER_BLOCK_OFFSET_UP = 115;
const DER_BLOCK_STACK_Y = 72;
const DER_BLOCK_PCC_BAY_DX = 118;

function buildDers(
  snapshot: EnergyNetworkModel,
  stations: readonly StationOnRunRendererProps[],
): { ders: DerRendererProps[]; derConnections: ConnectionRendererProps[] } {
  const generators = snapshot.generators ?? [];
  const ders: DerRendererProps[] = [];
  const derConnections: ConnectionRendererProps[] = [];
  const stationDerIndex = new Map<string, number>();
  const generatorRefCounts = new Map<string, number>();

  for (const gen of generators) {
    if (!mapGenTypeToDerKind(gen)) continue;
    generatorRefCounts.set(gen.ref_id, (generatorRefCounts.get(gen.ref_id) ?? 0) + 1);
  }

  for (const gen of generators) {
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    const stationRef = generatorStationRef(gen);
    const stationKey = stationRef ?? '__orphan__';
    const indexAtStation = stationDerIndex.get(stationKey) ?? 0;
    stationDerIndex.set(stationKey, indexAtStation + 1);
    const station = stationRef ? stations.find((s) => s.id === stationRef) : null;
    if (station && isStationOwnedDerConnection(gen.connection_variant)) {
      continue;
    }
    const renderKey = (generatorRefCounts.get(gen.ref_id) ?? 0) > 1
      ? `${gen.ref_id}:${gen.id || indexAtStation}`
      : gen.ref_id;
    const blockTransformer = gen.blocking_transformer_ref
      ? (snapshot.transformers ?? []).find((transformer) => transformer.ref_id === gen.blocking_transformer_ref)
      : null;
    const isBlockTransformerConnection = gen.connection_variant === 'block_transformer';
    const stationMvBusY = station ? station.y - STATION_RUN_TRUNK_OFFSET_Y : Y_RUN_BASE;
    const baseX = station
      ? station.x + (isBlockTransformerConnection ? DER_BLOCK_OFFSET_RIGHT : DER_GENERIC_OFFSET_RIGHT)
      : 800;
    const baseY = station
      ? (isBlockTransformerConnection
          ? stationMvBusY - DER_BLOCK_OFFSET_UP - indexAtStation * DER_BLOCK_STACK_Y
          : station.y + 60 + indexAtStation * DER_COMPACT_STEP_Y)
      : Y_RUN_BASE + 60 + indexAtStation * DER_COMPACT_STEP_Y;

    ders.push({
      id: gen.ref_id,
      x: baseX,
      y: baseY,
      kind,
      name: gen.name || gen.ref_id,
      nominalPowerKw: gen.p_mw !== null && gen.p_mw !== undefined ? gen.p_mw * 1000 : null,
      hasBlockTransformer: isBlockTransformerConnection,
      blockTransformerLabel: formatDerBlockTransformerLabel(blockTransformer),
      connectionVariant: gen.connection_variant ?? undefined,
      ncRfgModule: gen.nc_rfg_module ?? deriveNcRfgModule(gen.p_mw),
      operatingPMw: gen.p_mw ?? null,
      operatingQMvar: gen.q_mvar ?? null,
      lod: 'compact',
    });

    // Orthogonal L-path from station bus right port down to DER (AC-07).
    if (station) {
      const busExitX = station.x + DER_BUS_EXIT_DX;
      const busExitY = isBlockTransformerConnection ? stationMvBusY : station.y;
      const pccBayX = station.x + DER_BLOCK_PCC_BAY_DX;
      derConnections.push({
        id: `der-wire-${renderKey}`,
        pathPoints: isBlockTransformerConnection
          ? [
              { x: busExitX, y: busExitY },
              { x: pccBayX, y: busExitY },
              { x: pccBayX, y: baseY },
              { x: baseX, y: baseY },
            ]
          : [
              { x: busExitX, y: busExitY },
              { x: busExitX, y: baseY },
              { x: baseX, y: baseY },
            ],
        transformerLabel: isBlockTransformerConnection
          ? formatDerBlockTransformerLabel(blockTransformer)
          : null,
        connectionKind: isBlockTransformerConnection ? 'der_block_transformer' : 'generic',
        derRef: gen.ref_id,
        transformerRef: blockTransformer?.ref_id ?? blockTransformer?.id ?? null,
        pccRef: `${gen.ref_id}/pcc`,
      });
    }
  }
  return { ders, derConnections };
}

function isStationOwnedDerConnection(
  connectionVariant: string | null | undefined,
): boolean {
  return connectionVariant === 'nn_side'
    || connectionVariant === 'lv_busbar'
    || connectionVariant === 'LV_BEHIND_STATION_TRANSFORMER';
}

function formatDerBlockTransformerLabel(transformer: Transformer | null | undefined): string | null {
  if (!transformer) return null;
  const snKva = Math.round(transformer.sn_mva * 1000);
  const voltage = `${formatKvForSld(transformer.uhv_kv)}/${formatKvForSld(transformer.ulv_kv)} kV`;
  const vectorGroup = transformer.vector_group ? ` ${transformer.vector_group}` : '';
  return `TR ${voltage} ${snKva} kVA${vectorGroup}`;
}

function formatKvForSld(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

function mapGenTypeToDerKind(gen: Generator): DerRendererProps['kind'] | null {
  switch (gen.gen_type) {
    case 'pv_inverter':
      return 'PV';
    case 'bess':
      return 'BESS';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'FW';
    default:
      return null;
  }
}

/**
 * Wyprowadza NC RFG Module z mocy nominalnej wg progów ENEA profile (enea.yaml).
 * Fallback gdy backend nie ustawił nc_rfg_module.
 * A: Mikro (<1 MW), B: Małe (1–50 MW), C: Duże (50–75 MW), D: B. duże (>75 MW).
 */
function deriveNcRfgModule(pMw: number | null | undefined): 'A' | 'B' | 'C' | 'D' | null {
  if (pMw === null || pMw === undefined || pMw <= 0) return null;
  if (pMw < 1) return 'A';
  if (pMw < 50) return 'B';
  if (pMw < 75) return 'C';
  return 'D';
}
