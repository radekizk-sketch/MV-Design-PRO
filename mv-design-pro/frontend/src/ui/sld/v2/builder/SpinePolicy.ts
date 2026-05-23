/**
 * SpinePolicy — koncepcja ciągu SN jako poziomego korytarza ("spine").
 *
 * Spine = jeden line_run (run_kind === 'main_trunk') reprezentowany pojedynczą
 * poziomą osią Y. Stacje/ZKSN/słupy są węzłami na osi (SpineNode), odgałęzienia
 * do branch run-ów są reprezentowane jako SpineBranch.
 *
 * Pure function. Deterministic — same ENM → same SpineModel.
 *
 * Buduje się NA CorridorLayout — używa już wyznaczonych pozycji i band Y.
 *
 * Cel produktowy:
 * - Czytelna topologia >100 elementów.
 * - LOD overview pokazuje tylko spine + duże węzły.
 * - LOD detail rozwija pojedyncze stacje / pola / słupy.
 */

import type { EnergyNetworkModel, Substation, LineRunV1 } from '../../../../types/enm';
import type { CorridorLayout, CorridorPosition } from './CorridorLayout';

export type SpineNodeKind = 'gpz' | 'station' | 'zksn' | 'pole' | 'nop';

export interface SpineNode {
  /** ref_id stacji/słupa/ZKSN/NOP */
  readonly ref: string;
  /** Typ węzła. */
  readonly kind: SpineNodeKind;
  /** Pozycja X na osi spine (rosnąco wzdłuż run-u). */
  readonly x: number;
  /** Etykieta dla overview (LOD 0-1). */
  readonly label: string;
}

export interface SpineBranch {
  /** ref_id branch line_run (run_kind === 'branch'). */
  readonly branchRunId: string;
  /** ref_id stacji/słupa odgałęźnego na spine. */
  readonly originRef: string;
  /** Pozycja X początku odgałęzienia (== x originRef). */
  readonly originX: number;
}

export interface SpineCorridor {
  /** ref_id line_run (main_trunk). */
  readonly spineId: string;
  /** Etykieta produktowa (np. "Ciąg SN-1"). */
  readonly label: string;
  /** Y osi spine (środek band). */
  readonly axisY: number;
  /** Najmniejszy X spośród węzłów. */
  readonly xStart: number;
  /** Największy X spośród węzłów. */
  readonly xEnd: number;
  /** Węzły na osi, posortowane po X rosnąco. */
  readonly nodes: readonly SpineNode[];
  /** Odgałęzienia do branch run-ów. */
  readonly branches: readonly SpineBranch[];
}

export interface SpineModel {
  /** Wszystkie spine-y w sieci (jeden per main_trunk). */
  readonly corridors: readonly SpineCorridor[];
  /** Liczba węzłów łącznie (do statystyk LOD). */
  readonly totalNodes: number;
}

const FIELD_STATION_TYPES = new Set([
  'mv_lv',
  'inline',
  'branch',
  'terminal',
  'sectional',
  'switching',
  'customer',
]);

function spineNodeKindForStation(s: Substation): SpineNodeKind {
  if (s.station_type === 'gpz') return 'gpz';
  return 'station';
}

/**
 * Buduje SpineModel z ENM + CorridorLayout.
 *
 * Algorytm:
 * 1. Dla każdego line_run o run_kind === 'main_trunk':
 *    a. Pobierz band Y z CorridorLayout (po dopasowaniu line_run.id → band).
 *    b. Zbierz węzły z stations[] (po `order`), użyj pozycji z CorridorLayout.
 *    c. Dodaj ZKSN / słupy (BranchPointSN) leżące na trasie (po segments[]).
 *    d. Dodaj NOP jeśli line_run.nop_station_ref istnieje.
 *    e. Zidentyfikuj branch run-y (line_run.parent_run_ref === ten run.id) jako SpineBranch.
 * 2. Zwróć posortowaną listę corridors po spineId (deterministycznie).
 */
