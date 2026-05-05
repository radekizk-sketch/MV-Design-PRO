/**
 * TopologyAdapterV2 — Domain-driven adapter: TopologyInput → VisualGraphV1.
 *
 * CANONICAL (BINDING — RUN #3C):
 * - Buduje VisualGraphV1 WYLACZNIE z TopologyInput (domena), nie z UI symboli.
 * - ZAKAZ self-edges (fromPortRef.nodeId !== toPortRef.nodeId — twardy invariant).
 * - Wykrywanie stacji A/B/C/D z domeny (stationType + topology), nie z nazw.
 * - PV/BESS z pola generator.kind, nigdy z nazwy.
 * - Segmentacja trunk/branch/secondary: BFS spanning tree z deterministycznym tie-break.
 *
 * DETERMINIZM:
 * - Ten sam TopologyInput → identyczny VisualGraphV1 (bit-for-bit).
 * - Sortowanie po id na kazdym etapie.
 * - Brak niedeterministycznych API (random, zegar, iteracja Set/Map).
 */

import {
  type VisualGraphV1,
  type VisualNodeV1,
  type VisualEdgeV1,
  type VisualPortV1,
  type VisualGraphMetaV1,
  NodeTypeV1,
  EdgeTypeV1,
  PortRoleV1,
  VISUAL_GRAPH_VERSION,
  canonicalizeVisualGraph,
} from './visualGraph';

import type {
  TopologyInputV1,
  TopologyBranchV1,
  TopologyStationV1,
  TopologyFixAction,
  LogicalTrunkViewExtV1,
  LogicalBranchViewExtV1,
  LogicalRingViewV1,
} from './topologyInputReader';
import { BranchKind, GeneratorKind, StationKind } from './topologyInputReader';

import {
  buildStationBlocks,
  type StationBlockBuildResult,
  type SegmentationEdgeSets,
} from './stationBlockBuilder';
import { EmbeddingRoleV1 } from './fieldDeviceContracts';
import {
  buildVisualTopologyContract,
  type VisualTopologyContractV1,
} from './visualTopologyContract';
import {
  registerBranchPointDetailsForGraph,
  registerStationBlockDetailsForGraph,
} from './layoutDetailRegistry';
import { buildStationBlockDetailForBranchRef } from './canonicalFieldDetail';

// =============================================================================
// EXTENDED LOGICAL VIEWS
// =============================================================================

/**
 * Extended logical views with station ordering and junction points.
 * Built from TopologyInput logical views + segmentation result.
 */
export interface ExtendedLogicalViewsV1 {
  readonly trunks: readonly LogicalTrunkViewExtV1[];
  readonly branches: readonly LogicalBranchViewExtV1[];
  readonly rings: readonly LogicalRingViewV1[];
}

// =============================================================================
// ADAPTER RESULT
// =============================================================================

/**
 * Wynik adaptera — VisualGraph + walidacje + FixActions + StationBlockDetails.
 *
 * RUN #3D: Rozszerzono o stationBlockDetails (pola/urzadzenia/anchory per stacja).
 */
export interface AdapterResultV1 {
  readonly graph: VisualGraphV1;
  readonly fixActions: readonly TopologyFixAction[];
  /** Szczegoly pol/urzadzen/anchorow per stacja (RUN #3D) */
  readonly stationBlockDetails: StationBlockBuildResult;
  /** Jawny kontrakt topologii wizualnej (KROK B). */
  readonly visualTopology: VisualTopologyContractV1;
  /** Extended logical views with station ordering and junction metadata. */
  readonly extendedLogicalViews: ExtendedLogicalViewsV1;
}

// =============================================================================
// NODE TYPE CLASSIFICATION (DOMAIN-DRIVEN)
// =============================================================================

/**
 * Klasyfikuje NodeType dla szyny na podstawie napiecia.
 */
/**
 * Klasyfikuje NodeType szyny na podstawie napiecia.
 * null → BUS_SN (niedokreslone napiecie; FixAction bus.voltage_missing juz wygenerowany w TopologyInputReader).
 */
function classifyBusType(voltageKv: number | null): NodeTypeV1 {
  if (voltageKv === null) return NodeTypeV1.BUS_SN; // Undetermined — FixAction from reader
  return voltageKv >= 6 ? NodeTypeV1.BUS_SN : NodeTypeV1.BUS_NN;
}

/**
 * Klasyfikuje NodeType stacji na podstawie topologii.
 *
 * Reguly (z domeny, bez heurystyk stringowych):
 * - Stacja z 1 szyna + 0-1 TR + 0-1 branch → TYPE_A (leaf)
 * - Stacja z 1 szyna + zabezpieczenie/pomiar → TYPE_B (passthrough)
 * - Stacja z 1 szyna + branch trunk + branch odgalezienie → TYPE_C (trunk+branch)
 * - Stacja z ≥2 szyny (sekcyjna, coupler) → TYPE_D (sectional)
 *
 * Jesli domena nie podaje stationType: wyprowadz z topologii + FixAction.
 */
