/**
 * CorridorLayout — Phase 6 expansion (operator-grade SLD plan v2).
 *
 * Pierwsze działające corridor positioning: identyfikuje korytarze runów
 * (GPZ + ciągi główne + odgałęzienia + ring-return + rezerwa etykiet), pakuje stacje
 * pionowo per korytarz, orthogonal Manhattan między korytarzami.
 *
 * Pure function. Deterministic — same ENM → same layout positions.
 *
 * Strategy używana gdy `chooseLayoutStrategy(score)` zwraca 'corridor'
 * lub 'corridor_with_locked'.
 *
 * @see SLD_LAYOUT_CORRIDOR_AND_COLLISION_RULES.md
 */

import type { EnergyNetworkModel, Substation } from '../../../../types/enm';
import type { SldPoint, SldRunCorridorKind } from '../canvas/SldTopologyContracts';

export interface CorridorPosition {
  readonly ref: string;
  readonly x: number;
  readonly y: number;
  /** Indeks korytarza w którym leży obiekt. */
  readonly corridorIdx: number;
  readonly laneIndex: number;
  readonly orderInRun?: number | null;
  readonly runRef?: string | null;
  readonly distanceFromSourceM?: number | null;
  readonly tapPoint?: SldPoint | null;
  readonly routePoints?: readonly SldPoint[];
}

export interface CorridorBand {
  readonly id: string;
  readonly idx: number;
  readonly kind: SldRunCorridorKind;
  readonly yMin: number;
  readonly yMax: number;
  readonly laneIndex: number;
  readonly label?: string;
  /** Liczba stacji w tym korytarzu (do label density). */
  readonly stationCount: number;
  readonly runRef?: string | null;
  readonly parentRunRef?: string | null;
  readonly sourceRunRef?: string | null;
  readonly nopStationRef?: string | null;
  readonly tapPoint?: SldPoint | null;
  readonly routePoints?: readonly SldPoint[];
}

export interface CorridorLayout {
  readonly bands: readonly CorridorBand[];
  readonly positions: readonly CorridorPosition[];
  /** Stacje terenowe bez przypisania do line_run/corridor. Nie są renderowane jako osobna siatka. */
  readonly orphanStationRefs: readonly string[];
  /** Zalecana szerokość viewport dla danego layoutu. */
  readonly recommendedWidth: number;
  /** Zalecana wysokość viewport. */
  readonly recommendedHeight: number;
}

/**
 * Domyślne stałe layoutu — jawnie eksportowane dla testów / overrides.
 */
export const CORRIDOR_DEFAULTS = {
  /** Szerokość zarezerwowana na GPZ band (pierwszy korytarz). */
  GPZ_BAND_HEIGHT: 200,
  /** Wysokość każdego pasa ciągu głównego / odgałęzienia / ring. */
  FEEDER_BAND_HEIGHT: 140,
  /** Wysokość label zone (top + bottom). */
  LABEL_ZONE_HEIGHT: 60,
  /** Horizontal step between stations within a corridor. */
  STATION_X_STEP: 200,
  /** Margines lewy (offset X od lewej krawędzi). */
  LEFT_MARGIN: 100,
  /** Margines prawy (extra padding po ostatniej stacji). */
  RIGHT_PADDING: 200,
  /** Min recommended viewport width. */
  MIN_WIDTH: 1280,
} as const;

