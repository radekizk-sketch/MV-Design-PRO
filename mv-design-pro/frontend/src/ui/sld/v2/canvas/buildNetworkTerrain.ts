/**
 * buildNetworkTerrain — adapter ENM → NetworkTerrainRenderer props (R18).
 *
 * Konstruuje pełen graph sieci terenowej:
 *   - Stacje (mini-RMU) z ENM `Substation` (filter station_type !== 'gpz')
 *   - Cable runs jako NetworkSegment[] łączące stacje przez porty IN/OUT
 *   - Layout deterministyczny (corridor-based, snap-to-grid)
 *   - Hookup do runtime (energization + flow direction + measurements)
 *
 * Reuse:
 *   - LineRunV1 z ENM jako podstawa topologii
 *   - Bay.bay_role 'IN' → port sn_input (top stacji)
 *   - Bay.bay_role 'OUT' → port sn_output (bottom stacji)
 *   - PortKind contract z core/ports.ts
 *
 * Inv 1, 2: każdy element ma domain_ref z ENM (Substation/LineRun/Bay).
 * Inv 9: brak runtime → energization='unknown', NIE 'energized' default.
 * Inv 7: layout deterministyczny (no RNG, no Date.now).
 */

import type {
  Bay,
  Branch,
  EnergyNetworkModel,
  Generator,
  LineRunV1,
  Substation,
} from '../../../../types/enm';

import type {
  CableRunKind,
  NetworkSegment,
  NetworkSegmentEndpoint,
  NetworkSegmentMeasurements,
  NetworkStation,
  NetworkTerrainRendererProps,
} from '../renderer/NetworkTerrainRenderer';

import type { StationFootprintType } from '../renderer/MiniBlockFootprints';

/* =============================================================================
   Layout constants (deterministyczne, snap-to-grid 20px)
   ============================================================================= */

const GPZ_ANCHOR_X = 1200;
const GPZ_ANCHOR_Y = 200;
const STATION_ROW_Y = 360;
const STATION_PITCH_X = 160;
const STATION_LEFT_MARGIN = 120;
const SECOND_ROW_Y = 540;
const ROW_BREAKPOINT = 6; // ile stacji w pierwszym rzędzie zanim przejdzie do drugiego

/* =============================================================================
   Public API
   ============================================================================= */

export interface BuildNetworkTerrainOptions {
  /** Override pozycji GPZ anchor (gdy GPZ jest na specyficznej pozycji canvas). */
  readonly gpzAnchor?: { readonly x: number; readonly y: number };
  /** Filter: tylko stacje pod tym GPZ (po `substation_ref` w line_runs). null → wszystkie. */
  readonly gpzRef?: string | null;
}

/**
 * Buduje NetworkTerrainRendererProps z ENM.
 *
 * Wynik: pełen graph z stacjami + cable runs + endpointami portów.
 * Każdy LineRun jest mapowany na N segmentów (gdzie N = liczba odcinków
 * między kolejnymi stacjami).
 */