function classifyStationType(
  station: TopologyStationV1,
  branchCountFromStation: number,
  fixActions: TopologyFixAction[],
): NodeTypeV1 {
  if (station.branchPointType === 'branch_pole') {
    // Słup rozgałęźny — wyodrębniony typ węzła, NIE stacja
    return NodeTypeV1.BRANCH_POLE;
  }
  if (station.branchPointType === 'zksn') {
    // ZKSN — wyodrębniony typ węzła, NIE stacja
    return NodeTypeV1.ZKSN_NODE;
  }

  const busCount = station.busIds.length;

  // DISTRIBUTION z transformatorem → TYPE_B (SN + nN to dwie szyny, ale nie sekcyjna)
  if (station.stationType === StationKind.DISTRIBUTION && station.transformerIds.length > 0) {
    return NodeTypeV1.STATION_SN_NN_B;
  }

  // Stacja z ≥2 szynami → TYPE_D (sekcyjna)
  if (busCount >= 2) {
    return NodeTypeV1.STATION_SN_NN_D;
  }

  // Heurystyka topologiczna — NIE stringowa
  if (branchCountFromStation >= 3) {
    return NodeTypeV1.STATION_SN_NN_C;
  }

  if (station.stationType === StationKind.SWITCHING) {
    return NodeTypeV1.STATION_SN_NN_D;
  }

  if (station.stationType === StationKind.MAIN_SUBSTATION) {
    return NodeTypeV1.SWITCHGEAR_BLOCK;
  }

  // Default: TYPE_A (leaf) lub TYPE_B (z zabezpieczeniami)
  if (station.switchIds.length > 0 || station.transformerIds.length > 0) {
    return NodeTypeV1.STATION_SN_NN_B;
  }

  fixActions.push({
    code: 'station.typology_missing',
    message: `Stacja '${station.name}' (${station.id}) nie ma jawnego typu — wyprowadzono TYPE_A z topologii.`,
    elementRef: station.id,
    fixHint: 'Ustaw stationType w modelu domenowym.',
  });

  return NodeTypeV1.STATION_SN_NN_A;
}

/**
 * Klasyfikuje NodeType generatora.
 */
function classifyGeneratorType(kind: GeneratorKind): NodeTypeV1 {
  switch (kind) {
    case GeneratorKind.PV: return NodeTypeV1.GENERATOR_PV;
    case GeneratorKind.BESS: return NodeTypeV1.GENERATOR_BESS;
    case GeneratorKind.WIND: return NodeTypeV1.GENERATOR_WIND;
    case GeneratorKind.SYNCHRONOUS: return NodeTypeV1.GRID_SOURCE;
    default: return NodeTypeV1.GRID_SOURCE;
  }
}

// NOTE: classifyDeviceType is not currently used by the adapter but is kept
// for future device-node expansion (when individual switch nodes are needed).
// function classifyDeviceType(kind: DeviceKind): NodeTypeV1 | null {
//   switch (kind) {
//     case DeviceKind.CB: return NodeTypeV1.SWITCH_BREAKER;
//     case DeviceKind.DS: return NodeTypeV1.SWITCH_DISCONNECTOR;
//     case DeviceKind.LOAD_SWITCH: return NodeTypeV1.SWITCH_LOAD_SWITCH;
//     case DeviceKind.FUSE: return NodeTypeV1.SWITCH_FUSE;
//     // CT, VT, ES, RELAY nie generuja wlasnych wezlow VisualGraph
//     default: return null;
//   }
// }

// =============================================================================
// PORT GENERATION (reused from V1 contract)
// =============================================================================

function generatePorts(nodeType: NodeTypeV1): VisualPortV1[] {
  switch (nodeType) {
    case NodeTypeV1.BUS_SN:
    case NodeTypeV1.BUS_NN:
      return [
        { id: 'left', role: PortRoleV1.IN, relativeX: 0, relativeY: 0.5 },
        { id: 'right', role: PortRoleV1.OUT, relativeX: 1, relativeY: 0.5 },
      ];

    case NodeTypeV1.GRID_SOURCE:
    case NodeTypeV1.GENERATOR_PV:
    case NodeTypeV1.GENERATOR_BESS:
    case NodeTypeV1.GENERATOR_WIND:
      return [
        { id: 'bottom', role: PortRoleV1.OUT, relativeX: 0.5, relativeY: 1 },
      ];

    case NodeTypeV1.LOAD:
      return [
        { id: 'top', role: PortRoleV1.IN, relativeX: 0.5, relativeY: 0 },
      ];

    case NodeTypeV1.TRANSFORMER_WN_SN:
    case NodeTypeV1.TRANSFORMER_SN_NN:
      return [
        { id: 'top', role: PortRoleV1.TRANSFORMER_HV, relativeX: 0.5, relativeY: 0 },
        { id: 'bottom', role: PortRoleV1.TRANSFORMER_LV, relativeX: 0.5, relativeY: 1 },
      ];

    case NodeTypeV1.SWITCH_BREAKER:
    case NodeTypeV1.SWITCH_DISCONNECTOR:
    case NodeTypeV1.SWITCH_LOAD_SWITCH:
    case NodeTypeV1.SWITCH_FUSE:
      return [
        { id: 'top', role: PortRoleV1.FIELD_IN, relativeX: 0.5, relativeY: 0 },
        { id: 'bottom', role: PortRoleV1.FIELD_OUT, relativeX: 0.5, relativeY: 1 },
      ];

    case NodeTypeV1.STATION_SN_NN_A:
    case NodeTypeV1.STATION_SN_NN_B:
    case NodeTypeV1.STATION_SN_NN_C:
    case NodeTypeV1.STATION_SN_NN_D:
    case NodeTypeV1.SWITCHGEAR_BLOCK:
      return [
        { id: 'in', role: PortRoleV1.IN, relativeX: 0.5, relativeY: 0 },
        { id: 'out', role: PortRoleV1.OUT, relativeX: 0.5, relativeY: 1 },
        { id: 'branch', role: PortRoleV1.BRANCH, relativeX: 1, relativeY: 0.5 },
      ];

    case NodeTypeV1.FEEDER_JUNCTION:
      return [
        { id: 'top', role: PortRoleV1.IN, relativeX: 0.5, relativeY: 0 },
        { id: 'bottom', role: PortRoleV1.OUT, relativeX: 0.5, relativeY: 1 },
        { id: 'left', role: PortRoleV1.BRANCH, relativeX: 0, relativeY: 0.5 },
        { id: 'right', role: PortRoleV1.BRANCH, relativeX: 1, relativeY: 0.5 },
      ];

    default:
      return [
        { id: 'top', role: PortRoleV1.IN, relativeX: 0.5, relativeY: 0 },
        { id: 'bottom', role: PortRoleV1.OUT, relativeX: 0.5, relativeY: 1 },
      ];
  }
}

