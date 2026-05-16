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
  BayControlMode as EnmBayControlMode,
  BayRuntimeState,
  BaySwitchState,
  Cable,
  EnergyNetworkModel,
  LogicalViewsV1,
  Bus,
  Branch,
  OverheadLine,
  Substation,
  Source,
  Generator,
  Bay,
  GPZSection,
  Transformer,
} from '../../../../types/enm';
import type { GpzRendererProps } from '../renderer/GpzRenderer';
import type { SectionRendererProps } from '../renderer/SectionRenderer';
import {
  STATION_RUN_TRUNK_OFFSET_Y,
  type StationOnRunRendererProps,
} from '../renderer/StationOnRunRenderer';
import {
  MINI_BLOCK_FOOTPRINT,
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
  BayControlMode,
  EarthingSwitchState,
  GpzApparatusSwitchState,
  GpzBayDescriptor,
  GpzCouplerDescriptor,
  GpzSectionDescriptor,
} from '../renderer/GpzSwitchgearRenderer';
import { ENM_BAY_ROLE_TO_FIELD_ROLE, FIELD_ROLE } from '../domain/apparatusContracts';
import { buildSupplyPathHighlight, type SupplyPathHighlight } from './SupplyPathHighlighter';

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

function mapControlMode(mode: EnmBayControlMode | undefined): BayControlMode | undefined {
  if (mode === undefined) return undefined;
  switch (mode) {
    case 'zdalne':
      return 'remote';
    case 'miejscowe':
    case 'lokalne_zablokowane':
    case 'odstawione':
      return 'local';
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
  readonly controlMode?: BayControlMode;
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
  /* control_mode pola czytamy z CB (kanon: control_mode aparatu głównego rządzi polem). */
  const controlMode = mapControlMode(cb?.control_mode);
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
    controlMode,
    inManipulation,
  };
}

// =============================================================================
// Slot constants (deterministic layout)
// =============================================================================

const X_GPZ = 100;
const Y_GPZ = 80;
const GPZ_WIDTH = 200;

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
): number {
  const distancePx =
    cumKm > 0
      ? cumKm * PX_PER_KM
      : (posInRun + 1) * STATION_DEFAULT_PITCH;
  const proposedX = trunkStartX + distancePx;
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

const DER_OFFSET_RIGHT = 80;
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
  /** K30-41: napięcie ciągu [kV] z `inferRunVoltageKv`. Renderer dobiera tint
   *  stroke (gdy brak per-segment variant) + rysuje voltage chip przy starcie. */
  voltageKv?: number | null;
}

function isCableLikeBranch(b: Branch): boolean {
  return b.type === 'cable' || b.type === 'line_overhead';
}