export function buildNetworkTerrain(
  enm: EnergyNetworkModel,
  options: BuildNetworkTerrainOptions = {},
): Pick<NetworkTerrainRendererProps, 'gpzAnchor' | 'segments' | 'stations'> {
  const gpzAnchor = options.gpzAnchor ?? { x: GPZ_ANCHOR_X, y: GPZ_ANCHOR_Y };

  const allSubs = enm.substations ?? [];
  const allBays = enm.bays ?? [];
  const allBranches = enm.branches ?? [];
  const allGens = enm.generators ?? [];
  const allTrafos = enm.transformers ?? [];
  const lineRuns = enm.line_runs ?? [];

  /* Stacje terenowe — wszystkie poza GPZ */
  const fieldSubstations = allSubs.filter((s) => s.station_type !== 'gpz');

  /* Layout: stacje pozycjonowane wg LineRun order + breakpoint w 2 rzędach */
  const stationPositions = layoutStations(fieldSubstations, lineRuns, gpzAnchor);

  /* Build NetworkStation[] z deterministycznymi pozycjami */
  const stations: NetworkStation[] = fieldSubstations.map((sta) => {
    const stationBays = allBays.filter((b) => b.substation_ref === sta.ref_id);
    const stationTrafos = allTrafos.filter((t) => sta.transformer_refs?.includes(t.ref_id));
    const stationGens = allGens.filter((g) => g.station_ref === sta.ref_id);
    const pos = stationPositions.get(sta.ref_id) ?? { x: 0, y: 0 };

    return {
      stationRef: sta.ref_id,
      name: sta.name || '—',
      x: pos.x,
      y: pos.y,
      footprintType: mapStationTypeToFootprint(sta.station_type, stationGens.length > 0),
      snBays: stationBays.map((b) => ({
        bayRef: b.ref_id,
        fieldRole: mapBayRoleToFieldRole(b.bay_role),
        designation: b.bay_number ?? b.feeder_short_name ?? b.ref_id,
        hasMissingRequiredDevice: (b.equipment_refs?.length ?? 0) === 0,
      })),
      hasTransformer: stationTrafos.length > 0,
      transformerRatedKva: stationTrafos.length > 0
        ? stationTrafos.reduce((sum, t) => sum + (t.sn_mva * 1000), 0)
        : null,
      nnFeedersCount: stationBays.filter(
        (b) => b.bay_role === 'OUT' || b.bay_role === 'FEEDER',
      ).length,
      derBadges: buildDerBadges(stationGens),
      missingData: stationBays.some((b) => (b.equipment_refs?.length ?? 0) === 0)
        || (sta.station_type === 'mv_lv' && stationTrafos.length === 0),
      voltageActualKv: extractStationVoltage(sta, allBranches),
      voltageDropPercent: extractVoltageDrop(sta),
    };
  });

  /* Build NetworkSegment[] z LineRun graph + branches */
  const segments = buildSegments(
    lineRuns,
    fieldSubstations,
    allBays,
    allBranches,
    stationPositions,
    gpzAnchor,
  );

  return { gpzAnchor, segments, stations };
}

/* =============================================================================
   Layout — pozycje stacji deterministyczne
   ============================================================================= */

function layoutStations(
  fieldSubs: readonly Substation[],
  lineRuns: readonly LineRunV1[],
  gpzAnchor: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  /* Strategy: gdy mamy LineRun, użyj order ze stations[] do określenia kolejności.
   * Inaczej (fallback): alfabetyczny porządek stacji. */
  const orderedStations: string[] = [];

  if (lineRuns.length > 0) {
    /* Iteruj LineRuny w stable order */
    const sortedRuns = [...lineRuns].sort((a, b) => a.id.localeCompare(b.id));
    for (const run of sortedRuns) {
      const sortedStaRefs = [...run.stations]
        .sort((a, b) => a.order - b.order)
        .map((s) => s.substation_ref);
      for (const ref of sortedStaRefs) {
        if (!orderedStations.includes(ref)) orderedStations.push(ref);
      }
    }
  }

  /* Dodaj wszystkie pozostałe stacje (fallback dla nieuwzględnionych w LineRun) */
  const sortedSubs = [...fieldSubs].sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  for (const sub of sortedSubs) {
    if (!orderedStations.includes(sub.ref_id)) orderedStations.push(sub.ref_id);
  }

  /* Pozycjonowanie 2-rzędowe (breakpoint przy 6 stacjach na rząd) */
  for (let i = 0; i < orderedStations.length; i++) {
    const ref = orderedStations[i];
    const isFirstRow = i < ROW_BREAKPOINT;
    const indexInRow = isFirstRow ? i : i - ROW_BREAKPOINT;
    /* Pierwsza stacja w pierwszym rzędzie idzie najbliżej GPZ (po prawej),
     * kolejne idą w lewo. */
    const x = isFirstRow
      ? gpzAnchor.x - STATION_LEFT_MARGIN - indexInRow * STATION_PITCH_X
      : gpzAnchor.x - STATION_LEFT_MARGIN - indexInRow * STATION_PITCH_X;
    const y = isFirstRow ? STATION_ROW_Y : SECOND_ROW_Y;
    positions.set(ref, { x, y });
  }

  return positions;
}

/* =============================================================================
   Segments — kable SN łączące stacje przez porty IN/OUT
   ============================================================================= */