// =============================================================================
// SEGMENTATION: PRIMARY TREE + TRUNK/BRANCH/SECONDARY
// =============================================================================

interface SegmentationResult {
  readonly trunkEdgeIds: ReadonlySet<string>;
  readonly branchEdgeIds: ReadonlySet<string>;
  readonly secondaryEdgeIds: ReadonlySet<string>;
}

/**
 * Deterministyczna segmentacja topologiczna.
 *
 * 1. Zbuduj graf aktywnych krawedzi (ignoruj NOP / normalnie otwarte).
 * 2. BFS spanning tree od GRID_SOURCE (tie-break: sort po id).
 * 3. TRUNK = najdluzsza sciezka w spanning tree od root (tie-break po node.id).
 * 4. BRANCH = pozostale krawedzie spanning tree (nie na trunk).
 * 5. SECONDARY_CONNECTOR = krawedzie poza spanning tree (ring/rezerwa).
 */
function segmentTopology(
  input: TopologyInputV1,
  nodeIdSet: ReadonlySet<string>,
): SegmentationResult {
  const logicalViews = input.logicalViews ?? { trunks: [], branches: [], rings: [] };
  const trunkFromLogical = new Set<string>(logicalViews.trunks.flatMap(t => t.segmentIds));
  const branchFromLogical = new Set<string>(logicalViews.branches.flatMap(b => b.segmentIds));
  const secondaryFromLogical = new Set<string>(logicalViews.rings.flatMap(r => r.segmentIds));

  if (trunkFromLogical.size > 0 || branchFromLogical.size > 0 || secondaryFromLogical.size > 0) {
    for (const b of input.branches) {
      if (b.isNormallyOpen) {
        secondaryFromLogical.add(b.id);
      }
    }
    return {
      trunkEdgeIds: trunkFromLogical,
      branchEdgeIds: branchFromLogical,
      secondaryEdgeIds: secondaryFromLogical,
    };
  }

  // Buduj adjacency list z aktywnych galezi (nie-NOP)
  const activeBranches = input.branches.filter(b => !b.isNormallyOpen && b.inService);
  const adj = new Map<string, { nodeId: string; branchId: string }[]>();

  for (const b of activeBranches) {
    if (!nodeIdSet.has(b.fromNodeId) || !nodeIdSet.has(b.toNodeId)) continue;
    if (b.fromNodeId === b.toNodeId) continue; // skip self-loops in domain data

    if (!adj.has(b.fromNodeId)) adj.set(b.fromNodeId, []);
    if (!adj.has(b.toNodeId)) adj.set(b.toNodeId, []);

    adj.get(b.fromNodeId)!.push({ nodeId: b.toNodeId, branchId: b.id });
    adj.get(b.toNodeId)!.push({ nodeId: b.fromNodeId, branchId: b.id });
  }

  // Sort adjacency for determinism
  for (const [, neighbors] of [...adj.entries()].sort()) {
    neighbors.sort((a, b) => a.branchId.localeCompare(b.branchId));
  }

  // Znajdz root: GRID_SOURCE z sort po id
  const sourceNodeIds = [
    ...input.sources.map(s => s.nodeId),
  ].sort();

  const rootNodeId = sourceNodeIds.length > 0
    ? sourceNodeIds[0]
    : (input.connectionNodes.length > 0 ? input.connectionNodes[0].id : null);

  if (!rootNodeId) {
    return { trunkEdgeIds: new Set(), branchEdgeIds: new Set(), secondaryEdgeIds: new Set() };
  }

  // BFS spanning tree
  const visited = new Set<string>();
  const treeEdgeIds = new Set<string>();
  const parent = new Map<string, { parentId: string; branchId: string }>();
  const queue: string[] = [rootNodeId];
  visited.add(rootNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) || [];

    for (const { nodeId: neighbor, branchId } of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        treeEdgeIds.add(branchId);
        parent.set(neighbor, { parentId: current, branchId });
        queue.push(neighbor);
      }
    }
  }

  // Wyznacz trunk — najdluzsza sciezka od root (BFS distance)
  const depth = new Map<string, number>();
  depth.set(rootNodeId, 0);
  const bfsOrder: string[] = [rootNodeId];
  const bfsQueue: string[] = [rootNodeId];
  const bfsVisited = new Set<string>([rootNodeId]);

  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    const currentDepth = depth.get(current)!;
    const neighbors = adj.get(current) || [];

    for (const { nodeId: neighbor, branchId } of neighbors) {
      if (!bfsVisited.has(neighbor) && treeEdgeIds.has(branchId)) {
        bfsVisited.add(neighbor);
        depth.set(neighbor, currentDepth + 1);
        bfsOrder.push(neighbor);
        bfsQueue.push(neighbor);
      }
    }
  }

  // Najdalszy wezel = koniec trunk (tie-break: sort po id)
  let maxDepth = 0;
  let farthestNode = rootNodeId;
  for (const [nodeId, d] of [...depth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (d > maxDepth) {
      maxDepth = d;
      farthestNode = nodeId;
    }
  }

  // Trace path from farthest to root = trunk edges
  const trunkEdgeIds = new Set<string>();
  let current = farthestNode;
  while (parent.has(current)) {
    const { parentId, branchId } = parent.get(current)!;
    trunkEdgeIds.add(branchId);
    current = parentId;
  }

  // BRANCH = tree edges not on trunk
  const branchEdgeIds = new Set<string>();
  for (const edgeId of treeEdgeIds) {
    if (!trunkEdgeIds.has(edgeId)) {
      branchEdgeIds.add(edgeId);
    }
  }

  // SECONDARY = all active edges not in tree
  const secondaryEdgeIds = new Set<string>();
  for (const b of activeBranches) {
    if (!treeEdgeIds.has(b.id)) {
      secondaryEdgeIds.add(b.id);
    }
  }

  // NOP branches are also SECONDARY (but inactive — mark them too)
  for (const b of input.branches) {
    if (b.isNormallyOpen) {
      secondaryEdgeIds.add(b.id);
    }
  }

  return { trunkEdgeIds, branchEdgeIds, secondaryEdgeIds };
}

