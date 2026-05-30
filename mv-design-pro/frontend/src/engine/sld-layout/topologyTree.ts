/**
 * topologyTree — ekstrakcja drzewa topologii SN z `TopologyInputV1` (tryb topologiczny).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §2
 *
 * Algorytm (deterministyczny, zero heurystyk pozycyjnych):
 *  1. Mapuj każdą szynę → stacja (stationId z czytnika LUB fallback z prefiksu ref_id
 *     `stn/<id>` / `gpz/<id>`; szyny pól-terminali nie są w `bus_refs`, ale należą do
 *     stacji wg prefiksu — to wiąże laterale z ich stacją macierzystą).
 *  2. Zbuduj graf stacji z gałęzi CABLE/LINE. Szyny pośrednie (bus/...) bez stacji =
 *     węzły przelotowe; kontraktowane (deg-2) do krawędzi stacja→stacja.
 *  3. Korzeń = stacja zawierająca szynę źródła (GPZ).
 *  4. Drzewo rozpinające BFS (sąsiedzi sortowani leksykograficznie → determinizm),
 *     rank = głębokość.
 *  5. Magistrala = najdłuższa ścieżka od korzenia (oś pozioma). Reszta = laterale.
 *
 * Determinizm: sortowanie leksykograficzne na każdym kroku; ten sam snapshot →
 * identyczne drzewo.
 */

import {
  BranchKind,
  type TopologyInputV1,
  type TopologyBranchV1,
} from '../../ui/sld/core/topologyInputReader';

/** Węzeł drzewa = stacja (lub zakontraktowany węzeł pośredni, jeśli zostanie). */
export interface TreeNode {
  /** ref_id stacji (lub klucz węzła pośredniego). */
  readonly ref: string;
  readonly parent: string | null;
  readonly children: readonly string[];
  /** Głębokość w drzewie (0 = korzeń/GPZ). */
  readonly rank: number;
  /** Czy węzeł leży na magistrali (osi głównej). */
  readonly onTrunk: boolean;
  /** Indeks pozycyjny: na magistrali = kolejność na osi; w lateralu = pozycja w gałęzi. */
  readonly order: number;
  /** Czy to prawdziwa stacja (vs. węzeł pośredni szyny). */
  readonly isStation: boolean;
}

export interface TopologyTree {
  /** ref korzenia (GPZ). null jeśli brak źródła/stacji. */
  readonly rootRef: string | null;
  /** Wszystkie węzły drzewa, klucz = ref. */
  readonly nodes: ReadonlyMap<string, TreeNode>;
  /** Refy stacji na magistrali, w kolejności od korzenia. */
  readonly trunkRefs: readonly string[];
  /** Mapa stacja → krawędź(gałąź)-rodzic (gałąź CABLE/LINE łącząca z rodzicem). */
  readonly parentBranch: ReadonlyMap<string, TopologyBranchV1>;
  /** Liczba prawdziwych stacji w drzewie. */
  readonly stationCount: number;
}

const INTERMEDIATE_PREFIX = 'BUS:';

/** Stacja właściciel danej szyny: stationId z czytnika lub prefiks ref_id. */
function busOwnerStation(
  busId: string,
  busStationId: string | null,
): string | null {
  if (busStationId) return busStationId;
  if (busId.startsWith('stn/')) {
    const id = busId.split('/')[1];
    if (id) return `stn/${id}/station`;
  }
  if (busId.startsWith('gpz/')) {
    const id = busId.split('/')[1];
    if (id) return `gpz/${id}/substation`;
  }
  return null;
}

/** Klucz węzła grafu dla szyny: stacja lub węzeł pośredni. */
function nodeKeyForBus(busId: string, owner: string | null): string {
  return owner ?? INTERMEDIATE_PREFIX + busId;
}

/**
 * Buduje drzewo topologii z `TopologyInputV1`. Deterministyczne.
 */