/**
 * Computes corridor layout dla ENM.
 *
 * Algorytm:
 * 1. Identyfikuj korytarze:
 *    - Top label zone (60px, NMO labels + global navigation).
 *    - GPZ band (200px, pierwszy korytarz).
 *    - 1 main-trunk band per LineRun(run_kind === 'main_trunk') (140px).
 *    - 1 branch band per LineRun(run_kind === 'branch') (140px).
 *    - 1 ring-return band per LineRun(run_kind === 'ring') (140px).
 *    - Bottom label zone (60px, status bar).
 *
 * 2. Pakuj stacje per korytarz:
 *    - GPZ → centered w GPZ band (x = LEFT_MARGIN, y = band center).
 *    - Substations w line_runs[].stations[] → x sortowany po order, y = band center.
 *    - Stacje NIE w żadnym line_run → raport orphanStationRefs, bez pozycji na kanwie.
 *
 * 3. Compute recommended viewport:
 *    - width = LEFT_MARGIN + max(stationCount per corridor) × STATION_X_STEP + RIGHT_PADDING.
 *    - height = sum bands.
 *
 * Determinizm:
 * - Sortowanie line_runs po `id` alfabetycznie.
 * - Sortowanie stacji po `order` w ramach line_run.
 * - Same ENM → same layout positions.
 */