// =============================================================================
// EDGE TYPE CLASSIFICATION
// =============================================================================

function classifyEdgeType(
  branch: TopologyBranchV1,
  segmentation: SegmentationResult,
  busCouplerBranchIds: ReadonlySet<string>,
): EdgeTypeV1 {
  if (branch.kind === BranchKind.TR_LINK) {
    return EdgeTypeV1.TRANSFORMER_LINK;
  }
  if (busCouplerBranchIds.has(branch.id)) {
    return EdgeTypeV1.BUS_COUPLER;
  }
  if (segmentation.trunkEdgeIds.has(branch.id)) {
    return EdgeTypeV1.TRUNK;
  }
  if (segmentation.branchEdgeIds.has(branch.id)) {
    return EdgeTypeV1.BRANCH;
  }
  if (segmentation.secondaryEdgeIds.has(branch.id)) {
    return EdgeTypeV1.SECONDARY_CONNECTOR;
  }
  return EdgeTypeV1.BRANCH;
}

// =============================================================================
// EXTENDED LOGICAL VIEWS BUILDER
// =============================================================================

/**
 * Builds extended logical views with station ordering and junction metadata.
 *
 * For trunks: walks segments in chain order to find embedded stations,
 * determines station role from StationBlockDetails embedding.
 *
 * For branches: finds the junction node where the branch connects to a trunk
 * and builds ordered station list along the branch.
 *
 * DETERMINISM: stable ordering via sorted segment/node/station IDs.
 */
export function buildExtendedLogicalViews(
  input: TopologyInputV1,
  _segmentation: SegmentationResult,
  stationBlockDetails: StationBlockBuildResult,
): ExtendedLogicalViewsV1 {
  const logicalViews = input.logicalViews ?? { trunks: [], branches: [], rings: [] };

  // Build lookup: busId → stationId
  const busToStation = new Map<string, string>();
  for (const station of input.stations) {
    for (const busId of station.busIds) {
      busToStation.set(busId, station.id);
    }
  }

  // Build lookup: branchId → branch
  const branchById = new Map<string, TopologyBranchV1>();
  for (const b of input.branches) {
    branchById.set(b.id, b);
  }

  // Build lookup: stationId → embeddingRole
  const embeddingByStation = new Map<string, string>();
  for (const block of stationBlockDetails.stationBlocks) {
    embeddingByStation.set(block.blockId, block.embeddingRole);
  }

  // All trunk segment IDs (for junction detection in branches)
  const allTrunkSegmentIds = new Set<string>(
    logicalViews.trunks.flatMap(t => t.segmentIds),
  );

  // Build node→trunk-segment adjacency for junction detection
  const trunkNodeSet = new Set<string>();
  for (const segId of allTrunkSegmentIds) {
    const branch = branchById.get(segId);
    if (branch) {
      trunkNodeSet.add(branch.fromNodeId);
      trunkNodeSet.add(branch.toNodeId);
    }
  }

  // --- Build extended trunks ---
  const extTrunks: LogicalTrunkViewExtV1[] = logicalViews.trunks.map(trunk => {
    const orderedNodes = buildOrderedNodeChain(trunk.segmentIds, branchById);
    const seenStations = new Set<string>();
    const orderedStations: {
      stationId: string;
      role: 'przelotowa' | 'odgalezna' | 'sekcyjna' | 'koncowa';
      attachedBranchIds: readonly string[];
    }[] = [];

    for (const nodeId of orderedNodes) {
      const stationId = busToStation.get(nodeId);
      if (stationId && !seenStations.has(stationId)) {
        seenStations.add(stationId);
        const embedding = embeddingByStation.get(stationId);
        const role = embeddingToRole(embedding);

        // Find branch IDs attached to this station (from logicalViews.branches)
        const attachedBranchIds: string[] = [];
        for (const br of logicalViews.branches) {
          const branchSegments = br.segmentIds;
          if (branchSegments.length === 0) continue;
          // A branch attaches to a station if any of its segments touch a bus in the station
          for (const segId of branchSegments) {
            const seg = branchById.get(segId);
            if (!seg) continue;
            const fromStation = busToStation.get(seg.fromNodeId);
            const toStation = busToStation.get(seg.toNodeId);
            if (fromStation === stationId || toStation === stationId) {
              attachedBranchIds.push(br.id);
              break;
            }
          }
        }

        orderedStations.push({
          stationId,
          role,
          attachedBranchIds: attachedBranchIds.sort(),
        });
      }
    }

    return {
      id: trunk.id,
      segmentIds: trunk.segmentIds,
      orderedStations,
    };
  });

  // --- Build extended branches ---
  const extBranches: LogicalBranchViewExtV1[] = logicalViews.branches.map(branch => {
    // Find junction node: a node in the branch segments that also belongs to the trunk
    let junctionNodeId: string | null = null;
    const orderedNodes = buildOrderedNodeChain(branch.segmentIds, branchById);

    for (const nodeId of orderedNodes) {
      if (trunkNodeSet.has(nodeId)) {
        junctionNodeId = nodeId;
        break;
      }
    }

    // Build ordered station IDs along the branch
    const seenStations = new Set<string>();
    const orderedStationIds: string[] = [];
    for (const nodeId of orderedNodes) {
      const stationId = busToStation.get(nodeId);
      if (stationId && !seenStations.has(stationId)) {
        seenStations.add(stationId);
        orderedStationIds.push(stationId);
      }
    }

    return {
      id: branch.id,
      segmentIds: branch.segmentIds,
      junctionNodeId,
      orderedStationIds,
    };
  });

  return {
    trunks: extTrunks,
    branches: extBranches,
    rings: [...logicalViews.rings],
  };
}