export function buildTopologyTree(snapshot: TopologyInputV1): TopologyTree {
  // bus → stationId (z czytnika)
  const busStationId = new Map<string, string | null>();
  for (const cn of snapshot.connectionNodes) {
    busStationId.set(cn.id, cn.stationId);
  }

  // Zbiór realnych stacji (do oznaczenia isStation).
  const stationRefSet = new Set(snapshot.stations.map((s) => s.id));

  // bus → klucz węzła grafu
  const busToNode = new Map<string, string>();
  const resolveBusNode = (busId: string): string => {
    const cached = busToNode.get(busId);
    if (cached) return cached;
    const owner = busOwnerStation(busId, busStationId.get(busId) ?? null);
    const key = nodeKeyForBus(busId, owner);
    busToNode.set(busId, key);
    return key;
  };

  // Graf stacji z CABLE/LINE. Pamiętamy jedną gałąź per para (do parentBranch).
  const adj = new Map<string, Set<string>>();
  const edgeBranch = new Map<string, TopologyBranchV1>(); // klucz "a|b" posortowany
  const addAdj = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const br of snapshot.branches) {
    if (br.kind !== BranchKind.CABLE && br.kind !== BranchKind.LINE) continue;
    if (!br.inService) continue;
    const a = resolveBusNode(br.fromNodeId);
    const b = resolveBusNode(br.toNodeId);
    if (a === b) continue;
    addAdj(a, b);
    addAdj(b, a);
    const k = pairKey(a, b);
    // pierwszy (leksykalnie najmniejszy ref gałęzi) wygrywa → determinizm
    const prev = edgeBranch.get(k);
    if (!prev || br.id.localeCompare(prev.id) < 0) edgeBranch.set(k, br);
  }

  // Kontrakcja węzłów pośrednich deg-2 (BUS:...) do krawędzi.
  // Powtarzaj aż stabilnie. Determinizm: iterujemy po posortowanych kluczach.
  let changed = true;
  while (changed) {
    changed = false;
    const interKeys = [...adj.keys()].filter((n) => n.startsWith(INTERMEDIATE_PREFIX)).sort();
    for (const n of interKeys) {
      const nb = adj.get(n);
      if (!nb || nb.size !== 2) continue;
      const [x, y] = [...nb].sort();
      adj.get(x)?.delete(n);
      adj.get(y)?.delete(n);
      if (x !== y) {
        addAdj(x, y);
        addAdj(y, x);
        // stitch branch: prefer the branch toward the deeper stitch (keep one deterministically)
        const kxn = pairKey(x, n);
        const kyn = pairKey(y, n);
        const bx = edgeBranch.get(kxn);
        const by = edgeBranch.get(kyn);
        const stitched = bx && by ? (bx.id.localeCompare(by.id) <= 0 ? bx : by) : (bx ?? by);
        if (stitched) {
          const kxy = pairKey(x, y);
          const prev = edgeBranch.get(kxy);
          if (!prev || stitched.id.localeCompare(prev.id) < 0) edgeBranch.set(kxy, stitched);
        }
      }
      adj.delete(n);
      changed = true;
      break; // restart scan (sets mutated)
    }
  }

  // Korzeń = stacja zawierająca szynę pierwszego źródła (po sort id).
  let rootRef: string | null = null;
  const sortedSources = [...snapshot.sources].sort((a, b) => a.id.localeCompare(b.id));
  if (sortedSources.length > 0) {
    rootRef = resolveBusNode(sortedSources[0].nodeId);
  }
  // fallback: GPZ station (MAIN_SUBSTATION) lub pierwsza stacja
  if (!rootRef || !adj.has(rootRef)) {
    const gpz = [...stationRefSet].filter((r) => r.includes('/substation')).sort();
    rootRef = gpz[0] ?? [...adj.keys()].filter((k) => !k.startsWith(INTERMEDIATE_PREFIX)).sort()[0] ?? null;
  }

  const nodes = new Map<string, TreeNode>();
  const parentBranch = new Map<string, TopologyBranchV1>();
  if (!rootRef) {
    return { rootRef: null, nodes, trunkRefs: [], parentBranch, stationCount: 0 };
  }

  // BFS spanning tree (sąsiedzi sortowani → determinizm).
  const parent = new Map<string, string | null>([[rootRef, null]]);
  const rank = new Map<string, number>([[rootRef, 0]]);
  const childrenMap = new Map<string, string[]>();
  const queue: string[] = [rootRef];
  while (queue.length > 0) {
    const u = queue.shift()!;
    const neighbors = [...(adj.get(u) ?? [])].sort();
    for (const v of neighbors) {
      if (parent.has(v)) continue;
      parent.set(v, u);
      rank.set(v, (rank.get(u) ?? 0) + 1);
      if (!childrenMap.has(u)) childrenMap.set(u, []);
      childrenMap.get(u)!.push(v);
      if (edgeBranch.has(pairKey(u, v))) parentBranch.set(v, edgeBranch.get(pairKey(u, v))!);
      queue.push(v);
    }
  }

  // Magistrala = najdłuższa ścieżka od korzenia (deepest leaf, tie-break leksykalny).
  let deepest = rootRef;
  let deepestRank = -1;
  for (const [ref, r] of [...rank.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (r > deepestRank) {
      deepestRank = r;
      deepest = ref;
    }
  }
  const trunkSet = new Set<string>();
  {
    let n: string | null = deepest;
    while (n !== null) {
      trunkSet.add(n);
      n = parent.get(n) ?? null;
    }
  }
  // trunkRefs w kolejności od korzenia
  const trunkOrdered: string[] = [];
  {
    let n: string | null = deepest;
    const stack: string[] = [];
    while (n !== null) {
      stack.push(n);
      n = parent.get(n) ?? null;
    }
    while (stack.length) trunkOrdered.push(stack.pop()!);
  }

  // Order index: trunk = pozycja na osi; lateral = ranga w obrębie gałęzi (porządek dzieci).
  const trunkOrderIndex = new Map<string, number>();
  trunkOrdered.forEach((ref, i) => trunkOrderIndex.set(ref, i));

  for (const [ref, p] of parent.entries()) {
    const onTrunk = trunkSet.has(ref);
    const children = (childrenMap.get(ref) ?? []).slice().sort();
    const isStation =
      stationRefSet.has(ref) || (!ref.startsWith(INTERMEDIATE_PREFIX) && ref.includes('/'));
    nodes.set(ref, {
      ref,
      parent: p,
      children,
      rank: rank.get(ref) ?? 0,
      onTrunk,
      order: onTrunk ? (trunkOrderIndex.get(ref) ?? 0) : 0,
      isStation,
    });
  }

  const stationCount = [...nodes.values()].filter((n) => n.isStation).length;
  const trunkRefs = trunkOrdered.filter((r) => !r.startsWith(INTERMEDIATE_PREFIX));

  return { rootRef, nodes, trunkRefs, parentBranch, stationCount };
}