function buildSegments(
  lineRuns: readonly LineRunV1[],
  fieldSubs: readonly Substation[],
  allBays: readonly Bay[],
  allBranches: readonly Branch[],
  stationPositions: Map<string, { x: number; y: number }>,
  gpzAnchor: { x: number; y: number },
): NetworkSegment[] {
  const segments: NetworkSegment[] = [];

  if (lineRuns.length === 0) {
    /* Fallback: brak LineRun → bezpośrednie połączenia GPZ ↔ pierwsza stacja */
    return buildFallbackDirectSegments(fieldSubs, allBays, allBranches, stationPositions, gpzAnchor);
  }

  /* Iteruj LineRun, dla każdego buduj segmenty między kolejnymi stacjami */
  const sortedRuns = [...lineRuns].sort((a, b) => a.id.localeCompare(b.id));

  for (const run of sortedRuns) {
    const sortedStaRefs = [...run.stations]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.substation_ref);
    if (sortedStaRefs.length === 0) continue;

    /* Pierwszy segment: GPZ → pierwsza stacja */
    const firstStaRef = sortedStaRefs[0];
    const firstStaPos = stationPositions.get(firstStaRef);
    if (!firstStaPos) continue;
    const firstSta = fieldSubs.find((s) => s.ref_id === firstStaRef);
    if (!firstSta) continue;
    const firstStaInBay = findInBay(firstSta, allBays);

    segments.push({
      segmentId: `${run.id}__seg-0__gpz-to-${firstStaRef}`,
      runKind: mapRunKind(run.run_kind),
      segmentKind: 'cable_sn',
      source: {
        elementRef: 'gpz',
        bayRef: run.starting_bay_ref,
        portKind: 'sn_output',
        x: gpzAnchor.x,
        y: gpzAnchor.y,
      },
      target: {
        elementRef: firstStaRef,
        bayRef: firstStaInBay?.ref_id ?? null,
        portKind: 'sn_input',
        x: firstStaPos.x,
        y: firstStaPos.y - 28, // top of mini-RMU (port IN)
      },
      pathPoints: orthogonalPath(
        gpzAnchor.x, gpzAnchor.y,
        firstStaPos.x, firstStaPos.y - 28,
      ),
      energization: 'energized',
      flowDirection: 'forward',
      cableNumber: extractCableNumberFromRun(run, allBranches, 0),
      lengthM: extractSegmentLength(run, allBranches, 0),
      catalogRef: extractSegmentCatalogRef(run, allBranches, 0),
      measurements: null,
    });

    /* Kolejne segmenty: stacja_i → stacja_{i+1} */
    for (let i = 1; i < sortedStaRefs.length; i++) {
      const prevRef = sortedStaRefs[i - 1];
      const currRef = sortedStaRefs[i];
      const prevPos = stationPositions.get(prevRef);
      const currPos = stationPositions.get(currRef);
      if (!prevPos || !currPos) continue;
      const prevSta = fieldSubs.find((s) => s.ref_id === prevRef);
      const currSta = fieldSubs.find((s) => s.ref_id === currRef);
      if (!prevSta || !currSta) continue;
      const prevOutBay = findOutBay(prevSta, allBays);
      const currInBay = findInBay(currSta, allBays);

      const isNopSegment = run.nop_station_ref === currRef;

      segments.push({
        segmentId: `${run.id}__seg-${i}__${prevRef}-to-${currRef}`,
        runKind: isNopSegment ? 'tie_open' : mapRunKind(run.run_kind),
        segmentKind: 'cable_sn',
        source: {
          elementRef: prevRef,
          bayRef: prevOutBay?.ref_id ?? null,
          portKind: 'sn_output',
          x: prevPos.x,
          y: prevPos.y + 28, // bottom of mini-RMU (port OUT)
        },
        target: {
          elementRef: currRef,
          bayRef: currInBay?.ref_id ?? null,
          portKind: 'sn_input',
          x: currPos.x,
          y: currPos.y - 28,
        },
        pathPoints: orthogonalPath(
          prevPos.x, prevPos.y + 28,
          currPos.x, currPos.y - 28,
        ),
        energization: isNopSegment ? 'deenergized' : 'energized',
        flowDirection: isNopSegment ? 'none' : 'forward',
        cableNumber: extractCableNumberFromRun(run, allBranches, i),
        lengthM: extractSegmentLength(run, allBranches, i),
        catalogRef: extractSegmentCatalogRef(run, allBranches, i),
        measurements: null,
      });
    }
  }

  return segments;
}