/**
 * Builds an ordered chain of node IDs by walking segments in topological order.
 *
 * Given a set of segment IDs, builds an adjacency graph and walks from one end
 * to the other, producing a deterministic ordered list of nodes.
 */
function buildOrderedNodeChain(
  segmentIds: readonly string[],
  branchById: ReadonlyMap<string, TopologyBranchV1>,
): string[] {
  if (segmentIds.length === 0) return [];

  // Build adjacency: nodeId → [{nodeId, segmentId}]
  const adj = new Map<string, { nodeId: string; segmentId: string }[]>();
  const nodeSet = new Set<string>();

  for (const segId of segmentIds) {
    const branch = branchById.get(segId);
    if (!branch) continue;

    const from = branch.fromNodeId;
    const to = branch.toNodeId;
    if (from === to) continue;

    nodeSet.add(from);
    nodeSet.add(to);

    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to)) adj.set(to, []);
    adj.get(from)!.push({ nodeId: to, segmentId: segId });
    adj.get(to)!.push({ nodeId: from, segmentId: segId });
  }

  if (nodeSet.size === 0) return [];

  // Sort adjacency for determinism
  for (const [, neighbors] of adj) {
    neighbors.sort((a, b) => a.segmentId.localeCompare(b.segmentId));
  }

  // Find chain start: node with degree 1 (endpoint), tie-break by ID sort
  const sortedNodes = [...nodeSet].sort();
  let startNode = sortedNodes[0];
  for (const nodeId of sortedNodes) {
    if ((adj.get(nodeId)?.length ?? 0) === 1) {
      startNode = nodeId;
      break;
    }
  }

  // Walk the chain from startNode
  const visited = new Set<string>();
  const chain: string[] = [];
  let current: string | null = startNode;

  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    const neighbors: { nodeId: string; segmentId: string }[] = adj.get(current) ?? [];
    let next: string | null = null;
    for (const { nodeId } of neighbors) {
      if (!visited.has(nodeId)) {
        next = nodeId;
        break;
      }
    }
    current = next;
  }

  return chain;
}

/**
 * Maps EmbeddingRoleV1 to Polish station role label.
 */
function embeddingToRole(
  embedding: string | undefined,
): 'przelotowa' | 'odgalezna' | 'sekcyjna' | 'koncowa' {
  if (embedding === EmbeddingRoleV1.TRUNK_INLINE) return 'przelotowa';
  if (embedding === EmbeddingRoleV1.TRUNK_BRANCH) return 'odgalezna';
  if (embedding === EmbeddingRoleV1.LOCAL_SECTIONAL) return 'sekcyjna';
  return 'koncowa';
}

// =============================================================================
// MAIN ADAPTER
// =============================================================================

/**
 * Buduje VisualGraphV1 z TopologyInput.
 *
 * GWARANCJE:
 * - Brak self-edges (twardy invariant).
 * - Typ wezla z domeny (nie z nazwy).
 * - Segmentacja deterministyczna i stabilna pod permutacja.
 * - PV/BESS sa GENERATOR_*, nigdy LOAD.
 */