/** Detekcja brakujących portów endpointu na segmentach kabla/linii. */
function detectMissingEndpointPorts(
  segments: readonly Branch[],
): { missing: boolean; missingSegmentRefs: readonly string[] } {
  const missingSegmentRefs: string[] = [];
  for (const seg of segments) {
    if (seg.type !== 'cable' && seg.type !== 'line_overhead') continue;
    const a = (seg as Cable | OverheadLine).endpoint_a_port;
    const b = (seg as Cable | OverheadLine).endpoint_b_port;
    if (!a || !b) {
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
  readonly ders: DerRendererProps[];
  /** Połączenia DER-stacja — ortogonalne ścieżki L kształtu od portu szyny stacji do DER. */
  readonly derConnections: ConnectionRendererProps[];
  /** Wynik `SupplyPathHighlighter` — czysta topologia operatorska (bez fizyki).
   *  Renderery mogą subskrybować flagę `energized` na poziomie cableRuns /
   *  sections / stations, gdy tryb operatorski „Pokaż tor zasilania" jest
   *  aktywny. */
  readonly supplyPath: SupplyPathHighlight;
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
  ders: [],
  derConnections: [],
  supplyPath: EMPTY_SUPPLY_PATH_FROZEN,
});

// =============================================================================
// Main builder
// =============================================================================

export function buildSldDataFromSnapshot(
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): SldDataPayload {
  if (!snapshot) return EMPTY_SLD_DATA;

  const gpzs = buildGpzs(snapshot);
  const sections = buildSections(snapshot);
  const stations = buildStations(snapshot);
  const cableRuns = buildCableRuns(snapshot, logicalViews, stations);
  const { ders, derConnections } = buildDers(snapshot, stations);
  const supplyPath = buildSupplyPathHighlight(snapshot);

  // Propaguj energized/openPoint na cableRuns na podstawie wyniku SupplyPath.
  const energizedBranchSet = new Set(supplyPath.energizedBranchRefs);
  const openPointSet = new Set(supplyPath.openPointBranchRefs);
  const cableRunsAnnotated = cableRuns.map((run) => {
    const refs = run.segmentRefs ?? [];
    if (refs.length === 0) {
      return run;
    }
    const allEnergized = refs.every((ref) => energizedBranchSet.has(ref));
    const anyOpenPoint = refs.some((ref) => openPointSet.has(ref));
    return { ...run, energized: allEnergized, containsOpenPoint: anyOpenPoint };
  });

  return {
    gpzs,
    sections,
    cableRuns: cableRunsAnnotated,
    stations,
    ders,
    derConnections,
    supplyPath,
  };
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

    return {
      id: gpz.ref_id,
      x: X_GPZ + idx * (GPZ_WIDTH + 80),
      y: Y_GPZ,
      name: gpz.name || gpz.ref_id,
      /* INVARIANT 9: gdy null → przekazujemy 110 jako display fallback ALE
       * z `voltageHighKvKnown=false` flag żeby renderer mógł pokazać "?". */
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
        name: section.name ?? `Sekcja HV ${section.order}`,
        sectionLabel: section.line_field_name ?? `S${section.order}`,
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
    name: sec.name ?? `Sekcja ${sec.order}`,
    sectionLabel: sec.name ?? `S${sec.order}`,
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
    controlMode: telemetry.controlMode,
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
  const materialized = branch.materialized_params;
  if (materialized && typeof materialized === 'object') {
    for (const key of [
      'type_designation',
      'type_label',
      'catalog_label',
      'display_name',
      'designation',
      'name',
      'catalog_item_id',
    ]) {
      const raw = materialized[key];
      if (typeof raw === 'string' && raw.trim()) {
        return formatCatalogTypeLabel(raw);
      }
    }
  }
  return typeof branch.catalog_ref === 'string' && branch.catalog_ref.trim()
    ? formatCatalogTypeLabel(branch.catalog_ref)
    : undefined;
}

function formatCatalogTypeLabel(raw: string): string {
  const value = raw.trim();
  const directTypePattern = /^[A-Z0-9ĄĆĘŁŃÓŚŹŻ][A-Z0-9ĄĆĘŁŃÓŚŹŻ/ .-]{2,}$/u;
  if (directTypePattern.test(value) && !value.includes(':')) return value;

  const normalized = value
    .replace(/^KABEL_SN:/i, '')
    .replace(/^LINIA_SN:/i, '')
    .replace(/@[^@]+$/u, '')
    .replace(/^cable-/i, '')
    .replace(/^line-/i, '')
    .replace(/^base-/i, '')
    .replace(/^tfk-/i, '')
    .replace(/-/gu, ' ')
    .replace(/\bxlpe\b/giu, 'XLPE')
    .replace(/\bal\b/giu, 'Al')
    .replace(/\bst\b/giu, 'St')
    .replace(/\b3c\s+(\d+)\b/iu, '3x$1')
    .replace(/\b3x(\d+)\b/iu, '3x$1')
    .trim();

  return normalized ? normalized.toUpperCase().replace(/\bAL\b/u, 'Al').replace(/\bST\b/u, 'St') : value;
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
 * wytwórców). Zwracane null sygnalizuje renderowi brak danych — UI pokaże
 * placeholder zamiast fałszywego "110 kV".
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
        number: sec.order,
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
 *  2. **Orphans**: stacje pole-wymiarowe NIE wymienione w żadnym `line_runs[]`
 *     lądują w "orphan channel" wg starego algorytmu (idx/5). Daje back-compat
 *     z legacy ENM bez `line_runs[]` oraz toleruje stacje nieprzypisane.
 *
 * Wynik: deterministyczna pozycja stacji w SLD, oparta na ENM truth (Inv 9).
 */
function buildStations(snapshot: EnergyNetworkModel): StationOnRunRendererProps[] {
  const substations = snapshot.substations ?? [];
  const corridors = snapshot.corridors ?? [];
  const stations: StationOnRunRendererProps[] = [];

  const fieldStationKinds = new Set([
    'mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer',
  ]);
  const fieldStationByRef = new Map<string, Substation>();
  for (const st of substations) {
    if (fieldStationKinds.has(st.station_type)) {
      fieldStationByRef.set(st.ref_id, st);
    }
  }

  // K30 audit loop: jeśli ENM nie ma jawnych line_runs ALE branches tworzą
  // łańcuch GPZ→S→S→..., zsynchronizuj line_runs z buildCableRuns. Bez tego
  // stacje wpadają w orphan-fallback (4×5 grid cluster), a kable są jeden
  // wspólny main_trunk — visual inconsistency.
  const explicitLineRuns = snapshot.line_runs ?? [];
  const lineRuns = explicitLineRuns.length > 0
    ? explicitLineRuns
    : (() => {
      const tempStations: StationOnRunRendererProps[] = [...fieldStationByRef.values()].map((s) => ({
        id: s.ref_id, x: 0, y: 0, name: s.name || s.ref_id,
        topologicalType: classifyTopologicalType(s), nnVoltageLevelsCount: 1,
      }));
      const cables = (snapshot.branches ?? []).filter(isCableLikeBranch);
      const synth = inferLineRunsFromBranchChain(snapshot, cables, tempStations)
        .filter((lr) => lr.segments.length >= 2);
      // Dostosuj do EnergyNetworkModel.line_runs shape (run_kind itp.)
      return synth.map((s) => ({
        id: s.id,
        run_kind: 'main_trunk' as const,
        starting_bay_ref: null,
        starting_port_ref: null,
        segments: s.segments,
        stations: s.stations,
        nop_station_ref: null,
      }));
    })();

  /* Phase 0B-4: śledzimy które stacje już zostały umieszczone przez line_runs.
   * Reszta to "orphans" (legacy fallback). */
  const placed = new Set<string>();

  const branchByRef = new Map((snapshot.branches ?? []).map((b) => [b.ref_id, b]));

  // 1. Stacje z line_runs — deterministyczne sortowanie po lineRun.id, potem station.order.
  const sortedRuns = [...lineRuns].sort((a, b) => a.id.localeCompare(b.id));
  // K30-51 LAYOUT OVERHAUL: stacje pozycjonowane przez `distanceFromGpzKm`
  // (cumKm × PX_PER_KM), nie uniform pitch. Eliminuje 800px gap GPZ→stations
  // i "klocki w gridzie" wygląd. Snake multi-row routing wyłączony domyślnie
  // (threshold=100) — bo distance-based zwykle mieści się w widocznym canvasie
  // (30 stacji × 100m avg = 3 km × 200 px/km = 600 px). Multi-row fallback
  // tylko dla extreme cases > 100 stacji.
  const STATIONS_PER_ROW_THRESHOLD = 100;
  const STATIONS_PER_ROW = 12;
  const ROW_HEIGHT = 300; // vertical space per row (station body + margin)

  sortedRuns.forEach((lr, runIdx) => {
    const sortedStations = [...lr.stations].sort((a, b) => a.order - b.order);
    const sortedSegments = [...lr.segments].sort((a, b) => a.order - b.order);
    const useMultiRow = sortedStations.length >= STATIONS_PER_ROW_THRESHOLD;
    // K30-51: track previous station X per row for collision-avoidance (min pitch).
    let previousXInRow: number | null = null;
    let currentRowIdx = 0;
    sortedStations.forEach((sref, posInRun) => {
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
      const stationCode = `S${String(sref.order).padStart(2, '0')}`;

      // Multi-row snake routing fallback (K30-10 preserved for extreme cases)
      const rowIdx = useMultiRow ? Math.floor(posInRun / STATIONS_PER_ROW) : 0;
      if (rowIdx !== currentRowIdx) {
        previousXInRow = null;
        currentRowIdx = rowIdx;
      }
      // K30-51: distance-based X. CumKm > 0 → exact position from trunk start.
      // CumKm = 0 (no segments yet) → fallback uniform pitch posInRun * default.
      const stationX = useMultiRow
        ? X_STATIONS_START + ((posInRun % STATIONS_PER_ROW)) * STATION_PITCH  // legacy K30-10
        : stationXFromCumKm(GPZ_TRUNK_HEAD_X, cumKm, posInRun, previousXInRow);
      previousXInRow = stationX;

      stations.push({
        id: sub.ref_id,
        x: stationX,
        y: Y_RUN_BASE + runIdx * RUN_PITCH + rowIdx * ROW_HEIGHT + STATION_RUN_TRUNK_OFFSET_Y,
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
        busVoltageKv: stationSldDetails.mainBusVoltageKv,
        transformerVectorGroup: stationSldDetails.transformerVectorGroup,
      });
    });
  });

  // 3. Orphan field-stations — back-compat dla stacji bez line_runs/corridor station refs.
  const orphanRunBase = sortedRuns.length + sortedCorridorsWithStations.length;
  const orphans = [...fieldStationByRef.values()]
    .filter((s) => !placed.has(s.ref_id))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  orphans.forEach((st, idx) => {
    const runIndex = orphanRunBase + Math.floor(idx / 5);
    const positionInRun = idx % 5;
    const stationSldDetails = buildStationMiniBlockDetails(snapshot, st);
    stations.push({
      id: st.ref_id,
      x: X_STATIONS_START + positionInRun * STATION_PITCH,
      y: Y_RUN_BASE + runIndex * RUN_PITCH + STATION_RUN_TRUNK_OFFSET_Y,
      name: normalizeStationName(st.name, st.ref_id),
      topologicalType: classifyTopologicalType(st),
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
      busVoltageKv: stationSldDetails.mainBusVoltageKv,
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
  const explicitBays = buildExplicitStationMiniBays(snapshot, station.ref_id);
  const explicitRoles = explicitBays.map((bay) => bay.fieldRole);
  const hasMvSideDer = derBadges.some((badge) => badge.connectionSide !== 'nn');
  const footprintType = deriveFootprintType(station.station_type, explicitRoles, hasMvSideDer);
  const snBays = explicitBays.length > 0
    ? explicitBays
    : buildExpectedStationMiniBays(station.ref_id, MINI_BLOCK_FOOTPRINT[footprintType].defaultSnBayRoles);
  const transformerRefs = collectStationTransformerRefs(snapshot, station);
  const transformerRatedKva = inferTransformerRatedKva(snapshot, transformerRefs);

  // K30-15.3: zsumuj load + DER generation per station (LV side buses)
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
        (g) => g.station_ref === station.ref_id || g.station_ref === station.id
      )
      .reduce((acc, g) => acc + (g.p_mw ?? 0) * 1000, 0)
  );

  return {
    footprintType,
    snBays,
    transformerRefs,
    hasTransformer:
      transformerRefs.length > 0 ||
      snBays.some((bay) => bay.fieldRole === FIELD_ROLE.RMU_TRANSFORMER || bay.fieldRole === FIELD_ROLE.TRANSFORMER) ||
      MINI_BLOCK_FOOTPRINT[footprintType].hasTransformer,
    // K30-19: derive count z ENM meta (nn_field_specs filtered FEEDER role)
    // jeśli dostępne. Backward-compat fallback do DER-presence heuristic.
    nnFeedersCount: countNnFeedersFromMeta(station, derBadges),
    derBadges,
    transformerRatedKva,
    totalLoadKw,
    totalGenerationKw,
    mainBusVoltageKv,
    transformerVectorGroup: inferTransformerVectorGroup(snapshot, transformerRefs),
  };
}

/**
 * K30-62: zwróć vector_group z pierwszego transformatora linkowanego ze
 * stacją. Industrial SLD pokazuje vector group per IEC 60076-1 (np. Dyn5,
 * Yd11). Brak vector_group → null (no badge rendered).
 */
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
  const refs = new Set<string>(station.transformer_refs ?? []);
  const stationBusRefs = new Set(
    (snapshot.buses ?? [])
      .filter((bus) => {
        const scopedBus = bus as Bus & { substation_ref?: string };
        return scopedBus.substation_ref === station.ref_id || scopedBus.substation_ref === station.id;
      })
      .flatMap((bus) => [bus.ref_id, bus.id].filter((value): value is string => Boolean(value))),
  );
  for (const transformer of snapshot.transformers ?? []) {
    if (
      stationBusRefs.has(transformer.hv_bus_ref)
      || stationBusRefs.has(transformer.lv_bus_ref)
      || refs.has(transformer.id)
      || refs.has(transformer.ref_id)
    ) {
      refs.add(transformer.ref_id);
    }
  }
  return [...refs].filter(Boolean).sort();
}

function buildExplicitStationMiniBays(
  snapshot: EnergyNetworkModel,
  stationRef: string,
): MiniBlockBayDescriptor[] {
  // K30-65: cache snapshot.branches by ref_id for O(1) equipment lookup
  const branchByRef = new Map(
    (snapshot.branches ?? []).map((b) => [b.ref_id, b]),
  );
  return [...(snapshot.bays ?? [])]
    .filter((bay) => bay.substation_ref === stationRef)
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
  let cb: 'closed' | 'open' | 'unknown' = 'closed';
  let ds: 'closed' | 'open' | 'unknown' = 'closed';
  const es: 'closed' | 'open' | 'unknown' = 'open';
  for (const ref of bay.equipment_refs ?? []) {
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

function buildExpectedStationMiniBays(
  stationRef: string,
  defaultRoles: readonly MiniBlockBayDescriptor['fieldRole'][],
): MiniBlockBayDescriptor[] {
  return defaultRoles.map((fieldRole, index) => ({
    bayRef: `${stationRef}/expected-bay/${index + 1}`,
    fieldRole,
    designation: expectedStationBayDesignation(fieldRole, index),
    hasMissingRequiredDevice: true,
  }));
}

function expectedStationBayDesignation(
  fieldRole: MiniBlockBayDescriptor['fieldRole'],
  index: number,
): string {
  // K30-56: OSD-compliant Q-numeracja (Q01, Q02, ...) for line bays.
  // Special roles keep semantic name (TR/SPR/POM) per OSD convention.
  if (fieldRole === FIELD_ROLE.RMU_TRANSFORMER || fieldRole === FIELD_ROLE.TRANSFORMER) return 'TR';
  if (fieldRole === FIELD_ROLE.COUPLER) return 'SPR';
  if (fieldRole === FIELD_ROLE.MEASUREMENT) return 'POM';
  // K30-56: zeropadded Q-prefix dla wszystkich line bays (Q01, Q02, ...)
  return `Q${String(index + 1).padStart(2, '0')}`;
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
  const counters = new Map<string, { kind: 'PV' | 'BESS' | 'FW'; connectionSide?: 'nn' | 'sn' | 'dedicated'; count: number; totalPMw: number }>();
  for (const gen of snapshot.generators ?? []) {
    if (generatorStationRef(gen) !== stationRef) continue;
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    const connectionSide = mapGeneratorConnectionSide(gen);
    const key = `${kind}:${connectionSide}`;
    const current = counters.get(key);
    const pMw = (typeof gen.p_mw === 'number' && Number.isFinite(gen.p_mw)) ? gen.p_mw : 0;
    counters.set(key, {
      kind,
      connectionSide,
      count: (current?.count ?? 0) + 1,
      totalPMw: (current?.totalPMw ?? 0) + pMw,
    });
  }
  return [...counters.values()]
    .map((b) => ({
      kind: b.kind,
      connectionSide: b.connectionSide,
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

function buildCableRuns(
  snapshot: EnergyNetworkModel,
  logicalViews: LogicalViewsV1 | null,
  stations: readonly StationOnRunRendererProps[],
): CableRunRendererPropsLight[] {
  const branches = (snapshot.branches ?? []).filter(isCableLikeBranch);
  const lineRuns = [...(snapshot.line_runs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const stationByRef = new Map(stations.map((station) => [station.id, station]));
  const runs: CableRunRendererPropsLight[] = [];

  if (lineRuns.length > 0) {
    lineRuns.forEach((lineRun, idx) => {
      const segmentRefs = lineRunSegmentRefs(lineRun);
      const runSegments = segmentRefs
        .map((segmentRef) => branches.find((branch) => branch.ref_id === segmentRef))
        .filter((branch): branch is Branch => Boolean(branch));
      const firstSegment = runSegments[0] ?? branches[0] ?? null;
      const segmentKind = firstSegment ? classifySegmentKind(firstSegment) : 'cable_sn';
      const runStations = [...lineRun.stations]
        .sort((a, b) => a.order - b.order)
        .map((stationRef) => stationByRef.get(stationRef.substation_ref))
        .filter((station): station is StationOnRunRendererProps => Boolean(station));
      const y = runStations[0]?.y !== undefined
        ? runStations[0].y - STATION_RUN_TRUNK_OFFSET_Y
        : Y_RUN_BASE + idx * RUN_PITCH;
      const startingBayRef = inferRunStartingBayRef(runSegments, lineRun.starting_bay_ref);
      const startX = inferStartingBayOutletX(snapshot, startingBayRef, idx);
      const endX = runStations.length > 0
        ? runStations[runStations.length - 1].x + stationRunEndOffset(runStations[runStations.length - 1])
        : pendingRunEndX(startX, runSegments.length);
      const terminalX = runStations.length > 0
        ? Math.max(endX, startX + STATION_PITCH)
        : endX;
      const baseSegmentLabels = buildRunSegmentLabels(runSegments, runStations, startX, y, terminalX);
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
      const segmentPaths = buildRunSegmentPaths(runSegments, runStations, startX, y, terminalX);

      const portStatus = detectMissingEndpointPorts(runSegments);
      // K30-10: snake routing pathPoints przy multi-row layout. Jeśli stations
      // są w ≥2 rows (detected by unique Y values), buduj zigzag path z U-turns.
      const uniqueYs = [...new Set(runStations.map((s) => s.y - STATION_RUN_TRUNK_OFFSET_Y))].sort((a, b) => a - b);
      let snakePoints: { x: number; y: number }[];
      if (uniqueYs.length > 1) {
        // Stacje pogrupowane per row Y. Per row: cable goes left↔right zgodnie z
        // station X positions (snake reverses kierunek w parzystych rzędach).
        snakePoints = [{ x: startX, y: GPZ_FIELD_CABLE_HEAD_Y }, { x: startX, y: uniqueYs[0] }];
        uniqueYs.forEach((rowY, rowIdx) => {
          const stationsInRow = runStations.filter((s) => (s.y - STATION_RUN_TRUNK_OFFSET_Y) === rowY);
          if (stationsInRow.length === 0) return;
          const xs = stationsInRow.map((s) => s.x);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          // Cable enters row z lewej (rowIdx parzysty) lub prawej (rowIdx nieparzysty) — snake direction
          const enterX = rowIdx % 2 === 0 ? minX : maxX;
          const exitX = rowIdx % 2 === 0 ? maxX : minX;
          // jeśli to nie pierwszy row, dodaj vertical jump z poprzedniej Y
          if (rowIdx > 0) snakePoints.push({ x: enterX, y: rowY });
          else snakePoints[snakePoints.length - 1] = { x: enterX, y: rowY };
          // horizontal traverse
          snakePoints.push({ x: exitX, y: rowY });
        });
      } else {
        snakePoints = [
          { x: startX, y: GPZ_FIELD_CABLE_HEAD_Y },
          { x: startX, y },
          { x: terminalX, y },
        ];
      }
      runs.push({
        id: lineRun.id,
        runKind: lineRun.run_kind,
        segmentKind,
        segmentRefs: runSegments.map((segment) => segment.ref_id),
        segmentPaths,
        label: buildCableRunLabel(runSegments.length > 0 ? runSegments : firstSegment ? [firstSegment] : [], segmentKind),
        segmentLabels,
        pendingEndpoint: runStations.length === 0,
        missingEndpointPort: portStatus.missing,
        missingPortSegmentRefs: portStatus.missingSegmentRefs,
        pathPoints: snakePoints,
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
      const terminalX = runStations.length > 0
        ? Math.max(endX, startX + STATION_PITCH)
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
        pendingEndpoint: stationsOnRun.length === 0,
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
      pendingEndpoint: stationsOnRun.length === 0,
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
    const { fromX, toX } = runSegmentXBounds(segments, stationsOnRun, startX, terminalX, index);
    return [{
      segmentRef: segment.ref_id,
      text: label,
      x: (fromX + toX) / 2,
      y: y + (index % 2 === 0 ? -12 : 18),
    }];
  });
}

function buildRunSegmentPaths(
  segments: readonly Branch[],
  stationsOnRun: readonly StationOnRunRendererProps[],
  startX: number,
  y: number,
  terminalX: number,
): NonNullable<CableRunRendererPropsLight['segmentPaths']> {
  return segments.map((segment, index) => {
    const { fromX, toX } = runSegmentXBounds(segments, stationsOnRun, startX, terminalX, index);
    const pathPoints = index === 0
      ? [
          { x: fromX, y: GPZ_FIELD_CABLE_HEAD_Y },
          { x: fromX, y },
          { x: toX, y },
        ]
      : [
          { x: fromX, y },
          { x: toX, y },
        ];
    return {
      segmentRef: segment.ref_id,
      pathPoints,
      variant: inferCableVariant(segment),
    };
  });
}

function runSegmentXBounds(
  segments: readonly Branch[],
  stationsOnRun: readonly StationOnRunRendererProps[],
  startX: number,
  terminalX: number,
  index: number,
): { fromX: number; toX: number } {
  const previousStation = stationsOnRun[index - 1];
  const nextStation = stationsOnRun[index];
  if (nextStation) {
    const fromX = previousStation ? stationOutputX(previousStation) ?? startX : startX;
    const toX = stationInputX(nextStation) ?? terminalX;
    return { fromX, toX: Math.max(fromX, toX) };
  }

  const anchoredSegments = Math.min(stationsOnRun.length, segments.length);
  const remainingStart = anchoredSegments > 0
    ? stationOutputX(stationsOnRun[anchoredSegments - 1]) ?? startX
    : startX;
  const remainingSegments = Math.max(segments.length - anchoredSegments, 1);
  const remainingIndex = Math.max(0, index - anchoredSegments);
  const segmentPitch = Math.max(40, (terminalX - remainingStart) / remainingSegments);
  const fromX = remainingStart + segmentPitch * remainingIndex;
  const toX = remainingIndex === remainingSegments - 1
    ? terminalX
    : remainingStart + segmentPitch * (remainingIndex + 1);
  return { fromX, toX };
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
  lineRun: NonNullable<EnergyNetworkModel['line_runs']>[number],
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

  const bays = [...(snapshot.bays ?? [])]
    .filter((bay) => bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER')
    .sort(compareBaysForSld);
  const selectedIndex = startingBayRef
    ? Math.max(0, bays.findIndex((bay) => bay.ref_id === startingBayRef || bay.id === startingBayRef))
    : runIndex;
  const bayIndex = selectedIndex >= 0 ? selectedIndex : runIndex;
  return SECTION_X_BASE + 48 + bayIndex * 34;
}

function inferCanonicalGpzBayOutletX(
  snapshot: EnergyNetworkModel,
  startingBayRef: string | null,
  runIndex: number,
): number | null {
  const gpz = (snapshot.substations ?? []).find((station) => station.station_type === 'gpz');
  if (!gpz) return null;

  const sectionIds = (gpz.gpz_sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => section.section_id);
  if (sectionIds.length === 0) return null;

  const gpzBays = (snapshot.bays ?? [])
    .filter((bay) => bay.substation_ref === gpz.ref_id && bay.bay_role !== 'COUPLER');
  if (gpzBays.length === 0) return null;

  const selectedBay = startingBayRef
    ? gpzBays.find((bay) => bay.ref_id === startingBayRef || bay.id === startingBayRef)
    : null;
  const fallbackFeeders = gpzBays.filter((bay) => bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER');
  const fallbackBay = fallbackFeeders[Math.max(0, runIndex % Math.max(fallbackFeeders.length, 1))] ?? gpzBays[0];
  const bay = selectedBay ?? fallbackBay;
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

  return X_GPZ + lvStartX + sectionOffset + 32 + bayIndex * CANONICAL_BAY_PITCH;
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

function buildDers(
  snapshot: EnergyNetworkModel,
  stations: readonly StationOnRunRendererProps[],
): { ders: DerRendererProps[]; derConnections: ConnectionRendererProps[] } {
  const generators = snapshot.generators ?? [];
  const ders: DerRendererProps[] = [];
  const derConnections: ConnectionRendererProps[] = [];
  const stationDerIndex = new Map<string, number>();

  for (const gen of generators) {
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    const stationRef = generatorStationRef(gen);
    const stationKey = stationRef ?? '__orphan__';
    const indexAtStation = stationDerIndex.get(stationKey) ?? 0;
    stationDerIndex.set(stationKey, indexAtStation + 1);
    const station = stationRef ? stations.find((s) => s.id === stationRef) : null;
    const baseX = station ? station.x + DER_OFFSET_RIGHT : 800;
    const baseY = (station ? station.y + 60 : Y_RUN_BASE + 60) + indexAtStation * DER_COMPACT_STEP_Y;

    ders.push({
      id: gen.ref_id,
      x: baseX,
      y: baseY,
      kind,
      name: gen.name || gen.ref_id,
      nominalPowerKw: gen.p_mw !== null && gen.p_mw !== undefined ? gen.p_mw * 1000 : null,
      hasBlockTransformer: gen.connection_variant === 'block_transformer',
      connectionVariant: gen.connection_variant ?? undefined,
      ncRfgModule: gen.nc_rfg_module ?? deriveNcRfgModule(gen.p_mw),
      operatingPMw: gen.p_mw ?? null,
      operatingQMvar: gen.q_mvar ?? null,
      lod: 'compact',
    });

    // Orthogonal L-path from station bus right port down to DER (AC-07).
    if (station) {
      const busExitX = station.x + DER_BUS_EXIT_DX;
      const busExitY = station.y;
      derConnections.push({
        id: `der-wire-${gen.ref_id}`,
        pathPoints: [
          { x: busExitX, y: busExitY },
          { x: busExitX, y: baseY },
          { x: baseX, y: baseY },
        ],
      });
    }
  }
  return { ders, derConnections };
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