function buildFallbackDirectSegments(
  fieldSubs: readonly Substation[],
  allBays: readonly Bay[],
  allBranches: readonly Branch[],
  stationPositions: Map<string, { x: number; y: number }>,
  gpzAnchor: { x: number; y: number },
): NetworkSegment[] {
  const segments: NetworkSegment[] = [];
  for (const sta of fieldSubs) {
    const pos = stationPositions.get(sta.ref_id);
    if (!pos) continue;
    const inBay = findInBay(sta, allBays);
    segments.push({
      segmentId: `fallback__gpz-to-${sta.ref_id}`,
      runKind: 'main_trunk',
      segmentKind: 'cable_sn',
      source: {
        elementRef: 'gpz',
        bayRef: null,
        portKind: 'sn_output',
        x: gpzAnchor.x,
        y: gpzAnchor.y,
      },
      target: {
        elementRef: sta.ref_id,
        bayRef: inBay?.ref_id ?? null,
        portKind: 'sn_input',
        x: pos.x,
        y: pos.y - 28,
      },
      pathPoints: orthogonalPath(gpzAnchor.x, gpzAnchor.y, pos.x, pos.y - 28),
      energization: 'unknown',
      flowDirection: 'none',
      cableNumber: null,
      lengthM: null,
      catalogRef: null,
      measurements: null,
    });
  }
  // Suppress unused
  void allBranches;
  return segments;
}

/* =============================================================================
   Helpers
   ============================================================================= */

function findInBay(sta: Substation, allBays: readonly Bay[]): Bay | null {
  /* Pole IN: bay_role='IN' lub fallback pierwszy bay sub */
  return allBays.find((b) => b.substation_ref === sta.ref_id && b.bay_role === 'IN')
    ?? allBays.find((b) => b.substation_ref === sta.ref_id)
    ?? null;
}

function findOutBay(sta: Substation, allBays: readonly Bay[]): Bay | null {
  /* Pole OUT: bay_role='OUT' lub ostatni bay sub */
  return allBays.find((b) => b.substation_ref === sta.ref_id && b.bay_role === 'OUT')
    ?? null;
}

function orthogonalPath(
  x1: number, y1: number,
  x2: number, y2: number,
): ReadonlyArray<{ x: number; y: number }> {
  /* Manhattan path 3-punktowy: source → bend → target.
   * Bend: jeśli source i target są z tego samego rzędu (równe Y) → bezpośrednia linia.
   * Inaczej: bend point (sourceX, targetY) lub (targetX, sourceY).
   */
  if (Math.abs(y1 - y2) < 1) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }
  if (Math.abs(x1 - x2) < 1) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }
  /* Bend przez punkt pośredni — wybór: prefer L-shape z poziomym pierwszym ruchem,
   * chyba że delta y jest małe (wtedy poziome końcowe). */
  const midX = (x1 + x2) / 2;
  return [
    { x: x1, y: y1 },
    { x: midX, y: y1 },
    { x: midX, y: y2 },
    { x: x2, y: y2 },
  ];
}

function mapRunKind(rk: 'main_trunk' | 'branch' | 'ring' | 'loop'): CableRunKind {
  switch (rk) {
    case 'main_trunk': return 'main_trunk';
    case 'branch': return 'branch';
    case 'ring': return 'ring_return';
    case 'loop': return 'ring_return';
  }
}

function mapBayRoleToFieldRole(role: Bay['bay_role']): NetworkStation['snBays'][number]['fieldRole'] {
  switch (role) {
    case 'IN': return 'LINE_IN';
    case 'OUT': return 'LINE_OUT';
    case 'TR': return 'TRANSFORMER';
    case 'COUPLER': return 'COUPLER';
    case 'FEEDER': return 'LINE_OUT';
    case 'MEASUREMENT': return 'MEASUREMENT';
    case 'OZE': return 'TRANSFORMER';
    default: return 'LINE_OUT';
  }
}

function mapStationTypeToFootprint(
  stationType: Substation['station_type'],
  hasDer: boolean,
): StationFootprintType {
  if (hasDer) return 'der_station';
  switch (stationType) {
    case 'switching': return 'switching_station';
    case 'customer': return 'mv_lv_customer';
    case 'inline': return 'mv_lv_inline';
    case 'branch': return 'mv_lv_branch';
    case 'sectional': return 'mv_lv_sectional';
    case 'terminal': return 'mv_lv_terminal';
    case 'mv_lv':
    default:
      return 'mv_lv_terminal';
  }
}