export function buildVisualGraphFromTopology(
  input: TopologyInputV1,
  options: { timestamp?: string } = {},
): AdapterResultV1 {
  const fixActions: TopologyFixAction[] = [...input.fixActions];
  const nodes: VisualNodeV1[] = [];
  const edges: VisualEdgeV1[] = [];

  // Set of all VisualNode IDs for port reference validation
  const nodeIdSet = new Set<string>();
  // Map: nodeId → NodeTypeV1 (do semantycznego wyboru portow)
  const nodeTypeMap = new Map<string, NodeTypeV1>();

  // Map: connectionNode ID → index in stations (for station membership)
  const busToStation = new Map<string, string>();
  for (const station of input.stations) {
    for (const busId of station.busIds) {
      busToStation.set(busId, station.id);
    }
  }

  // Count branches per station for type classification
  const branchCountByStation = new Map<string, number>();
  for (const b of input.branches) {
    const fromStation = busToStation.get(b.fromNodeId);
    const toStation = busToStation.get(b.toNodeId);
    if (fromStation) {
      branchCountByStation.set(fromStation, (branchCountByStation.get(fromStation) ?? 0) + 1);
    }
    if (toStation && toStation !== fromStation) {
      branchCountByStation.set(toStation, (branchCountByStation.get(toStation) ?? 0) + 1);
    }
  }

  // --- 1. Create nodes for connection nodes (buses) ---
  for (const cn of input.connectionNodes) {
    const nodeType = classifyBusType(cn.voltageKv);
    nodeIdSet.add(cn.id);
    nodeTypeMap.set(cn.id, nodeType);

    nodes.push({
      id: cn.id,
      nodeType,
      ports: generatePorts(nodeType),
      attributes: {
        label: cn.name,
        voltageKv: cn.voltageKv,
        inService: cn.inService,
        elementId: cn.id,
        elementType: 'Bus',
        elementName: cn.name,
        switchState: null,
        branchType: null,
        ratedPowerMva: null,
        width: null,
        height: null,
        fromNodeId: null,
        toNodeId: null,
        connectedToNodeId: null,
      },
    });
  }

  // --- 2. Create nodes for stations ---
  for (const station of input.stations) {
    const branchCount = branchCountByStation.get(station.id) ?? 0;
    const nodeType = classifyStationType(station, branchCount, fixActions);
    nodeIdSet.add(station.id);
    nodeTypeMap.set(station.id, nodeType);

    nodes.push({
      id: station.id,
      nodeType,
      ports: generatePorts(nodeType),
      attributes: {
        label: station.name,
        voltageKv: station.voltageKv,
        inService: true,
        elementId: station.id,
        elementType: 'STATION', // ElementTypeV1.STATION — kontener logiczny
        elementName: station.name,
        switchState: null,
        branchType: null,
        ratedPowerMva: null,
        width: null,
        height: null,
        fromNodeId: null,
        toNodeId: null,
        connectedToNodeId: null,
      },
    });
  }

  // --- 3. Create nodes for sources ---
  for (const source of input.sources) {
    const nodeType = NodeTypeV1.GRID_SOURCE;
    nodeIdSet.add(source.id);
    nodeTypeMap.set(source.id, nodeType);

    nodes.push({
      id: source.id,
      nodeType,
      ports: generatePorts(nodeType),
      attributes: {
        label: source.name,
        voltageKv: null,
        inService: source.inService,
        elementId: source.id,
        elementType: 'Source',
        elementName: source.name,
        switchState: null,
        branchType: null,
        ratedPowerMva: null,
        width: null,
        height: null,
        fromNodeId: null,
        toNodeId: null,
        connectedToNodeId: source.nodeId,
      },
    });
  }

  // --- 4. Create nodes for generators (PV/BESS/Wind) ---
  for (const gen of input.generators) {
    const nodeType = classifyGeneratorType(gen.kind);
    nodeIdSet.add(gen.id);
    nodeTypeMap.set(gen.id, nodeType);

    nodes.push({
      id: gen.id,
      nodeType,
      ports: generatePorts(nodeType),
      attributes: {
        label: gen.name,
        voltageKv: null,
        inService: gen.inService,
        elementId: gen.id,
        elementType: 'GENERATOR', // ElementTypeV1.GENERATOR — nie Source
        elementName: gen.name,
        switchState: null,
        branchType: null,
        ratedPowerMva: gen.ratedPowerMw,
        width: null,
        height: null,
        fromNodeId: null,
        toNodeId: null,
        connectedToNodeId: gen.nodeId,
      },
    });
  }

  // --- 5. Create nodes for loads ---
  for (const load of input.loads) {
    const nodeType = NodeTypeV1.LOAD;
    nodeIdSet.add(load.id);
    nodeTypeMap.set(load.id, nodeType);

    nodes.push({
      id: load.id,
      nodeType,
      ports: generatePorts(nodeType),
      attributes: {
        label: load.name,
        voltageKv: null,
        inService: load.inService,
        elementId: load.id,
        elementType: 'Load',
        elementName: load.name,
        switchState: null,
        branchType: null,
        ratedPowerMva: null,
        width: null,
        height: null,
        fromNodeId: null,
        toNodeId: null,
        connectedToNodeId: load.nodeId,
      },
    });
  }

  // --- 6. Segmentation ---
  const segmentation = segmentTopology(input, nodeIdSet);

  // Detect bus couplers: switches between two buses at the same voltage in a station
  const busCouplerBranchIds = new Set<string>();
  for (const b of input.branches) {
    if (b.kind === BranchKind.BUS_LINK) {
      const fromStation = busToStation.get(b.fromNodeId);
      const toStation = busToStation.get(b.toNodeId);
      if (fromStation && toStation && fromStation === toStation) {
        busCouplerBranchIds.add(b.id);
      }
    }
  }

  // --- 7. Create edges for branches (connecting TWO DIFFERENT nodes) ---
  for (const branch of input.branches) {
    // TWARDY INVARIANT: zakaz self-edges
    if (branch.fromNodeId === branch.toNodeId) {
      fixActions.push({
        code: 'topology.self_edge_forbidden',
        message: `Galaz '${branch.name}' (${branch.id}) ma fromNodeId === toNodeId  /* ui-terminology-ignore */ (${branch.fromNodeId}). Pominieto.`,
        elementRef: branch.id,
        fixHint: 'Popraw polaczenia galezi — fromNodeId i toNodeId musza byc rozne.',
      });
      continue;
    }

    // Sprawdz czy oba endpointy istnieja
    if (!nodeIdSet.has(branch.fromNodeId)) {
      fixActions.push({
        code: 'branch.endpoint_invalid',
        message: `Galaz '${branch.name}' (${branch.id}): fromNodeId '${branch.fromNodeId}' /* ui-terminology-ignore */ nie istnieje jako wezel.`,
        elementRef: branch.id,
        fixHint: 'Dodaj brakujacy wezel polaczeniowy.',
      });
      continue;
    }
    if (!nodeIdSet.has(branch.toNodeId)) {
      fixActions.push({
        code: 'branch.endpoint_invalid',
        message: `Galaz '${branch.name}' (${branch.id}): toNodeId '${branch.toNodeId}' /* ui-terminology-ignore */ nie istnieje jako wezel.`,
        elementRef: branch.id,
        fixHint: 'Dodaj brakujacy wezel polaczeniowy.',
      });
      continue;
    }

    const edgeType = classifyEdgeType(branch, segmentation, busCouplerBranchIds);

    // Wybierz porty semantycznie (po roli, nie po geometrii)
    const fromNodeType = nodeTypeMap.get(branch.fromNodeId) ?? NodeTypeV1.BUS_SN;
    const toNodeType = nodeTypeMap.get(branch.toNodeId) ?? NodeTypeV1.BUS_SN;
    const fromPort = selectSourcePort(branch, edgeType, fromNodeType);
    const toPort = selectTargetPort(branch, edgeType, toNodeType);

    edges.push({
      id: `edge_${branch.id}`,
      fromPortRef: { nodeId: branch.fromNodeId, portId: fromPort },
      toPortRef: { nodeId: branch.toNodeId, portId: toPort },
      edgeType,
      isNormallyOpen: branch.isNormallyOpen,
      attributes: {
        label: branch.name,
        lengthKm: branch.lengthKm,
        branchType: branch.kind === BranchKind.LINE ? 'LINE'
          : branch.kind === BranchKind.CABLE ? 'CABLE'
          : null,
        inService: branch.inService,
      },
    });
  }

  // --- 8. Create edges for source → bus ---
  for (const source of input.sources) {
    if (!nodeIdSet.has(source.nodeId)) {
      fixActions.push({
        code: 'topology.missing_connection_node',
        message: `Zrodlo '${source.name}' (${source.id}): connectedToNodeId '${source.nodeId}' nie istnieje.`,
        elementRef: source.id,
        fixHint: 'Dodaj brakujaca szyne zbiorcza.',
      });
      continue;
    }
    edges.push({
      id: `edge_src_${source.id}`,
      fromPortRef: { nodeId: source.id, portId: resolvePortId(NodeTypeV1.GRID_SOURCE, PortRoleV1.OUT) },
      toPortRef: { nodeId: source.nodeId, portId: resolvePortId(nodeTypeMap.get(source.nodeId) ?? NodeTypeV1.BUS_SN, PortRoleV1.IN) },
      edgeType: EdgeTypeV1.TRUNK,
      isNormallyOpen: false,
      attributes: {
        label: `${source.name} → bus`,
        lengthKm: null,
        branchType: null,
        inService: source.inService,
      },
    });
  }

  // --- 9. Create edges for generator → bus ---
  for (const gen of input.generators) {
    if (!nodeIdSet.has(gen.nodeId)) {
      fixActions.push({
        code: 'generator.connection_field_missing',
        message: `Generator '${gen.name}' (${gen.id}): nodeId '${gen.nodeId}' nie istnieje.`,
        elementRef: gen.id,
        fixHint: 'Dodaj brakujaca szyne zbiorcza lub pole przylaczeniowe.',
      });
      continue;
    }
    edges.push({
      id: `edge_gen_${gen.id}`,
      fromPortRef: { nodeId: gen.id, portId: resolvePortId(nodeTypeMap.get(gen.id) ?? NodeTypeV1.GENERATOR_PV, PortRoleV1.OUT) },
      toPortRef: { nodeId: gen.nodeId, portId: resolvePortId(nodeTypeMap.get(gen.nodeId) ?? NodeTypeV1.BUS_SN, PortRoleV1.OUT) },
      edgeType: EdgeTypeV1.BRANCH,
      isNormallyOpen: false,
      attributes: {
        label: `${gen.name} → bus`,
        lengthKm: null,
        branchType: null,
        inService: gen.inService,
      },
    });
  }

  // --- 10. Create edges for bus → load ---
  for (const load of input.loads) {
    if (!nodeIdSet.has(load.nodeId)) {
      fixActions.push({
        code: 'topology.missing_connection_node',
        message: `Odbiorca '${load.name}' (${load.id}): nodeId '${load.nodeId}' nie istnieje.`,
        elementRef: load.id,
        fixHint: 'Dodaj brakujaca szyne zbiorcza.',
      });
      continue;
    }
    edges.push({
      id: `edge_load_${load.id}`,
      fromPortRef: { nodeId: load.nodeId, portId: resolvePortId(nodeTypeMap.get(load.nodeId) ?? NodeTypeV1.BUS_SN, PortRoleV1.OUT) },
      toPortRef: { nodeId: load.id, portId: resolvePortId(NodeTypeV1.LOAD, PortRoleV1.IN) },
      edgeType: EdgeTypeV1.BRANCH,
      isNormallyOpen: false,
      attributes: {
        label: `bus → ${load.name}`,
        lengthKm: null,
        branchType: null,
        inService: load.inService,
      },
    });
  }

  // --- 11. Build meta (DETERMINISTIC — timestamp z parametru, nie z zegara) ---
  const meta: VisualGraphMetaV1 = {
    snapshotId: input.snapshotId,
    snapshotFingerprint: input.snapshotFingerprint,
    createdAt: options.timestamp ?? '1970-01-01T00:00:00.000Z',
    version: VISUAL_GRAPH_VERSION,
  };

  // --- 12. Assemble and canonicalize ---
  const graph: VisualGraphV1 = {
    version: VISUAL_GRAPH_VERSION,
    nodes,
    edges,
    meta,
  };

  // Final self-edge check (paranoia guard)
  for (const edge of graph.edges) {
    if (edge.fromPortRef.nodeId === edge.toPortRef.nodeId) {
      throw new Error(
        `INVARIANT VIOLATION: self-edge detected in VisualGraph: edge ${edge.id} ` +
        `(${edge.fromPortRef.nodeId}.${edge.fromPortRef.portId} → ` +
        `${edge.toPortRef.nodeId}.${edge.toPortRef.portId})`
      );
    }
  }

  // --- 13. Build station block details (RUN #3D: field/device modeling) ---
  const segmentationEdgeSets: SegmentationEdgeSets = {
    trunkEdgeIds: segmentation.trunkEdgeIds,
    branchEdgeIds: segmentation.branchEdgeIds,
    secondaryEdgeIds: segmentation.secondaryEdgeIds,
  };

  const stationBlockDetails = buildStationBlocks(input, segmentationEdgeSets);

  const visualTopology = buildVisualTopologyContract(input, segmentationEdgeSets, stationBlockDetails);

  // --- 14. Build extended logical views (station ordering + junction metadata) ---
  const extendedLogicalViews = buildExtendedLogicalViews(input, segmentation, stationBlockDetails);

  // Merge field/device fixActions into adapter fixActions (with stable code mapping)
  for (const fa of stationBlockDetails.fixActions) {
    fixActions.push({
      code: fa.code,
      message: fa.message,
      elementRef: fa.elementId,
      fixHint: fa.fixHint,
    });
  }

  const canonicalGraph = canonicalizeVisualGraph(graph);
  registerStationBlockDetailsForGraph(canonicalGraph, stationBlockDetails);
  registerBranchPointDetailsForGraph(
    canonicalGraph,
    new Map(
      canonicalGraph.edges
        .filter((edge) => edge.edgeType === EdgeTypeV1.BRANCH)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((edge) => [edge.id, buildStationBlockDetailForBranchRef(edge.id)] as const),
    ),
  );

  return {
    graph: canonicalGraph,
    fixActions: [...fixActions].sort(
      (a, b) => a.code.localeCompare(b.code) || (a.elementRef ?? '').localeCompare(b.elementRef ?? ''),
    ),
    stationBlockDetails,
    visualTopology,
    extendedLogicalViews,
  };
}

