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
  EnergyNetworkModel,
  LogicalViewsV1,
  Bus,
  Branch,
  Substation,
  Source,
  Generator,
} from '../../../../types/enm';
import type { GpzRendererProps } from '../renderer/GpzRenderer';
import type { SectionRendererProps } from '../renderer/SectionRenderer';
import type { StationOnRunRendererProps } from '../renderer/StationOnRunRenderer';
import type { DerRendererProps } from '../renderer/DerRenderer';

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

const Y_RUN_BASE = 320;
const RUN_PITCH = 110;
const X_STATIONS_START = 200;
const STATION_PITCH = 180;

const DER_OFFSET_RIGHT = 80;

// =============================================================================
// Cable/line run helpers
// =============================================================================

interface CableRunRendererPropsLight {
  id: string;
  runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  pathPoints: ReadonlyArray<{ x: number; y: number }>;
  segmentKind: 'cable_sn' | 'overhead_line_sn';
}

function isCableLikeBranch(b: Branch): boolean {
  return b.type === 'cable' || b.type === 'line_overhead';
}

function classifySegmentKind(b: Branch): 'cable_sn' | 'overhead_line_sn' {
  return b.type === 'cable' ? 'cable_sn' : 'overhead_line_sn';
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
}

const EMPTY_SLD_DATA: SldDataPayload = Object.freeze({
  gpzs: [],
  sections: [],
  cableRuns: [],
  stations: [],
  ders: [],
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
  const cableRuns = buildCableRuns(snapshot, logicalViews);
  const ders = buildDers(snapshot, stations);

  return { gpzs, sections, cableRuns, stations, ders };
}

// -----------------------------------------------------------------------------
// GPZ
// -----------------------------------------------------------------------------

function buildGpzs(snapshot: EnergyNetworkModel): GpzRendererProps[] {
  const substations = snapshot.substations ?? [];
  const sources = snapshot.sources ?? [];
  const buses = snapshot.buses ?? [];

  // Każda stacja station_type='gpz' renderowana jako blok.
  const gpzStations = substations.filter((s) => s.station_type === 'gpz');

  return gpzStations.map((gpz, idx) => {
    const associatedSource = findSourceForGpz(sources, gpz);
    const lvBus = findFirstBusByRefs(buses, gpz.bus_refs);
    const lvVoltageKv = lvBus?.voltage_kv ?? 15;
    void associatedSource;
    return {
      id: gpz.ref_id,
      x: X_GPZ + idx * (GPZ_WIDTH + 80),
      y: Y_GPZ,
      name: gpz.name || gpz.ref_id,
      voltageHighKv: 110,
      voltageLowKv: lvVoltageKv,
    };
  });
}

function findSourceForGpz(sources: readonly Source[], gpz: Substation): Source | null {
  return (
    sources.find((s) => s.substation_ref === gpz.ref_id || gpz.bus_refs.includes(s.bus_ref)) ?? null
  );
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

function buildStations(snapshot: EnergyNetworkModel): StationOnRunRendererProps[] {
  const substations = snapshot.substations ?? [];
  const stations: StationOnRunRendererProps[] = [];

  // Stacje typu mv_lv / inline / branch / terminal / sectional → wzdłuż ciągu.
  const fieldStations = substations.filter((s) =>
    ['mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer'].includes(
      s.station_type,
    ),
  );

  fieldStations.forEach((st, idx) => {
    const runIndex = Math.floor(idx / 5); // 5 stacji per ciąg, potem nowy kanał Y
    const positionInRun = idx % 5;
    stations.push({
      id: st.ref_id,
      x: X_STATIONS_START + positionInRun * STATION_PITCH,
      y: Y_RUN_BASE + runIndex * RUN_PITCH,
      name: st.name || st.ref_id,
      topologicalType: classifyTopologicalType(st),
      nnVoltageLevelsCount: 1,
    });
  });

  return stations;
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

function buildCableRuns(
  snapshot: EnergyNetworkModel,
  logicalViews: LogicalViewsV1 | null,
): CableRunRendererPropsLight[] {
  const branches = (snapshot.branches ?? []).filter(isCableLikeBranch);
  const runs: CableRunRendererPropsLight[] = [];

  if (logicalViews && logicalViews.trunks.length > 0) {
    // Dla każdego trunku — pojedynczy widoczny ciąg główny.
    logicalViews.trunks.forEach((trunk, idx) => {
      const segments = trunk.segments
        .map((segId) => branches.find((b) => b.ref_id === segId))
        .filter((b): b is Branch => Boolean(b));
      if (segments.length === 0) return;

      const y = Y_RUN_BASE + idx * RUN_PITCH;
      const xStart = SECTION_X_BASE + 60;
      const xEnd = X_STATIONS_START + 5 * STATION_PITCH;
      const segmentKind = classifySegmentKind(segments[0]);

      runs.push({
        id: trunk.corridor_ref,
        runKind: 'main_trunk',
        segmentKind,
        pathPoints: [
          { x: xStart, y: Y_SECTIONS + 40 },
          { x: xStart, y },
          { x: xEnd, y },
        ],
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

      runs.push({
        id: br.branch_id,
        runKind: 'branch',
        segmentKind,
        pathPoints: [
          { x: xStart, y: Y_RUN_BASE - 10 },
          { x: xStart, y: yBranch },
          { x: xStart + 3 * STATION_PITCH, y: yBranch },
        ],
      });
    });
    return runs;
  }

  // Fallback: każda branch → osobna prosta linia (nie ma logical_views).
  branches.forEach((b, idx) => {
    runs.push({
      id: b.ref_id,
      runKind: 'main_trunk',
      segmentKind: classifySegmentKind(b),
      pathPoints: [
        { x: SECTION_X_BASE + 60, y: Y_SECTIONS + 40 + idx * 4 },
        { x: SECTION_X_BASE + 60, y: Y_RUN_BASE + idx * RUN_PITCH },
        { x: X_STATIONS_START + 4 * STATION_PITCH, y: Y_RUN_BASE + idx * RUN_PITCH },
      ],
    });
  });

  return runs;
}

// -----------------------------------------------------------------------------
// DERs (PV/BESS/FW)
// -----------------------------------------------------------------------------

function buildDers(
  snapshot: EnergyNetworkModel,
  stations: readonly StationOnRunRendererProps[],
): DerRendererProps[] {
  const generators = snapshot.generators ?? [];
  const ders: DerRendererProps[] = [];

  for (const gen of generators) {
    const kind = mapGenTypeToDerKind(gen);
    if (!kind) continue;
    const stationRef = gen.station_ref ?? null;
    const station = stationRef ? stations.find((s) => s.id === stationRef) : null;
    const baseX = station ? station.x + DER_OFFSET_RIGHT : 800;
    const baseY = station ? station.y + 60 : Y_RUN_BASE + 60;

    ders.push({
      id: gen.ref_id,
      x: baseX,
      y: baseY,
      kind,
      name: gen.name || gen.ref_id,
      nominalPowerKw: (gen.p_mw ?? 0) * 1000,
      hasBlockTransformer: gen.connection_variant === 'block_transformer',
    });
  }
  return ders;
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