function buildDerBadges(gens: readonly Generator[]): NetworkStation['derBadges'] {
  const counts = { PV: 0, BESS: 0, FW: 0 };
  for (const g of gens) {
    if (g.gen_type === 'pv_inverter') counts.PV++;
    else if (g.gen_type === 'bess') counts.BESS++;
    else if (g.gen_type === 'wind_inverter' || g.gen_type?.startsWith('fw_')) counts.FW++;
  }
  return (Object.keys(counts) as Array<'PV' | 'BESS' | 'FW'>)
    .filter((k) => counts[k] > 0)
    .map((k) => ({ kind: k, count: counts[k] }));
}

function extractCableNumberFromRun(
  run: LineRunV1,
  allBranches: readonly Branch[],
  segIdx: number,
): string | null {
  /* Pobierz segment w pozycji segIdx z run.segments[].order */
  const sortedSegs = [...run.segments].sort((a, b) => a.order - b.order);
  if (segIdx >= sortedSegs.length) return null;
  const segRef = sortedSegs[segIdx].segment_ref;
  const branch = allBranches.find((b) => b.ref_id === segRef);
  /* Wyciągamy z meta jeśli jest, lub z name */
  return branch?.name ?? null;
}

function extractSegmentLength(
  run: LineRunV1,
  allBranches: readonly Branch[],
  segIdx: number,
): number | null {
  const sortedSegs = [...run.segments].sort((a, b) => a.order - b.order);
  if (segIdx >= sortedSegs.length) return null;
  const segRef = sortedSegs[segIdx].segment_ref;
  const branch = allBranches.find((b) => b.ref_id === segRef);
  if (!branch) return null;
  /* Cable / OverheadLine mają length_km */
  if ('length_km' in branch && typeof branch.length_km === 'number') {
    return branch.length_km * 1000;
  }
  return null;
}

function extractSegmentCatalogRef(
  run: LineRunV1,
  allBranches: readonly Branch[],
  segIdx: number,
): string | null {
  const sortedSegs = [...run.segments].sort((a, b) => a.order - b.order);
  if (segIdx >= sortedSegs.length) return null;
  const segRef = sortedSegs[segIdx].segment_ref;
  const branch = allBranches.find((b) => b.ref_id === segRef);
  return branch?.catalog_ref ?? null;
}

function extractStationVoltage(_sta: Substation, _branches: readonly Branch[]): number | null {
  /* Hook miejsce na load-flow integration. Bez runtime zwracamy null (Inv 9). */
  return null;
}

function extractVoltageDrop(_sta: Substation): number | null {
  /* Hook miejsce na voltage profile analysis integration. */
  return null;
}

/* =============================================================================
   Hookup measurements (R19: load flow / SC integration)
   ============================================================================= */

/**
 * Uzupełnia segments[] o `measurements` z load flow runtime.
 * Wywoływane po `buildNetworkTerrain` w SldWorkspaceContainer.
 */
export function attachSegmentMeasurements(
  segments: readonly NetworkSegment[],
  loadFlowResults: ReadonlyMap<string, NetworkSegmentMeasurements>,
): NetworkSegment[] {
  return segments.map((seg) => {
    const m = loadFlowResults.get(seg.segmentId);
    if (!m) return seg;
    return { ...seg, measurements: m };
  });
}

/**
 * Uzupełnia stations[] o voltage z load flow runtime.
 */
export function attachStationVoltage(
  stations: readonly NetworkStation[],
  voltageMap: ReadonlyMap<string, { actualKv: number; dropPercent: number }>,
): NetworkStation[] {
  return stations.map((sta) => {
    const v = voltageMap.get(sta.stationRef);
    if (!v) return sta;
    return { ...sta, voltageActualKv: v.actualKv, voltageDropPercent: v.dropPercent };
  });
}

/* =============================================================================
   Endpoint helpers (eksport dla testów + workflow integration)
   ============================================================================= */

export function getStationInputPort(station: NetworkStation): NetworkSegmentEndpoint {
  return {
    elementRef: station.stationRef,
    bayRef: station.snBays.find((b) => b.fieldRole === 'LINE_IN')?.bayRef ?? null,
    portKind: 'sn_input',
    x: station.x,
    y: station.y - 28,
  };
}

export function getStationOutputPort(station: NetworkStation): NetworkSegmentEndpoint {
  return {
    elementRef: station.stationRef,
    bayRef: station.snBays.find((b) => b.fieldRole === 'LINE_OUT')?.bayRef ?? null,
    portKind: 'sn_output',
    x: station.x,
    y: station.y + 28,
  };
}