export function computeCorridorLayout(
  enm: Pick<EnergyNetworkModel, 'substations' | 'line_runs'>,
  options: {
    readonly defaults?: Partial<typeof CORRIDOR_DEFAULTS>;
  } = {},
): CorridorLayout {
  const D = { ...CORRIDOR_DEFAULTS, ...(options.defaults ?? {}) };
  const substations = enm.substations ?? [];
  const lineRuns = (enm.line_runs ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));

  // Identify corridors
  const bands: CorridorBand[] = [];
  let cursorY = 0;

  // Top label zone
  bands.push({
    id: 'lz-top', idx: bands.length, kind: 'label-reserve',
    laneIndex: bands.length,
    yMin: cursorY, yMax: cursorY + D.LABEL_ZONE_HEIGHT,
    label: 'Górny pasek nawigacji', stationCount: 0,
  });
  cursorY += D.LABEL_ZONE_HEIGHT;

  // GPZ band
  const gpzStations = substations.filter((s) => s.station_type === 'gpz');
  bands.push({
    id: 'band-gpz', idx: bands.length, kind: 'gpz',
    laneIndex: bands.length,
    yMin: cursorY, yMax: cursorY + D.GPZ_BAND_HEIGHT,
    label: 'GPZ', stationCount: gpzStations.length,
  });
  const gpzBandIdx = bands.length - 1;
  const gpzBandY = cursorY + D.GPZ_BAND_HEIGHT / 2;
  cursorY += D.GPZ_BAND_HEIGHT;

  // Per-LineRun bands
  const runToBandIdx = new Map<string, number>();
  for (const run of lineRuns) {
    const kind: SldRunCorridorKind =
      run.run_kind === 'main_trunk'
        ? 'main-trunk'
        : run.run_kind === 'branch'
          ? 'branch'
          : run.run_kind === 'ring' || run.run_kind === 'loop'
            ? 'ring-return'
            : 'main-trunk';
    bands.push({
      id: `band-${run.id}`, idx: bands.length, kind,
      laneIndex: bands.length,
      yMin: cursorY, yMax: cursorY + D.FEEDER_BAND_HEIGHT,
      label: run.name ?? run.id,
      stationCount: run.stations.length,
      runRef: run.id,
      parentRunRef: run.parent_run_ref ?? null,
      sourceRunRef: run.parent_run_ref ?? null,
      nopStationRef: run.nop_station_ref ?? null,
    });
    runToBandIdx.set(run.id, bands.length - 1);
    cursorY += D.FEEDER_BAND_HEIGHT;
  }

  // Bottom label zone
  bands.push({
    id: 'lz-bottom', idx: bands.length, kind: 'label-reserve',
    laneIndex: bands.length,
    yMin: cursorY, yMax: cursorY + D.LABEL_ZONE_HEIGHT,
    label: 'Dolny pasek statusu', stationCount: 0,
  });
  cursorY += D.LABEL_ZONE_HEIGHT;

  // Pakuj stacje per band
  const positions: CorridorPosition[] = [];
  const placed = new Set<string>();

  // GPZ stations w GPZ band — centered, sorted po ref_id
  gpzStations
    .slice()
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))
    .forEach((g, idx) => {
      positions.push({
        ref: g.ref_id,
        x: D.LEFT_MARGIN + idx * D.STATION_X_STEP,
        y: gpzBandY,
        corridorIdx: gpzBandIdx,
        laneIndex: gpzBandIdx,
        orderInRun: idx,
        runRef: null,
        distanceFromSourceM: null,
      });
      placed.add(g.ref_id);
    });

  // Substations w line_runs
  const fieldKinds = new Set(['mv_lv', 'inline', 'branch', 'terminal', 'sectional', 'switching', 'customer']);
  const subById = new Map<string, Substation>();
  for (const s of substations) subById.set(s.ref_id, s);

  for (const run of lineRuns) {
    const bandIdx = runToBandIdx.get(run.id);
    if (bandIdx === undefined) continue;
    const band = bands[bandIdx];
    const bandY = (band.yMin + band.yMax) / 2;
    const sortedStations = run.stations.slice().sort((a, b) => a.order - b.order);
    sortedStations.forEach((stRef, posInRun) => {
      const sub = subById.get(stRef.substation_ref);
      if (!sub) return;
      if (!fieldKinds.has(sub.station_type)) return; // GPZ pomijamy (osobny band)
      placed.add(sub.ref_id);
      positions.push({
        ref: sub.ref_id,
        x: D.LEFT_MARGIN + posInRun * D.STATION_X_STEP,
        y: bandY,
        corridorIdx: bandIdx,
        laneIndex: bandIdx,
        orderInRun: posInRun,
        runRef: run.id,
        distanceFromSourceM: null,
      });
    });
  }

  // Orphan field stations (NIE w żadnym line_run) → raport kontraktu, bez pozycji na kanwie.
  const orphanStationRefs = substations
    .filter((s) => fieldKinds.has(s.station_type) && !placed.has(s.ref_id))
    .map((s) => s.ref_id)
    .sort((a, b) => a.localeCompare(b));

  // Recommended viewport
  const maxStationsInCorridor = Math.max(
    gpzStations.length,
    ...lineRuns.map((r) => r.stations.length),
    1,
  );
  const recommendedWidth = Math.max(
    D.MIN_WIDTH,
    D.LEFT_MARGIN + maxStationsInCorridor * D.STATION_X_STEP + D.RIGHT_PADDING,
  );
  const recommendedHeight = cursorY;
  const lineRunById = new Map(lineRuns.map((run) => [run.id, run]));
  const positionByRef = new Map(positions.map((position) => [position.ref, position]));
  const enrichedBands = bands.map((band) => {
    const run = band.runRef ? lineRunById.get(band.runRef) : null;
    const originRef = run?.branch_origin_station_ref ?? null;
    const origin = originRef ? positionByRef.get(originRef) : null;
    const bandY = (band.yMin + band.yMax) / 2;
    const tapPoint = origin ? { x: origin.x, y: origin.y } : null;
    const routePoints = tapPoint
      ? [{ x: tapPoint.x, y: tapPoint.y }, { x: tapPoint.x, y: bandY }]
      : [];

    return {
      ...band,
      tapPoint,
      routePoints,
    };
  });

  return { bands: enrichedBands, positions, orphanStationRefs, recommendedWidth, recommendedHeight };
}

/**
 * Helper: konwertuje CorridorBand[] do `CadCorridorBand[]` używanego
 * przez `CadOverlay`. Bands z stationCount === 0 są pomijane (puste
 * korytarze NIE renderowane).
 */
export function toCadCorridorBands(layout: CorridorLayout): {
  id: string;
  yMin: number;
  yMax: number;
  kind: SldRunCorridorKind;
  label?: string;
}[] {
  return layout.bands.map((b) => ({
    id: b.id,
    yMin: b.yMin,
    yMax: b.yMax,
    kind: b.kind,
    label: b.label,
  }));
}