// =============================================================================
// PORT SELECTION HELPERS (semantyczne — po roli, nie po geometrii)
// =============================================================================

/**
 * Mapuje (nodeType, PortRoleV1) → portId.
 * Pozwala na wybor portu po roli semantycznej zamiast po pozycji geometrycznej.
 */
function resolvePortId(nodeType: NodeTypeV1, role: PortRoleV1): string {
  const portMap: Partial<Record<NodeTypeV1, Partial<Record<PortRoleV1, string>>>> = {
    [NodeTypeV1.BUS_SN]: { [PortRoleV1.IN]: 'left', [PortRoleV1.OUT]: 'right' },
    [NodeTypeV1.BUS_NN]: { [PortRoleV1.IN]: 'left', [PortRoleV1.OUT]: 'right' },
    [NodeTypeV1.GRID_SOURCE]: { [PortRoleV1.OUT]: 'bottom' },
    [NodeTypeV1.GENERATOR_PV]: { [PortRoleV1.OUT]: 'bottom' },
    [NodeTypeV1.GENERATOR_BESS]: { [PortRoleV1.OUT]: 'bottom' },
    [NodeTypeV1.GENERATOR_WIND]: { [PortRoleV1.OUT]: 'bottom' },
    [NodeTypeV1.LOAD]: { [PortRoleV1.IN]: 'top' },
    [NodeTypeV1.TRANSFORMER_WN_SN]: { [PortRoleV1.TRANSFORMER_HV]: 'top', [PortRoleV1.TRANSFORMER_LV]: 'bottom' },
    [NodeTypeV1.TRANSFORMER_SN_NN]: { [PortRoleV1.TRANSFORMER_HV]: 'top', [PortRoleV1.TRANSFORMER_LV]: 'bottom' },
    [NodeTypeV1.STATION_SN_NN_A]: { [PortRoleV1.IN]: 'in', [PortRoleV1.OUT]: 'out', [PortRoleV1.BRANCH]: 'branch' },
    [NodeTypeV1.STATION_SN_NN_B]: { [PortRoleV1.IN]: 'in', [PortRoleV1.OUT]: 'out', [PortRoleV1.BRANCH]: 'branch' },
    [NodeTypeV1.STATION_SN_NN_C]: { [PortRoleV1.IN]: 'in', [PortRoleV1.OUT]: 'out', [PortRoleV1.BRANCH]: 'branch' },
    [NodeTypeV1.STATION_SN_NN_D]: { [PortRoleV1.IN]: 'in', [PortRoleV1.OUT]: 'out', [PortRoleV1.BRANCH]: 'branch' },
    [NodeTypeV1.SWITCHGEAR_BLOCK]: { [PortRoleV1.IN]: 'in', [PortRoleV1.OUT]: 'out', [PortRoleV1.BRANCH]: 'branch' },
    [NodeTypeV1.FEEDER_JUNCTION]: { [PortRoleV1.IN]: 'top', [PortRoleV1.OUT]: 'bottom', [PortRoleV1.BRANCH]: 'left' },
  };
  return portMap[nodeType]?.[role] ?? 'left';
}

/**
 * Wybiera portId na wezle FROM (zrodlowym) dla krawedzi branch.
 * Semantyka: rola portu zalezy od typu krawedzi, nie od pozycji geometrycznej.
 */
function selectSourcePort(_branch: TopologyBranchV1, edgeType: EdgeTypeV1, fromNodeType: NodeTypeV1): string {
  if (edgeType === EdgeTypeV1.TRANSFORMER_LINK) {
    return resolvePortId(fromNodeType, PortRoleV1.IN);
  }
  return resolvePortId(fromNodeType, PortRoleV1.OUT);
}

/**
 * Wybiera portId na wezle TO (docelowym) dla krawedzi branch.
 */
function selectTargetPort(_branch: TopologyBranchV1, edgeType: EdgeTypeV1, toNodeType: NodeTypeV1): string {
  if (edgeType === EdgeTypeV1.TRANSFORMER_LINK) {
    return resolvePortId(toNodeType, PortRoleV1.IN);
  }
  return resolvePortId(toNodeType, PortRoleV1.IN);
}