export function computeSpineModel(
  enm: Pick<EnergyNetworkModel, 'substations' | 'line_runs' | 'branch_points'>,
  corridorLayout: CorridorLayout,
): SpineModel {
  const allRuns = enm.line_runs ?? [];
  const positionsByRef = new Map<string, CorridorPosition>();
  for (const p of corridorLayout.positions) {
    positionsByRef.set(p.ref, p);
  }

  const subsByRef = new Map<string, Substation>();
  for (const s of enm.substations ?? []) {
    subsByRef.set(s.ref_id, s);
  }

  const branchPointsByRef = new Map<string, NonNullable<typeof enm.branch_points>[number]>();
  for (const bp of enm.branch_points ?? []) {
    branchPointsByRef.set(bp.ref_id, bp);
  }

  const branchRunsByParent = new Map<string, LineRunV1[]>();
  for (const run of allRuns) {
    if (run.parent_run_ref) {
      const arr = branchRunsByParent.get(run.parent_run_ref) ?? [];
      arr.push(run);
      branchRunsByParent.set(run.parent_run_ref, arr);
    }
  }

  const mainTrunks = allRuns
    .filter((r) => r.run_kind === 'main_trunk')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const corridors: SpineCorridor[] = [];
  let totalNodes = 0;

  for (const trunk of mainTrunks) {
    const sortedStations = trunk.stations.slice().sort((a, b) => a.order - b.order);
    const nodes: SpineNode[] = [];
    let axisY: number | null = null;
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;

    for (const stRef of sortedStations) {
      const sub = subsByRef.get(stRef.substation_ref);
      if (!sub) continue;
      const pos = positionsByRef.get(sub.ref_id);
      if (!pos) continue;
      if (!FIELD_STATION_TYPES.has(sub.station_type) && sub.station_type !== 'gpz') continue;
      if (axisY === null) axisY = pos.y;
      nodes.push({
        ref: sub.ref_id,
        kind: spineNodeKindForStation(sub),
        x: pos.x,
        label: sub.name ?? sub.ref_id,
      });
      if (pos.x < xMin) xMin = pos.x;
      if (pos.x > xMax) xMax = pos.x;
    }

    // ZKSN / branch points — używamy pozycji z corridorLayout, jeśli są.
    for (const bp of enm.branch_points ?? []) {
      const pos = positionsByRef.get(bp.ref_id);
      if (!pos) continue;
      if (axisY === null || Math.abs(pos.y - axisY) > 1) continue;
      nodes.push({
        ref: bp.ref_id,
        kind: bp.branch_point_type === 'zksn' ? 'zksn' : 'pole',
        x: pos.x,
        label: bp.name ?? bp.ref_id,
      });
      if (pos.x < xMin) xMin = pos.x;
      if (pos.x > xMax) xMax = pos.x;
    }

    // NOP marker
    if (trunk.nop_station_ref) {
      const pos = positionsByRef.get(trunk.nop_station_ref);
      const sub = subsByRef.get(trunk.nop_station_ref);
      if (pos && sub) {
        const exists = nodes.find((n) => n.ref === sub.ref_id);
        if (!exists) {
          nodes.push({
            ref: sub.ref_id,
            kind: 'nop',
            x: pos.x,
            label: sub.name ?? sub.ref_id,
          });
          if (pos.x < xMin) xMin = pos.x;
          if (pos.x > xMax) xMax = pos.x;
        }
      }
    }

    nodes.sort((a, b) => a.x - b.x || a.ref.localeCompare(b.ref));
    totalNodes += nodes.length;

    const childBranches = branchRunsByParent.get(trunk.id) ?? [];
    const branches: SpineBranch[] = [];
    for (const child of childBranches) {
      if (!child.branch_origin_station_ref) continue;
      const originPos = positionsByRef.get(child.branch_origin_station_ref);
      if (!originPos) continue;
      branches.push({
        branchRunId: child.id,
        originRef: child.branch_origin_station_ref,
        originX: originPos.x,
      });
    }
    branches.sort((a, b) => a.branchRunId.localeCompare(b.branchRunId));

    if (axisY === null || nodes.length === 0) continue;

    corridors.push({
      spineId: trunk.id,
      label: trunk.name ?? trunk.id,
      axisY,
      xStart: xMin === Number.POSITIVE_INFINITY ? 0 : xMin,
      xEnd: xMax === Number.NEGATIVE_INFINITY ? 0 : xMax,
      nodes,
      branches,
    });
  }

  return { corridors, totalNodes };
}
